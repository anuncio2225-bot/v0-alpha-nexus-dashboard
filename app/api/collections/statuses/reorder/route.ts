import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";

// PATCH /api/collections/statuses/reorder
// Body: { order: string[] } — array de ids de status na nova ordem.
// Persiste a posicao (position) de cada coluna do kanban para o usuario.
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const order: string[] = Array.isArray(body.order) ? body.order : [];
  if (order.length === 0) {
    return NextResponse.json({ error: "Ordem invalida" }, { status: 400 });
  }

  // Atualiza posicao de cada status (escopado ao usuario por seguranca)
  const scopedId = await getEffectiveUserId(supabase, user.id);
  const results = await Promise.all(
    order.map((id, index) =>
      supabase
        .from("collection_statuses")
        .update({ position: index, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", scopedId)
    )
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
