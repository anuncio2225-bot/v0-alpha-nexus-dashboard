import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("bills")
    .select("*")
    .eq("user_id", await getEffectiveUserId(supabase, user.id))
    .order("vencimento", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { titulo, categoria, valor, vencimento, recorrente, observacao, status } = body;

  if (!titulo || !vencimento) {
    return NextResponse.json({ error: "Titulo e vencimento sao obrigatorios" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("bills")
    .insert({
      user_id: await getEffectiveUserId(supabase, user.id),
      titulo,
      categoria: categoria || "Outros",
      valor: Number(valor) || 0,
      vencimento,
      recorrente: recorrente ?? false,
      observacao: observacao || null,
      status: status || "pendente",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
