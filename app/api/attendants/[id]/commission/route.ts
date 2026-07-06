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
        "status, amount, total_value, paid_value, commission, affiliate_commission, sale_date, payment_date, customer_name, product_name"
      )
      .eq("user_id", userId)
      .eq("src", att.src)
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

  const result = calculateCommission(att, (rules || []) as AttendantRule[], paidSales, period);

  // Lista detalhada de vendas para a tela de Detalhes
  const sales = paidSales
    .map((tx) => ({
      date: (tx.payment_date || tx.sale_date || "").slice(0, 10),
      customer_name: tx.customer_name,
      product_name: tx.product_name,
      sale_value:
        Number(tx.total_value) || Number(tx.amount) || Number(tx.paid_value) || 0,
      base_value: saleBaseValue(tx, att),
      commission: saleBaseValue(tx, att) * (result.commission_tier.percent / 100),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return NextResponse.json({ ...result, sales });
}
