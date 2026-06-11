import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Fixes Payt webhooks that were mislabeled as Braip (or another gateway).
 *
 * It scans this user's webhook_logs, identifies Payt payloads by their
 * distinctive (dotted) field shape, and realigns:
 *  - webhook_logs.gateway   -> "payt"
 *  - transactions           -> gateway="payt", source="payt", sale_type="recuperacao"
 *  - webhooks               -> source="payt", operational_type="recuperacao"
 *
 * Scoped to the authenticated user, idempotent (skips already-correct rows),
 * and never deletes any data.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Load all of this user's logs
  const { data: logs, error: logsErr } = await admin
    .from("webhook_logs")
    .select("id, webhook_id, gateway, payload")
    .eq("user_id", user.id);

  if (logsErr) {
    return NextResponse.json({ error: logsErr.message }, { status: 500 });
  }

  let fixedLogs = 0;
  let fixedTx = 0;
  let fixedValues = 0;
  const fixedWebhookIds = new Set<string>();

  // Payt sends all monetary values as INTEGER CENTS (e.g. 296616 = R$ 2.966,16).
  const centsToReais = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.round(n) / 100;
  };

  // Pull the affiliate (and producer) commission out of the dotted
  // "commission.N.type" / "commission.N.amount" structure.
  const extractCommissions = (p: Record<string, unknown>) => {
    let affiliate: number | null = null;
    let producer: number | null = null;
    for (let i = 0; i < 10; i++) {
      const type = p[`commission.${i}.type`];
      const amount = p[`commission.${i}.amount`];
      if (type === undefined && amount === undefined) continue;
      const reais = centsToReais(amount);
      if (type === "affiliation") affiliate = reais;
      else if (type === "producer") producer = reais;
    }
    return { affiliate, producer };
  };

  for (const log of logs || []) {
    const p = (log.payload || {}) as Record<string, unknown>;

    // Detect Payt by its real payload shape (dotted keys + Payt-only fields)
    const linkUrl = typeof p["link.url"] === "string" ? String(p["link.url"]) : "";
    const isPayt =
      linkUrl.toLowerCase().includes("payt") ||
      (!!p["seller_id"] && p["seller_id"] !== "") ||
      (!!p["cart_id"] && p["cart_id"] !== "") ||
      (!!p["customer.name"] && p["customer.name"] !== "") ||
      (!!p["transaction.payment_status"] &&
        p["transaction.payment_status"] !== "") ||
      (!!p["integration_key"] && p["integration_key"] !== "");

    if (!isPayt) continue;

    // Fix the log gateway (skip if already correct)
    if (log.gateway !== "payt") {
      const { error: logUpErr } = await admin
        .from("webhook_logs")
        .update({ gateway: "payt" })
        .eq("id", log.id)
        .eq("user_id", user.id);
      if (!logUpErr) fixedLogs += 1;
    }

    if (!log.webhook_id) continue;

    // 1) Fix gateway/source/sale_type for ALL transactions of this webhook.
    const { data: txRows, error: txErr } = await admin
      .from("transactions")
      .update({
        gateway: "payt",
        source: "payt",
        sale_type: "recuperacao",
        updated_at: new Date().toISOString(),
      })
      .eq("webhook_id", log.webhook_id)
      .eq("user_id", user.id)
      .neq("gateway", "payt")
      .select("id");

    if (!txErr) fixedTx += txRows?.length || 0;

    // 2) Re-extract the monetary values from the Payt payload (cents -> reais)
    //    and write them to the matching transaction. Payt values were never
    //    parsed before, so these transactions are sitting at R$ 0,00.
    const totalPrice = centsToReais(p["transaction.total_price"]);
    const { affiliate, producer } = extractCommissions(p);
    // Commission the affiliate actually receives drives the dashboard revenue.
    const commissionValue = affiliate ?? producer ?? totalPrice;

    // Only patch values when we actually found a total in the payload.
    if (totalPrice !== null) {
      // Match the transaction by its Payt transaction_id / cart_id, which are
      // stored in external_id / transaction_code.
      const txId = p["transaction_id"] ? String(p["transaction_id"]) : null;
      const cartId = p["cart_id"] ? String(p["cart_id"]) : null;
      const matchKeys = [txId, cartId].filter(Boolean) as string[];

      if (matchKeys.length > 0) {
        const orFilter = matchKeys
          .flatMap((k) => [`external_id.eq.${k}`, `transaction_code.eq.${k}`])
          .join(",");

        const valueUpdates: Record<string, unknown> = {
          total_value: totalPrice,
          paid_value: totalPrice,
          amount: totalPrice,
          updated_at: new Date().toISOString(),
        };
        if (affiliate !== null) valueUpdates.affiliate_commission = affiliate;
        if (producer !== null) valueUpdates.producer_commission = producer;
        if (commissionValue !== null) valueUpdates.commission = commissionValue;

        const { data: vRows, error: vErr } = await admin
          .from("transactions")
          .update(valueUpdates)
          .eq("webhook_id", log.webhook_id)
          .eq("user_id", user.id)
          .or(orFilter)
          .select("id");

        if (!vErr) fixedValues += vRows?.length || 0;
      }
    }

    // Fix the webhook config once per webhook
    if (!fixedWebhookIds.has(log.webhook_id)) {
      const { error: whErr } = await admin
        .from("webhooks")
        .update({
          source: "payt",
          operational_type: "recuperacao",
          updated_at: new Date().toISOString(),
        })
        .eq("id", log.webhook_id)
        .eq("user_id", user.id);
      if (!whErr) fixedWebhookIds.add(log.webhook_id);
    }
  }

  return NextResponse.json({
    fixed_logs: fixedLogs,
    fixed_transactions: fixedTx,
    fixed_values: fixedValues,
    fixed_webhooks: fixedWebhookIds.size,
    message:
      fixedLogs > 0 || fixedTx > 0 || fixedValues > 0
        ? `Corrigido: ${fixedLogs} logs, ${fixedTx} transações, ${fixedValues} valores, ${fixedWebhookIds.size} webhooks`
        : "Nenhuma correção necessária",
  });
}
