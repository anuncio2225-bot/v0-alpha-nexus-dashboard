import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";

const DEFAULT_CONFIG = {
  cost_per_unit: 0,
  shipping_cost: 0,
  affiliate_percent: 50,
  affiliate_platform_fee: 5.99,
  affiliate_platform_fixed: 1,
  company_reserve_percent: 33.33,
  excluded_cashflow_categories: ["Investimento Ads", "Meta Ads"] as string[],
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = await getEffectiveUserId(supabase, user.id);

  const { data, error } = await supabase
    .from("profit_config")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ config: data || { ...DEFAULT_CONFIG, user_id: userId } });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = await getEffectiveUserId(supabase, user.id);
  const body = await request.json();

  const payload = {
    user_id: userId,
    cost_per_unit: Number(body.cost_per_unit) || 0,
    shipping_cost: Number(body.shipping_cost) || 0,
    affiliate_percent: Number(body.affiliate_percent) || 0,
    affiliate_platform_fee: Number(body.affiliate_platform_fee) || 0,
    affiliate_platform_fixed: Number(body.affiliate_platform_fixed) || 0,
    company_reserve_percent: Number(body.company_reserve_percent) || 0,
    excluded_cashflow_categories: Array.isArray(body.excluded_cashflow_categories)
      ? body.excluded_cashflow_categories
      : DEFAULT_CONFIG.excluded_cashflow_categories,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("profit_config")
    .upsert(payload, { onConflict: "user_id" })
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ config: data });
}
