import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    meta_tax_multiplier,
    timezone,
    currency,
    tax_percentage,
    ads_tax_percentage,
    manual_scheduled_value,
    manual_scheduled_count,
    manual_waiting_value,
    manual_waiting_count,
    manual_late_value,
    manual_late_count,
  } = body;

  const updates: Record<string, unknown> = {
    user_id: user.id,
    updated_at: new Date().toISOString(),
  };
  if (meta_tax_multiplier !== undefined) updates.meta_tax_multiplier = meta_tax_multiplier;
  if (timezone !== undefined) updates.timezone = timezone;
  if (currency !== undefined) updates.currency = currency;
  if (tax_percentage !== undefined) updates.tax_percentage = tax_percentage;
  if (ads_tax_percentage !== undefined) updates.ads_tax_percentage = ads_tax_percentage;
  if (manual_scheduled_value !== undefined) updates.manual_scheduled_value = manual_scheduled_value;
  if (manual_scheduled_count !== undefined) updates.manual_scheduled_count = manual_scheduled_count;
  if (manual_waiting_value !== undefined) updates.manual_waiting_value = manual_waiting_value;
  if (manual_waiting_count !== undefined) updates.manual_waiting_count = manual_waiting_count;
  if (manual_late_value !== undefined) updates.manual_late_value = manual_late_value;
  if (manual_late_count !== undefined) updates.manual_late_count = manual_late_count;

  const { data, error } = await supabase
    .from("settings")
    .upsert(updates, { onConflict: "user_id" })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}

// POST alias — some pages call POST instead of PATCH
export { PATCH as POST };
