import type { NormalizedEvent } from "../types";
import { normalizeGatewayDate } from "../date-utils";
import { trackingStage, trackingUrlFor } from "@/lib/tracking/stages";

/**
 * Pag2Pay — normalizador dedicado (doc. de integração v1.0, set/2026).
 *
 * O corpo tem SEMPRE a mesma estrutura, qualquer que seja o evento, e traz o
 * estado completo do pedido. O nome do evento vem só no cabeçalho
 * `X-Webhook-Event` (o processor repassa em `eventHeader`).
 *
 * Pontos que o normalizador genérico errava:
 *  - Valores SEMPRE em centavos inteiros (39000 = R$ 390,00; 970 = R$ 9,70).
 *    O genérico só dividia acima de 1000.
 *  - O status está em `type` / `trans_status`, não em `status`.
 *  - AfterPay ("Receba e Pague") vem em `payment_type: "afterpay"`: nasce
 *    `scheduled`, recebe rastreio, é entregue e SÓ ENTÃO vira cobrança
 *    (`pending`) e depois `approved`.
 *  - Rastreio: tracking_code / tracking_status / tracking_carrier.
 */

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function plain(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Centavos inteiros -> reais. Null quando ausente. */
function cents(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n) / 100;
}

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

/**
 * Detecta payload do Pag2Pay. O corpo usa nomes no padrão Braip (trans_key,
 * client_name...), então precisa de marcas próprias, senão cai como Braip.
 */
export function isPag2PayPayload(
  payload: Record<string, unknown>,
  headers?: Record<string, string>
): boolean {
  const ua = (headers?.["user-agent"] || "").toLowerCase();
  if (ua.startsWith("pag2pay")) return true;

  const marker = str(payload.gateway || payload.platform || payload.source)
    .toLowerCase()
    .replace(/\s+/g, "");
  if (marker === "pag2pay" || marker === "pag2ppay" || marker === "pag2p") return true;

  if ("pag2pay_id" in payload || "pag2p_id" in payload || "pag2ppay_id" in payload)
    return true;

  // Campos que só o Pag2Pay manda (a Braip não tem nenhum destes).
  if ("_webhookId" in payload && "trans_key" in payload) return true;
  if ("plan_items_quantity" in payload && "tracking_last_description" in payload)
    return true;
  if (str(payload.payment_link).includes("pag2pay.com")) return true;

  return false;
}

export type Pag2PayPaymentStatus =
  | "pago"
  | "agendado"
  | "aguardando"
  | "cancelado"
  | "devolvido"
  | "frustrado";

/**
 * Status de pagamento. Ordem: texto legível (trans_status) → evento do
 * cabeçalho → `type`. O texto é o mais específico (distingue vencido,
 * frustrado e chargeback, que o `type` resume em 5 valores).
 */
export function pag2payStatus(
  payload: Record<string, unknown>,
  eventName?: string | null
): { status: Pag2PayPaymentStatus; overdue: boolean } {
  const text = plain(str(payload.trans_status));
  const type = plain(str(payload.type));
  const ev = plain(str(eventName || payload.test_event || payload.event));

  const overdue = /vencid|atrasad|overdue/.test(text) || type === "overdue";

  const fromText = (): Pag2PayPaymentStatus | null => {
    if (!text) return null;
    if (/reembols|estorn|devolvid|refund/.test(text)) return "devolvido";
    if (/chargeback|contestad/.test(text)) return "cancelado";
    if (/frustrad|recusad|refused|frustrated/.test(text)) return "frustrado";
    if (/cancelad|cancelled|canceled/.test(text)) return "cancelado";
    if (/aprovad|^pago$|^paid$|confirmad/.test(text)) return "pago";
    if (/agendad|scheduled/.test(text)) return "agendado";
    if (/aguardando|pendente|pending|waiting|vencid|atrasad|overdue/.test(text))
      return "aguardando";
    return null;
  };

  const fromEvent = (): Pag2PayPaymentStatus | null => {
    switch (ev) {
      case "pagamentoaprovado":
        return "pago";
      case "agendado":
        return "agendado";
      case "aguardandopagamento":
        return "aguardando";
      case "cancelada":
        return "cancelado";
      case "frustrada":
        return "frustrado";
      default:
        return null; // eventos de rastreio não dizem nada do pagamento
    }
  };

  const fromType = (): Pag2PayPaymentStatus | null => {
    switch (type) {
      case "approved":
      case "paid":
        return "pago";
      case "scheduled":
        return "agendado";
      case "pending":
      case "pending_payment":
      case "waiting_payment":
      case "overdue":
        return "aguardando";
      case "cancelled":
      case "canceled":
      case "chargedback":
        return "cancelado";
      case "refunded":
        return "devolvido";
      case "refused":
      case "frustrated":
        return "frustrado";
      default:
        return null;
    }
  };

  return { status: fromText() ?? fromEvent() ?? fromType() ?? "aguardando", overdue };
}

function normalizePaymentType(raw: string): string {
  const s = plain(raw).replace(/[\s-]/g, "_");
  if (s === "creditcard" || s === "credit_card" || s === "cartao") return "credit_card";
  if (s === "afterpay" || s === "after_pay") return "afterpay";
  if (s === "pix") return "pix";
  if (s === "boleto") return "boleto";
  return raw || "";
}

export function normalizePag2Pay(
  payload: Record<string, unknown>,
  eventName?: string | null
): NormalizedEvent {
  const externalId = str(pick(payload, ["order_id", "trans_key", "order_number"]));
  const event = str(eventName || payload.test_event || payload.event) || str(payload.type) || "STATUS";

  const paymentType = normalizePaymentType(str(payload.payment_type));
  const isAfterpay = paymentType === "afterpay";

  let { status, overdue } = pag2payStatus(payload, eventName);

  // Rastreio
  const trackingCode = str(payload.tracking_code);
  const rawTracking = str(payload.tracking_status);
  const stage = trackingStage(rawTracking);
  // "Atualização" = reserva: o status não avança. Não gravamos por cima do anterior.
  const shippingStatus = stage ? rawTracking : "";

  // Encomenda devolvida/frustrada/cancelada antes de pagar = venda perdida.
  // (Venda já paga não é revertida pelo rastreio.)
  if (status === "agendado" || status === "aguardando") {
    if (stage === "devolvido" || stage === "frustrado") status = "frustrado";
    else if (stage === "cancelado") status = "cancelado";
  }

  const total = cents(payload.trans_value) ?? 0;
  const producer = cents(payload.producer_commission);
  const affiliate = cents(payload.affiliate_commission);

  // Quem recebeu o webhook é o PRODUTOR (dono do produto no Pag2Pay).
  // Venda por link de afiliado externo → affiliate_incoming (fica fora do
  // dashboard e vai para a aba Afiliação), igual à Payt/Braip. Venda por link
  // de FUNCIONÁRIO do próprio produtor continua sendo venda própria.
  const hasAffiliate = !!str(payload.affiliate_key) && (affiliate ?? 0) > 0;
  const originType: "own" | "affiliate_incoming" = hasAffiliate ? "affiliate_incoming" : "own";

  // O que o dono recebe = comissão de produtor (já líquida da taxa da
  // plataforma e da comissão do afiliado/funcionário). Sem ela, o valor cheio.
  const ownerReceives = producer ?? total;

  const addressParts = [
    payload.client_address,
    payload.client_address_number,
    payload.client_address_comp,
    payload.client_address_district,
    payload.client_address_city,
    payload.client_address_state,
    pick(payload, ["client_zip_code", "client_address_zipcode"]),
  ]
    .map(str)
    .filter(Boolean);

  // src (atendente): o funcionário do Pag2Pay é o vendedor da equipe.
  const src = str(pick(payload, ["src", "employee_name"]));

  const paidDate = normalizeGatewayDate(str(payload.paid_date));
  const saleDate = normalizeGatewayDate(
    str(pick(payload, ["order_date", "trans_createdate"]))
  );

  return {
    gateway: "pag2pay",
    external_id: externalId || `pag2pay_${Date.now()}`,
    event_type: event,
    status,
    status_code: str(payload.type) || undefined,
    // Rótulo legível que aparece no CRM ("Status da plataforma").
    original_status:
      (overdue ? "Vencido" : str(payload.trans_status)) || undefined,

    sale_type: isAfterpay ? "afterpay" : "antecipado",
    pay_on_delivery: isAfterpay,

    product_name: str(payload.product_name) || undefined,
    product_id: str(payload.product_key) || undefined,
    plan_name: str(payload.plan_name) || undefined,

    customer_name: str(payload.client_name) || undefined,
    customer_email: str(payload.client_email) || undefined,
    customer_phone: str(pick(payload, ["client_cellphone", "client_cel"])) || undefined,
    customer_doc: str(pick(payload, ["client_document", "client_documment"])) || undefined,

    amount: total,
    total_value: total || undefined,
    // Valor que o cliente efetivamente pagou: só existe depois do pagamento.
    paid_value: status === "pago" ? total : undefined,
    product_price: total || undefined,
    commission: ownerReceives || undefined,
    affiliate_commission: (hasAffiliate ? affiliate : ownerReceives) || undefined,
    producer_commission: producer ?? undefined,
    origin_type: originType,
    affiliate_name: hasAffiliate ? str(payload.affiliate_name) || undefined : undefined,
    currency: str(payload.currency) || "BRL",

    payment_method: paymentType || undefined,
    payment_link: str(payload.payment_link) || undefined,

    address_full: addressParts.join(", ") || undefined,

    sale_date: saleDate || undefined,
    payment_date: status === "pago" ? paidDate || undefined : undefined,

    tracking_code: trackingCode || undefined,
    tracking_url: trackingCode ? trackingUrlFor(trackingCode, "pag2pay") || undefined : undefined,
    shipping_status: shippingStatus || undefined,
    shipping_company:
      [str(payload.tracking_carrier), str(payload.tracking_service)]
        .filter(Boolean)
        .join(" · ") || undefined,

    utm_source: str(payload.utm_source) || undefined,
    utm_campaign: str(payload.utm_campaign) || undefined,
    src: src || undefined,
    fbclid: str(payload.fbclid) || undefined,
  };
}
