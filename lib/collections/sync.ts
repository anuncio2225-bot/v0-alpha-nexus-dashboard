import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sincronizacao de transacoes -> modulo de Cobranca (collection_clients).
 *
 * Regras (ver AJUSTES no modulo de Cobranca):
 * - Cada transacao gera/atualiza um collection_client (vinculado por transaction_id).
 * - O status da cobranca reflete o status REAL da transacao (mapeamento abaixo).
 * - O atendente e identificado pelo campo `src` da transacao (attendant_id costuma
 *   ser nulo). Se existir um attendant com name = src, vincula o id; senao usa o
 *   proprio src como nome (sem vincular).
 * - PRIORIDADE: o webhook sempre sobrescreve para "Pago", "Cancelado" e "Devolucao".
 *   Para os demais status, um status MANUAL definido pelo usuario prevalece sobre
 *   o status automatico (ex.: "Negociacao", "Prometeu Pagar").
 * - O valor (total_value) usa a comissao do afiliado (affiliate_commission ||
 *   commission); se ambos forem 0/nulos, cai para total_value/amount da venda.
 */

// Transacao -> nome do status de cobranca
export function mapTransactionStatusToCollection(txStatus: string | null): string {
  switch ((txStatus || "").toLowerCase()) {
    case "pago":
      return "Pago";
    case "cancelado":
      return "Cancelado";
    case "devolvido":
    case "devolucao":
      return "Devolucao";
    case "agendado":
    case "aguardando":
    case "frustrado":
    default:
      // afterpay/pendentes e frustrados entram como "Devendo" (cobravel)
      return txStatus?.toLowerCase() === "frustrado" ? "Frustrado" : "Devendo";
  }
}

// Status automaticos que o webhook tem autoridade para sobrescrever
const WEBHOOK_AUTHORITATIVE = new Set(["Pago", "Cancelado", "Devolucao"]);

// Status do sistema (automaticos). Status manuais (Negociacao, etc.) NAO estao aqui.
const SYSTEM_STATUS = new Set([
  "Pago",
  "Cancelado",
  "Devolucao",
  "Devendo",
  "Frustrado",
]);

interface TxRow {
  id: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  customer_doc?: string | null;
  product_name?: string | null;
  product_id?: string | null;
  gateway?: string | null;
  src?: string | null;
  attendant_id?: string | null;
  status?: string | null;
  affiliate_commission?: number | null;
  commission?: number | null;
  total_value?: number | null;
  amount?: number | null;
  sale_date?: string | null;
  created_at?: string | null;
  payment_method?: string | null;
  tracking_code?: string | null;
}

// Normaliza o src removendo sujeira (ex.: "Gabriela]" -> "Gabriela")
export function cleanSrc(src: string | null | undefined): string | null {
  if (!src) return null;
  const t = src.replace(/[[\]]/g, "").trim();
  return t || null;
}

export function txCollectionValue(t: TxRow): number {
  return (
    Number(t.affiliate_commission) ||
    Number(t.commission) ||
    Number(t.total_value) ||
    Number(t.amount) ||
    0
  );
}

/**
 * Resolve o atendente a partir do src da transacao.
 * Retorna { attendant_id, attendant_name } — id pode ser null.
 */
async function resolveAttendant(
  supabase: SupabaseClient,
  userId: string,
  t: TxRow,
  attByName: Map<string, string>
): Promise<{ attendant_id: string | null; attendant_name: string | null }> {
  // attendant_id direto (raro, mas respeitado se vier)
  if (t.attendant_id) {
    return { attendant_id: t.attendant_id, attendant_name: null };
  }
  const src = cleanSrc(t.src);
  if (!src) return { attendant_id: null, attendant_name: null };
  const matchedId = attByName.get(src.toLowerCase());
  return { attendant_id: matchedId || null, attendant_name: src };
}

/**
 * Cria um Map name(lower) -> attendant_id para o usuario.
 */
export async function buildAttendantMap(
  supabase: SupabaseClient,
  userId: string
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("attendants")
    .select("id, name")
    .eq("user_id", userId);
  const m = new Map<string, string>();
  for (const a of data || []) {
    if (a.name) m.set(String(a.name).toLowerCase(), a.id as string);
  }
  return m;
}

/**
 * Cria um Map name(lower) -> { id, color } dos status de cobranca do usuario.
 */
export async function buildStatusMap(
  supabase: SupabaseClient,
  userId: string
): Promise<Map<string, { id: string; name: string }>> {
  const { data } = await supabase
    .from("collection_statuses")
    .select("id, name")
    .eq("user_id", userId);
  const m = new Map<string, { id: string; name: string }>();
  for (const s of data || []) {
    if (s.name) m.set(String(s.name).toLowerCase(), { id: s.id, name: s.name });
  }
  return m;
}

/**
 * Sincroniza UMA transacao para a cobranca.
 * - insert: cria novo collection_client
 * - update: atualiza dados + status (respeitando prioridade manual/webhook)
 */
export async function syncTransactionToCollection(
  supabase: SupabaseClient,
  userId: string,
  t: TxRow,
  statusMap: Map<string, { id: string; name: string }>,
  attByName: Map<string, string>
): Promise<"inserted" | "updated" | "skipped"> {
  const targetStatusName = mapTransactionStatusToCollection(t.status ?? null);
  const targetStatus =
    statusMap.get(targetStatusName.toLowerCase()) ||
    statusMap.get("devendo") ||
    null;

  const { attendant_id, attendant_name } = await resolveAttendant(
    supabase,
    userId,
    t,
    attByName
  );
  const value = txCollectionValue(t);

  // Ja existe um collection_client para essa transacao?
  const { data: existing } = await supabase
    .from("collection_clients")
    .select("id, status_id, status_name, paid_value")
    .eq("user_id", userId)
    .eq("transaction_id", t.id)
    .maybeSingle();

  const baseFields = {
    name: t.customer_name || "Cliente sem nome",
    phone: t.customer_phone || null,
    email: t.customer_email || null,
    document: t.customer_doc || null,
    product_name: t.product_name || null,
    product_id: t.product_id || null,
    platform_name: t.gateway || null,
    attendant_id,
    attendant_name,
    src: cleanSrc(t.src),
    payment_method: t.payment_method || null,
    tracking_code: t.tracking_code || null,
    order_date: t.sale_date || t.created_at || null,
  };

  if (!existing) {
    const paid = targetStatusName === "Pago" ? value : 0;
    const { error } = await supabase.from("collection_clients").insert({
      user_id: userId,
      transaction_id: t.id,
      total_value: value,
      paid_value: paid,
      remaining_value: value - paid,
      status_id: targetStatus?.id || null,
      status_name: targetStatus?.name || targetStatusName,
      ...baseFields,
    });
    return error ? "skipped" : "inserted";
  }

  // Existe: decide se sobrescreve o status.
  const currentName = (existing.status_name as string | null) || "";
  const currentIsManual = !SYSTEM_STATUS.has(currentName);

  const updates: Record<string, unknown> = {
    ...baseFields,
    total_value: value,
    updated_at: new Date().toISOString(),
  };

  // Webhook tem autoridade absoluta para Pago/Cancelado/Devolucao.
  // Caso contrario, so atualiza o status se o atual NAO for manual.
  const shouldOverrideStatus =
    WEBHOOK_AUTHORITATIVE.has(targetStatusName) || !currentIsManual;

  if (shouldOverrideStatus && targetStatus) {
    updates.status_id = targetStatus.id;
    updates.status_name = targetStatus.name;
    if (targetStatusName === "Pago") {
      updates.paid_value = value;
      updates.remaining_value = 0;
    } else {
      const paid = Number(existing.paid_value) || 0;
      updates.remaining_value = value - paid;
    }
  }

  const { error } = await supabase
    .from("collection_clients")
    .update(updates)
    .eq("id", existing.id)
    .eq("user_id", userId);

  return error ? "skipped" : "updated";
}
