import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const platform = searchParams.get("platform");

  let query = supabase
    .from("ad_investments")
    .select("*")
    .eq("user_id", await getEffectiveUserId(supabase, user.id))
    .order("date", { ascending: false });

  if (from) query = query.gte("date", from);
  if (to) query = query.lte("date", to);
  if (platform && platform !== "all") query = query.eq("platform", platform);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Calculate totals
  const totalInvested = (data || []).reduce(
    (sum, inv) => sum + Number(inv.investment_value || 0),
    0
  );

  return NextResponse.json({ investments: data || [], totalInvested });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { date, platform, campaign_name, investment_value } = body;

  if (!date || !investment_value) {
    return NextResponse.json(
      { error: "Data e valor sao obrigatorios" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("ad_investments")
    .insert({
      user_id: await getEffectiveUserId(supabase, user.id),
      date,
      platform: platform || "meta_ads",
      campaign_name: campaign_name || null,
      investment_value: parseFloat(investment_value),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ investment: data });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id, ...updates } = body;

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.date !== undefined) updatePayload.date = updates.date;
  if (updates.platform !== undefined) updatePayload.platform = updates.platform;
  if (updates.campaign_name !== undefined) updatePayload.campaign_name = updates.campaign_name;
  if (updates.investment_value !== undefined)
    updatePayload.investment_value = parseFloat(updates.investment_value);

  const { data, error } = await supabase
    .from("ad_investments")
    .update(updatePayload)
    .eq("id", id)
    .eq("user_id", await getEffectiveUserId(supabase, user.id))
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ investment: data });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase
    .from("ad_investments")
    .delete()
    .eq("id", id)
    .eq("user_id", await getEffectiveUserId(supabase, user.id));

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
