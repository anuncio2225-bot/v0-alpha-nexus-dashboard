import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/webhooks/reconcile
 *
 * Retroactively fixes transactions/logs that were stored with the WRONG
 * gateway/sale_type because the old detectGateway() fell back to "braip" and
 * the webhook's operational_type wasn't applied.
 *
 * For every webhook owned by the current user, it re-aligns the related rows:
 *   - transactions.gateway / transactions.source  -> webhook.source (when not "universal")
 *   - transactions.sale_type                      -> webhook.operational_type
 *   - webhook_logs.gateway                         -> webhook.source (when not "universal")
 *
 * Idempotent: only updates rows that are actually out of sync, so running it
 * again has no further effect. NEVER deletes data.
 */
export async function POST(_req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const results: string[] = [];

    // 0. AUTO-DETECTION: webhooks configured as "universal"/"braip" that are
    // actually receiving Payt payloads (identified by Payt-exclusive fields in
    // the stored webhook_logs payloads) get their source fixed to "payt"
    // BEFORE reconciling, so the realignment below uses the right platform.
    const { data: allWebhooks, error: allErr } = await supabase
      .from("webhooks")
      .select("id, name, source, operational_type")
      .eq("user_id", await getEffectiveUserId(supabase, user.id));

    if (allErr) {
      return NextResponse.json({ error: allErr.message }, { status: 500 });
    }

    for (const wh of allWebhooks || []) {
      const src = (wh.source as string | null) || "universal";
      // Only inspect webhooks that could be misconfigured.
      if (src !== "universal" && src !== "braip") continue;

      const { data: sampleLogs } = await supabase
        .from("webhook_logs")
        .select("id, payload")
        .eq("webhook_id", wh.id)
        .eq("user_id", await getEffectiveUserId(supabase, user.id))
        .order("created_at", { ascending: false })
        .limit(5);

      const isPayt = (sampleLogs || []).some((log) => {
        const p = log.payload as Record<string, unknown> | null;
        if (!p || typeof p !== "object") return false;
        return (
          "seller_id" in p ||
          "cart_id" in p ||
          "integration_key" in p ||
          "customer.name" in p ||
          "transaction.payment_status" in p ||
          ("transaction_id" in p && !("trans_cod" in p)) ||
          (typeof p["link.url"] === "string" &&
            String(p["link.url"]).toLowerCase().includes("payt"))
        );
      });

      if (isPayt) {
        const { error: fixErr } = await supabase
          .from("webhooks")
          .update({ source: "payt" })
          .eq("id", wh.id)
          .eq("user_id", await getEffectiveUserId(supabase, user.id));
        if (!fixErr) {
          results.push(
            `Webhook "${wh.name}": source ${src} -> payt (payloads Payt detectados nos logs)`
          );
        }
      }
    }

    // 1. Load this user's webhooks (fresh, after auto-detection fixes).
    const { data: webhooks, error: whErr } = await supabase
      .from("webhooks")
      .select("id, name, source, operational_type")
      .eq("user_id", await getEffectiveUserId(supabase, user.id));

    if (whErr) {
      return NextResponse.json({ error: whErr.message }, { status: 500 });
    }

    let transactionsFixed = 0;
    let logsFixed = 0;

    for (const wh of webhooks || []) {
      if (!wh.id) continue;

      const source = wh.source as string | null;
      const operationalType = wh.operational_type as string | null;
      const hasConcreteSource = !!source && source !== "universal";
      let whTxFixed = 0;
      let whLogsFixed = 0;

      // --- Fix transactions for this webhook ---
      // Only touch the columns we can confidently re-derive from the webhook.
      const { data: txRows, error: txErr } = await supabase
        .from("transactions")
        .select("id, gateway, source, sale_type")
        .eq("user_id", await getEffectiveUserId(supabase, user.id))
        .eq("webhook_id", wh.id);

      if (txErr) {
        console.error("[v0] reconcile tx fetch error:", txErr.message);
        continue;
      }

      for (const tx of txRows || []) {
        const updates: Record<string, unknown> = {};

        if (hasConcreteSource) {
          if (tx.gateway !== source) updates.gateway = source;
          if (tx.source !== source) updates.source = source;
        }
        if (operationalType && tx.sale_type !== operationalType) {
          updates.sale_type = operationalType;
        }

        if (Object.keys(updates).length > 0) {
          const { error: upErr } = await supabase
            .from("transactions")
            .update(updates)
            .eq("id", tx.id)
            .eq("user_id", await getEffectiveUserId(supabase, user.id));
          if (!upErr) {
            transactionsFixed += 1;
            whTxFixed += 1;
          }
        }
      }

      // --- Fix webhook_logs gateway for this webhook ---
      if (hasConcreteSource) {
        const { data: logRows, error: logErr } = await supabase
          .from("webhook_logs")
          .select("id, gateway")
          .eq("user_id", await getEffectiveUserId(supabase, user.id))
          .eq("webhook_id", wh.id);

        if (logErr) {
          console.error("[v0] reconcile log fetch error:", logErr.message);
        } else {
          for (const log of logRows || []) {
            if (log.gateway !== source) {
              const { error: upErr } = await supabase
                .from("webhook_logs")
                .update({ gateway: source })
                .eq("id", log.id)
                .eq("user_id", await getEffectiveUserId(supabase, user.id));
              if (!upErr) {
                logsFixed += 1;
                whLogsFixed += 1;
              }
            }
          }
        }
      }

      if (whTxFixed > 0 || whLogsFixed > 0) {
        results.push(
          `Webhook "${wh.name}": ${whTxFixed} transacoes e ${whLogsFixed} logs corrigidos -> gateway="${source}", sale_type="${operationalType || "(payload)"}"`
        );
      }
    }

    if (results.length === 0) {
      results.push("Nenhuma correcao necessaria - tudo ja esta correto.");
    }
    results.push(
      `TOTAL: ${transactionsFixed} transacoes e ${logsFixed} logs corrigidos`
    );

    return NextResponse.json({
      success: true,
      transactionsFixed,
      logsFixed,
      results,
      message: `${transactionsFixed} transacoes e ${logsFixed} logs corrigidos.`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[v0] reconcile error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
