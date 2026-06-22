import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  buildAttendantMap,
  buildStatusMap,
  syncTransactionToCollection,
} from "@/lib/collections/sync";

// POST /api/collections/import — importa/atualiza TODAS as transacoes para a
// cobranca (independente de sale_type/status). Nao duplica (vinculo por
// transaction_id): cria os novos e ATUALIZA os existentes que estao com dados
// faltando (telefone, email, CPF, link de pagamento, atendente, etc.), sem
// sobrescrever status manual nem dados ja preenchidos.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await supabase.rpc("seed_collection_defaults", { p_user_id: user.id });

  // Busca TODAS as transacoes do usuario (qualquer status / sale_type)
  const { data: txs, error: txErr } = await supabase
    .from("transactions")
    .select(
      "id, customer_name, customer_phone, customer_email, customer_doc, product_name, product_id, plan_name, commission, affiliate_commission, total_value, amount, gateway, src, attendant_id, status, status_code, original_status, sale_date, created_at, tracking_code, tracking_url, shipping_status, shipping_company, address_full, payment_method, payment_link"
    )
    .eq("user_id", user.id);

  if (txErr) {
    return NextResponse.json({ error: txErr.message }, { status: 500 });
  }

  if (!txs || txs.length === 0) {
    return NextResponse.json({ imported: 0 });
  }

  // Mapas compartilhados (status por nome, atendentes por nome)
  const [statusMap, attMap] = await Promise.all([
    buildStatusMap(supabase, user.id),
    buildAttendantMap(supabase, user.id),
  ]);

  // Processa TODAS as transacoes: o sync cria os novos e atualiza os existentes
  // (preenchendo campos faltantes) sem duplicar nem sobrescrever status manual.
  let imported = 0;
  let updated = 0;
  for (const t of txs) {
    const res = await syncTransactionToCollection(
      supabase,
      user.id,
      t,
      statusMap,
      attMap
    );
    if (res === "inserted") imported++;
    else if (res === "updated") updated++;
  }

  return NextResponse.json({ imported, updated });
}
