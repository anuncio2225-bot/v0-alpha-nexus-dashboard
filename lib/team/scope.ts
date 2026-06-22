import type { SupabaseClient } from "@supabase/supabase-js";

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
