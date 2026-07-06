import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";
import {
  calculateCommission,
  getCurrentPeriod,
  type CommissionTx,
} from "@/lib/attendants/commission";
import type { Attendant, AttendantRule } from "@/types";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = await getEffectiveUserId(supabase, user.id);

  // Período fixo opcional (mesmo intervalo para todas). Sem parâmetros, cada
  // atendente usa seu próprio dia de fechamento.
  const { searchParams } = new URL(request.url);
  const qStart = searchParams.get("period_start");
  const qEnd = searchParams.get("period_end");
  const fixedPeriod = qStart && qEnd ? { start: qStart, end: qEnd } : null;

  const { data: attendants } = await supabase
    .from("attendants")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active");

  const list = (attendants || []) as Attendant[];

  if (list.length === 0) {
    return NextResponse.json({
      total_attendants: 0,
      total_to_pay: 0,
      total_paid_sales: 0,
      top_seller: null,
    });
  }

  const { data: allRules } = await supabase
    .from("attendant_rules")
    .select("*")
    .eq("user_id", userId);

  const rulesByAtt = new Map<string, AttendantRule[]>();
  for (const r of (allRules || []) as AttendantRule[]) {
    const arr = rulesByAtt.get(r.attendant_id) || [];
    arr.push(r);
    rulesByAtt.set(r.attendant_id, arr);
  }

  let totalToPay = 0;
  let totalPaidSales = 0;
  let topSeller: { name: string; sales: number } | null = null;

  for (const att of list) {
    if (!att.src) continue;
    const period = fixedPeriod ?? getCurrentPeriod(att.payment_closing_day || 1);

    const { data: txs } = await supabase
      .from("transactions")
      .select(
        "status, amount, total_value, paid_value, commission, affiliate_commission, sale_date, payment_date"
      )
      .eq("user_id", userId)
      .ilike("src", att.src)
      .eq("status", "pago");

    const paidSales = ((txs || []) as CommissionTx[]).filter((tx) => {
      const ref = (tx.payment_date || tx.sale_date || "").slice(0, 10);
      return ref >= period.start && ref <= period.end;
    });

    const result = calculateCommission(
      att,
      rulesByAtt.get(att.id) || [],
      paidSales,
      period
    );

    totalToPay += result.total_to_pay;
    totalPaidSales += result.total_sales;

    if (!topSeller || result.total_sales > topSeller.sales) {
      topSeller = { name: att.name, sales: result.total_sales };
    }
  }

  return NextResponse.json({
    total_attendants: list.length,
    total_to_pay: totalToPay,
    total_paid_sales: totalPaidSales,
    top_seller: topSeller && topSeller.sales > 0 ? topSeller : null,
  });
}
