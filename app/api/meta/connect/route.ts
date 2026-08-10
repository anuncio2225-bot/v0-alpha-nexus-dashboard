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
// /api/meta/connect — Conexões via System User Token (uma por Business Manager)
//
// Cada BM tem seu próprio System User Token, gravado como uma linha em
// meta_connections. O meta_config continua guardando o STATUS GLOBAL do sync
// (lock/last_sync) por usuário.
//
// SEGURANÇA: o token é gravado em meta_connections.access_token (texto puro).
//   // TODO: encrypt at rest usando ENCRYPTION_KEY + crypto do Node.
//   O token NUNCA é retornado por GET nem enviado ao client.
// ============================================================================

// GET: lista as conexões (sem token) + status global de sync.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveId = await getEffectiveUserId(supabase, user.id);

  const { data: connections } = await supabase
    .from("meta_connections")
    .select(
      "id, label, business_id, business_name, status, last_error, last_synced_at, created_at"
    )
    .eq("user_id", effectiveId)
    .order("created_at", { ascending: true });

  const { data: config } = await supabase
    .from("meta_config")
    .select("last_sync_at, sync_status, sync_error, updated_at")
    .eq("user_id", effectiveId)
    .single();

  // Auto-recuperação: se um sync ficou preso em 'syncing' (timeout antigo),
  // destravamos para a UI não ficar eternamente em "Sincronizando...".
  let syncStatus = config?.sync_status || "idle";
  let syncError = config?.sync_error || null;
  if (isSyncLockStale(config?.sync_status, config?.updated_at)) {
    syncStatus = "error";
    syncError =
      "A última sincronização demorou demais e foi interrompida. Tente novamente (de preferência importando períodos menores).";
    await supabase
      .from("meta_config")
      .update({
        sync_status: "error",
        sync_error: syncError,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", effectiveId);
  }

  const conns = connections || [];
  return NextResponse.json({
    connected: conns.length > 0,
    connections: conns,
    lastSyncAt: config?.last_sync_at || null,
    syncStatus,
    syncError,
  });
}

// POST: adiciona/valida um novo System User Token (uma nova conexão/BM).
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { access_token, label } = await request.json();

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
          : "Token inválido ou expirado.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    // 2. debug_token (opcional; não bloqueia a conexão se falhar)
    try {
      await debugToken(token);
    } catch {
      /* ignore */
    }

    const effectiveId = await getEffectiveUserId(supabase, user.id);

    // 3. Cria a conexão (não faz upsert por user: permitimos várias BMs).
    const { data: inserted, error: insertError } = await supabase
      .from("meta_connections")
      .insert({
        user_id: effectiveId,
        label: (label && String(label).trim()) || me.name || "Conexão Meta",
        access_token: token, // TODO: encrypt at rest (ENCRYPTION_KEY)
        status: "active",
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[v0] Error saving meta connection:", insertError.message);
      return NextResponse.json(
        { error: "Falha ao salvar a conexão." },
        { status: 500 }
      );
    }

    // Garante uma linha de status global de sync para o usuário.
    await supabase.from("meta_config").upsert(
      {
        user_id: effectiveId,
        is_connected: true,
        connected_at: new Date().toISOString(),
        sync_status: "idle",
        sync_error: null,
        validation_status: "valid",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    // Resposta NUNCA inclui o token.
    return NextResponse.json({
      success: true,
      connectionId: inserted?.id,
      accountName: me.name || null,
    });
  } catch (error) {
    console.error("[v0] Meta connect error:", error);
    return NextResponse.json({ error: "Falha na conexão." }, { status: 500 });
  }
}

// DELETE: remove uma conexão específica (?id=) ou todas (sem id).
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveId = await getEffectiveUserId(supabase, user.id);
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (id) {
    // Remove só essa conexão. As contas vinculadas caem por ON DELETE CASCADE.
    await supabase
      .from("meta_connections")
      .delete()
      .eq("id", id)
      .eq("user_id", effectiveId);

    // Se não sobrar nenhuma conexão, marca desconectado.
    const { count } = await supabase
      .from("meta_connections")
      .select("id", { count: "exact", head: true })
      .eq("user_id", effectiveId);
    if (!count) {
      await supabase
        .from("meta_config")
        .update({ is_connected: false, updated_at: new Date().toISOString() })
        .eq("user_id", effectiveId);
    }
    return NextResponse.json({ success: true });
  }

  // Sem id: desconecta tudo (comportamento legado).
  await supabase.from("meta_connections").delete().eq("user_id", effectiveId);
  await supabase.from("meta_config").delete().eq("user_id", effectiveId);
  await supabase.from("meta_ad_accounts").delete().eq("user_id", effectiveId);

  return NextResponse.json({ success: true });
}
