import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Reorder bank accounts by position.
 * Body: { order: string[] } where order is array of account IDs in desired order.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { order } = body as { order: string[] };

  if (!order || !Array.isArray(order)) {
    return NextResponse.json(
      { error: "order array required" },
      { status: 400 }
    );
  }

  // Update each account's position based on its index in the order array
  const updates = order.map((id, index) => ({
    id,
    user_id: user.id,
    position: index + 1,
    updated_at: new Date().toISOString(),
  }));

  // Batch update - Supabase doesn't support batch update natively,
  // so we do individual updates in a transaction-like manner
  for (const u of updates) {
    const { error } = await supabase
      .from("bank_accounts")
      .update({ position: u.position, updated_at: u.updated_at })
      .eq("id", u.id)
      .eq("user_id", user.id);

    if (error) {
      console.error("[v0] Reorder error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, count: updates.length });
}
