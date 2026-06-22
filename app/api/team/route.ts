import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTeamContext } from "@/lib/team/server";
import { resolveRolePreset } from "@/lib/team/roles";
import type { TeamRole, TeamScopeMode, TeamSrcAreas } from "@/types";

// GET /api/team — lista os membros da equipe do dono logado
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const ctx = await getTeamContext(supabase, user.id);
  if (!ctx.isOwner) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("team_members")
    .select("*")
    .eq("owner_id", user.id)
    .order("invited_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ members: data || [] });
}

// POST /api/team — cria o membro JA ATIVO com a senha definida pelo dono.
// O membro entra pelo login normal com email + senha. Sem link de convite.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const ctx = await getTeamContext(supabase, user.id);
  if (!ctx.isOwner) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const email = (body.email || "").trim().toLowerCase();
  const name = (body.name || "").trim() || null;
  const password = (body.password || "").toString();
  const role = (body.role || "viewer") as TeamRole;

  // Vinculo de atendente / escopo
  const scopeMode = (body.scope_mode === "attendant"
    ? "attendant"
    : "all") as TeamScopeMode;
  const attendantId = body.attendant_id || null;
  const attendantSrc =
    typeof body.attendant_src === "string" && body.attendant_src.trim()
      ? body.attendant_src.trim()
      : null;
  const srcAreas: TeamSrcAreas = {
    cobranca: body.src_areas?.cobranca !== false,
    financeiro: body.src_areas?.financeiro !== false,
  };

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "A senha deve ter no mínimo 6 caracteres" },
      { status: 400 }
    );
  }
  if (scopeMode === "attendant" && !attendantSrc) {
    return NextResponse.json(
      { error: "Selecione o atendente (SRC) para a visão restrita" },
      { status: 400 }
    );
  }
  if (user.email && email === user.email.toLowerCase()) {
    return NextResponse.json(
      { error: "Você não pode convidar a si mesmo" },
      { status: 400 }
    );
  }

  // Email ja convidado nesta conta?
  const { data: existing } = await supabase
    .from("team_members")
    .select("id")
    .eq("owner_id", user.id)
    .eq("invited_email", email)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "Este email já faz parte da sua equipe" },
      { status: 409 }
    );
  }

  const preset = resolveRolePreset(role, {
    permissions: body.permissions,
    can_edit: body.can_edit,
    can_delete: body.can_delete,
    can_export: body.can_export,
  });

  const admin = createAdminClient();

  // Cria o usuario de autenticacao ja confirmado, com a senha do dono.
  const { data: created, error: createErr } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name, name },
    });

  if (createErr || !created?.user) {
    const msg = (createErr?.message || "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      return NextResponse.json(
        {
          error:
            "Este email já está em uso na plataforma. Use outro email ou remova-o do sistema antes.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: createErr?.message || "Erro ao criar usuário" },
      { status: 500 }
    );
  }

  const memberUserId = created.user.id;

  const { data: member, error } = await supabase
    .from("team_members")
    .insert({
      owner_id: user.id,
      invited_email: email,
      invited_name: name,
      member_user_id: memberUserId,
      role,
      status: "active",
      accepted_at: new Date().toISOString(),
      permissions: preset.permissions,
      can_edit: preset.can_edit,
      can_delete: preset.can_delete,
      can_export: preset.can_export,
      attendant_id: attendantId,
      attendant_src: attendantSrc,
      scope_mode: scopeMode,
      src_areas: srcAreas,
    })
    .select("*")
    .single();

  if (error) {
    // rollback do usuario criado para nao deixar orfao
    await admin.auth.admin.deleteUser(memberUserId).catch(() => {});
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ member });
}
