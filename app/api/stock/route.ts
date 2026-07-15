import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";

/**
 * GET /api/stock?from=&to= — lista as movimentações do período (mais recentes
 * primeiro), já com o saldo acumulado calculado em ordem cronológica.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = await getEffectiveUserId(supabase, user.id);
  const { searchParams } = new URL(request.url);
  const fromRaw = searchParams.get("from");
  const toRaw = searchParams.get("to");

  // Busca TODAS as movimentações para computar o saldo acumulado corretamente;
  // depois filtra as do período para exibir.
  const { data: allRaw, error } = await supabase
    .from("stock_movements")
    .select("*")
    .eq("user_id", userId)
    .order("date", { ascending: true })
    .order("created_at", { ascending: true });

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const all = allRaw || [];
  let running = 0;
  const withBalance = all.map((m) => {
    running += m.type === "entry" ? m.quantity : -m.quantity;
    return { ...m, balance_after: running };
  });

  const fromMs = fromRaw ? new Date(`${fromRaw.slice(0, 10)}T00:00:00-03:00`).getTime() : -Infinity;
  const toMs = toRaw ? new Date(`${toRaw.slice(0, 10)}T23:59:59-03:00`).getTime() : Infinity;

  const filtered = withBalance
    .filter((m) => {
      const t = new Date(m.date).getTime();
      return t >= fromMs && t <= toMs;
    })
    .reverse(); // mais recentes primeiro

  return NextResponse.json({ movements: filtered });
}
