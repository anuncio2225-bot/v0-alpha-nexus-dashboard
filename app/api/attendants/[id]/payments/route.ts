import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";

async function auth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, userId: null as string | null };
  return { supabase, userId: await getEffectiveUserId(supabase, user.id) };
}

// Histórico de pagamentos da atendente
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("attendant_payments")
    .select("*")
    .eq("attendant_id", id)
    .eq("user_id", userId)
    .order("period_end", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ payments: data });
}

// Registrar pagamento (snapshot do cálculo do período)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const b = await request.json();

  // Impede registrar o MESMO período duas vezes para a mesma atendente.
  const { data: existing } = await supabase
    .from("attendant_payments")
    .select("id")
    .eq("user_id", userId)
    .eq("attendant_id", id)
    .eq("period_start", b.period_start)
    .eq("period_end", b.period_end)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "already_registered", message: "Este período já foi registrado." },
      { status: 409 }
    );
  }

  const totalToPay = Number(b.total_to_pay) || 0;

  const { data, error } = await supabase
    .from("attendant_payments")
    .insert({
      user_id: userId,
      attendant_id: id,
      period_start: b.period_start,
      period_end: b.period_end,
      total_sales: Number(b.total_sales) || 0,
      commission_percent: Number(b.commission_percent) || 0,
      commission_value: Number(b.commission_value) || 0,
      bonus_total: Number(b.bonus_total) || 0,
      fixed_per_sale_total: Number(b.fixed_per_sale_total) || 0,
      platform_deductions: Number(b.platform_deductions) || 0,
      total_to_pay: totalToPay,
      status: "paid",
      paid_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Lançamento opcional no Fluxo de Caixa (saída na categoria "Atendente").
  let cashflowRegistered = false;
  if (b.register_cashflow && totalToPay > 0) {
    const name = (b.attendant_name || "atendente").toString();
    const fmt = (d: string) => {
      if (!d) return "";
      const [, m, day] = d.split("-");
      return `${day}/${m}`;
    };
    const description = `Comissão ${name} - Período ${fmt(b.period_start)} a ${fmt(b.period_end)}`;
    const note = (b.note || "").toString().trim();

    const { error: cashErr } = await supabase.from("cashflow").insert({
      user_id: userId,
      type: "expense",
      category: "Atendente",
      description,
      amount: totalToPay,
      date: new Date().toISOString(),
      payment_method: "pix",
      notes: note || null,
      source: "atendente",
    });
    if (!cashErr) cashflowRegistered = true;
    else console.error("[v0] cashflow insert error:", cashErr.message);
  }

  return NextResponse.json({ payment: data, cashflow_registered: cashflowRegistered });
}
