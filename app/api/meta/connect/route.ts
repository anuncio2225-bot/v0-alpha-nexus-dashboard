import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";
import {
  validateToken,
  debugToken,
  MetaApiError,
  friendlyMetaMessage,
} from "@/lib/meta/graph";
import { isSyncLockStale } from "@/lib/meta/sync";

// ============================================================================
// /api/meta/connect — Conexao via System User Token (substitui o fluxo OAuth)
//
// SEGURANCA: o token e gravado em meta_config.access_token (texto puro).
//   // TODO: encrypt at rest usando ENCRYPTION_KEY + crypto do Node.
//   O token NUNCA e retornado por GET nem enviado ao client.
// ============================================================================

// GET: status da conexao (NUNCA retorna o token)
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveId = await getEffectiveUserId(supabase, user.id);
  const { data: config } = await supabase
    .from("meta_config")
    .select(
      "is_connected, connected_at, token_expires_at, validation_status, last_sync_at, sync_status, sync_error, app_id, updated_at"
    )
    .eq("user_id", effectiveId)
    .single();

  // Auto-recuperacao: se um sync ficou preso em 'syncing' (timeout antigo),
  // destravamos para a UI nao ficar eternamente em "Sincronizando...".
  let syncStatus = config?.sync_status || "idle";
  let syncError = config?.sync_error || null;
  if (isSyncLockStale(config?.sync_status, config?.updated_at)) {
    syncStatus = "error";
    syncError =
      "A ultima sincronizacao demorou demais e foi interrompida. Tente novamente (de preferencia importando periodos menores).";
    await supabase
      .from("meta_config")
      .update({
        sync_status: "error",
        sync_error: syncError,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", effectiveId);
  }

  return NextResponse.json({
    connected: config?.is_connected || false,
    connectedAt: config?.connected_at || null,
    expiresAt: config?.token_expires_at || null, // null = nunca expira
    validationStatus: config?.validation_status || null,
    lastSyncAt: config?.last_sync_at || null,
    syncStatus,
    syncError,
    appId: config?.app_id || null,
  });
}

// POST: salvar e validar System User Token
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { access_token, app_id } = await request.json();

    if (!access_token || typeof access_token !== "string") {
      return NextResponse.json(
        { error: "Informe o Access Token (System User Token)." },
        { status: 400 }
      );
    }

    const token = access_token.trim();

    // 1. Validar token via GET /me
    let me;
    try {
      me = await validateToken(token);
    } catch (err) {
      const message =
        err instanceof MetaApiError
          ? friendlyMetaMessage(err.kind)
          : "Token invalido ou expirado.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    // 2. Detectar expiracao via debug_token (expires_at=0 => nunca expira => null)
    let expiresAt: string | null = null;
    let detectedAppId: string | undefined;
    try {
      const dbg = await debugToken(token);
      expiresAt = dbg.expiresAt;
      detectedAppId = dbg.appId;
    } catch {
      // debug_token pode falhar dependendo do tipo de token; nao bloquear a
      // conexao por isso. Assumimos sem expiracao conhecida (null).
      expiresAt = null;
    }

    // 3 + 4. Salvar protegido + marcar conectado
    const { error: upsertError } = await supabase.from("meta_config").upsert(
      {
        user_id: await getEffectiveUserId(supabase, user.id),
        access_token: token, // TODO: encrypt at rest (ENCRYPTION_KEY)
        app_id: app_id || detectedAppId || null,
        token_expires_at: expiresAt,
        validation_status: "valid",
        is_connected: true,
        connected_at: new Date().toISOString(),
        sync_status: "idle",
        sync_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (upsertError) {
      console.error("[v0] Error saving meta config:", upsertError.message);
      return NextResponse.json(
        { error: "Falha ao salvar a configuracao." },
        { status: 500 }
      );
    }

    // Resposta NUNCA inclui o token
    return NextResponse.json({
      success: true,
      accountName: me.name || null,
      expiresAt,
      neverExpires: expiresAt === null,
    });
  } catch (error) {
    console.error("[v0] Meta connect error:", error);
    return NextResponse.json({ error: "Falha na conexao." }, { status: 500 });
  }
}

// DELETE: desconectar (remove token e contas)
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await supabase.from("meta_config").delete().eq("user_id", await getEffectiveUserId(supabase, user.id));
  await supabase.from("meta_ad_accounts").delete().eq("user_id", await getEffectiveUserId(supabase, user.id));

  return NextResponse.json({ success: true });
}
