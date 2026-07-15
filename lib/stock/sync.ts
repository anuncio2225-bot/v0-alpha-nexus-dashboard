import { resolveKitUnits, type KitRow } from "./kit";

/**
 * Sincronização de estoque a partir de vendas (SOMENTE gravação em
 * stock_movements — nunca altera transactions).
 *
 * - Venda paga  -> cria uma SAÍDA ('exit') com a quantidade de potes do kit.
 * - Devolução/cancelamento de uma venda que já teve saída -> cria uma ENTRADA
 *   ('entry') de devolução, restaurando o saldo.
 *
 * Idempotente: no máximo 1 saída por transação (garantido também por índice
 * único parcial no banco) e no máximo 1 devolução por transação.
 */

// Usamos `any` para o client porque este helper roda tanto com o admin client
// (webhook) quanto com o server client (rotas de API).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

export interface StockTx {
  id: string;
  status: string | null;
  plan_name: string | null;
  product_name: string | null;
  customer_name: string | null;
  payment_date: string | null;
  sale_date: string | null;
  created_at?: string | null;
}

const REVERSAL_STATUSES = new Set([
  "cancelado",
  "devolvido",
  "reembolsado",
  "estornado",
  "chargeback",
  "reembolso",
]);

export async function fetchKits(supabase: SB, userId: string): Promise<KitRow[]> {
  const { data } = await supabase
    .from("product_costs")
    .select("product_keyword, units_per_kit")
    .eq("user_id", userId);
  return (data || []) as KitRow[];
}

/**
 * Aplica a movimentação de estoque para UMA transação. Retorna a ação tomada.
 */
export async function syncStockForTransaction(
  supabase: SB,
  userId: string,
  tx: StockTx,
  kits: KitRow[]
): Promise<"exit_created" | "return_created" | "noop"> {
  const status = (tx.status || "").toLowerCase().trim();
  const when = tx.payment_date || tx.sale_date || tx.created_at || new Date().toISOString();
  const label = `${tx.customer_name || "Cliente"} - ${tx.plan_name || tx.product_name || "Produto"}`;

  // Caso 1: venda paga -> garantir SAÍDA
  if (status === "pago") {
    const { data: existingExit } = await supabase
      .from("stock_movements")
      .select("id")
      .eq("user_id", userId)
      .eq("transaction_id", tx.id)
      .eq("type", "exit")
      .maybeSingle();
    if (existingExit) return "noop";

    const { units, matched } = resolveKitUnits(tx.plan_name, tx.product_name, kits);
    const { error } = await supabase.from("stock_movements").insert({
      user_id: userId,
      type: "exit",
      quantity: units,
      transaction_id: tx.id,
      product_name: tx.plan_name || tx.product_name || null,
      description: `Venda: ${label}`,
      kit_matched: matched,
      date: when,
    });
    // 23505 = violação do índice único parcial (corrida) -> ignora silenciosamente
    if (error && error.code !== "23505") throw error;
    return error ? "noop" : "exit_created";
  }

  // Caso 2: devolução/cancelamento -> se houve saída e ainda não há devolução,
  // cria ENTRADA de devolução restaurando o saldo.
  if (REVERSAL_STATUSES.has(status)) {
    const { data: exit } = await supabase
      .from("stock_movements")
      .select("id, quantity")
      .eq("user_id", userId)
      .eq("transaction_id", tx.id)
      .eq("type", "exit")
      .maybeSingle();
    if (!exit) return "noop";

    const { data: existingReturn } = await supabase
      .from("stock_movements")
      .select("id")
      .eq("user_id", userId)
      .eq("transaction_id", tx.id)
      .eq("type", "entry")
      .maybeSingle();
    if (existingReturn) return "noop";

    const { error } = await supabase.from("stock_movements").insert({
      user_id: userId,
      type: "entry",
      quantity: exit.quantity,
      unit_cost: 0,
      total_cost: 0,
      transaction_id: tx.id,
      product_name: tx.plan_name || tx.product_name || null,
      description: `Devolução: ${label}`,
      kit_matched: true,
      date: when,
    });
    if (error) throw error;
    return "return_created";
  }

  return "noop";
}
