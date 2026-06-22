import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

// GET /api/collections/[id]/history — timeline do cliente
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
    .from("collection_history")
    .select("*")
    .eq("user_id", await getEffectiveUserId(supabase, user.id))
    .eq("client_id", id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ history: data });
}

// POST /api/collections/[id]/history — adiciona evento (nota, etc.)
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
  if (!body.description) {
    return NextResponse.json({ error: "Descricao obrigatoria" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("collection_history")
    .insert({
      user_id: await getEffectiveUserId(supabase, user.id),
      client_id: id,
      type: body.type || "note",
      description: body.description,
      old_status: body.old_status || null,
      new_status: body.new_status || null,
      payment_amount: body.payment_amount ?? null,
      payment_method: body.payment_method || null,
      scheduled_date: body.scheduled_date || null,
      created_by: body.created_by || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Atualiza ultimo contato no cliente
  await supabase
    .from("collection_clients")
    .update({ last_contact_at: new Date().toISOString(), days_without_response: 0 })
    .eq("id", id)
    .eq("user_id", await getEffectiveUserId(supabase, user.id));

  return NextResponse.json({ event: data });
}
