import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// POST /api/collections/import — importa transacoes afterpay pendentes para cobranca
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await supabase.rpc("seed_collection_defaults", { p_user_id: user.id });

  // Busca transacoes afterpay ainda pendentes (agendado/aguardando)
  const { data: txs, error: txErr } = await supabase
    .from("transactions")
    .select(
      "id, customer_name, customer_phone, customer_email, customer_doc, product_name, product_id, commission, affiliate_commission, total_value, gateway, src, attendant_id, sale_date, created_at, tracking_code, payment_method"
    )
    .eq("user_id", user.id)
    .eq("sale_type", "afterpay")
    .in("status", ["agendado", "aguardando"]);

  if (txErr) {
    return NextResponse.json({ error: txErr.message }, { status: 500 });
  }

  if (!txs || txs.length === 0) {
    return NextResponse.json({ imported: 0 });
  }

  // Transacoes ja vinculadas
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

  // Status padrao "Devendo"
  const { data: devendo } = await supabase
    .from("collection_statuses")
    .select("id, name")
    .eq("user_id", user.id)
    .ilike("name", "Devendo")
    .limit(1)
    .maybeSingle();

  // Mapa de atendentes para nome denormalizado
  const { data: attendants } = await supabase
    .from("attendants")
    .select("id, name")
    .eq("user_id", user.id);
  const attMap = new Map((attendants || []).map((a) => [a.id, a.name]));

  const rows = pending.map((t) => {
    const total =
      Number(t.affiliate_commission) ||
      Number(t.commission) ||
      Number(t.total_value) ||
      0;
    return {
      user_id: user.id,
      name: t.customer_name || "Cliente sem nome",
      phone: t.customer_phone || null,
      email: t.customer_email || null,
      document: t.customer_doc || null,
      product_name: t.product_name || null,
      product_id: t.product_id || null,
      platform_name: t.gateway || null,
      attendant_id: t.attendant_id || null,
      attendant_name: t.attendant_id ? attMap.get(t.attendant_id) || null : null,
      src: t.src || null,
      transaction_id: t.id,
      total_value: total,
      paid_value: 0,
      remaining_value: total,
      payment_method: t.payment_method || null,
      status_id: devendo?.id || null,
      status_name: devendo?.name || "Devendo",
      order_date: t.sale_date || t.created_at || null,
      tracking_code: t.tracking_code || null,
    };
  });

  const { data: inserted, error: insErr } = await supabase
    .from("collection_clients")
    .insert(rows)
    .select("id");

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ imported: inserted?.length || 0 });
}
