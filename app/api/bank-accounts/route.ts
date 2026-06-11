import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("bank_accounts")
    .select("*")
    .eq("user_id", user.id)
    .order("position", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ accounts: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, bank_name, account_type, balance, color, category } = body;

  if (!name) {
    return NextResponse.json({ error: "Name required" }, { status: 400 });
  }

  // Get next position
  const { data: maxPosData } = await supabase
    .from("bank_accounts")
    .select("position")
    .eq("user_id", user.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition = (maxPosData?.position ?? 0) + 1;

  const { data, error } = await supabase
    .from("bank_accounts")
    .insert({
      user_id: user.id,
      name,
      bank_name,
      account_type: account_type || "checking",
      balance: balance || 0,
      color: color || "#10b981",
      category: category || "bank",
      position: nextPosition,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ account: data });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, balance, ...otherUpdates } = body;

  if (!id) {
    return NextResponse.json({ error: "ID required" }, { status: 400 });
  }

  // If balance is being changed, log the old value first
  if (balance !== undefined) {
    const { data: current } = await supabase
      .from("bank_accounts")
      .select("balance")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (current && Number(current.balance) !== Number(balance)) {
      await supabase.from("account_balance_logs").insert({
        account_id: id,
        user_id: user.id,
        old_balance: Number(current.balance),
        new_balance: Number(balance),
      });
    }
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    ...otherUpdates,
    updated_at: now,
  };
  if (balance !== undefined) {
    updates.balance = balance;
    updates.last_balance_update = now;
  }

  const { data, error } = await supabase
    .from("bank_accounts")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ account: data });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "ID required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("bank_accounts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
