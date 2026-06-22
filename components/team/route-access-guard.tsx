"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useTeamPermissions } from "@/hooks/use-team-permissions";
import type { TeamPermissionKey } from "@/types";
import { ShieldAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Mapeia o prefixo da rota -> chave de permissao.
// A ordem importa: rotas mais especificas primeiro.
const ROUTE_PERMISSIONS: { prefix: string; perm: TeamPermissionKey; ownerOnly?: boolean }[] = [
  { prefix: "/dashboard/team", perm: "equipe", ownerOnly: true },
  { prefix: "/dashboard/investimento-ads", perm: "investimento_ads" },
  { prefix: "/dashboard/connect", perm: "integracoes" },
  { prefix: "/dashboard/webhooks", perm: "webhooks" },
  { prefix: "/dashboard/attendants", perm: "atendentes" },
  { prefix: "/dashboard/collections", perm: "cobranca" },
  { prefix: "/dashboard/financial", perm: "financeiro" },
  { prefix: "/dashboard/cashflow", perm: "cashflow" },
  { prefix: "/dashboard/logs", perm: "logs" },
  { prefix: "/dashboard/settings", perm: "settings" },
  { prefix: "/dashboard", perm: "dashboard" },
];

function resolveRoute(pathname: string) {
  return ROUTE_PERMISSIONS.find((r) => pathname.startsWith(r.prefix));
}

export function RouteAccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isOwner, isMember, permissions, loading } = useTeamPermissions();

  // Donos (e qualquer usuario que nao seja membro) tem acesso total — sem
  // bloqueio nenhum. Isso garante que nada muda para quem ja usa o sistema.
  if (loading || isOwner || !isMember) {
    return <>{children}</>;
  }

  const route = resolveRoute(pathname);

  // Rota nao mapeada => libera (nao bloqueia navegacao desconhecida)
  if (!route) return <>{children}</>;

  const allowed = !route.ownerOnly && permissions?.[route.perm] === true;
  if (allowed) return <>{children}</>;

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <ShieldAlert className="h-7 w-7 text-destructive" />
      </div>
      <div className="max-w-md">
        <h1 className="text-lg font-semibold text-foreground">
          Acesso restrito
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Você não tem permissão para acessar esta área. Fale com o
          administrador da conta se precisar de acesso.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link href="/dashboard">Voltar ao início</Link>
      </Button>
    </div>
  );
}

// Versao leve so para evitar flash de loading quando necessario
export function RouteAccessLoading() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}
