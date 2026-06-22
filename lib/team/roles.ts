import {
  ALL_PERMISSIONS_TRUE,
  ALL_PERMISSIONS_FALSE,
  type TeamPermissions,
  type TeamRole,
} from "@/types";

export interface RolePreset {
  permissions: TeamPermissions;
  can_edit: boolean;
  can_delete: boolean;
  can_export: boolean;
}

// "equipe" nunca e liberado por preset: so o dono gerencia a equipe.
const VIEWER_PERMS: TeamPermissions = {
  ...ALL_PERMISSIONS_TRUE,
  equipe: false,
};

/**
 * Resolve as permissoes a partir de um papel.
 * Para "custom", usa exatamente o que veio do cliente (com fallback seguro).
 */
export function resolveRolePreset(
  role: TeamRole,
  custom?: {
    permissions?: Partial<TeamPermissions>;
    can_edit?: boolean;
    can_delete?: boolean;
    can_export?: boolean;
  }
): RolePreset {
  switch (role) {
    case "admin":
      return {
        permissions: { ...VIEWER_PERMS },
        can_edit: true,
        can_delete: true,
        can_export: true,
      };
    case "editor":
      return {
        permissions: { ...VIEWER_PERMS },
        can_edit: true,
        can_delete: false,
        can_export: true,
      };
    case "viewer":
      return {
        permissions: { ...VIEWER_PERMS },
        can_edit: false,
        can_delete: false,
        can_export: false,
      };
    case "custom":
    default:
      return {
        permissions: {
          ...ALL_PERMISSIONS_FALSE,
          ...(custom?.permissions || {}),
          equipe: false,
        },
        can_edit: !!custom?.can_edit,
        can_delete: !!custom?.can_delete,
        can_export: !!custom?.can_export,
      };
  }
}

export const ROLE_LABELS: Record<TeamRole, string> = {
  admin: "Administrador",
  editor: "Editor",
  viewer: "Visualizador",
  custom: "Personalizado",
};

export const PERMISSION_LABELS: { key: keyof TeamPermissions; label: string }[] = [
  { key: "dashboard", label: "Dashboard (visão geral e KPIs)" },
  { key: "investimento_ads", label: "Investimento Ads (Meta Ads e manual)" },
  { key: "integracoes", label: "Integrações (conexões com APIs)" },
  { key: "webhooks", label: "Webhooks (gerenciar webhooks)" },
  { key: "atendentes", label: "Atendentes (ver e gerenciar)" },
  { key: "cobranca", label: "Cobrança (CRM de cobrança)" },
  { key: "financeiro", label: "Financeiro (contas a pagar)" },
  { key: "cashflow", label: "Fluxo de Caixa" },
  { key: "logs", label: "Logs (webhooks recebidos)" },
  { key: "settings", label: "Configurações (perfil, imposto, timezone)" },
];
