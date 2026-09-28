import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/team/scope";

/**
 * Registra (ou atualiza) o aparelho que ativou os avisos.
 * owner_id = dono das vendas (para membro da equipe, o dono da conta).
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const inscricao = body?.inscricao;
  if (!inscricao?.endpoint || !inscricao?.keys?.p256dh || !inscricao?.keys?.auth) {
    return NextResponse.json({ error: "inscrição inválida" }, { status: 400 });
  }

  const ownerId = await getEffectiveUserId(supabase, user.id);
  // Uma linha por (conta, aparelho): o mesmo celular pode receber de várias
  // contas — basta entrar em cada uma e ativar. Reinstalar o app gera outro
  // endpoint, e o antigo morre sozinho no primeiro envio (404/410).
  const { error } = await createAdminClient()
    .from("push_subscriptions")
    .upsert(
      {
        owner_id: ownerId,
        member_id: user.id,
        endpoint: inscricao.endpoint,
        p256dh: inscricao.keys.p256dh,
        auth: inscricao.keys.auth,
        user_agent: request.headers.get("user-agent"),
      },
      { onConflict: "owner_id,endpoint" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { endpoint } = (await request.json().catch(() => ({}))) as { endpoint?: string };
  if (!endpoint) return NextResponse.json({ error: "endpoint faltando" }, { status: 400 });

  await createAdminClient()
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint)
    .eq("member_id", user.id)
    .eq("owner_id", await getEffectiveUserId(supabase, user.id));
  return NextResponse.json({ ok: true });
}
