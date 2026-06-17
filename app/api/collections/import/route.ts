import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import {
  buildAttendantMap,
  buildStatusMap,
  syncTransactionToCollection,
} from "@/lib/collections/sync";

// POST /api/collections/import — importa TODAS as transacoes para a cobranca
// (independente de sale_type/status). Nao duplica: pula as que ja possuem
// um collection_client vinculado pelo transaction_id.
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
      "id, customer_name, customer_phone, customer_email, customer_doc, product_name, product_id, commission, affiliate_commission, total_value, amount, gateway, src, attendant_id, status, sale_date, created_at, tracking_code, payment_method"
    )
    .eq("user_id", user.id);

  if (txErr) {
    return NextResponse.json({ error: txErr.message }, { status: 500 });
  }

  if (!txs || txs.length === 0) {
    return NextResponse.json({ imported: 0 });
  }

  // Transacoes ja vinculadas (para nao duplicar)
  const { data: existing } = await supabase
    .from("collection_clients")
    .select("transaction_id")
    .eq("user_id", user.id)
    .not("transaction_id", "is", null);
  const linked = new Set((existing || []).map((c) => c.transaction_id));

  const pending = txs.filter((t) => !linked.has(t.id));
  if (pending.length === 0) {
    return NextResponse.json({ imported: 0 });
  }

  // Mapas compartilhados (status por nome, atendentes por nome)
  const [statusMap, attMap] = await Promise.all([
    buildStatusMap(supabase, user.id),
    buildAttendantMap(supabase, user.id),
  ]);

  let imported = 0;
  for (const t of pending) {
    const res = await syncTransactionToCollection(
      supabase,
      user.id,
      t,
      statusMap,
      attMap
    );
    if (res === "inserted") imported++;
  }

  return NextResponse.json({ imported });
}
