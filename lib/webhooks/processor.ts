import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeBraip, isBraipPayload } from "./normalizers/braip";
import { normalizeKiwify, isKiwifyPayload } from "./normalizers/kiwify";
import { normalizePayt, isPaytPayload } from "./normalizers/payt";
import { normalizePag2Pay, isPag2PayPayload } from "./normalizers/pag2pay";
import { normalizeGeneric } from "./normalizers/generic";
import {
  buildAttendantMap,
  buildStatusMap,
  syncTransactionToCollection,
} from "@/lib/collections/sync";
import type { NormalizedEvent, ProcessResult, WebhookGateway } from "./types";

export interface ProcessOptions {
  forceGateway?: WebhookGateway;
  headers?: Record<string, string>;
  webhookId?: string;
}

export interface ResolvedWebhook {
  webhook_id: string;
  user_id: string;
  source: string;
  is_active: boolean;
}

/**
 * Resolve webhook + user_id from token (new multi-webhook table).
 * Falls back to legacy profiles.webhook_token for backwards compat.
 */
export async function resolveWebhookFromToken(
  token: string
): Promise<ResolvedWebhook | null> {
  try {
    const supabase = createAdminClient();

    // Try new webhooks table first
    const { data: webhook } = await supabase
      .from("webhooks")
      .select("id, user_id, source, is_active")
      .eq("token", token)
      .maybeSingle();

    if (webhook) {
      return {
        webhook_id: webhook.id,
        user_id: webhook.user_id,
        source: webhook.source,
        is_active: webhook.is_active,
      };
    }

    // Legacy fallback: profiles.webhook_token (UUID format, with or without dashes)
    const tokenNoDash = token.replace(/-/g, "");
    const tokenWithDash = token.includes("-")
      ? token
      : `${token.slice(0, 8)}-${token.slice(8, 12)}-${token.slice(12, 16)}-${token.slice(16, 20)}-${token.slice(20)}`;

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, webhook_token")
      .or(`webhook_token.eq.${token},webhook_token.eq.${tokenNoDash},webhook_token.eq.${tokenWithDash}`)
      .maybeSingle();

    if (profile) {
      return {
        webhook_id: "",
        user_id: profile.id,
        source: "universal",
        is_active: true,
      };
    }

    return null;
  } catch (err) {
    console.error("[v0] resolveWebhookFromToken error:", err);
    return null;
  }
}

/**
 * Detect "PIX de termo" pattern that should be silently ignored:
 * - afterpay (pay_on_delivery=true OR pay_on_delivery=1)
 * - AND status is aguardando (status_code=1, "aguardando", "pending", "Aguardando Pagamento")
 *
 * These represent customers who only initiated checkout but haven't paid.
 * The real sale arrives later when status changes to "pago" (status_code=2).
 */
function isAfterpayAwaiting(payload: Record<string, unknown>): boolean {
  const payOnDeliveryRaw =
    payload.trans_pay_on_delivery ??
    payload.pay_on_delivery ??
    payload.afterpay ??
    payload.pagamento_na_entrega;

  const isAfterpay =
    payOnDeliveryRaw === true ||
    payOnDeliveryRaw === 1 ||
    payOnDeliveryRaw === "1" ||
    String(payOnDeliveryRaw).toLowerCase() === "true" ||
    String(payOnDeliveryRaw).toLowerCase() === "sim";

  if (!isAfterpay) return false;

  const statusRaw = String(
    payload.trans_status ??
      payload.status ??
      payload.transaction_status ??
      ""
  )
    .toLowerCase()
    .trim();

  const isAwaiting =
    statusRaw === "1" ||
    statusRaw === "aguardando" ||
    statusRaw === "pending" ||
    statusRaw === "aguardando pagamento";

  return isAwaiting;
}

/**
 * Detect which gateway sent the payload by inspecting its shape.
 * Returns "unknown" when it can't confidently identify the source - the caller
 * (forceGateway from the webhook's configured `source`) resolves it instead.
 * IMPORTANT: never falls back to "braip" as a generic catch-all, otherwise
 * Payt/Pag2Pay payloads would be mislabeled as Braip.
 */
export function detectGateway(payload: Record<string, unknown>): WebhookGateway {
  // Check explicit gateway field first
  const explicit = payload.gateway || payload.platform || payload.source;
  if (typeof explicit === "string") {
    const lower = explicit.toLowerCase().trim();
    const compact = lower.replace(/\s+/g, "");
    if (lower === "braip") return "braip";
    if (lower === "kiwify") return "kiwify";
    if (lower === "payt") return "payt";
    if (compact === "pag2pay" || compact === "pag2ppay" || compact === "pag2p")
      return "pag2pay";
  }

  // Check by payload shape (specific platforms first)
  if (isPaytPayload(payload)) return "payt";
  if (isPag2PayPayload(payload)) return "pag2pay";
  if (isKiwifyPayload(payload)) return "kiwify";
  if (isBraipPayload(payload)) return "braip";

  // Unknown: do NOT guess braip. Let the webhook's configured source
  // (forceGateway) decide. If it's "universal", it will be logged as unknown.
  return "unknown";
}

/**
 * Normalize raw payload using the appropriate gateway normalizer.
 * Never returns null - always creates a minimal event for logging.
 */
export function normalize(
  payload: Record<string, unknown>,
  gateway: WebhookGateway
): NormalizedEvent {
  let event: NormalizedEvent | null = null;

  try {
    switch (gateway) {
      case "braip":
        event = normalizeBraip(payload);
        break;
      case "kiwify":
        event = normalizeKiwify(payload);
        break;
      case "payt":
        event = normalizePayt(payload);
        break;
      case "pag2pay":
        event = normalizePag2Pay(payload);
        break;
      default:
        // Unknown gateway: use the generic normalizer (tries common fields)
        // instead of assuming Braip, so we don't mislabel the source.
        event = normalizeGeneric(payload, gateway || "unknown");
        break;
    }
  } catch (err) {
    console.error("[v0] normalize error:", err);
  }

  // Always return something - never null
  if (!event) {
    event = {
      gateway: gateway || "unknown",
      external_id: `unknown_${Date.now()}`,
      event_type: String(payload.event || payload.type || "UNKNOWN"),
      status: "other",
      amount: 0,
      currency: "BRL",
    };
  }

  return event;
}

/**
 * Main entrypoint: receive a raw payload + user token, log it,
 * normalize it, and upsert the transaction.
 *
 * NEVER throws - always returns a result and logs everything.
 * Always returns 200 to avoid Braip blocking the webhook.
 */
export async function processWebhook(
  userId: string,
  payload: Record<string, unknown>,
  options: ProcessOptions = {}
): Promise<ProcessResult> {
  const supabase = createAdminClient();
  let logRowId: string | null = null;

  try {
    const gateway = options.forceGateway ?? detectGateway(payload);
    const webhookId = options.webhookId || null;

    // Fetch the webhook's configured operational_type (afterpay | antecipado |
    // recuperacao). When set, it OVERRIDES the sale_type derived from the
    // payload, so a webhook tagged as "recuperacao" always classifies its
    // transactions as recovery sales (the payload status is still respected).
    let webhookOperationalType: string | null = null;
    if (webhookId) {
      try {
        const { data: whCfg } = await supabase
          .from("webhooks")
          .select("operational_type")
          .eq("id", webhookId)
          .maybeSingle();
        webhookOperationalType = whCfg?.operational_type || null;
      } catch {
        // Non-blocking - fall back to payload-derived sale_type
      }
    }

    // Extract event type for logging
    const eventType = String(
      payload.event ||
        payload.event_type ||
        payload.type ||
        payload.webhook_event_type ||
        "UNKNOWN"
    );

    console.log("[v0] Webhook received:", { gateway, eventType, userId });
    console.log("[v0] Payload:", JSON.stringify(payload).slice(0, 500));

    // CRITICAL RULE: PIX de termo (afterpay aguardando) - SKIP SILENTLY
    // Sales that are afterpay AND still aguardando are not real sales yet,
    // they are just the customer initiating checkout. Wait for the paid event.
    if (isAfterpayAwaiting(payload)) {
      console.log("[v0] SKIP: PIX de termo (afterpay aguardando) - ignored silently");
      return {
        success: true,
        message: "skipped_afterpay_awaiting",
        action: "skipped",
      };
    }

    // 1. ALWAYS log the incoming webhook first (even before parsing)
    try {
      const { data: logRow } = await supabase
        .from("webhook_logs")
        .insert({
          user_id: userId,
          webhook_id: webhookId,
          gateway,
          event_type: eventType,
          payload,
          headers: options.headers || {},
          status: "received",
        })
        .select("id")
        .single();

      logRowId = logRow?.id || null;
    } catch (logErr) {
      console.error("[v0] Failed to create webhook_log:", logErr);
      // Continue anyway - don't block processing
    }

    // 2. Normalize the payload (never returns null now)
    const event = normalize(payload, gateway);

    console.log("[v0] Normalized event:", {
      gateway: event.gateway,
      external_id: event.external_id,
      status: event.status,
      amount: event.amount,
    });

    // 3. Skip upsert if no valid external_id (but still log)
    if (!event.external_id || event.external_id.startsWith("unknown_")) {
      console.log("[v0] No valid external_id, skipping upsert but logged");

      if (logRowId) {
        await supabase
          .from("webhook_logs")
          .update({
            status: "logged_only",
            error_message: "No valid external_id found in payload",
          })
          .eq("id", logRowId);
      }

      return {
        success: true,
        message: "logged_only",
        action: "logged",
      };
    }

    // 4. Build transaction row
    const tx: Record<string, unknown> = {
      user_id: userId,
      webhook_id: webhookId,
      gateway: event.gateway,
      external_id: event.external_id,
      transaction_code: event.external_id,
      status: event.status,
      status_code: event.status_code || null,
      original_status: event.original_status || null,

      product_name: event.product_name || null,
      product_id: event.product_id || null,
      plan_name: event.plan_name || null,

      customer_name: event.customer_name || null,
      customer_email: event.customer_email || null,
      customer_phone: event.customer_phone || null,
      customer_doc: event.customer_doc || null,

      amount: event.amount || 0,
      total_value: event.total_value ?? event.amount ?? 0,
      paid_value: event.paid_value ?? event.amount ?? 0,
      commission: event.commission ?? 0,
      affiliate_commission: event.affiliate_commission ?? 0,
      producer_commission: event.producer_commission ?? 0,
      currency: event.currency ?? "BRL",

      payment_method: event.payment_method || null,
      sale_date: event.sale_date || new Date().toISOString(),
      payment_date:
        event.payment_date ||
        (event.status === "pago" ? new Date().toISOString() : null),
      guarantee_date: event.guarantee_date || null,
      // The webhook's configured operational_type (afterpay | antecipado |
      // recuperacao) is the source of truth for sale_type. It reflects how the
      // user set up that integration. We only fall back to the payload-derived
      // sale_type when the webhook has no operational_type configured (e.g.
      // legacy "universal" token without a webhook row).
      sale_type:
        webhookOperationalType || event.sale_type || "antecipado",
      pay_on_delivery: event.pay_on_delivery ?? false,

      tracking_code: event.tracking_code || null,
      tracking_url: event.tracking_url || null,
      shipping_status: event.shipping_status || null,

      utm_source: event.utm_source || null,
      utm_campaign: event.utm_campaign || null,
      src: event.src || null,
      fbclid: event.fbclid || null,

      source: event.gateway,
      raw_payload: payload,
      updated_at: new Date().toISOString(),
    };

    // 5. Upsert - use conflict on unique index (user_id, gateway, external_id)
    const { data: upserted, error: upsertError } = await supabase
      .from("transactions")
      .upsert(tx, { onConflict: "user_id,gateway,external_id" })
      .select("id")
      .single();

    if (upsertError) {
      console.error("[v0] Upsert error:", upsertError.message);

      // Log the error but don't fail
      await supabase.from("webhook_errors").insert({
        user_id: userId,
        webhook_id: webhookId,
        gateway,
        error_message: upsertError.message,
        payload,
      });

      if (logRowId) {
        await supabase
          .from("webhook_logs")
          .update({ status: "error", error_message: upsertError.message })
          .eq("id", logRowId);
      }

      // Still return success to avoid Braip blocking
      return {
        success: true,
        message: "logged_with_error",
        error: upsertError.message,
        action: "error",
      };
    }

    // ARCHITECTURE RULE: webhook NEVER feeds the cashflow table automatically.
    // Cashflow is reserved for MANUAL entries only (controle financeiro interno).
    // Webhook events update only the transactions table and dashboard metrics.

    // 6b. Sincroniza automaticamente com o modulo de Cobranca.
    // Cria um collection_client novo (ou atualiza o status do existente quando o
    // webhook manda uma mudanca de status, ex.: agendado -> pago). NUNCA altera a
    // tabela transactions a partir daqui. E nao bloqueia o retorno do webhook.
    try {
      const collectionTx = {
        id: upserted?.id as string,
        customer_name: event.customer_name || null,
        customer_phone: event.customer_phone || null,
        customer_email: event.customer_email || null,
        customer_doc: event.customer_doc || null,
        product_name: event.product_name || null,
        product_id: event.product_id || null,
        gateway: event.gateway || null,
        src: event.src || null,
        attendant_id: null,
        status: event.status || null,
        affiliate_commission: event.affiliate_commission ?? 0,
        commission: event.commission ?? 0,
        total_value: event.total_value ?? event.amount ?? 0,
        amount: event.amount ?? 0,
        sale_date: event.sale_date || null,
        created_at: event.sale_date || new Date().toISOString(),
        payment_method: event.payment_method || null,
        tracking_code: event.tracking_code || null,
      };

      await supabase.rpc("seed_collection_defaults", { p_user_id: userId });
      const [statusMap, attMap] = await Promise.all([
        buildStatusMap(supabase, userId),
        buildAttendantMap(supabase, userId),
      ]);
      await syncTransactionToCollection(
        supabase,
        userId,
        collectionTx,
        statusMap,
        attMap
      );
    } catch (collErr) {
      console.error("[v0] collection sync error (non-blocking):", collErr);
    }

    // 7. Mark log as processed
    if (logRowId) {
      await supabase
        .from("webhook_logs")
        .update({ status: "processed" })
        .eq("id", logRowId);
    }

    console.log("[v0] Webhook processed successfully:", upserted?.id);

    return {
      success: true,
      message: "ok",
      transaction_id: upserted?.id,
      action: "updated",
    };
  } catch (err) {
    // Global catch - NEVER let the webhook fail
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error("[v0] Global webhook error:", errorMessage);

    // Try to log the error
    try {
      await supabase.from("webhook_errors").insert({
        user_id: userId,
        webhook_id: options.webhookId || null,
        gateway: options.forceGateway || "unknown",
        error_message: errorMessage,
        payload,
      });

      if (logRowId) {
        await supabase
          .from("webhook_logs")
          .update({ status: "error", error_message: errorMessage })
          .eq("id", logRowId);
      }
    } catch {
      // Even logging failed - just console
      console.error("[v0] Failed to log error");
    }

    // Always return 200 to avoid blocking
    return {
      success: true,
      message: "logged_with_error",
      error: errorMessage,
      action: "error",
    };
  }
}
