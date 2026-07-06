import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";

/** Remove caracteres especiais soltos no final do SRC (colchetes, parênteses, chaves, pontos, vírgulas, espaços). */
export function cleanSrc(src: string): string {
  return (src || "").replace(/[\]\[(){}.,\s]+$/g, "").trim();
}

/**
 * Varre a tabela transactions do usuário, extrai valores DISTINTOS de `src`
 * (já higienizados) e cria automaticamente atendentes para cada SRC ainda
 * não cadastrado. Não altera a tabela transactions (somente leitura).
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = await getEffectiveUserId(supabase, user.id);

  const { data: srcs, error: srcErr } = await supabase
    .from("transactions")
    .select("src")
    .eq("user_id", userId)
    .not("src", "is", null)
    .neq("src", "");

  if (srcErr) {
    return NextResponse.json({ error: srcErr.message }, { status: 500 });
  }

  // Higieniza e deduplica os SRCs das vendas
  const uniqueSrcs = [
    ...new Set((srcs || []).map((s) => cleanSrc(s.src || "")).filter(Boolean)),
  ];

  const { data: existing, error: exErr } = await supabase
    .from("attendants")
    .select("src")
    .eq("user_id", userId);

  if (exErr) {
    return NextResponse.json({ error: exErr.message }, { status: 500 });
  }

  // Compara contra os SRCs existentes também higienizados (evita duplicar "Gabriela" x "Gabriela]")
  const existingSrcs = new Set(
    (existing || []).map((a) => cleanSrc(a.src || "")).filter(Boolean)
  );

  const toCreate = uniqueSrcs.filter((src) => !existingSrcs.has(src));

  if (toCreate.length === 0) {
    return NextResponse.json({ created: 0, detected: uniqueSrcs.length });
  }

  const rows = toCreate.map((src) => ({
    user_id: userId,
    name: src,
    src,
    auto_detected: true,
    status: "active",
    role: "closer",
    commission_rate: 0,
    monthly_goal: 0,
    payment_closing_day: 1,
    calc_mode: "affiliate",
  }));

  const { error: insErr } = await supabase.from("attendants").insert(rows);

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ created: toCreate.length, detected: uniqueSrcs.length });
}
