"use client";

import useSWR from "swr";
import {
  ALL_PERMISSIONS_TRUE,
  type TeamContext,
  type TeamPermissionKey,
} from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/**
 * Hook de permissoes de equipe (client-side).
 *
 * Enquanto carrega, assume dono com acesso total para evitar "flash" de
 * conteudo bloqueado para quem e dono. A protecao real fica no servidor (RLS
 * + checagens nas rotas), entao isso e apenas UX.
 */
export function useTeamPermissions() {
  const { data, isLoading } = useSWR<{ context: TeamContext }>(
    "/api/team/me",
    fetcher,
    { revalidateOnFocus: false }
  );

  const ctx: TeamContext = data?.context || {
    isOwner: true,
    isMember: false,
    permissions: ALL_PERMISSIONS_TRUE,
    canEdit: true,
    canDelete: true,
    canExport: true,
    ownerName: null,
    ownerId: "",
  };

  function can(page: TeamPermissionKey): boolean {
    if (ctx.isOwner) return true;
    return !!ctx.permissions[page];
  }

  return {
    isLoading,
    isOwner: ctx.isOwner,
    isMember: ctx.isMember,
    permissions: ctx.permissions,
    canEdit: ctx.canEdit,
    canDelete: ctx.canDelete,
    canExport: ctx.canExport,
    ownerName: ctx.ownerName,
    can,
  };
}
