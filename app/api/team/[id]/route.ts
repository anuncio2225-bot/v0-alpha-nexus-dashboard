import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTeamContext } from "@/lib/team/server";
import { resolveRolePreset } from "@/lib/team/roles";
import type { TeamRole } from "@/types";

// PATCH /api/team/[id] — edita papel/permissoes de um membro (apenas dono)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.role) {
    const role = body.role as TeamRole;
    const preset = resolveRolePreset(role, {
      permissions: body.permissions,
      can_edit: body.can_edit,
      can_delete: body.can_delete,
      can_export: body.can_export,
    });
    update.role = role;
    update.permissions = preset.permissions;
    update.can_edit = preset.can_edit;
    update.can_delete = preset.can_delete;
    update.can_export = preset.can_export;
  } else {
    // Atualizacoes pontuais sem mudar o papel
    if (body.permissions) update.permissions = { ...body.permissions, equipe: false };
    if (typeof body.can_edit === "boolean") update.can_edit = body.can_edit;
    if (typeof body.can_delete === "boolean") update.can_delete = body.can_delete;
    if (typeof body.can_export === "boolean") update.can_export = body.can_export;
    if (typeof body.invited_name === "string")
      update.invited_name = body.invited_name.trim() || null;
  }

  const { data, error } = await supabase
    .from("team_members")
    .update(update)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ member: data });
}

// DELETE /api/team/[id] — revoga o acesso de um membro (apenas dono)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  const { error } = await supabase
    .from("team_members")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      member_user_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
