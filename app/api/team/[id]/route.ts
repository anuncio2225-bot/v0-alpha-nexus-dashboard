import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTeamContext } from "@/lib/team/server";
import { resolveRolePreset } from "@/lib/team/roles";
import type { TeamRole, TeamScopeMode, TeamSrcAreas } from "@/types";

// PATCH /api/team/[id] — edita papel/permissoes/vinculo/senha de um membro (dono)
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

  // Garante que o membro pertence ao dono
  const { data: target } = await supabase
    .from("team_members")
    .select("id, member_user_id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "Membro não encontrado" }, { status: 404 });
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
    if (body.permissions) update.permissions = { ...body.permissions, equipe: false };
    if (typeof body.can_edit === "boolean") update.can_edit = body.can_edit;
    if (typeof body.can_delete === "boolean") update.can_delete = body.can_delete;
    if (typeof body.can_export === "boolean") update.can_export = body.can_export;
  }

  if (typeof body.invited_name === "string")
    update.invited_name = body.invited_name.trim() || null;

  // Vinculo de atendente / escopo
  if (body.scope_mode === "all" || body.scope_mode === "attendant") {
    update.scope_mode = body.scope_mode as TeamScopeMode;
  }
  if ("attendant_id" in body) update.attendant_id = body.attendant_id || null;
  if ("attendant_src" in body)
    update.attendant_src =
      typeof body.attendant_src === "string" && body.attendant_src.trim()
        ? body.attendant_src.trim()
        : null;
  if (body.src_areas) {
    update.src_areas = {
      cobranca: body.src_areas.cobranca !== false,
      financeiro: body.src_areas.financeiro !== false,
    } as TeamSrcAreas;
  }

  // Redefinir senha (opcional)
  if (typeof body.password === "string" && body.password.length > 0) {
    if (body.password.length < 6) {
      return NextResponse.json(
        { error: "A senha deve ter no mínimo 6 caracteres" },
        { status: 400 }
      );
    }
    if (target.member_user_id) {
      const admin = createAdminClient();
      const { error: pwErr } = await admin.auth.admin.updateUserById(
        target.member_user_id,
        { password: body.password }
      );
      if (pwErr) {
        return NextResponse.json({ error: pwErr.message }, { status: 500 });
      }
    }
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

// DELETE /api/team/[id] — remove o membro e LIBERA o email (apaga o usuario
// de autenticacao), permitindo que a pessoa crie a propria conta depois.
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

  const { data: target } = await supabase
    .from("team_members")
    .select("id, member_user_id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "Membro não encontrado" }, { status: 404 });
  }

  // Apaga o usuario de autenticacao para liberar o email para uso proprio.
  if (target.member_user_id) {
    const admin = createAdminClient();
    await admin.auth.admin.deleteUser(target.member_user_id).catch(() => {});
  }

  const { error } = await supabase
    .from("team_members")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
