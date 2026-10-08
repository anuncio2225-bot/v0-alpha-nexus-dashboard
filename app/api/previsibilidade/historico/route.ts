import { createClient } from "@/lib/supabase/server";
import { getCanDelete, getCanEdit, getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";
import { aplicarCenario, calcular, normalizarEntradas, type Cenario } from "@/lib/previsibilidade/calculo";

/** Histórico de simulações salvas (mais novas primeiro). */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = await getEffectiveUserId(supabase, user.id);

  const { data, error } = await supabase
    .from("previsibilidade_historico")
    .select("id, nome, entradas, resultado, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ itens: data || [] });
}

/**
 * Salva uma simulação. O resultado é recalculado AQUI com o mesmo motor da
 * tela — o número guardado é o que estava na tela, sem confiar no navegador.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = await getEffectiveUserId(supabase, user.id);
  if (!(await getCanEdit(supabase))) {
    return NextResponse.json({ error: "Sem permissão para salvar" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.entradas) return NextResponse.json({ error: "Faltam as entradas" }, { status: 400 });

  const cenario = (body.cenario || null) as Cenario | null;
  const entradas = aplicarCenario(normalizarEntradas(body.entradas), cenario);
  const resultado = calcular(entradas);
  const nome = String(body.nome || cenario?.nome || "Simulação").trim().slice(0, 80) || "Simulação";

  const { data, error } = await supabase
    .from("previsibilidade_historico")
    .insert({ user_id: userId, nome, entradas, resultado, criado_por: user.id })
    .select("id, nome, entradas, resultado, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = await getEffectiveUserId(supabase, user.id);
  if (!(await getCanDelete(supabase))) {
    return NextResponse.json({ error: "Sem permissão para apagar" }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta o id" }, { status: 400 });

  const { error } = await supabase.from("previsibilidade_historico").delete().eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
