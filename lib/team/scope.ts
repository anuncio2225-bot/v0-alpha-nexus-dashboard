import type { SupabaseClient } from "@supabase/supabase-js";
import type { TeamDataScope, TeamSrcAreas } from "@/types";

const DEFAULT_SRC_AREAS: TeamSrcAreas = { cobranca: true, financeiro: true };

/**
 * Resolve o escopo de DADOS completo do usuario logado:
 * - ownerId: de quem sao os dados (dono = proprio id; membro = id do dono)
 * - srcFilter: se o membro esta limitado a um atendente (SRC), o valor do SRC.
 *   Para donos ou membros com visao total, e null (sem restricao).
 * - srcAreas: em quais areas o filtro por SRC se aplica.
 *
 * Nunca lanca: em falha, devolve escopo de dono (sem restricao).
 */
export async function getTeamDataScope(
  supabase: SupabaseClient,
  fallbackUserId: string
): Promise<TeamDataScope> {
  const ownerId = await getEffectiveUserId(supabase, fallbackUserId);

  try {
    const { data: membership } = await supabase
      .from("team_members")
      .select("scope_mode, attendant_src, src_areas, status")
      .eq("member_user_id", fallbackUserId)
      .eq("status", "active")
      .maybeSingle();

    if (
      membership &&
      membership.scope_mode === "attendant" &&
      membership.attendant_src
    ) {
      return {
        ownerId,
        srcFilter: membership.attendant_src as string,
        srcAreas: {
          ...DEFAULT_SRC_AREAS,
          ...((membership.src_areas as Partial<TeamSrcAreas>) || {}),
        },
      };
    }
  } catch {
    // ignora — cai no escopo de dono
  }

  return { ownerId, srcFilter: null, srcAreas: DEFAULT_SRC_AREAS };
}

/**
 * Retorna o ID de usuario para escopo de DADOS.
 *
 * - Dono (nao e membro de ninguem): retorna o proprio id (comportamento
 *   identico ao anterior — nada muda para quem ja usa).
 * - Membro de equipe ativo: retorna o id do DONO da conta, para que ele
 *   leia/escreva os dados da conta compartilhada (respeitando RLS + permissoes).
 *
 * Usa a funcao SQL effective_user_id() (SECURITY DEFINER) que ja resolve isso
 * no banco, garantindo consistencia com as policies RLS.
 */
export async function getEffectiveUserId(
  supabase: SupabaseClient,
  fallbackUserId: string
): Promise<string> {
  const { data, error } = await supabase.rpc("effective_user_id");
  if (error || !data) return fallbackUserId;
  return data as string;
}

/**
 * Retorna se o usuario logado pode EDITAR dados da conta atual.
 * Dono => sempre true. Membro => depende da permissao can_edit.
 */
export async function getCanEdit(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("team_can_edit");
  if (error || data === null || data === undefined) return true;
  return data as boolean;
}

/**
 * Retorna se o usuario logado pode EXCLUIR dados da conta atual.
 */
export async function getCanDelete(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("team_can_delete");
  if (error || data === null || data === undefined) return true;
  return data as boolean;
}
