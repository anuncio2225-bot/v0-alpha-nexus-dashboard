import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/team/accept { token } — vincula o usuario logado ao convite.
// Usa admin client para ler o convite pendente (RLS bloqueia o convidado de
// ver a linha antes de aceitar), mas SO vincula se o email logado bater.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Faça login para aceitar o convite", code: "not_logged_in" },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const token = (body.token || "").trim();
  if (!token) {
    return NextResponse.json({ error: "Token ausente" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: invite, error: findErr } = await admin
    .from("team_members")
    .select("id, owner_id, invited_email, status, member_user_id")
    .eq("invite_token", token)
    .maybeSingle();

  if (findErr || !invite) {
    return NextResponse.json(
      { error: "Convite inválido ou expirado", code: "invalid" },
      { status: 404 }
    );
  }

  if (invite.status === "revoked") {
    return NextResponse.json(
      { error: "Este convite foi revogado", code: "revoked" },
      { status: 410 }
    );
  }

  // Email do usuario logado precisa bater com o convidado
  const userEmail = (user.email || "").toLowerCase();
  if (userEmail !== invite.invited_email.toLowerCase()) {
    return NextResponse.json(
      {
        error: `Este convite é para ${invite.invited_email}. Faça login com essa conta.`,
        code: "email_mismatch",
        invitedEmail: invite.invited_email,
      },
      { status: 403 }
    );
  }

  // Dono nao pode ser membro de si mesmo
  if (invite.owner_id === user.id) {
    return NextResponse.json(
      { error: "Você não pode aceitar um convite da sua própria conta", code: "self" },
      { status: 400 }
    );
  }

  const { error: updErr } = await admin
    .from("team_members")
    .update({
      member_user_id: user.id,
      status: "active",
      accepted_at: new Date().toISOString(),
      revoked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invite.id);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
