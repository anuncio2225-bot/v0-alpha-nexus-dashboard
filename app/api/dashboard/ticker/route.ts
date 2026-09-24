import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";

/**
 * GET /api/dashboard/ticker — últimas vendas próprias para a faixa que corre
 * no topo do painel. Só o necessário para exibir: produto, valor, status e data.
 * Nada de nome/telefone de cliente (a faixa fica visível na tela o tempo todo).
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = await getEffectiveUserId(supabase, user.id);

  const { data, error } = await supabase
    .from("transactions")
    .select("id, product_name, plan_name, total_value, amount, status, gateway, sale_date, created_at")
    .eq("user_id", userId)
    .or("origin_type.eq.own,origin_type.is.null")
    .order("sale_date", { ascending: false, nullsFirst: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const items = (data || []).map((t) => ({
    id: t.id,
    product: t.plan_name || t.product_name || "Venda",
    value: Number(t.total_value ?? t.amount ?? 0),
    status: t.status,
    gateway: t.gateway,
    at: t.sale_date || t.created_at,
  }));

  return NextResponse.json({ items });
}
