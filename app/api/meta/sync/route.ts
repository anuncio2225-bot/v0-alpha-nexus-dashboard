import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";
import { syncUser, tryAcquireSyncLock } from "@/lib/meta/sync";
import type { InsightLevel } from "@/lib/meta/graph";

// Importacao de historico pode ser longa: damos ate 300s para a funcao.
// (A Vercel limita conforme o plano; valores acima do permitido sao reduzidos.)
export const maxDuration = 300;

// ============================================================================
// /api/meta/sync — sync manual disparado pelo usuario.
//
// Sync incremental: ultimos `lookbackDays` (default 3) + hoje.
// Concorrencia: se ja houver um sync rodando para o usuario, retorna 409.
// Falha parcial (1 conta falha, outras ok) NAO derruba o sync.
// ============================================================================

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const lookbackDays: number = body.lookbackDays ?? 3;
    const level: InsightLevel = body.level === "ad" ? "ad" : "account";
    // Range explicito para importacao de historico (YYYY-MM-DD). Opcional.
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    const since: string | undefined =
      typeof body.since === "string" && dateRe.test(body.since)
        ? body.since
        : undefined;
    const until: string | undefined =
      typeof body.until === "string" && dateRe.test(body.until)
        ? body.until
        : undefined;

    // ID efetivo (dono da conta). Para donos = proprio id; membros = id do dono.
    // Tudo (config, lock, contas, performance) e chaveado por esse id.
    const effectiveId = await getEffectiveUserId(supabase, user.id);

    // Config + token
    const { data: config } = await supabase
      .from("meta_config")
      .select("access_token, is_connected, validation_status")
      .eq("user_id", effectiveId)
      .single();

    if (!config?.is_connected || !config?.access_token) {
      return NextResponse.json(
        { error: "Meta nao conectado" },
        { status: 400 }
      );
    }

    // Lock de concorrencia (libera automaticamente locks presos/stale)
    const acquired = await tryAcquireSyncLock(supabase, effectiveId);
    if (!acquired) {
      return NextResponse.json(
        { error: "Ja existe uma sincronizacao em andamento." },
        { status: 409 }
      );
    }

    const result = await syncUser(supabase, {
      userId: effectiveId,
      token: config.access_token,
      level,
      lookbackDays,
      since,
      until,
    });

    // Sem nenhuma conta ativa: nao e uma sincronizacao bem-sucedida, e sim
    // uma configuracao incompleta. Avisamos claramente o usuario.
    if (result.accountsTotal === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Nenhuma conta de anuncio ativa. Marque uma conta e clique em "Salvar Selecao" antes de sincronizar.',
          ...result,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: result.accountsFailed === 0,
      ...result,
    });
  } catch (error) {
    console.error("[v0] Meta sync error:", error);
    // Garante que o status nao fique preso em 'syncing'
    await supabase
      .from("meta_config")
      .update({
        sync_status: "error",
        sync_error:
          error instanceof Error ? error.message : "Falha na sincronizacao.",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", await getEffectiveUserId(supabase, user.id));
    return NextResponse.json({ error: "Falha na sincronizacao." }, { status: 500 });
  }
}

// GET: status da ultima sincronizacao
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: config } = await supabase
    .from("meta_config")
    .select("last_sync_at, sync_status, sync_error")
    .eq("user_id", await getEffectiveUserId(supabase, user.id))
    .single();

  return NextResponse.json({
    lastSync: config?.last_sync_at || null,
    syncStatus: config?.sync_status || "idle",
    syncError: config?.sync_error || null,
  });
}
