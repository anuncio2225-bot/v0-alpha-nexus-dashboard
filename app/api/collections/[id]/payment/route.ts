import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

// POST /api/collections/[id]/payment — registra pagamento parcial/total
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const amount = Number(body.amount);
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "Valor invalido" }, { status: 400 });
  }

  const { data: client } = await supabase
    .from("collection_clients")
    .select("*")
    .eq("id", id)
    .eq("user_id", await getEffectiveUserId(supabase, user.id))
    .single();

  if (!client) {
    return NextResponse.json({ error: "Cliente nao encontrado" }, { status: 404 });
  }

  const total = Number(client.total_value) || 0;
  const newPaid = (Number(client.paid_value) || 0) + amount;
  const remaining = total - newPaid;

  // Determina novo status: Pago (saldo <=0) ou Pagamento Parcial
  const targetName = remaining <= 0 ? "Pago" : "Pagamento Parcial";
  const { data: targetStatus } = await supabase
    .from("collection_statuses")
    .select("id, name")
    .eq("user_id", await getEffectiveUserId(supabase, user.id))
    .ilike("name", targetName)
    .limit(1)
    .maybeSingle();

  const updates: Record<string, unknown> = {
    paid_value: newPaid,
    remaining_value: remaining,
    payment_method: body.payment_method || client.payment_method,
    last_contact_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (targetStatus) {
    updates.status_id = targetStatus.id;
    updates.status_name = targetStatus.name;
  }

  const { data: updated, error } = await supabase
    .from("collection_clients")
    .update(updates)
    .eq("id", id)
    .eq("user_id", await getEffectiveUserId(supabase, user.id))
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Registra no historico
  await supabase.from("collection_history").insert({
    user_id: await getEffectiveUserId(supabase, user.id),
    client_id: id,
    type: "payment",
    description: `Pagamento registrado de R$ ${amount.toFixed(2)}${
      remaining <= 0 ? " — quitado" : ` — saldo R$ ${remaining.toFixed(2)}`
    }`,
    payment_amount: amount,
    payment_method: body.payment_method || null,
  });

  return NextResponse.json({ client: updated });
}
