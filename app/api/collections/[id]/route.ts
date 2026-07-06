import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

// GET /api/collections/[id] — detalhes do cliente
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("collection_clients")
    .select("*")
    .eq("id", id)
    .eq("user_id", await getEffectiveUserId(supabase, user.id))
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json({ client: data });
}

// PATCH /api/collections/[id] — edita cliente
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // Carrega o estado atual (para detectar mudanca de status e recalcular saldo)
  const { data: current } = await supabase
    .from("collection_clients")
    .select("*")
    .eq("id", id)
    .eq("user_id", await getEffectiveUserId(supabase, user.id))
    .single();

  if (!current) {
    return NextResponse.json({ error: "Nao encontrado" }, { status: 404 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const allowed = [
    "name",
    "phone",
    "email",
    "document",
    "product_name",
    "product_id",
    "platform_id",
    "platform_name",
    "attendant_id",
    "attendant_name",
    "src",
    "total_value",
    "paid_value",
    "payment_method",
    "payment_link",
    "status_id",
    "status_name",
    "order_date",
    "payment_date",
    "negotiation_date",
    "next_collection_date",
    "tracking_code",
    "last_contact_at",
    "days_without_response",
    "notes",
  ];
  for (const key of allowed) {
    if (key in body) updates[key] = body[key];
  }

  // Ao (re)atribuir um atendente pela Cobrança, resolvemos o registro autoritativo
  // da atendente para preencher attendant_name e src, e propagamos o src para a
  // transação vinculada — assim o cálculo de comissão da aba de Atendentes reflete
  // a mudança automaticamente (a query lá busca transações por src).
  if ("attendant_id" in body && body.attendant_id) {
    const scopedUserId = await getEffectiveUserId(supabase, user.id);
    const { data: att } = await supabase
      .from("attendants")
      .select("id, name, src")
      .eq("id", body.attendant_id)
      .eq("user_id", scopedUserId)
      .single();

    if (att) {
      const effectiveSrc = (att.src && att.src.trim()) || att.name;
      updates.attendant_name = att.name;
      updates.src = effectiveSrc;

      // Garante que a atendente tenha um src (necessário para o cálculo por transações)
      if (!att.src && effectiveSrc) {
        await supabase
          .from("attendants")
          .update({ src: effectiveSrc })
          .eq("id", att.id)
          .eq("user_id", scopedUserId);
      }

      // Propaga o src para a transação vinculada (quando existir)
      if (current.transaction_id) {
        await supabase
          .from("transactions")
          .update({ src: effectiveSrc })
          .eq("id", current.transaction_id)
          .eq("user_id", scopedUserId);
      }
    }
  }

  // Recalcula saldo se valores mudaram
  const total =
    "total_value" in body ? Number(body.total_value) || 0 : Number(current.total_value) || 0;
  const paid =
    "paid_value" in body ? Number(body.paid_value) || 0 : Number(current.paid_value) || 0;
  if ("total_value" in body || "paid_value" in body) {
    updates.remaining_value = total - paid;
  }

  // Resolve status_name quando muda status_id
  let statusChanged = false;
  let newStatusName = current.status_name as string | null;
  if ("status_id" in body && body.status_id !== current.status_id) {
    statusChanged = true;
    const { data: st } = await supabase
      .from("collection_statuses")
      .select("name")
      .eq("id", body.status_id)
      .eq("user_id", await getEffectiveUserId(supabase, user.id))
      .single();
    newStatusName = st?.name || null;
    updates.status_name = newStatusName;
  }

  const { data, error } = await supabase
    .from("collection_clients")
    .update(updates)
    .eq("id", id)
    .eq("user_id", await getEffectiveUserId(supabase, user.id))
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Registra mudanca de status no historico
  if (statusChanged) {
    await supabase.from("collection_history").insert({
      user_id: await getEffectiveUserId(supabase, user.id),
      client_id: id,
      type: "status_change",
      description: `Status alterado para ${newStatusName || "—"}`,
      old_status: current.status_name,
      new_status: newStatusName,
    });
  }

  return NextResponse.json({ client: data });
}

// DELETE /api/collections/[id]
// Remove o cliente SOMENTE da Cobranca (collection_clients + collection_history).
// NUNCA toca na tabela transactions — a transacao original permanece intacta e o
// cliente pode ser re-importado depois pelo "Importar do Webhook".
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Remove o historico vinculado primeiro (caso nao haja cascade no banco)
  await supabase
    .from("collection_history")
    .delete()
    .eq("client_id", id)
    .eq("user_id", await getEffectiveUserId(supabase, user.id));

  const { error } = await supabase
    .from("collection_clients")
    .delete()
    .eq("id", id)
    .eq("user_id", await getEffectiveUserId(supabase, user.id));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
