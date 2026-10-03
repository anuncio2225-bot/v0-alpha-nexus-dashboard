import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Pagamento registrado À MÃO para uma venda que veio do gateway (ex.: AfterPay
 * em que o cliente adiantou por fora). Sem isto, o card da Cobrança virava
 * "Pago" mas a venda continuava agendada no Dashboard — e o próximo evento do
 * gateway podia desfazer.
 *
 * Só mexe em venda de webhook (gateway diferente de "manual"); pedido criado
 * à mão já tem a transação espelho própria (manual-transaction.ts).
 */

/** Marca a venda como paga na data informada (padrão: agora). */
export async function marcarVendaPagaManual(
  supabase: SupabaseClient,
  ownerId: string,
  transactionId: string | null | undefined,
  dataPagamento?: string | null
): Promise<boolean> {
  if (!transactionId) return false;
  const { data: tx } = await supabase
    .from("transactions")
    .select("id, gateway, status, total_value, amount")
    .eq("id", transactionId)
    .eq("user_id", ownerId)
    .maybeSingle();
  if (!tx || tx.gateway === "manual" || tx.status === "pago") return false;

  const quando = dataPagamento ? new Date(dataPagamento).toISOString() : new Date().toISOString();
  const { error } = await supabase
    .from("transactions")
    .update({
      status: "pago",
      payment_date: quando,
      paid_value: Number(tx.total_value) || Number(tx.amount) || 0,
      pago_manual_em: new Date().toISOString(),
      status_antes_manual: tx.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tx.id)
    .eq("user_id", ownerId);
  return !error;
}

/** Desfaz o pago manual (volta ao status que o gateway tinha mandado). */
export async function desfazerPagoManual(
  supabase: SupabaseClient,
  ownerId: string,
  transactionId: string | null | undefined
): Promise<boolean> {
  if (!transactionId) return false;
  const { data: tx } = await supabase
    .from("transactions")
    .select("id, pago_manual_em, status_antes_manual")
    .eq("id", transactionId)
    .eq("user_id", ownerId)
    .maybeSingle();
  if (!tx?.pago_manual_em) return false;
  const { error } = await supabase
    .from("transactions")
    .update({
      status: tx.status_antes_manual || "aguardando",
      payment_date: null,
      paid_value: 0,
      pago_manual_em: null,
      status_antes_manual: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tx.id)
    .eq("user_id", ownerId);
  return !error;
}
