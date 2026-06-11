import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  fetchAdAccounts,
  MetaApiError,
  friendlyMetaMessage,
} from "@/lib/meta/graph";

// ============================================================================
// /api/meta/accounts — listar contas do token e selecionar quais monitorar
// ============================================================================

// GET: lista contas de anuncio do token, marcando quais ja estao selecionadas
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
    .select("access_token, is_connected")
    .eq("user_id", user.id)
    .single();

  if (!config?.is_connected || !config?.access_token) {
    return NextResponse.json({ error: "Meta nao conectado" }, { status: 400 });
  }

  try {
    const accounts = await fetchAdAccounts(config.access_token);

    // Contas ja salvas/ativas
    const { data: savedAccounts } = await supabase
      .from("meta_ad_accounts")
      .select("account_id, is_active")
      .eq("user_id", user.id);

    const savedMap = new Map(
      (savedAccounts || []).map((a) => [a.account_id, a.is_active])
    );

    const enriched = accounts.map((acc) => ({
      id: acc.accountId,
      name: acc.accountName,
      currency: acc.currency,
      status: acc.status,
      timezoneName: acc.timezoneName,
      businessId: acc.businessId,
      businessName: acc.businessName,
      isSelected: savedMap.has(acc.accountId),
      isActive: savedMap.get(acc.accountId) ?? false,
    }));

    return NextResponse.json({ accounts: enriched });
  } catch (err) {
    const message =
      err instanceof MetaApiError
        ? friendlyMetaMessage(err.kind)
        : "Falha ao buscar contas de anuncio.";
    // Token invalido: refletir no config
    if (err instanceof MetaApiError && err.kind === "invalid_token") {
      await supabase
        .from("meta_config")
        .update({ validation_status: "expired", is_connected: false })
        .eq("user_id", user.id);
    }
    console.error("[v0] Error fetching ad accounts:", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// PUT: selecionar/ativar contas. Faz upsert preservando metadados de BM.
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
        { error: "Lista de contas invalida" },
        { status: 400 }
      );
    }

    const selectedIds = accounts.map((a: { id: string }) => a.id);

    // Desativa contas que nao estao mais selecionadas (sem deletar histórico)
    await supabase
      .from("meta_ad_accounts")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .not(
        "account_id",
        "in",
        `(${selectedIds.length > 0 ? selectedIds.join(",") : "''"})`
      );

    // Upsert das selecionadas como ativas
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
        }) => ({
          user_id: user.id,
          account_id: acc.id,
          account_name: acc.name,
          currency: acc.currency || "BRL",
          timezone_name: acc.timezoneName ?? null,
          business_id: acc.businessId ?? null,
          business_name: acc.businessName ?? null,
          account_status: acc.accountStatus ?? null,
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
