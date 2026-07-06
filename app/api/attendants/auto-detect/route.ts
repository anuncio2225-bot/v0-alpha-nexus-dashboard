import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";

/**
 * Varre a tabela transactions do usuário, extrai valores DISTINTOS de `src`
 * e cria automaticamente atendentes para cada SRC ainda não cadastrado.
 * Não altera a tabela transactions (somente leitura).
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

  const uniqueSrcs = [
    ...new Set((srcs || []).map((s) => (s.src || "").trim()).filter(Boolean)),
  ];

  const { data: existing, error: exErr } = await supabase
    .from("attendants")
    .select("src")
    .eq("user_id", userId);

  if (exErr) {
    return NextResponse.json({ error: exErr.message }, { status: 500 });
  }

  const existingSrcs = new Set(
    (existing || []).map((a) => (a.src || "").trim()).filter(Boolean)
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
