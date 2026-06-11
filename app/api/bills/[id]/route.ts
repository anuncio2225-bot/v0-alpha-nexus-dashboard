import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.titulo !== undefined) updates.titulo = body.titulo;
  if (body.categoria !== undefined) updates.categoria = body.categoria;
  if (body.valor !== undefined) updates.valor = Number(body.valor);
  if (body.vencimento !== undefined) updates.vencimento = body.vencimento;
  if (body.recorrente !== undefined) updates.recorrente = body.recorrente;
  if (body.observacao !== undefined) updates.observacao = body.observacao;
  if (body.status !== undefined) updates.status = body.status;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("bills")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { error } = await supabase
    .from("bills")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
