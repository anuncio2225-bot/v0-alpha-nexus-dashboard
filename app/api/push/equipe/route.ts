import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Só o DONO: quem da equipe recebe notificações no celular.
 * GET lista os membros ativos; PATCH liga/desliga um membro.
 */
async function dono() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  // Membro da equipe não é dono de nada aqui.
  const { data: souMembro } = await supabase
    .from("team_members")
    .select("id")
    .eq("member_user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  return souMembro ? null : user.id;
}

export async function GET() {
  const ownerId = await dono();
  if (!ownerId) return NextResponse.json({ error: "Somente o dono da conta" }, { status: 403 });
  const admin = createAdminClient();

  const { data: membros } = await admin
    .from("team_members")
    .select("member_user_id, invited_name, invited_email, scope_mode, attendant_src")
    .eq("owner_id", ownerId)
    .eq("status", "active")
    .not("member_user_id", "is", null);
  const ids = (membros || []).map((m) => m.member_user_id as string);
  if (!ids.length) return NextResponse.json({ membros: [] });

  const [{ data: prefs }, { data: aparelhos }] = await Promise.all([
    admin.from("push_preferencias").select("member_id, permitido").eq("owner_id", ownerId).in("member_id", ids),
    admin.from("push_subscriptions").select("member_id").eq("owner_id", ownerId).in("member_id", ids),
  ]);
  const permitido = new Map((prefs || []).map((p) => [p.member_id, p.permitido]));
  const qtd = new Map<string, number>();
  for (const a of aparelhos || []) qtd.set(a.member_id, (qtd.get(a.member_id) || 0) + 1);

  return NextResponse.json({
    membros: (membros || []).map((m) => ({
      member_id: m.member_user_id,
      nome: m.invited_name || m.invited_email,
      email: m.invited_email,
      atendente: m.scope_mode === "attendant" ? m.attendant_src : null,
      permitido: permitido.get(m.member_user_id) ?? true,
      aparelhos: qtd.get(m.member_user_id) || 0,
    })),
  });
}

export async function PATCH(request: NextRequest) {
  const ownerId = await dono();
  if (!ownerId) return NextResponse.json({ error: "Somente o dono da conta" }, { status: 403 });
  const { member_id, permitido } = (await request.json().catch(() => ({}))) as {
    member_id?: string;
    permitido?: boolean;
  };
  if (!member_id || typeof permitido !== "boolean")
    return NextResponse.json({ error: "dados inválidos" }, { status: 400 });

  const admin = createAdminClient();
  // Só membros desta conta.
  const { data: membro } = await admin
    .from("team_members")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("member_user_id", member_id)
    .maybeSingle();
  if (!membro) return NextResponse.json({ error: "membro não encontrado" }, { status: 404 });

  const { error } = await admin
    .from("push_preferencias")
    .upsert(
      { owner_id: ownerId, member_id, permitido, updated_at: new Date().toISOString() },
      { onConflict: "owner_id,member_id" }
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
