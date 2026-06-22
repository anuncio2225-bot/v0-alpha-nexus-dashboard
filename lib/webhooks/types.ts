// Normalized event shape that ALL gateway normalizers must produce
// The processor consumes only this shape - gateways are isolated.

export type WebhookGateway = "braip" | "kiwify" | "hotmart" | "monetizze" | "payt" | "pag2pay" | "unknown";

export interface NormalizedEvent {
  // Identification
  gateway: WebhookGateway;
  external_id: string; // unique ID inside the gateway (transaction id, order id, etc)
  event_type: string; // e.g. "sale.approved", "STATUS_ALTERADO", "TRACKING_UPDATED"

  // Status (Portuguese canonical: "pago" | "agendado" | "aguardando" | "cancelado" | "devolvido" | "frustrado")
  status: string;
  status_code?: string; // raw status from gateway (e.g. "1", "2", "P", "approved")
  original_status?: string;

  // Sale classification
  sale_type?: "antecipado" | "afterpay" | "recuperacao"; // afterpay = pay on delivery; recuperacao = link de recuperacao
  pay_on_delivery?: boolean;

  // Product / plan
  product_name?: string;
  product_id?: string;
  plan_name?: string;

  // Customer
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_doc?: string;

  // Amounts (in BRL, regular decimals - NOT centavos)
  amount: number; // primary value (paid_value if available, else total_value)
  total_value?: number;
  paid_value?: number;
  commission?: number; // legacy generic commission field
  affiliate_commission?: number; // what the affiliate actually receives (trans_value_partner)
  producer_commission?: number; // what the producer receives (prod_partner_value)
  currency?: string;

  // Payment
  payment_method?: string;
  payment_link?: string; // trans_payment_link_checkout (Braip) - link para o cliente pagar

  // Address
  address_full?: string;

  // Dates
  sale_date?: string; // ISO
  payment_date?: string; // ISO - when actually paid (status=pago)
  guarantee_date?: string;

  // Tracking (for STATUS_ALTERADO + TRACKING events)
  tracking_code?: string;
  tracking_url?: string;
  shipping_status?: string; // last_status_delivery (Braip) - status de entrega
  shipping_company?: string;

  // Marketing / attribution
  utm_source?: string;
  utm_campaign?: string;
  src?: string;
  fbclid?: string;
}

export interface ProcessResult {
  success: boolean;
  message: string;
  transaction_id?: string;
  action?: "created" | "updated" | "ignored" | "logged" | "error" | "skipped";
  error?: string;
}
