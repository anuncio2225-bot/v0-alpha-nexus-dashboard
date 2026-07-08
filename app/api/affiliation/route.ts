import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";

interface AffiliateTx {
  affiliate_name: string | null;
  affiliate_commission: number | null;
  commission: number | null;
  total_value: number | null;
  amount: number | null;
  product_price: number | null;
  product_name: string | null;
  customer_name: string | null;
  gateway: string | null;
  status: string | null;
  sale_date: string | null;
  payment_date: string | null;
}

interface AffiliateGroup {
  affiliate_name: string;
  approved_sales: number; // quantidade de vendas aprovadas
  total_commission: number; // comissão do afiliado (o que ele recebeu)
  total_volume: number; // volume de vendas (preço dos produtos)
}

/**
 * Vendas de AFILIADOS EXTERNOS (origin_type = 'affiliate_incoming').
 * São vendas em que o dono é o produtor e um afiliado de fora vendeu o produto.
 * Não entram no dashboard/atendentes/cobrança — só aqui, para acompanhamento.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = await getEffectiveUserId(supabase, user.id);

  const { searchParams } = new URL(request.url);
  const qStart = searchParams.get("period_start");
  const qEnd = searchParams.get("period_end");

  let query = supabase
    .from("transactions")
    .select(
      "affiliate_name, affiliate_commission, commission, total_value, amount, product_price, product_name, customer_name, gateway, status, sale_date, payment_date"
    )
    .eq("user_id", userId)
    .eq("origin_type", "affiliate_incoming")
    // Apenas vendas APROVADAS: só interessa quantas foram aprovadas e a comissão
    // efetivamente recebida. Canceladas/pendentes/reembolsadas ficam de fora.
    .eq("status", "pago");

  // Filtro de período opcional pela data da venda (ou pagamento como fallback).
  if (qStart && qEnd) {
    query = query.or(
      `and(sale_date.gte.${qStart},sale_date.lte.${qEnd}),and(sale_date.is.null,payment_date.gte.${qStart},payment_date.lte.${qEnd})`
    );
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const txs = (data || []) as AffiliateTx[];

  // Agrupa por afiliado (todas as linhas aqui já são vendas APROVADAS).
  const groupsMap = new Map<string, AffiliateGroup>();
  let totalCommission = 0;
  let totalVolume = 0;

  for (const tx of txs) {
    const name = (tx.affiliate_name || "Afiliado não identificado").trim();
    const commission = Number(tx.affiliate_commission) || Number(tx.commission) || 0;
    const volume =
      Number(tx.product_price) || Number(tx.total_value) || Number(tx.amount) || 0;

    let g = groupsMap.get(name);
    if (!g) {
      g = { affiliate_name: name, approved_sales: 0, total_commission: 0, total_volume: 0 };
      groupsMap.set(name, g);
    }
    g.approved_sales += 1;
    g.total_commission += commission;
    g.total_volume += volume;
    totalCommission += commission;
    totalVolume += volume;
  }

  const groups = Array.from(groupsMap.values()).sort(
    (a, b) => b.total_commission - a.total_commission
  );

  return NextResponse.json({
    summary: {
      total_affiliates: groups.length,
      approved_sales: txs.length,
      total_commission: totalCommission,
      total_volume: totalVolume,
    },
    groups,
  });
}
