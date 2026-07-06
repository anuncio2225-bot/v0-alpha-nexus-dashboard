import type { NormalizedEvent } from "../types";

/**
 * Braip status mapping - handles ALL known status values
 * Can come as numeric code, string code, or full text
 */
// Maps any Braip status to canonical Portuguese status
const BRAIP_STATUS_MAP: Record<string, string> = {
  // Numeric codes (as strings)
  "1": "aguardando",
  "2": "pago",
  "3": "cancelado",
  "4": "cancelado", // chargeback
  "5": "devolvido",
  "6": "aguardando", // em analise
  "7": "aguardando", // estorno pendente
  "8": "aguardando", // em processamento
  "9": "pago", // parcialmente pago
  "10": "aguardando", // atrasado
  "11": "agendado",
  "12": "frustrado",

  // Full text (Portuguese)
  "aguardando pagamento": "aguardando",
  "aguardando": "aguardando",
  "pagamento aprovado": "pago",
  "aprovado": "pago",
  "pago": "pago",
  "cancelada": "cancelado",
  "cancelado": "cancelado",
  "chargeback": "cancelado",
  "devolvida": "devolvido",
  "devolvido": "devolvido",
  "em análise": "aguardando",
  "em analise": "aguardando",
  "estorno pendente": "aguardando",
  "em processamento": "aguardando",
  "parcialmente pago": "pago",
  "pagamento atrasado": "aguardando",
  "agendado": "agendado",
  "frustrada": "frustrado",
  "frustrado": "frustrado",

  // English keywords
  approved: "pago",
  paid: "pago",
  pending: "aguardando",
  cancelled: "cancelado",
  canceled: "cancelado",
  refunded: "devolvido",
  expired: "cancelado",
  scheduled: "agendado",
  frustrated: "frustrado",
};

const BRAIP_PAYMENT_MAP: Record<string, string> = {
  // Numeric codes
  "1": "boleto",
  "2": "credit_card",
  "3": "boleto", // boleto parcelado
  "5": "pix",
  "6": "cod", // cash on delivery

  // Text
  boleto: "boleto",
  credit_card: "credit_card",
  cartao: "credit_card",
  "cartão": "credit_card",
  pix: "pix",
  cod: "cod",
};

function safeString(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function parseValue(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") {
    // Braip sends centavos for values > 100 (e.g., 19900 = R$199,00)
    return v >= 100 && Number.isInteger(v) ? v / 100 : v;
  }
  const s = String(v).replace(/[^\d.,\-]/g, "").replace(",", ".");
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  // Heuristic: if no decimal and large value, assume centavos
  if (!s.includes(".") && n >= 100) return n / 100;
  return n;
}

function pickFirst(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function normalizeStatus(raw: string): string {
  const lower = raw.toLowerCase().trim();
  return BRAIP_STATUS_MAP[lower] || BRAIP_STATUS_MAP[raw] || "aguardando";
}

function parseBoolFlag(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.toLowerCase().trim();
    return s === "true" || s === "1" || s === "yes" || s === "sim" || s === "y";
  }
  return false;
}

function normalizePayment(raw: string): string {
  const lower = raw.toLowerCase().trim();
  return BRAIP_PAYMENT_MAP[lower] || BRAIP_PAYMENT_MAP[raw] || raw || "other";
}

/**
 * Detect if payload is from Braip
 * Very permissive - accepts many field combinations
 */
export function isBraipPayload(payload: Record<string, unknown>): boolean {
  // Direct indicators
  if (payload.gateway === "braip" || payload.platform === "braip") return true;

  // Braip-specific field names
  const braipFields = [
    "trans_cod",
    "trans_key",
    "trans_status",
    "trans_total_value",
    "trans_createdate",
    "trans_updatedate",
    "trans_payment",
    "trans_paytype",
    "product_key",
    "client_name",
    "client_email",
    "basic_authentication",
  ];

  for (const field of braipFields) {
    if (field in payload) return true;
  }

  // Event type pattern
  const event = safeString(payload.event || payload.type || payload.event_type);
  if (event.toUpperCase().startsWith("STATUS")) return true;
  if (event.includes("TRACKING")) return true;

  return false;
}

/**
 * Normalize Braip payload to canonical format
 * Handles all field name variations and formats
 */
export function normalizeBraip(
  payload: Record<string, unknown>
): NormalizedEvent | null {
  // Extract external ID - try many possible fields
  const externalId = safeString(
    pickFirst(payload, [
      "trans_cod",
      "trans_key",
      "transaction_code",
      "transaction_id",
      "id_transacao",
      "codigo_transacao",
      "code",
      "id",
    ])
  );

  // If no ID at all, we can still log but can't upsert
  // Return a minimal event so it gets logged
  const eventType = safeString(
    pickFirst(payload, ["event", "type", "event_type", "webhook_event_type"]) ||
      "STATUS_ALTERADO"
  );

  // Status handling
  const rawStatus = safeString(
    pickFirst(payload, [
      "trans_status",
      "status",
      "status_compra",
      "status_code",
      "trans_status_code",
    ])
  );

  // Values - Braip sends in centavos
  const totalValue = parseValue(
    pickFirst(payload, [
      "trans_total_value",
      "trans_value",
      "total_value",
      "valor_total",
      "valor",
      "value",
      "amount",
    ])
  );

  const paidValue = parseValue(
    pickFirst(payload, [
      "trans_pay_value",
      "paid_value",
      "valor_pago",
    ])
  );

  // Preço do PRODUTO sem juros de parcelamento. Na Braip, `trans_value` é o
  // valor do produto (constante), enquanto `trans_total_value` varia com o
  // parcelamento (inclui juros). Ex.: trans_value=46700 (R$467) em 12x vira
  // trans_total_value=57960. Usamos trans_value como base do modo produtor.
  const productPrice = parseValue(
    pickFirst(payload, ["trans_value", "plan_value", "product_price"])
  );

  const commission = parseValue(
    pickFirst(payload, [
      "trans_commission",
      "commission",
      "comissao",
    ])
  );

  // Affiliate commission - Braip sends this in a "commissions" array.
  // Each item has { type: "Afiliado" | "Produtor", value: <centavos>, ... }
  // We sum all "Afiliado" entries (in case of co-affiliates) for the user's actual revenue.
  let affiliateCommission = 0;
  let producerCommission = 0;

  const commissionsArray = payload.commissions;
  if (Array.isArray(commissionsArray)) {
    for (const item of commissionsArray) {
      if (!item || typeof item !== "object") continue;
      const c = item as Record<string, unknown>;
      const type = safeString(c.type).toLowerCase();
      const rawValue = c.value;
      const value =
        typeof rawValue === "number"
          ? rawValue
          : parseFloat(safeString(rawValue));
      if (!isFinite(value) || value <= 0) continue;

      // Braip sends in centavos
      const valueInReais = value / 100;

      if (type.includes("afiliado") || type.includes("affiliate")) {
        affiliateCommission += valueInReais;
      } else if (type.includes("produtor") || type.includes("producer")) {
        producerCommission += valueInReais;
      }
    }
  }

  // Fallback: try flat fields if no commissions array (other gateways or older payloads)
  if (affiliateCommission === 0) {
    affiliateCommission = parseValue(
      pickFirst(payload, [
        "trans_value_partner",
        "affiliate_commission",
        "affiliate_value",
        "comissao_afiliado",
        "valor_afiliado",
        "partner_value",
      ])
    );
  }
  if (producerCommission === 0) {
    producerCommission = parseValue(
      pickFirst(payload, [
        "prod_partner_value",
        "producer_commission",
        "producer_value",
        "comissao_produtor",
        "valor_produtor",
      ])
    );
  }

  // Customer data - can be nested or flat
  const customer = (payload.customer || payload.cliente || {}) as Record<
    string,
    unknown
  >;

  const customerName = safeString(
    pickFirst(payload, [
      "client_name",
      "customer_name",
      "customer.name",
      "nome_cliente",
    ]) || pickFirst(customer, ["name", "nome", "full_name"])
  );
  
  const customerEmail = safeString(
    pickFirst(payload, [
      "client_email",
      "customer_email",
      "customer.email",
      "email_cliente",
    ]) || pickFirst(customer, ["email"])
  );

  const customerPhone = safeString(
    pickFirst(payload, [
      "client_cel", // campo REAL da Braip (celular do cliente)
      "client_phone",
      "client_tel",
      "customer_phone",
      "customer.phone", // formato novo (chave achatada)
      "telefone_cliente",
      "phone",
      "telefone",
      "celular",
    ]) || pickFirst(customer, ["phone", "telefone", "celular", "cel"])
  );

  const customerDoc = safeString(
    pickFirst(payload, [
      "client_documment", // campo REAL da Braip (CPF/CNPJ) - grafia com 2 m
      "client_document",
      "client_doc",
      "customer.doc", // formato novo (chave achatada)
      "cpf",
      "document",
      "doc",
      "cpf_cliente",
    ]) || pickFirst(customer, ["doc", "cpf", "document"])
  );

  // Payment method
  const rawPayment = safeString(
    pickFirst(payload, [
      "trans_payment",
      "trans_paytype",
      "payment_method",
      "metodo_pagamento",
      "forma_pagamento",
    ])
  );

  // Product info
  const productName = safeString(
    pickFirst(payload, [
      "product_name",
      "produto",
      "produto_nome",
      "nome_produto",
      "product",
    ])
  );

  const productId = safeString(
    pickFirst(payload, ["product_id", "produto_id", "id_produto", "product_key"])
  );

  const planName = safeString(
    pickFirst(payload, ["plan_name", "plano", "plano_nome", "offer_name"])
  );

  // Pay on delivery / sale type
  const payOnDelivery = parseBoolFlag(
    pickFirst(payload, [
      "trans_pay_on_delivery",
      "pay_on_delivery",
      "afterpay",
      "pagamento_na_entrega",
    ])
  );
  const saleType: "antecipado" | "afterpay" = payOnDelivery
    ? "afterpay"
    : "antecipado";

  // Dates
  const saleDate = safeString(
    pickFirst(payload, [
      "trans_createdate",
      "sale_date",
      "data_compra",
      "created_at",
      "data_venda",
    ])
  );

  const paymentDate = safeString(
    pickFirst(payload, [
      "trans_paydate",
      "trans_payment_date",
      "payment_date",
      "data_pagamento",
      "paid_at",
    ])
  );

  const guaranteeDate = safeString(
    pickFirst(payload, ["guarantee_date", "data_garantia", "warranty_date"])
  );

  // Tracking
  const trackingCode = safeString(
    pickFirst(payload, [
      "tracking_code",
      "codigo_rastreio",
      "rastreio",
      "tracking",
    ])
  );

  const trackingUrl = safeString(
    pickFirst(payload, ["tracking_url", "url_rastreio", "link_rastreio"])
  );

  const shippingStatus = safeString(
    pickFirst(payload, [
      "last_status_delivery",
      "shipping_status",
      "status_envio",
      "status_entrega",
      "delivery_status",
    ])
  );

  const shippingCompany = safeString(
    pickFirst(payload, [
      "shipping_company",
      "transportadora",
      "carrier",
      "shipping_carrier",
    ])
  );

  // Link de pagamento (ESSENCIAL: usado no WhatsApp para o cliente pagar)
  const paymentLink = safeString(
    pickFirst(payload, [
      "trans_payment_link_checkout",
      "payment_link",
      "checkout_url",
      "payment_url",
      "link_pagamento",
      "url_checkout",
    ])
  );

  // Endereco completo - monta a partir de campos comuns da Braip se houver
  const addressParts = [
    pickFirst(payload, ["client_address", "address", "endereco", "client_street"]),
    pickFirst(payload, ["client_address_number", "address_number", "numero"]),
    pickFirst(payload, ["client_address_comp", "address_complement", "complemento"]),
    pickFirst(payload, ["client_neighborhood", "neighborhood", "bairro"]),
    pickFirst(payload, ["client_city", "city", "cidade"]),
    pickFirst(payload, ["client_state", "state", "uf", "estado"]),
    pickFirst(payload, ["client_zip_code", "zip_code", "cep"]),
  ]
    .map((v) => safeString(v))
    .filter(Boolean);
  const addressFull = addressParts.join(", ");

  // UTM / Source tracking (can be nested in meta)
  const meta = (payload.meta || {}) as Record<string, unknown>;

  const utmSource = safeString(
    pickFirst(payload, ["utm_source"]) || pickFirst(meta, ["utm_source"])
  );

  const utmCampaign = safeString(
    pickFirst(payload, ["utm_campaign"]) || pickFirst(meta, ["utm_campaign"])
  );

  // O atendente vem no parametro src/SRC. Pode estar direto no payload/meta ou,
  // muito comum na Braip, embutido no link de checkout (ex.: "...&src=Bruna" ou
  // "...&SRC=Gabriela"). Extraimos do link como fallback robusto.
  const srcFromLink = (() => {
    if (!paymentLink) return null;
    const m = paymentLink.match(/[?&][sS][rR][cC]=([^&]+)/);
    if (!m) return null;
    try {
      return decodeURIComponent(m[1]).replace(/[[\]]/g, "").trim() || null;
    } catch {
      return m[1].replace(/[[\]]/g, "").trim() || null;
    }
  })();

  const src = safeString(
    pickFirst(payload, ["src"]) || pickFirst(meta, ["src"]) || srcFromLink
  );

  const fbclid = safeString(
    pickFirst(payload, ["fbclid"]) || pickFirst(meta, ["fbclid"])
  );

  return {
    gateway: "braip",
    external_id: externalId || `braip_${Date.now()}`, // fallback ID for logging
    event_type: eventType,
    status: normalizeStatus(rawStatus),
    status_code: rawStatus || undefined,
    original_status: rawStatus || undefined,
    sale_type: saleType,
    pay_on_delivery: payOnDelivery,

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
    product_price: productPrice || undefined,
    commission: commission || undefined,
    affiliate_commission: affiliateCommission || undefined,
    producer_commission: producerCommission || undefined,
    currency: "BRL",

    payment_method: normalizePayment(rawPayment) || undefined,
    payment_link: paymentLink || undefined,

    address_full: addressFull || undefined,

    sale_date: saleDate || undefined,
    payment_date: paymentDate || undefined,
    guarantee_date: guaranteeDate || undefined,

    tracking_code: trackingCode || undefined,
    tracking_url: trackingUrl || undefined,
    shipping_status: shippingStatus || undefined,
    shipping_company: shippingCompany || undefined,

    utm_source: utmSource || undefined,
    utm_campaign: utmCampaign || undefined,
    src: src || undefined,
    fbclid: fbclid || undefined,
  };
}
