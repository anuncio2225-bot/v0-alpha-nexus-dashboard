import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = await getEffectiveUserId(supabase, user.id);
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  if ("product_name" in body)
    updates.product_name = String(body.product_name || "").trim();
  if ("product_keyword" in body)
    updates.product_keyword = String(body.product_keyword || "").trim();
  if ("units_per_kit" in body)
    updates.units_per_kit = Number(body.units_per_kit) || 1;
  if ("custom_shipping" in body)
    updates.custom_shipping =
      body.custom_shipping === null || body.custom_shipping === "" || body.custom_shipping === undefined
        ? null
        : Number(body.custom_shipping);

  const { data, error } = await supabase
    .from("product_costs")
    .update(updates)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ productCost: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = await getEffectiveUserId(supabase, user.id);

  const { error } = await supabase
    .from("product_costs")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
