import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";

const DEFAULT = { default_unit_cost: 0, low_stock_alert: 50 };

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = await getEffectiveUserId(supabase, user.id);
  const { data, error } = await supabase
    .from("stock_config")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ config: data || { ...DEFAULT, user_id: userId } });
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
    default_unit_cost: Number(body.default_unit_cost) || 0,
    low_stock_alert: Math.round(Number(body.low_stock_alert) || 0),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("stock_config")
    .upsert(payload, { onConflict: "user_id" })
    .select()
    .single();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ config: data });
}
