import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";
import {
  calculateCommission,
  getCurrentPeriod,
  saleBaseValue,
  type CommissionTx,
} from "@/lib/attendants/commission";
import type { Attendant, AttendantRule } from "@/types";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = await getEffectiveUserId(supabase, user.id);

  const { data: attendant, error: attErr } = await supabase
    .from("attendants")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (attErr || !attendant) {
    return NextResponse.json({ error: "Attendant not found" }, { status: 404 });
  }

  const att = attendant as Attendant;

  // Período: parâmetros ou período de fechamento atual
  const { searchParams } = new URL(request.url);
  const qStart = searchParams.get("period_start");
  const qEnd = searchParams.get("period_end");
  const period =
    qStart && qEnd
      ? { start: qStart, end: qEnd }
      : getCurrentPeriod(att.payment_closing_day || 1);

  const { data: rules } = await supabase
    .from("attendant_rules")
    .select("*")
    .eq("attendant_id", id)
    .eq("user_id", userId);

  // Sem SRC configurado → não há vendas vinculadas
  let paidSales: (CommissionTx & {
    customer_name: string | null;
    product_name: string | null;
  })[] = [];

  if (att.src) {
    const { data: txs, error: txErr } = await supabase
      .from("transactions")
      .select(
        "status, amount, total_value, paid_value, product_price, commission, affiliate_commission, sale_date, payment_date, customer_name, product_name"
      )
      .eq("user_id", userId)
      // Comparação case-insensitive: "Bruna" == "bruna" == "BRUNA"
      .ilike("src", att.src)
      // Afiliados externos não têm atendente — não entram no cálculo de comissão.
      .or("origin_type.eq.own,origin_type.is.null")
      .eq("status", "pago");

    if (txErr) {
      return NextResponse.json({ error: txErr.message }, { status: 500 });
    }

    // Filtra pelo período usando payment_date (fallback sale_date)
    paidSales = (txs || []).filter((tx) => {
      const ref = (tx.payment_date || tx.sale_date || "").slice(0, 10);
      return ref >= period.start && ref <= period.end;
    });
  }

  // Fonte 2: clientes de Cobrança atribuídos manualmente a este atendente
  // que NÃO possuem transaction_id (vendas adicionadas manualmente). Assim não
  // duplicam com a fonte acima — as vendas vindas de transações já são cobertas
  // pelo src (que é propagado ao reatribuir o atendente na Cobrança).
  const { data: manualClients } = await supabase
    .from("collection_clients")
    .select(
      "name, product_name, total_value, order_total_value, paid_value, remaining_value, status_name, order_date, payment_date, created_at"
    )
    .eq("user_id", userId)
    .eq("attendant_id", id)
    .is("transaction_id", null);

  const manualSales = (manualClients || [])
    .filter((cc) => {
      const paid =
        Number(cc.paid_value) > 0 ||
        (Number(cc.total_value) > 0 && Number(cc.remaining_value) <= 0);
      if (!paid) return false;
      const ref = (cc.payment_date || cc.order_date || cc.created_at || "").slice(0, 10);
      return ref >= period.start && ref <= period.end;
    })
    .map((cc) => ({
      status: "pago",
      affiliate_commission: Number(cc.total_value) || 0,
      commission: Number(cc.total_value) || 0,
      total_value: Number(cc.order_total_value) || Number(cc.total_value) || 0,
      amount: Number(cc.order_total_value) || Number(cc.total_value) || 0,
      paid_value: Number(cc.paid_value) || 0,
      // Clientes manuais não têm product_price; o cálculo usa o fallback para total_value.
      product_price: Number(cc.total_value) || null,
      sale_date: cc.order_date,
      payment_date: cc.payment_date || cc.created_at,
      customer_name: cc.name,
      product_name: cc.product_name,
    }));

  paidSales = [...paidSales, ...manualSales];

  const result = calculateCommission(att, (rules || []) as AttendantRule[], paidSales, period);

  // Lista detalhada de vendas para a tela de Detalhes
  const sales = paidSales
    .map((tx) => {
      // "Venda" = preço do produto SEM juros (fallback total_value nas antigas).
      const saleValue =
        Number(tx.product_price) ||
        Number(tx.total_value) ||
        Number(tx.amount) ||
        Number(tx.paid_value) ||
        0;
      // "Cliente pagou" = valor com juros de parcelamento.
      const customerPaid =
        Number(tx.total_value) || Number(tx.amount) || Number(tx.paid_value) || 0;
      return {
        date: (tx.payment_date || tx.sale_date || "").slice(0, 10),
        customer_name: tx.customer_name,
        product_name: tx.product_name,
        sale_value: saleValue,
        customer_paid: customerPaid,
        base_value: saleBaseValue(tx, att),
        commission: saleBaseValue(tx, att) * (result.commission_tier.percent / 100),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  // Indica se a atendente tem ao menos uma faixa de comissão salva em
  // attendant_rules — usado para decidir se exibe o aviso "Configure as faixas".
  const hasCommissionRule = ((rules || []) as AttendantRule[]).some(
    (r) => r.rule_type === "commission"
  );

  return NextResponse.json({ ...result, sales, has_commission_rule: hasCommissionRule });
}
