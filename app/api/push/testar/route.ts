import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { enviarAviso } from "@/lib/push/enviar";

/** Manda um aviso de teste para ESTE aparelho (ou todos da conta, sem endpoint). */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { endpoint } = (await request.json().catch(() => ({}))) as { endpoint?: string };
  const ownerId = await getEffectiveUserId(supabase, user.id);
  const r = await enviarAviso(
    ownerId,
    {
      evento: "teste",
      titulo: "🔔 AlphaNexus conectado",
      corpo: "Os avisos de venda e entrega vão chegar aqui.",
      url: "/dashboard/settings",
      tag: "teste",
    },
    endpoint
  );
  return NextResponse.json(r);
}
