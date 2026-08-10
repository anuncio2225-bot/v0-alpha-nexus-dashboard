import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";
import {
  fetchAdAccounts,
  MetaApiError,
  friendlyMetaMessage,
} from "@/lib/meta/graph";

// ============================================================================
// /api/meta/accounts — lista contas de TODAS as conexões (BMs) do usuário e
// permite selecionar quais monitorar, com IOF por conta.
// ============================================================================

// GET: agrega as contas de anúncio de cada conexão (cada uma com seu token).
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
    .select("id, label, access_token")
    .eq("user_id", effectiveId);

  if (!connections || connections.length === 0) {
    return NextResponse.json({ error: "Meta não conectado" }, { status: 400 });
  }

  // Contas já salvas (para marcar seleção/ativas e trazer o IOF configurado).
  const { data: savedAccounts } = await supabase
    .from("meta_ad_accounts")
    .select("account_id, is_active, iof_percent")
    .eq("user_id", effectiveId);
  const savedMap = new Map(
    (savedAccounts || []).map((a) => [a.account_id, a])
  );

  const enriched: unknown[] = [];
  const errors: { connectionId: string; message: string }[] = [];

  for (const conn of connections) {
    if (!conn.access_token) continue;
    try {
      const accounts = await fetchAdAccounts(conn.access_token);
      for (const acc of accounts) {
        const saved = savedMap.get(acc.accountId);
        enriched.push({
          id: acc.accountId,
          name: acc.accountName,
          currency: acc.currency,
          status: acc.status,
          timezoneName: acc.timezoneName,
          businessId: acc.businessId,
          businessName: acc.businessName,
          connectionId: conn.id,
          connectionLabel: conn.label,
          isSelected: savedMap.has(acc.accountId),
          isActive: saved?.is_active ?? false,
          iofPercent: Number(saved?.iof_percent ?? 0),
        });
      }
      // conexão OK: reflete status
      await supabase
        .from("meta_connections")
        .update({ status: "active", last_error: null })
        .eq("id", conn.id)
        .eq("user_id", effectiveId);
    } catch (err) {
      const message =
        err instanceof MetaApiError
          ? friendlyMetaMessage(err.kind)
          : "Falha ao buscar contas de anúncio.";
      errors.push({ connectionId: conn.id, message });
      if (err instanceof MetaApiError && err.kind === "invalid_token") {
        await supabase
          .from("meta_connections")
          .update({ status: "expired", last_error: message })
          .eq("id", conn.id)
          .eq("user_id", effectiveId);
      }
    }
  }

  return NextResponse.json({ accounts: enriched, errors });
}

// PUT: seleciona/ativa contas, gravando connection_id e iof_percent por conta.
export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { accounts } = await request.json();

    if (!Array.isArray(accounts)) {
      return NextResponse.json(
        { error: "Lista de contas inválida" },
        { status: 400 }
      );
    }

    const selectedIds = accounts.map((a: { id: string }) => a.id);
    const scopedId = await getEffectiveUserId(supabase, user.id);

    // Desativa contas que não estão mais selecionadas (sem deletar histórico).
    await supabase
      .from("meta_ad_accounts")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("user_id", scopedId)
      .not(
        "account_id",
        "in",
        `(${selectedIds.length > 0 ? selectedIds.join(",") : "''"})`
      );

    if (accounts.length > 0) {
      const rows = accounts.map(
        (acc: {
          id: string;
          name: string;
          currency?: string;
          timezoneName?: string | null;
          businessId?: string | null;
          businessName?: string | null;
          accountStatus?: number;
          connectionId?: string | null;
          iofPercent?: number;
        }) => ({
          user_id: scopedId,
          account_id: acc.id,
          account_name: acc.name,
          currency: acc.currency || "BRL",
          timezone_name: acc.timezoneName ?? null,
          business_id: acc.businessId ?? null,
          business_name: acc.businessName ?? null,
          account_status: acc.accountStatus ?? null,
          connection_id: acc.connectionId ?? null,
          iof_percent:
            Number.isFinite(Number(acc.iofPercent)) && Number(acc.iofPercent) >= 0
              ? Number(acc.iofPercent)
              : 0,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
      );

      const { error } = await supabase
        .from("meta_ad_accounts")
        .upsert(rows, { onConflict: "user_id,account_id" });

      if (error) {
        console.error("[v0] Error saving accounts:", error.message);
        return NextResponse.json(
          { error: "Falha ao salvar contas." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true, activeCount: accounts.length });
  } catch (error) {
    console.error("[v0] Error updating accounts:", error);
    return NextResponse.json({ error: "Falha ao atualizar." }, { status: 500 });
  }
}
