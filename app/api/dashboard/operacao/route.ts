import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId, scopedSrc } from "@/lib/team/scope";
import { NextResponse } from "next/server";
import { calcularOperacaoReal } from "@/lib/previsibilidade/real";

/**
 * Resultado real da operação no período (pedidos → pagos → custos → lucro →
 * ROI), separando antecipados × agendados e própria × afiliados.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Membro limitado a um atendente: custos e lucro são da operação inteira.
  if (await scopedSrc(supabase, user.id, "dashboard")) {
    return NextResponse.json({ restrito: true });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) return NextResponse.json({ error: "Missing from/to params" }, { status: 400 });

  try {
    const ownerId = await getEffectiveUserId(supabase, user.id);
    return NextResponse.json(await calcularOperacaoReal(supabase, ownerId, from, to));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao calcular a operação";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
