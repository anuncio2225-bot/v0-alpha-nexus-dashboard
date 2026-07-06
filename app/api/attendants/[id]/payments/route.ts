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
      total_to_pay: Number(b.total_to_pay) || 0,
      status: "paid",
      paid_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ payment: data });
}
