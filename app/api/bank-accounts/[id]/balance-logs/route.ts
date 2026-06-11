import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Get balance change history for a specific account.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("account_balance_logs")
    .select("*")
    .eq("account_id", id)
    .eq("user_id", user.id)
    .order("changed_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ logs: data });
}
