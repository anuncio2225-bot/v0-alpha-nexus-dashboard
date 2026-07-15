import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";

/**
 * POST /api/stock/entry — registra uma entrada manual de estoque (lote novo).
 * Calcula total_cost = quantity × unit_cost.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = await getEffectiveUserId(supabase, user.id);
  const body = await request.json();

  const quantity = Math.round(Number(body.quantity) || 0);
  const unitCost = Number(body.unit_cost) || 0;
  if (quantity <= 0)
    return NextResponse.json(
      { error: "Quantidade deve ser maior que zero" },
      { status: 400 }
    );

  const payload = {
    user_id: userId,
    type: "entry" as const,
    quantity,
    unit_cost: unitCost,
    total_cost: quantity * unitCost,
    description: body.description || "Entrada de estoque",
    kit_matched: true,
    date: body.date ? new Date(body.date).toISOString() : new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("stock_movements")
    .insert(payload)
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ movement: data });
}
