import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("cashflow")
    .select("*")
    .eq("user_id", await getEffectiveUserId(supabase, user.id))
    .order("date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entries: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { type, category, description, amount, date, payment_method, notes, include_in_profit } = body;

  if (!type || !category || !amount) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("cashflow")
    .insert({
      user_id: await getEffectiveUserId(supabase, user.id),
      type,
      category,
      description,
      amount,
      date: date || new Date().toISOString(),
      payment_method: payment_method || "pix",
      notes: notes || null,
      source: "manual",
      include_in_profit: include_in_profit === undefined ? true : !!include_in_profit,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entry: data });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "ID required" }, { status: 400 });
  }

  // Update parcial: só grava os campos enviados. Permite o toggle inline
  // (que manda apenas { id, include_in_profit }) sem apagar os demais campos.
  const updates: Record<string, unknown> = {};
  for (const key of [
    "type",
    "category",
    "description",
    "amount",
    "date",
    "payment_method",
    "notes",
  ]) {
    if (key in body) updates[key] = body[key];
  }
  if ("include_in_profit" in body) {
    updates.include_in_profit = !!body.include_in_profit;
  }

  const { data, error } = await supabase
    .from("cashflow")
    .update(updates)
    .eq("id", id)
    .eq("user_id", await getEffectiveUserId(supabase, user.id))
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ entry: data });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("cashflow")
    .delete()
    .eq("id", id)
    .eq("user_id", await getEffectiveUserId(supabase, user.id));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
