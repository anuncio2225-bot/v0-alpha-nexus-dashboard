import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanSrc } from "@/lib/collections/sync";

/**
 * Espelhamento de pedidos MANUAIS da Cobrança na tabela `transactions`.
 *
 * Contexto: o Dashboard principal (Pagas no Período, ROI, CPA, Lucro) lê SOMENTE
 * da tabela `transactions`. Pedidos criados manualmente na Cobrança vivem apenas
 * em `collection_clients`. Para que um pedido manual PAGO apareça no Dashboard,
 * criamos um registro correspondente em `transactions`.
 *
 * Regras (ver spec "Pedidos manuais da Cobrança devem aparecer no Dashboard"):
 * - Só vale para pedidos MANUAIS: aqueles cujo `transaction_id` é nulo (não vieram
 *   de webhook). Pedidos de webhook JÁ possuem transação e são ignorados aqui.
 * - Só criamos a transação quando o status é "Pago".
 * - A transação espelho usa external_id determinístico "manual_<collection_client.id>"
 *   para permitir localizar/atualizar/excluir depois.
 * - origin_type = "own" (venda própria); gateway = "manual".
 * - O valor recebido (commission) = total_value do pedido (pix manual direto).
 */

const MANUAL_GATEWAY = "manual";

export function manualExternalId(clientId: string): string {
  return `manual_${clientId}`;
}

/** Considera "pago" o status textual "Pago" (case-insensitive). */
export function isPaidStatusName(statusName: string | null | undefined): boolean {
  return (statusName || "").trim().toLowerCase() === "pago";
}

interface ManualClient {
  id: string;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  document?: string | null;
  product_name?: string | null;
  product_id?: string | null;
  plan_name?: string | null;
  total_value?: number | null;
  order_total_value?: number | null;
  payment_method?: string | null;
  payment_link?: string | null;
  src?: string | null;
  attendant_id?: string | null;
  attendant_name?: string | null;
  order_date?: string | null;
  payment_date?: string | null;
  transaction_code?: string | null;
  address_full?: string | null;
  tracking_code?: string | null;
}

/**
 * Cria (ou atualiza, se já existir) a transação espelho de um pedido manual PAGO.
 * Retorna o id da transação criada/atualizada, ou null se nada foi feito.
 *
 * Idempotente: usa upsert por (user_id, external_id).
 */
export async function upsertManualTransaction(
  supabase: SupabaseClient,
  userId: string,
  client: ManualClient
): Promise<string | null> {
  const total = Number(client.total_value) || 0;
  const nowIso = new Date().toISOString();
  const externalId = manualExternalId(client.id);

  // src do atendente: usa o do pedido; se ausente mas houver attendant_id,
  // resolve pelo cadastro (name/src) para o cálculo de comissão via transações.
  let src = cleanSrc(client.src);
  if (!src && client.attendant_id) {
    const { data: att } = await supabase
      .from("attendants")
      .select("name, src")
      .eq("id", client.attendant_id)
      .eq("user_id", userId)
      .single();
    src = cleanSrc(att?.src) || (att?.name ? String(att.name) : null);
  }

  const row = {
    user_id: userId,
    external_id: externalId,
    gateway: MANUAL_GATEWAY,
    transaction_code: client.transaction_code || externalId,
    status: "pago",
    original_status: "Pago",
    sale_type: "antecipado",
    origin_type: "own",
    customer_name: client.name || "Cliente sem nome",
    customer_phone: client.phone || null,
    customer_email: client.email || null,
    customer_doc: client.document || null,
    product_name: client.product_name || null,
    product_id: client.product_id || null,
    plan_name: client.plan_name || null,
    amount: total,
    total_value: Number(client.order_total_value) || total,
    paid_value: total,
    product_price: total,
    // Valor efetivamente recebido no pix manual = total do pedido.
    commission: total,
    affiliate_commission: total,
    currency: "BRL",
    payment_method: client.payment_method || null,
    payment_link: client.payment_link || null,
    address_full: client.address_full || null,
    tracking_code: client.tracking_code || null,
    src,
    sale_date: client.order_date || nowIso,
    payment_date: client.payment_date || nowIso,
    updated_at: nowIso,
  };

  const { data, error } = await supabase
    .from("transactions")
    .upsert(row, { onConflict: "user_id,gateway,external_id" })
    .select("id")
    .single();

  if (error) {
    console.error("[v0] upsertManualTransaction error:", error.message);
    return null;
  }
  return (data?.id as string) || null;
}

/**
 * Exclui a transação espelho de um pedido manual (external_id = manual_<id>).
 * EXCEÇÃO à regra de nunca deletar transações — vale SOMENTE para manuais.
 */
export async function deleteManualTransaction(
  supabase: SupabaseClient,
  userId: string,
  clientId: string
): Promise<void> {
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("user_id", userId)
    .eq("gateway", MANUAL_GATEWAY)
    .eq("external_id", manualExternalId(clientId));
  if (error) console.error("[v0] deleteManualTransaction error:", error.message);
}
