import type { NormalizedEvent } from "../types";

// Kiwify order status -> canonical
const KIWIFY_STATUS: Record<string, string> = {
  paid: "approved",
  approved: "approved",
  waiting_payment: "pending",
  pending: "pending",
  refused: "expired",
  refunded: "refunded",
  chargedback: "chargeback",
  canceled: "cancelled",
  cancelled: "cancelled",
};

const KIWIFY_PAYMENT: Record<string, string> = {
  credit_card: "credit_card",
  boleto: "boleto",
  pix: "pix",
};

function parseValue(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") {
    // Kiwify usually sends in centavos
    return v > 9999 && Number.isInteger(v) ? v / 100 : v;
  }
  const s = String(v).replace(",", ".");
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  if (!s.includes(".") && n > 9999) return n / 100;
  return n;
}

export function isKiwifyPayload(payload: Record<string, unknown>): boolean {
  return (
    "order_id" in payload ||
    "order_status" in payload ||
    "kiwify" in payload ||
    payload.platform === "kiwify" ||
    payload.gateway === "kiwify" ||
    ("webhook_event_type" in payload &&
      typeof payload.webhook_event_type === "string" &&
      (payload.webhook_event_type as string).includes("order"))
  );
}

export function normalizeKiwify(payload: Record<string, unknown>): NormalizedEvent | null {
  const externalId = String(
    payload.order_id || payload.id || payload.transaction_id || ""
  );
  if (!externalId) return null;

  const rawStatus = String(payload.order_status || payload.status || "");
  const eventType = String(payload.webhook_event_type || payload.event || "order.updated");

  const product = (payload.Product || payload.product || {}) as Record<string, unknown>;
  const plan = (payload.subscription_plan || {}) as Record<string, unknown>;
  const customer = (payload.Customer || payload.customer || {}) as Record<string, unknown>;
  const commissions = (payload.Commissions || payload.commissions || {}) as Record<string, unknown>;
  const payment = (payload.payment_merchant || {}) as Record<string, unknown>;
  const tracking = (payload.tracking_parameters || {}) as Record<string, unknown>;

  const totalValue = parseValue(
    payload.total_value ||
      payload.product_value ||
      payload.charge_amount ||
      payload.value ||
      product.value
  );
  const paidValue = parseValue(payload.paid_value || payload.net_value || totalValue);
  const commission = parseValue(commissions.my_commission || commissions.commission || 0);

  const paymentMethodRaw = String(payload.payment_method || payment.payment_method || "").toLowerCase();

  return {
    gateway: "kiwify",
    external_id: externalId,
    event_type: eventType,
    status: KIWIFY_STATUS[rawStatus.toLowerCase()] || "other",
    status_code: rawStatus || undefined,
    original_status: rawStatus || undefined,

    product_name: String(product.product_name || payload.product_name || "") || undefined,
    product_id: String(product.product_id || payload.product_id || "") || undefined,
    plan_name: String(plan.name || "") || undefined,

    customer_name:
      String(
        customer.full_name ||
          customer.first_name ||
          payload.customer_name ||
          ""
      ) || undefined,
    customer_email: String(customer.email || payload.customer_email || "") || undefined,
    customer_phone: String(customer.mobile || customer.phone || payload.customer_phone || "") || undefined,
    customer_doc: String(customer.cpf || customer.cnpj || customer.document || "") || undefined,

    amount: paidValue || totalValue,
    total_value: totalValue,
    paid_value: paidValue || totalValue,
    commission,
    currency: String(payload.currency || "BRL"),

    payment_method: KIWIFY_PAYMENT[paymentMethodRaw] || paymentMethodRaw || undefined,

    sale_date: String(payload.created_at || payload.approved_date || "") || undefined,
    guarantee_date: String(payload.guarantee_date || "") || undefined,

    tracking_code: String(payload.tracking_code || "") || undefined,
    tracking_url: String(payload.tracking_url || "") || undefined,

    utm_source: String(tracking.utm_source || payload.utm_source || "") || undefined,
    utm_campaign: String(tracking.utm_campaign || payload.utm_campaign || "") || undefined,
    src: String(tracking.src || payload.src || "") || undefined,
    fbclid: String(tracking.fbclid || payload.fbclid || "") || undefined,
  };
}
