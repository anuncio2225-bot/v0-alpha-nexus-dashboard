import type { NormalizedEvent, WebhookGateway } from "../types";

/**
 * Generic normalizer for payment platforms whose exact payload shape is not
 * fully known (Payt, Pag2Pay). It tries the most common field names used by
 * Brazilian payment gateways and falls back to null when a field is missing.
 *
 * It NEVER throws and NEVER returns null when there is any identifiable field,
 * so the webhook is always logged. The status is mapped to the same canonical
 * Portuguese vocabulary used by the other gateways:
 * "pago" | "agendado" | "aguardando" | "cancelado" | "devolvido" | "frustrado".
 */

// Canonical status map - very permissive, accepts text, codes and english
const GENERIC_STATUS_MAP: Record<string, string> = {
  // Portuguese
  pago: "pago",
  paga: "pago",
  aprovado: "pago",
  aprovada: "pago",
  "pagamento aprovado": "pago",
  "pagamento confirmado": "pago",
  confirmado: "pago",
  concluido: "pago",
  "concluído": "pago",
  aguardando: "aguardando",
  "aguardando pagamento": "aguardando",
  pendente: "aguardando",
  processando: "aguardando",
  "em processamento": "aguardando",
  "em analise": "aguardando",
  "em análise": "aguardando",
  agendado: "agendado",
  agendada: "agendado",
  cancelado: "cancelado",
  cancelada: "cancelado",
  chargeback: "cancelado",
  estornado: "devolvido",
  estornada: "devolvido",
  devolvido: "devolvido",
  devolvida: "devolvido",
  reembolsado: "devolvido",
  recusado: "frustrado",
  recusada: "frustrado",
  rejeitado: "frustrado",
  rejeitada: "frustrado",
  falhou: "frustrado",
  falha: "frustrado",
  expirado: "cancelado",
  expirada: "cancelado",

  // English
  paid: "pago",
  approved: "pago",
  completed: "pago",
  confirmed: "pago",
  pending: "aguardando",
  processing: "aguardando",
  waiting: "aguardando",
  waiting_payment: "aguardando",
  scheduled: "agendado",
  cancelled: "cancelado",
  canceled: "cancelado",
  refunded: "devolvido",
  refused: "frustrado",
  rejected: "frustrado",
  failed: "frustrado",
  expired: "cancelado",
};

function safeString(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function parseValue(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") {
    // Heuristic: large integers are likely centavos (e.g. 19900 = R$199,00)
    return v >= 1000 && Number.isInteger(v) ? v / 100 : v;
  }
  const s = String(v).replace(/[^\d.,\-]/g, "").replace(",", ".");
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  if (!s.includes(".") && n >= 1000) return n / 100;
  return n;
}

function pickFirst(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

/** Payt envia valores como centavos inteiros (ex.: 37344 = R$ 373,44). */
function centsToReais(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n) / 100;
}

/**
 * Extrai a comissao REAL do vendedor a partir da estrutura achatada
 * "commission.N.type" / "commission.N.amount" (formato Payt).
 *
 * Regra de negocio (o que o usuario RECEBE, nao o que o cliente paga):
 *  - O tipo "platform" e a taxa do gateway (Payt) — NUNCA e a receita do usuario.
 *  - A receita do usuario e a comissao de afiliado (quando ele e afiliado) ou
 *    de produtor (quando ele e o produtor). Por isso ignoramos "platform" e
 *    preferimos affiliate > producer > coproducer > maior comissao nao-plataforma.
 *
 * Retorna { found } = false quando o payload nao usa essa estrutura (ex.:
 * outras plataformas), para o normalizer cair no parsing generico antigo.
 */
function extractTypedCommissions(payload: Record<string, unknown>): {
  found: boolean;
  affiliate: number | null;
  producer: number | null;
  coproducer: number | null;
  maxNonPlatform: number | null;
} {
  let found = false;
  let affiliate: number | null = null;
  let producer: number | null = null;
  let coproducer: number | null = null;
  let maxNonPlatform: number | null = null;

  for (let i = 0; i < 10; i++) {
    const type = payload[`commission.${i}.type`];
    const amount = payload[`commission.${i}.amount`];
    if (type === undefined && amount === undefined) continue;
    found = true;

    const reais = centsToReais(amount);
    if (reais === null) continue;

    const t = String(type || "").toLowerCase();
    // Taxa do gateway: nunca conta como receita do usuario.
    if (t.includes("platform") || t.includes("plataforma")) continue;

    if (t.includes("afili") || t.includes("affili")) affiliate = reais;
    else if (t.includes("coprodu") || t.includes("co-produ")) coproducer = reais;
    else if (t.includes("produ")) producer = reais;

    if (maxNonPlatform === null || reais > maxNonPlatform) maxNonPlatform = reais;
  }

  return { found, affiliate, producer, coproducer, maxNonPlatform };
}

function normalizeStatus(raw: string): string {
  const lower = raw.toLowerCase().trim();
  return GENERIC_STATUS_MAP[lower] || GENERIC_STATUS_MAP[raw] || "aguardando";
}

/**
 * Generic normalizer used by both Payt and Pag2Pay.
 * @param payload raw webhook payload
 * @param gateway the gateway label to stamp on the event
 */
export function normalizeGeneric(
  payload: Record<string, unknown>,
  gateway: WebhookGateway
): NormalizedEvent {
  // Nested customer object (common variations)
  const customer = (payload.customer ||
    payload.cliente ||
    payload.buyer ||
    payload.comprador ||
    {}) as Record<string, unknown>;

  const externalId = safeString(
    pickFirst(payload, [
      "transaction_id",
      "transaction_code",
      "trans_cod",
      "cart_id",
      "order_id",
      "order_code",
      "id_transacao",
      "codigo_transacao",
      "sale_id",
      "payment_id",
      "code",
      "id",
    ])
  );

  const eventType = safeString(
    pickFirst(payload, [
      "event",
      "event_type",
      "type",
      "webhook_event_type",
      "status_event",
    ]) || "STATUS"
  );

  const rawStatus = safeString(
    pickFirst(payload, [
      "status",
      "transaction.payment_status",
      "transaction_status",
      "payment_status",
      "order_status",
      "status_pagamento",
      "situacao",
    ])
  );

  const totalValue = parseValue(
    pickFirst(payload, [
      "transaction.total_price",
      "total_value",
      "total",
      "amount",
      "value",
      "valor_total",
      "valor",
      "product.price",
      "price",
    ])
  );

  const paidValue = parseValue(
    pickFirst(payload, [
      "transaction.total_price",
      "paid_value",
      "net_value",
      "valor_pago",
      "amount_paid",
    ])
  );

  // Comissao REAL do vendedor. Para Payt (estrutura commission.N.type/amount)
  // ignoramos a taxa da plataforma e usamos affiliate > producer > coproducer.
  // Para outras plataformas, caimos no parsing generico antigo.
  const typedCommissions = extractTypedCommissions(payload);
  const sellerCommission = typedCommissions.found
    ? typedCommissions.affiliate ??
      typedCommissions.producer ??
      typedCommissions.coproducer ??
      typedCommissions.maxNonPlatform ??
      0
    : parseValue(
        pickFirst(payload, [
          "commission",
          "comissao",
          "affiliate_commission",
          "comissao_afiliado",
          "valor_comissao",
        ])
      );
  const commission = sellerCommission;

  const customerName = safeString(
    pickFirst(payload, [
      "customer.name",
      "customer_name",
      "client_name",
      "nome_cliente",
      "name",
    ]) || pickFirst(customer, ["name", "nome", "full_name"])
  );

  const customerEmail = safeString(
    pickFirst(payload, [
      "customer.email",
      "customer_email",
      "client_email",
      "email_cliente",
      "email",
    ]) || pickFirst(customer, ["email"])
  );

  const customerPhone = safeString(
    pickFirst(payload, [
      "customer.phone",
      "customer_phone",
      "client_phone",
      "telefone_cliente",
      "phone",
      "telefone",
      "celular",
    ]) || pickFirst(customer, ["phone", "telefone", "celular", "mobile"])
  );

  const customerDoc = safeString(
    pickFirst(payload, [
      "customer.doc",
      "customer_doc",
      "cpf",
      "document",
      "doc",
      "cpf_cliente",
    ]) || pickFirst(customer, ["doc", "cpf", "cnpj", "document"])
  );

  const productName = safeString(
    pickFirst(payload, [
      "product.name",
      "link.title",
      "product_name",
      "produto",
      "produto_nome",
      "nome_produto",
      "product",
    ])
  );

  const productId = safeString(
    pickFirst(payload, [
      "product.code",
      "product.sku",
      "product_id",
      "produto_id",
      "id_produto",
      "product_code",
    ])
  );

  const planName = safeString(
    pickFirst(payload, ["plan_name", "plano", "plano_nome", "offer_name", "link.title"])
  );

  const rawPayment = safeString(
    pickFirst(payload, [
      "transaction.payment_method",
      "payment_method",
      "metodo_pagamento",
      "forma_pagamento",
      "payment_type",
      "paytype",
    ])
  ).toLowerCase();

  const saleDate = safeString(
    pickFirst(payload, [
      "started_at",
      "transaction.created_at",
      "sale_date",
      "created_at",
      "data_compra",
      "data_venda",
      "date",
    ])
  );

  const paymentDate = safeString(
    pickFirst(payload, [
      "transaction.paid_at",
      "transaction.updated_at",
      "payment_date",
      "paid_at",
      "data_pagamento",
      "approved_date",
      "updated_at",
    ])
  );

  const utmSource = safeString(pickFirst(payload, ["utm_source", "link.sources.src"]));
  const utmCampaign = safeString(pickFirst(payload, ["utm_campaign"]));
  const src = safeString(pickFirst(payload, ["src", "link.sources.src"]));
  const fbclid = safeString(pickFirst(payload, ["fbclid"]));

  return {
    gateway,
    external_id: externalId || `${gateway}_${Date.now()}`,
    event_type: eventType,
    status: normalizeStatus(rawStatus),
    status_code: rawStatus || undefined,
    original_status: rawStatus || undefined,

    product_name: productName || undefined,
    product_id: productId || undefined,
    plan_name: planName || undefined,

    customer_name: customerName || undefined,
    customer_email: customerEmail || undefined,
    customer_phone: customerPhone || undefined,
    customer_doc: customerDoc || undefined,

    amount: paidValue || totalValue,
    total_value: totalValue || undefined,
    paid_value: paidValue || totalValue || undefined,
    commission: commission || undefined,
    // affiliate_commission e o campo prioritario no dashboard; refletimos a
    // receita real do vendedor (afiliado quando houver, senao a comissao apurada).
    affiliate_commission:
      (typedCommissions.affiliate ?? commission) || undefined,
    producer_commission: typedCommissions.producer ?? undefined,
    currency: "BRL",

    payment_method: rawPayment || undefined,

    sale_date: saleDate || undefined,
    payment_date: paymentDate || undefined,

    utm_source: utmSource || undefined,
    utm_campaign: utmCampaign || undefined,
    src: src || undefined,
    fbclid: fbclid || undefined,
  };
}
