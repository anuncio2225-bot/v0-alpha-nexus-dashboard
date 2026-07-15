import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

/**
 * PATCH /api/stock/[id] — edição manual de uma movimentação.
 * Permite ajustar a quantidade (e o custo unitário em entradas). Ao editar a
 * quantidade manualmente, marcamos kit_matched=true (some o alerta de revisão).
 */
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = await getEffectiveUserId(supabase, user.id);
  const body = await request.json();

  const updates: Record<string, unknown> = {};

  if (body.quantity !== undefined) {
    const q = Math.trunc(Number(body.quantity));
    if (!Number.isFinite(q) || q <= 0) {
      return NextResponse.json(
        { error: "Quantidade deve ser um número inteiro maior que zero." },
        { status: 400 }
      );
    }
    updates.quantity = q;
    // Ajuste manual = usuário confirmou o valor; remove o alerta de revisão.
    updates.kit_matched = true;
  }

  if (body.unit_cost !== undefined) {
    const uc = Number(body.unit_cost) || 0;
    updates.unit_cost = uc;
    // Recalcula o total quando temos a quantidade final (nova ou atual).
    const finalQty =
      updates.quantity !== undefined ? (updates.quantity as number) : null;
    if (finalQty !== null) {
      updates.total_cost = uc * finalQty;
    }
  }

  if (body.description !== undefined) {
    updates.description = String(body.description);
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  // Se só mudou o custo unitário mas há quantidade nova implícita, garante o total.
  if (
    updates.unit_cost !== undefined &&
    updates.total_cost === undefined &&
    updates.quantity === undefined
  ) {
    const { data: existing } = await supabase
      .from("stock_movements")
      .select("quantity")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (existing) {
      updates.total_cost = (updates.unit_cost as number) * existing.quantity;
    }
  }

  const { data, error } = await supabase
    .from("stock_movements")
    .update(updates)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ movement: data });
}

/**
 * DELETE /api/stock/[id] — remove uma movimentação manual.
 */
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = await getEffectiveUserId(supabase, user.id);

  const { error } = await supabase
    .from("stock_movements")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
