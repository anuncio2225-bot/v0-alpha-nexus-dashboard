import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import {
  upsertManualTransaction,
  isPaidStatusName,
} from "@/lib/collections/manual-transaction";

/**
 * Backfill: cria a transação espelho de pedidos MANUAIS da Cobrança que já
 * estavam como "Pago" ANTES do espelhamento automático existir.
 *
 * Contexto: o Dashboard principal (Pagas no Período, ROI, CPA, Lucro) lê só da
 * tabela `transactions`. Pedidos manuais pagos criados antes da feature ficaram
 * sem transação e, portanto, não apareciam no Dashboard (ex.: a cliente
 * "MARIA ERLINA..."). Este endpoint localiza esses pedidos (manual = sem
 * transaction_id, status "Pago") e cria/liga a transação espelho usando o MESMO
 * helper do fluxo em runtime.
 *
 * Idempotente e escopado ao usuário: upsert por (user_id, gateway, external_id).
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const userId = await getEffectiveUserId(supabase, user.id);

  // Pedidos manuais (sem transaction_id) e pagos.
  const { data: clients, error } = await supabase
    .from("collection_clients")
    .select("*")
    .eq("user_id", userId)
    .is("transaction_id", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Ignora pedidos de TESTE que possam ter vazado para a Cobrança (ex.: postback
  // de teste da Payt: email "yoda@testsuser.com" / transaction_code "PAYTS2").
  const isTestClient = (c: Record<string, unknown>): boolean => {
    const email = String(c.email ?? "").toLowerCase();
    const code = String(c.transaction_code ?? "").toUpperCase();
    return email.includes("testsuser") || code === "PAYTS2";
  };

  const manualPaid = (clients || []).filter(
    (c) => isPaidStatusName(c.status_name as string | null) && !isTestClient(c)
  );

  let created = 0;
  const names: string[] = [];

  for (const client of manualPaid) {
    const txId = await upsertManualTransaction(supabase, userId, client);
    if (txId) {
      await supabase
        .from("collection_clients")
        .update({ transaction_id: txId })
        .eq("id", client.id)
        .eq("user_id", userId);
      created += 1;
      if (client.name) names.push(String(client.name));
    }
  }

  return NextResponse.json({
    manual_paid_found: manualPaid.length,
    mirrored: created,
    clients: names,
    message: `${created} pedido(s) manual(is) pago(s) espelhado(s) no Dashboard`,
  });
}
