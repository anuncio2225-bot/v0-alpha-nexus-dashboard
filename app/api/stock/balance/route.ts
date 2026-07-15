import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";

/**
 * GET /api/stock/balance?from=&to= — KPIs do estoque.
 * - balance: saldo atual (todas entradas − todas saídas, desde o início)
 * - stock_value: saldo × custo unitário médio das entradas
 * - avg_unit_cost: soma(total_cost entradas) / soma(qty entradas)
 * - period_entries / period_exits: somatórios no período filtrado
 * - low_stock_alert / is_low: limite e flag de alerta
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
  const fromMs = fromRaw ? new Date(`${fromRaw.slice(0, 10)}T00:00:00-03:00`).getTime() : -Infinity;
  const toMs = toRaw ? new Date(`${toRaw.slice(0, 10)}T23:59:59-03:00`).getTime() : Infinity;

  const { data: movesRaw, error } = await supabase
    .from("stock_movements")
    .select("type, quantity, unit_cost, total_cost, date")
    .eq("user_id", userId);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const moves = movesRaw || [];
  let totalEntries = 0;
  let totalExits = 0;
  let entriesQtyCost = 0;
  let entriesTotalCost = 0;
  let periodEntries = 0;
  let periodExits = 0;

  for (const m of moves) {
    const qty = Number(m.quantity) || 0;
    if (m.type === "entry") {
      totalEntries += qty;
      entriesQtyCost += qty;
      entriesTotalCost += Number(m.total_cost) || 0;
    } else {
      totalExits += qty;
    }
    const t = new Date(m.date).getTime();
    if (t >= fromMs && t <= toMs) {
      if (m.type === "entry") periodEntries += qty;
      else periodExits += qty;
    }
  }

  const balance = totalEntries - totalExits;
  const avgUnitCost = entriesQtyCost > 0 ? entriesTotalCost / entriesQtyCost : 0;
  const stockValue = balance * avgUnitCost;

  const { data: cfg } = await supabase
    .from("stock_config")
    .select("low_stock_alert, default_unit_cost")
    .eq("user_id", userId)
    .maybeSingle();
  const lowStockAlert = cfg?.low_stock_alert ?? 50;

  return NextResponse.json({
    balance,
    stock_value: stockValue,
    avg_unit_cost: avgUnitCost,
    period_entries: periodEntries,
    period_exits: periodExits,
    low_stock_alert: lowStockAlert,
    is_low: balance < lowStockAlert,
    default_unit_cost: cfg?.default_unit_cost ?? 0,
  });
}
