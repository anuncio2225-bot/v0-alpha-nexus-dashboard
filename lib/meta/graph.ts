// lib/meta/graph.ts
// ============================================================================
// Helper server-side centralizado para a Graph API do Meta (Facebook Ads).
//
// REGRAS DE SEGURANCA:
//  - O System User Token NUNCA deve ser retornado por rotas GET, logado em
//    producao, nem enviado ao client. Este modulo so roda no servidor e nunca
//    serializa o token em respostas.
//  - Todas as chamadas usam retry com backoff exponencial para rate limit.
//
// ENV VARS RELEVANTES:
//  - META_APP_SECRET  (opcional; util para appsecret_proof / debug_token)
//  - ENCRYPTION_KEY   (opcional; reservado para criptografia futura do token)
//  - CRON_SECRET      (usado pelo cron, nao por este modulo)
//  - NEXT_PUBLIC_APP_URL
//
// NOTA SOBRE NOMES DE COLUNA:
//  Este modulo usa os nomes REAIS ja presentes no banco em producao:
//  meta_config.access_token (texto puro // TODO: encrypt at rest),
//  meta_ad_accounts.account_id / account_name.
// ============================================================================

export const GRAPH_VERSION = "v21.0";
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

// Fuso padrao para agregacao diaria. O Meta entrega dados no fuso da conta de
// anuncio; ao exibir/agregar por dia padronizamos para America/Sao_Paulo.
export const REPORT_TIMEZONE = "America/Sao_Paulo";

// ----------------------------------------------------------------------------
// Tipos
// ----------------------------------------------------------------------------
export interface MetaError {
  message: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

export class MetaApiError extends Error {
  code?: number;
  subcode?: number;
  /** classificacao amigavel para o front/banco */
  kind: "invalid_token" | "permission" | "rate_limit" | "unknown";

  constructor(err: MetaError) {
    super(err.message);
    this.name = "MetaApiError";
    this.code = err.code;
    this.subcode = err.error_subcode;
    this.kind = classifyMetaError(err);
  }
}

export function classifyMetaError(err: MetaError): MetaApiError["kind"] {
  // 190 = token invalido/expirado
  if (err.code === 190) return "invalid_token";
  // 17 / 80004 / 4 = rate limit / user request limit
  if (err.code === 17 || err.code === 80004 || err.code === 4)
    return "rate_limit";
  // 10 / 200 / 294 = permissao insuficiente (ex.: falta ads_read)
  if (err.code === 10 || err.code === 200 || err.code === 294)
    return "permission";
  return "unknown";
}

/** Mensagem clara em PT-BR para exibir ao usuario, sem vazar dados sensiveis. */
export function friendlyMetaMessage(kind: MetaApiError["kind"]): string {
  switch (kind) {
    case "invalid_token":
      return "Sua conexao com o Meta expirou ou o token e invalido. Gere um novo token e reconecte.";
    case "permission":
      return "O token nao tem a permissao necessaria (ads_read). Gere o token com as permissoes corretas.";
    case "rate_limit":
      return "O Meta limitou temporariamente as requisicoes (rate limit). Tente novamente em alguns minutos.";
    default:
      return "Falha ao comunicar com o Meta. Tente novamente.";
  }
}

// ----------------------------------------------------------------------------
// Fetch base com retry/backoff para rate limit
// ----------------------------------------------------------------------------
async function graphFetch<T>(
  url: string,
  { retries = 3 }: { retries?: number } = {}
): Promise<T> {
  let attempt = 0;
  // backoff: 2s, 4s, 8s
  while (true) {
    const res = await fetch(url);
    const json = await res.json();

    if (json.error) {
      const apiErr = new MetaApiError(json.error as MetaError);
      // So vale a pena re-tentar em rate limit
      if (apiErr.kind === "rate_limit" && attempt < retries) {
        const waitMs = 2000 * Math.pow(2, attempt);
        attempt++;
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw apiErr;
    }

    return json as T;
  }
}

// ----------------------------------------------------------------------------
// 1. Validacao de token: GET /me
// ----------------------------------------------------------------------------
export interface MeResponse {
  id: string;
  name?: string;
}

export async function validateToken(token: string): Promise<MeResponse> {
  return graphFetch<MeResponse>(
    `${GRAPH_BASE}/me?fields=id,name&access_token=${encodeURIComponent(token)}`,
    { retries: 1 }
  );
}

// ----------------------------------------------------------------------------
// 2. Expiracao do token: GET /debug_token
//    expires_at = 0  => nunca expira (retornamos null)
// ----------------------------------------------------------------------------
export interface DebugTokenData {
  app_id?: string;
  is_valid?: boolean;
  expires_at?: number; // unix seconds; 0 = never
  scopes?: string[];
}

export async function debugToken(
  token: string
): Promise<{ expiresAt: string | null; scopes: string[]; appId?: string }> {
  // debug_token idealmente usa app access token; com System User Token o
  // proprio token costuma funcionar como inspecionador.
  const data = await graphFetch<{ data: DebugTokenData }>(
    `${GRAPH_BASE}/debug_token?input_token=${encodeURIComponent(
      token
    )}&access_token=${encodeURIComponent(token)}`,
    { retries: 1 }
  );

  const expiresAtUnix = data.data?.expires_at ?? 0;
  // expires_at = 0 => token de longa duracao / nunca expira => null
  const expiresAt =
    expiresAtUnix && expiresAtUnix > 0
      ? new Date(expiresAtUnix * 1000).toISOString()
      : null;

  return {
    expiresAt,
    scopes: data.data?.scopes ?? [],
    appId: data.data?.app_id,
  };
}

// ----------------------------------------------------------------------------
// 3. Listar contas de anuncio: GET /me/adaccounts
// ----------------------------------------------------------------------------
export interface RawAdAccount {
  id: string; // act_xxxxx
  name?: string;
  currency?: string;
  account_status?: number;
  timezone_name?: string;
  business?: { id: string; name: string };
}

export interface NormalizedAdAccount {
  /** id sem o prefixo act_ (como salvamos em account_id) */
  accountId: string;
  accountName: string;
  currency: string;
  accountStatus: number;
  status: "active" | "inactive";
  timezoneName: string | null;
  businessId: string | null;
  businessName: string | null;
}

export async function fetchAdAccounts(
  token: string
): Promise<NormalizedAdAccount[]> {
  const data = await graphFetch<{ data: RawAdAccount[] }>(
    `${GRAPH_BASE}/me/adaccounts?fields=id,name,currency,account_status,timezone_name,business&limit=200&access_token=${encodeURIComponent(
      token
    )}`
  );

  return (data.data || []).map((acc) => ({
    accountId: acc.id.replace("act_", ""),
    accountName: acc.name || acc.id,
    currency: acc.currency || "BRL",
    accountStatus: acc.account_status ?? 0,
    status: acc.account_status === 1 ? "active" : "inactive",
    timezoneName: acc.timezone_name ?? null,
    businessId: acc.business?.id ?? null,
    businessName: acc.business?.name ?? null,
  }));
}

// ----------------------------------------------------------------------------
// 4. Insights
// ----------------------------------------------------------------------------
export interface RawInsightAction {
  action_type: string;
  value: string;
}

export interface RawInsight {
  date_start: string;
  date_stop: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  reach?: string;
  cpc?: string;
  cpm?: string;
  ctr?: string;
  actions?: RawInsightAction[];
  action_values?: RawInsightAction[];
}

export type InsightLevel = "account" | "campaign" | "adset" | "ad";

const PURCHASE_ACTION_TYPES = new Set([
  "omni_purchase",
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
]);

/** Soma conversoes (count) a partir do array actions. */
export function extractConversions(actions?: RawInsightAction[]): number {
  if (!actions) return 0;
  return actions
    .filter((a) => PURCHASE_ACTION_TYPES.has(a.action_type))
    .reduce((sum, a) => {
      const v = Number(a.value);
      return sum + (Number.isFinite(v) ? v : 0);
    }, 0);
}

/** Soma valor das conversoes a partir do array action_values. */
export function extractConversionValue(
  actionValues?: RawInsightAction[]
): number {
  if (!actionValues) return 0;
  return actionValues
    .filter((a) => PURCHASE_ACTION_TYPES.has(a.action_type))
    .reduce((sum, a) => {
      const v = Number(a.value);
      return sum + (Number.isFinite(v) ? v : 0);
    }, 0);
}

/** Number seguro: trata string/null/NaN como 0. */
export function num(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

export async function fetchInsights(
  token: string,
  accountId: string,
  opts: {
    since: string;
    until: string;
    level?: InsightLevel;
  }
): Promise<RawInsight[]> {
  const level = opts.level || "account";
  const fields = [
    "spend",
    "impressions",
    "clicks",
    "reach",
    "cpc",
    "cpm",
    "ctr",
    "actions",
    "action_values",
  ];
  // Campos de identificacao por nivel
  if (level !== "account") {
    fields.push("campaign_id", "campaign_name");
  }
  if (level === "adset" || level === "ad") {
    fields.push("adset_id", "adset_name");
  }
  if (level === "ad") {
    fields.push("ad_id", "ad_name");
  }

  const timeRange = JSON.stringify({ since: opts.since, until: opts.until });
  const url =
    `${GRAPH_BASE}/act_${accountId}/insights` +
    `?fields=${fields.join(",")}` +
    `&level=${level}` +
    `&time_increment=1` +
    `&time_range=${encodeURIComponent(timeRange)}` +
    `&limit=500` +
    `&access_token=${encodeURIComponent(token)}`;

  const out: RawInsight[] = [];
  let next: string | null = url;
  // paginacao simples
  while (next) {
    const page: { data: RawInsight[]; paging?: { next?: string } } =
      await graphFetch(next);
    out.push(...(page.data || []));
    next = page.paging?.next || null;
  }
  return out;
}

// ----------------------------------------------------------------------------
// 5. Linha normalizada pronta para upsert em meta_ads_performance.
//    Para level=account, campaign/adset/ad ficam '' (string vazia) para
//    casar com a constraint unica meta_ads_performance_unique_grain.
// ----------------------------------------------------------------------------
export interface PerformanceRow {
  user_id: string;
  ad_account_id: string;
  campaign_id: string;
  campaign_name: string | null;
  adset_id: string;
  adset_name: string | null;
  ad_id: string;
  ad_name: string | null;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  cpc: number;
  cpm: number;
  ctr: number;
  conversions: number;
  conversion_value: number;
  cost_per_conversion: number;
  updated_at: string;
}

export function toPerformanceRow(
  userId: string,
  accountId: string,
  insight: RawInsight
): PerformanceRow {
  const spend = num(insight.spend);
  const conversions = extractConversions(insight.actions);
  const conversionValue = extractConversionValue(insight.action_values);
  const costPerConversion = conversions > 0 ? spend / conversions : 0;

  return {
    user_id: userId,
    ad_account_id: accountId,
    // '' em vez de null para a constraint unica composta
    campaign_id: insight.campaign_id ?? "",
    campaign_name: insight.campaign_name ?? null,
    adset_id: insight.adset_id ?? "",
    adset_name: insight.adset_name ?? null,
    ad_id: insight.ad_id ?? "",
    ad_name: insight.ad_name ?? null,
    date: insight.date_start,
    spend,
    impressions: num(insight.impressions),
    clicks: num(insight.clicks),
    reach: num(insight.reach),
    cpc: num(insight.cpc),
    cpm: num(insight.cpm),
    ctr: num(insight.ctr),
    conversions,
    conversion_value: conversionValue,
    cost_per_conversion: costPerConversion,
    updated_at: new Date().toISOString(),
  };
}

// Coluna de conflito usada nos upserts (deve casar com a constraint do banco)
export const PERFORMANCE_CONFLICT_TARGET =
  "user_id,ad_account_id,date,campaign_id,adset_id,ad_id";
