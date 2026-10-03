import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId, podeVerCliente } from "@/lib/team/scope";

type Params = { params: Promise<{ tx: string }> };

/** Id do cliente da Cobrança ligado a uma venda (toque na notificação abre ele). */
export async function GET(_request: Request, { params }: Params) {
  const { tx } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ownerId = await getEffectiveUserId(supabase, user.id);
  const { data } = await supabase
    .from("collection_clients")
    .select("id")
    .eq("user_id", ownerId)
    .eq("transaction_id", tx)
    .maybeSingle();
  if (!data) return NextResponse.json({ id: null });
  if (!(await podeVerCliente(supabase, user.id, ownerId, data.id))) return NextResponse.json({ id: null });
  return NextResponse.json({ id: data.id });
}
