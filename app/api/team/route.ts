import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTeamContext } from "@/lib/team/server";
import { resolveRolePreset } from "@/lib/team/roles";
import type { TeamRole } from "@/types";

// GET /api/team — lista os membros da equipe do dono logado
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  // Apenas donos gerenciam equipe
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

// POST /api/team/invite e tratado aqui via ?action=invite OU rota dedicada.
// Mantemos POST /api/team como criacao de convite para simplicidade.
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
  const role = (body.role || "viewer") as TeamRole;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }

  // Dono nao pode se auto-convidar
  if (user.email && email === user.email.toLowerCase()) {
    return NextResponse.json(
      { error: "Você não pode convidar a si mesmo" },
      { status: 400 }
    );
  }

  // Email ja convidado?
  const { data: existing } = await supabase
    .from("team_members")
    .select("id, status")
    .eq("owner_id", user.id)
    .eq("invited_email", email)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: "Este email já foi convidado" },
      { status: 409 }
    );
  }

  const preset = resolveRolePreset(role, {
    permissions: body.permissions,
    can_edit: body.can_edit,
    can_delete: body.can_delete,
    can_export: body.can_export,
  });

  const { data: created, error } = await supabase
    .from("team_members")
    .insert({
      owner_id: user.id,
      invited_email: email,
      invited_name: name,
      role,
      status: "pending",
      permissions: preset.permissions,
      can_edit: preset.can_edit,
      can_delete: preset.can_delete,
      can_export: preset.can_export,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Link de convite para o dono copiar e enviar manualmente
  const origin = request.nextUrl.origin;
  const inviteLink = `${origin}/auth/team-invite?token=${created.invite_token}`;

  return NextResponse.json({ member: created, inviteLink });
}
