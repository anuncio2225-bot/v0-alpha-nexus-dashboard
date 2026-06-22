import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ALL_PERMISSIONS_TRUE,
  ALL_PERMISSIONS_FALSE,
  type TeamContext,
  type TeamPermissions,
} from "@/types";

/**
 * Resolve o contexto de equipe do usuario logado.
 *
 * - Dono (nao e membro de ninguem): isOwner=true, ownerId = proprio id,
 *   todas as permissoes liberadas (comportamento atual, inalterado).
 * - Membro ativo: isMember=true, ownerId = id do dono, permissoes do registro.
 *
 * NUNCA lanca: em qualquer falha, devolve fallback de dono com o proprio id,
 * para nunca quebrar o fluxo existente.
 */
export async function getTeamContext(
  supabase: SupabaseClient,
  userId: string
): Promise<TeamContext> {
  const fallbackOwner: TeamContext = {
    isOwner: true,
    isMember: false,
    permissions: ALL_PERMISSIONS_TRUE,
    canEdit: true,
    canDelete: true,
    canExport: true,
    ownerName: null,
    ownerId: userId,
  };

  try {
    // A policy team_members_self permite o membro ler a propria linha.
    const { data: membership } = await supabase
      .from("team_members")
      .select(
        "owner_id, status, permissions, can_edit, can_delete, can_export"
      )
      .eq("member_user_id", userId)
      .eq("status", "active")
      .maybeSingle();

    if (!membership) {
      return fallbackOwner;
    }

    // Nome do dono (policy team_select_owner_profile permite ao membro ler).
    let ownerName: string | null = null;
    const { data: ownerProfile } = await supabase
      .from("profiles")
      .select("full_name, name, email")
      .eq("id", membership.owner_id)
      .maybeSingle();
    if (ownerProfile) {
      ownerName =
        ownerProfile.full_name || ownerProfile.name || ownerProfile.email || null;
    }

    const permissions = {
      ...ALL_PERMISSIONS_FALSE,
      ...(membership.permissions as Partial<TeamPermissions>),
    } as TeamPermissions;

    return {
      isOwner: false,
      isMember: true,
      permissions,
      canEdit: !!membership.can_edit,
      canDelete: !!membership.can_delete,
      canExport: !!membership.can_export,
      ownerName,
      ownerId: membership.owner_id,
    };
  } catch {
    return fallbackOwner;
  }
}

/**
 * Atalho: retorna apenas o id efetivo para escopar queries.
 * Para donos, retorna o proprio id (comportamento inalterado).
 */
export async function getEffectiveUserId(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const ctx = await getTeamContext(supabase, userId);
  return ctx.ownerId;
}
