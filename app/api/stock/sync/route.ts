import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";
import { resolveKitUnits, type KitRow } from "@/lib/stock/kit";

/**
 * POST /api/stock/sync — cria saídas de estoque para TODAS as vendas pagas
 * (own + affiliate_incoming) que ainda não possuem uma saída correspondente.
 * Idempotente: pula transações que já têm saída. Retorna quantas foram criadas.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = await getEffectiveUserId(supabase, user.id);

  // Kits configurados (para o match de quantidade)
  const { data: kitsRaw } = await supabase
    .from("product_costs")
    .select("product_keyword, units_per_kit")
    .eq("user_id", userId);
  const kits = (kitsRaw || []) as KitRow[];

  // Transações pagas
  const { data: txsRaw, error: txErr } = await supabase
    .from("transactions")
    .select("id, status, plan_name, product_name, customer_name, payment_date, sale_date, created_at")
    .eq("user_id", userId)
    .eq("status", "pago")
    .in("origin_type", ["own", "affiliate_incoming"]);
  if (txErr)
    return NextResponse.json({ error: txErr.message }, { status: 500 });
  const txs = txsRaw || [];

  // Saídas já existentes (para não duplicar)
  const { data: existingRaw } = await supabase
    .from("stock_movements")
    .select("transaction_id")
    .eq("user_id", userId)
    .eq("type", "exit")
    .not("transaction_id", "is", null);
  const existing = new Set(
    (existingRaw || []).map((r) => r.transaction_id as string)
  );

  const toInsert = txs
    .filter((t) => !existing.has(t.id))
    .map((t) => {
      const { units, matched } = resolveKitUnits(t.plan_name, t.product_name, kits);
      const label = `${t.customer_name || "Cliente"} - ${t.plan_name || t.product_name || "Produto"}`;
      return {
        user_id: userId,
        type: "exit" as const,
        quantity: units,
        transaction_id: t.id,
        product_name: t.plan_name || t.product_name || null,
        description: `Venda: ${label}`,
        kit_matched: matched,
        date: t.payment_date || t.sale_date || t.created_at || new Date().toISOString(),
      };
    });

  let created = 0;
  // Insere em lotes de 500 para evitar payloads muito grandes
  for (let i = 0; i < toInsert.length; i += 500) {
    const batch = toInsert.slice(i, i + 500);
    const { error, count } = await supabase
      .from("stock_movements")
      .insert(batch, { count: "exact" });
    if (error && error.code !== "23505")
      return NextResponse.json({ error: error.message }, { status: 500 });
    created += count ?? batch.length;
  }

  return NextResponse.json({ created, total_paid: txs.length });
}
