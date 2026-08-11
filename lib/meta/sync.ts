// lib/meta/sync.ts
// ============================================================================
// Logica de sincronizacao compartilhada entre a rota manual (/api/meta/sync)
// e o cron (/api/cron/meta-sync).
//
// Estrategia incremental: sempre re-puxa os ultimos N dias (default 3) + hoje,
// pois o Meta ajusta atribuicao retroativamente. Nao re-puxa historico antigo.
//
// Aceita qualquer client supabase (server com RLS ou admin service-role).
// ============================================================================

import { format, subDays } from "date-fns";
import {
  fetchInsights,
  toPerformanceRow,
  num,
  MetaApiError,
  friendlyMetaMessage,
  PERFORMANCE_CONFLICT_TARGET,
  type InsightLevel,
} from "./graph";
import { preloadUsdBrlRange, getUsdBrlRate, isBRL } from "./fx";

// Client minimamente tipado (compativel com supabase-js)
type SupabaseLike = {
  from: (table: string) => any;
};

export interface SyncResult {
  accountsTotal: number;
  accountsOk: number;
  accountsFailed: number;
  rowsUpserted: number;
  errors: { accountId: string; message: string }[];
}

/** Janela incremental: ultimos `lookbackDays` dias + hoje. */
export function incrementalRange(lookbackDays = 3): {
  since: string;
  until: string;
} {
  const until = format(new Date(), "yyyy-MM-dd");
  const since = format(subDays(new Date(), lookbackDays), "yyyy-MM-dd");
  return { since, until };
}

/**
 * Divide um intervalo [since, until] em blocos de no maximo `maxDays` dias.
 * Evita que periodos longos (ex.: 90 dias) estourem o limite do Meta.
 */
export function chunkDateRange(
  since: string,
  until: string,
  maxDays = 30
): { since: string; until: string }[] {
  const chunks: { since: string; until: string }[] = [];
  let cursor = new Date(`${since}T00:00:00`);
  const end = new Date(`${until}T00:00:00`);

  while (cursor <= end) {
    const chunkStart = cursor;
    const tentativeEnd = new Date(chunkStart);
    tentativeEnd.setDate(tentativeEnd.getDate() + (maxDays - 1));
    const chunkEnd = tentativeEnd > end ? end : tentativeEnd;

    chunks.push({
      since: format(chunkStart, "yyyy-MM-dd"),
      until: format(chunkEnd, "yyyy-MM-dd"),
    });

    cursor = new Date(chunkEnd);
    cursor.setDate(cursor.getDate() + 1);
  }
  return chunks;
}

/**
 * Sincroniza um unico usuario. Atualiza meta_config.sync_status/last_sync_at/
 * sync_error. Em caso de token invalido, marca validation_status e desconecta.
 *
 * @returns SyncResult com contagem de sucesso/falha por conta (falha parcial
 *          NAO derruba o sync inteiro).
 */
export async function syncUser(
  supabase: SupabaseLike,
  params: {
    userId: string;
    token: string;
    level?: InsightLevel;
    lookbackDays?: number;
    /** Range explicito (YYYY-MM-DD). Se informado, ignora lookbackDays e
     *  importa exatamente esse intervalo (usado pelo "Importar historico"). */
    since?: string;
    until?: string;
  }
): Promise<SyncResult> {
  const { userId, token, level = "account", lookbackDays = 3 } = params;
  // Se since/until vierem, usamos o range explicito; senao, incremental.
  const { since, until } =
    params.since && params.until
      ? { since: params.since, until: params.until }
      : incrementalRange(lookbackDays);

  const result: SyncResult = {
    accountsTotal: 0,
    accountsOk: 0,
    accountsFailed: 0,
    rowsUpserted: 0,
    errors: [],
  };

  // Contas ativas do usuario, com moeda/IOF e a conexão (token da BM).
  const { data: accounts } = await supabase
    .from("meta_ad_accounts")
    .select("account_id, currency, iof_percent, connection_id")
    .eq("user_id", userId)
    .eq("is_active", true);

  // Mapa connection_id -> token (cada BM tem seu próprio System User Token).
  const { data: connections } = await supabase
    .from("meta_connections")
    .select("id, access_token")
    .eq("user_id", userId);
  const tokenByConnection = new Map<string, string>();
  for (const c of connections || []) {
    if (c.id && c.access_token) tokenByConnection.set(c.id, c.access_token);
  }
  // Fallback: se a conta não tiver conexão vinculada, usa o token recebido
  // (compatibilidade com o fluxo antigo de token único).
  const resolveToken = (connId: string | null): string =>
    (connId && tokenByConnection.get(connId)) || token;

  // Pré-carrega o câmbio USD->BRL do período (uma chamada só) caso exista ao
  // menos uma conta em moeda diferente de BRL.
  const hasForeign = (accounts || []).some(
    (a: { currency: string | null }) => !isBRL(a.currency)
  );
  if (hasForeign) {
    await preloadUsdBrlRange(since, until);
  }

  result.accountsTotal = accounts?.length || 0;
  if (!accounts || accounts.length === 0) {
    // IMPORTANTE: sem contas ativas NAO podemos retornar cedo sem antes
    // liberar o lock — senao sync_status fica preso em 'syncing' para sempre
    // (a tela trava em "Sincronizando..."). Resetamos para 'idle' com um aviso.
    await supabase
      .from("meta_config")
      .update({
        sync_status: "idle",
        sync_error:
          "Nenhuma conta de anuncio ativa. Selecione uma conta e clique em \"Salvar Selecao\" antes de sincronizar.",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);
    return result;
  }

  for (const account of accounts) {
    const accountId = account.account_id as string;
    const accountToken = resolveToken(account.connection_id as string | null);
    const currency = (account.currency as string) || "BRL";
    const iofPercent = num(account.iof_percent);
    const brl = isBRL(currency);
    try {
      // Divide o periodo em blocos de 30 dias (importacao de historico longo).
      const blocks = chunkDateRange(since, until, 30);
      const insights = [];
      for (const block of blocks) {
        const part = await fetchInsights(accountToken, accountId, {
          since: block.since,
          until: block.until,
          level,
        });
        insights.push(...part);
      }

      // Sem dados no periodo => nao e erro, apenas pula
      if (insights.length === 0) {
        result.accountsOk++;
        continue;
      }

      // Converte cada linha para BRL usando a taxa TRAVADA do dia da linha.
      const rows = [];
      for (const i of insights) {
        const exchangeRate = brl ? 1 : await getUsdBrlRate(i.date_start);
        rows.push(
          toPerformanceRow(userId, accountId, i, {
            currency,
            exchangeRate,
            iofPercent,
          })
        );
      }

      const { error: upsertError } = await supabase
        .from("meta_ads_performance")
        .upsert(rows, {
          onConflict: PERFORMANCE_CONFLICT_TARGET,
          ignoreDuplicates: false,
        });

      if (upsertError) {
        throw new Error(upsertError.message);
      }

      result.rowsUpserted += rows.length;
      result.accountsOk++;
    } catch (err) {
      result.accountsFailed++;
      const message =
        err instanceof MetaApiError
          ? friendlyMetaMessage(err.kind)
          : err instanceof Error
            ? err.message
            : "Erro desconhecido";
      result.errors.push({ accountId, message });

      // Token inválido agora afeta apenas a CONEXÃO (BM) daquela conta — as
      // demais BMs continuam sincronizando normalmente. Marcamos a conexão como
      // expirada e seguimos para a próxima conta.
      if (err instanceof MetaApiError && err.kind === "invalid_token") {
        const connId = account.connection_id as string | null;
        if (connId) {
          await supabase
            .from("meta_connections")
            .update({
              status: "expired",
              last_error: message,
              updated_at: new Date().toISOString(),
            })
            .eq("id", connId)
            .eq("user_id", userId);
        } else {
          // Sem conexão vinculada (fluxo legado): mantém o comportamento antigo.
          await supabase
            .from("meta_config")
            .update({
              validation_status: "expired",
              is_connected: false,
              sync_status: "error",
              sync_error: message,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", userId);
          return result;
        }
      }
    }
  }

  // Atualiza status final do usuario
  const hadError = result.accountsFailed > 0;
  await supabase
    .from("meta_config")
    .update({
      last_sync_at: new Date().toISOString(),
      sync_status: hadError && result.accountsOk === 0 ? "error" : "idle",
      sync_error: hadError ? result.errors.map((e) => e.message).join("; ") : null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return result;
}

/**
 * Tempo (min) apos o qual um lock 'syncing' e considerado "preso" (stale).
 * Se uma sincronizacao estourar o tempo limite da funcao serverless, o status
 * nunca volta para 'idle'. Passado esse limite, liberamos o lock automaticamente
 * para a UI nao ficar travada em "Sincronizando..." para sempre.
 */
export const STALE_LOCK_MINUTES = 10;

/** Verdadeiro se o lock 'syncing' esta preso ha mais de STALE_LOCK_MINUTES. */
export function isSyncLockStale(
  syncStatus: string | null | undefined,
  updatedAt: string | null | undefined
): boolean {
  if (syncStatus !== "syncing") return false;
  if (!updatedAt) return true; // sem timestamp confiavel => tratar como preso
  const ageMs = Date.now() - new Date(updatedAt).getTime();
  return ageMs > STALE_LOCK_MINUTES * 60 * 1000;
}

/** Marca sync_status='syncing' apenas se nao houver outro em andamento. */
export async function tryAcquireSyncLock(
  supabase: SupabaseLike,
  userId: string
): Promise<boolean> {
  const { data: config } = await supabase
    .from("meta_config")
    .select("sync_status, updated_at")
    .eq("user_id", userId)
    .single();

  // Lock em andamento e ainda fresco => nao adquire (evita sync concorrente).
  // Lock preso (stale) => liberamos e seguimos, recuperando de timeouts antigos.
  if (
    config?.sync_status === "syncing" &&
    !isSyncLockStale(config.sync_status, config.updated_at)
  ) {
    return false;
  }

  await supabase
    .from("meta_config")
    .update({ sync_status: "syncing", updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  return true;
}

export { num };
