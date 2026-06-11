import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Resets all transactional data for the authenticated user:
 * - transactions
 * - sales
 * - webhook_logs
 * - webhook_errors
 *
 * Does NOT touch: cashflow (manual entries only), profiles, webhooks
 * (URL configuration), attendants, goals.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const scope: "all" | "logs_only" = body?.scope === "logs_only" ? "logs_only" : "all";

  const admin = createAdminClient();
  const userId = user.id;

  const counts: Record<string, number | null> = {};

  try {
    // Always: clear webhook_logs and webhook_errors
    const { count: logsCount } = await admin
      .from("webhook_logs")
      .delete({ count: "exact" })
      .eq("user_id", userId);
    counts.webhook_logs = logsCount ?? 0;

    const { count: errorsCount } = await admin
      .from("webhook_errors")
      .delete({ count: "exact" })
      .eq("user_id", userId);
    counts.webhook_errors = errorsCount ?? 0;

    if (scope === "all") {
      // Clear sales
      const { count: salesCount } = await admin
        .from("sales")
        .delete({ count: "exact" })
        .eq("user_id", userId);
      counts.sales = salesCount ?? 0;

      // Clear transactions
      const { count: txCount } = await admin
        .from("transactions")
        .delete({ count: "exact" })
        .eq("user_id", userId);
      counts.transactions = txCount ?? 0;
    }

    return NextResponse.json({ success: true, scope, counts });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "unknown_error";
    console.error("[v0] Reset error:", err);
    return NextResponse.json(
      { success: false, error: message, counts },
      { status: 500 }
    );
  }
}
