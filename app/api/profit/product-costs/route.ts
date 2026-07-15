import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = await getEffectiveUserId(supabase, user.id);

  const { data, error } = await supabase
    .from("product_costs")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  // Sugestões: product_name únicos das transações pagas que ainda não têm kit.
  const { data: txProducts } = await supabase
    .from("transactions")
    .select("product_name, plan_name")
    .eq("user_id", userId)
    .eq("status", "pago")
    .or("origin_type.eq.own,origin_type.is.null")
    .not("product_name", "is", null)
    .limit(500);

  const suggestions = Array.from(
    new Set(
      (txProducts || [])
        .map((t) => (t.plan_name || t.product_name || "").trim())
        .filter(Boolean)
    )
  ).slice(0, 30);

  return NextResponse.json({ productCosts: data || [], suggestions });
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

  const productName = String(body.product_name || "").trim();
  const keyword = String(body.product_keyword || "").trim();
  if (!productName || !keyword)
    return NextResponse.json(
      { error: "Nome e keyword são obrigatórios" },
      { status: 400 }
    );

  const { data, error } = await supabase
    .from("product_costs")
    .insert({
      user_id: userId,
      product_name: productName,
      product_keyword: keyword,
      units_per_kit: Number(body.units_per_kit) || 1,
      custom_shipping:
        body.custom_shipping === null || body.custom_shipping === "" || body.custom_shipping === undefined
          ? null
          : Number(body.custom_shipping),
    })
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ productCost: data });
}
