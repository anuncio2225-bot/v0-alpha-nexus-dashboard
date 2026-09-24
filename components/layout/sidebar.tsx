"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  Link2,
  Users,
  Wallet,
  ArrowLeftRight,
  TrendingUp,
  Package,
  FileText,
  Settings,
  LogOut,
  Webhook,
  Megaphone,
  PhoneCall,
  Handshake,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Eye,
  EyeOff,
  ShieldCheck,
  Sun,
  Moon,
} from "lucide-react";
import type { Profile, TeamPermissionKey } from "@/types";
import { useSidebar } from "@/hooks/use-sidebar";
import { useHideValues } from "@/contexts/hide-values-context";
import { useTeamPermissions } from "@/hooks/use-team-permissions";
import { BrandMark } from "@/components/layout/brand-mark";

interface SidebarProps {
  profile: Profile | null;
}

const navItems: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  perm: TeamPermissionKey;
  ownerOnly?: boolean;
  group: string;
}[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard" , group: "Visão geral" },
  { href: "/dashboard/profit", label: "Análise de Lucro", icon: TrendingUp, perm: "financeiro" , group: "Visão geral" },
  { href: "/dashboard/attendants", label: "Atendentes", icon: Users, perm: "atendentes" , group: "Vendas" },
  { href: "/dashboard/affiliation", label: "Afiliação", icon: Handshake, perm: "atendentes" , group: "Vendas" },
  { href: "/dashboard/collections", label: "Cobrança", icon: PhoneCall, perm: "cobranca" , group: "Vendas" },
  { href: "/dashboard/cashflow", label: "Fluxo de Caixa", icon: ArrowLeftRight, perm: "cashflow" , group: "Financeiro" },
  { href: "/dashboard/financial", label: "Financeiro", icon: Wallet, perm: "financeiro" , group: "Financeiro" },
  { href: "/dashboard/stock", label: "Estoque", icon: Package, perm: "financeiro" , group: "Financeiro" },
  { href: "/dashboard/investimento-ads", label: "Investimento Ads", icon: Megaphone, perm: "investimento_ads" , group: "Marketing" },
  { href: "/dashboard/team", label: "Equipe", icon: ShieldCheck, perm: "equipe", ownerOnly: true , group: "Sistema" },
  { href: "/dashboard/connect", label: "Integrações", icon: Link2, perm: "integracoes" , group: "Sistema" },
  { href: "/dashboard/webhooks", label: "Webhooks", icon: Webhook, perm: "webhooks" , group: "Sistema" },
  { href: "/dashboard/logs", label: "Logs", icon: FileText, perm: "logs" , group: "Sistema" },
  { href: "/dashboard/settings", label: "Configurações", icon: Settings, perm: "settings" , group: "Sistema" },
];

export function Sidebar({ profile }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { isCollapsed: storedCollapsed, isHydrated, toggle } = useSidebar();
  const { hidden: valuesHidden, toggle: toggleValues } = useHideValues();
  const { isOwner, isMember, permissions, ownerName, isLoading } =
    useTeamPermissions();
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isDark = resolvedTheme !== "light";

  // Abaixo de 1024 px o menu vira gaveta: fica fora da tela e abre pelo botão
  // da barra superior. "Recolhido" só existe no computador.
  const [isDesktop, setIsDesktop] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);
  useEffect(() => setMobileOpen(false), [pathname]);
  const isCollapsed = storedCollapsed && isDesktop;

  // Itens visiveis: dono ve tudo; membro ve apenas o que tem permissao.
  // "Equipe" e exclusivo do dono. Enquanto carrega, mostramos tudo (evita flash
  // para donos); membros so escondem itens apos resolver o contexto.
  const visibleItems = navItems.filter((item) => {
    if (item.ownerOnly) return isOwner;
    if (isOwner || isLoading || !isMember) return true;
    return permissions?.[item.perm] === true;
  });

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  const firstName = (profile?.full_name || profile?.name || "").trim().split(/\s+/)[0] || "";
  const [todayLabel, setTodayLabel] = useState("");
  useEffect(() => {
    const s = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
    setTodayLabel(s.charAt(0).toUpperCase() + s.slice(1));
  }, []);

  const initials = profile?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "U";

  // Prevent layout shift during hydration
  const sidebarWidth = isCollapsed ? "w-[76px]" : "w-[256px]";

  return (
    <TooltipProvider delayDuration={0}>
      {/* Barra superior do celular: botão do menu + logotipo */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-sidebar-border bg-sidebar/95 px-4 backdrop-blur lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(true)}
          className="h-9 w-9 text-sidebar-foreground/70"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <Link href="/dashboard" className="flex items-center gap-2 text-lg font-bold font-logo tracking-tight">
          <BrandMark className="h-7 w-7" />
          <span className="text-metal">AlphaNexus</span>
        </Link>
      </header>

      {/* Fundo escurecido atrás da gaveta aberta */}
      <div
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
        className={cn(
          "fixed inset-0 z-40 bg-black/60 transition-opacity duration-200 lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      />

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-dvh flex-col border-r border-sidebar-border bg-sidebar transition-[width,transform] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] lg:z-40",
          isDesktop ? sidebarWidth : "w-[272px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo + Toggle */}
        <div className={cn("flex h-[72px] items-center justify-between gap-2 px-4", isCollapsed && "h-auto flex-col justify-center gap-3 py-4")}>
          <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
            <BrandMark className="h-9 w-9 shrink-0" />
            {!isCollapsed && (
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[17px] font-bold font-logo tracking-tight text-metal">AlphaNexus</span>
                <span className="block truncate text-[11px] text-sidebar-foreground/45">Gestão inteligente de operações</span>
              </span>
            )}
          </Link>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={isDesktop ? toggle : () => setMobileOpen(false)}
                aria-label={isDesktop ? (isCollapsed ? "Expandir menu" : "Recolher menu") : "Fechar menu"}
                className="btn-glass h-8 w-8 shrink-0 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground"
              >
                {!isDesktop ? (
                  <X className="h-4 w-4" />
                ) : isCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {!isDesktop ? "Fechar menu" : isCollapsed ? "Expandir menu" : "Recolher menu"}
            </TooltipContent>
          </Tooltip>
        </div>

        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        {/* Saudação grande, como nas referências */}
        {!isCollapsed && (
          <div className="px-5 pb-3 pt-4">
            <p className="text-[20px] font-semibold leading-[1.15] tracking-tight text-metal">
              Bem-vindo de volta,
              <br />
              {firstName || "tudo pronto"}
            </p>
            {todayLabel && (
              <p className="mt-2 text-xs text-sidebar-foreground/45">{todayLabel}</p>
            )}
            {isMember && (
              <div className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full border border-brand/25 bg-brand/10 px-2.5 py-1">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-brand" />
                <span className="truncate text-[11px] text-brand">
                  {ownerName ? `Equipe · ${ownerName}` : "Acesso de equipe"}
                </span>
              </div>
            )}
          </div>
        )}
        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-3">
          {visibleItems.map((item, index) => {
            const showGroup = index === 0 || visibleItems[index - 1].group !== item.group;
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <div key={item.href}>
                {showGroup && !isCollapsed && (
                  <p className="mb-1 mt-3 px-3 text-[11px] font-medium text-sidebar-foreground/35">
                    {item.group}
                  </p>
                )}
                {showGroup && isCollapsed && index > 0 && (
                  <div className="mx-3 my-3 h-px bg-white/[0.06]" />
                )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      "group relative mb-0.5 flex items-center gap-3 rounded-xl border px-3 py-2 text-[13.5px] font-medium transition-[color,background-color,border-color] duration-200",
                      isActive
                        ? "shine-top border-white/10 bg-[linear-gradient(90deg,rgba(255,255,255,0.09),rgba(255,255,255,0.02))] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_24px_-12px_rgba(0,0,0,0.9)]"
                        : "border-transparent text-sidebar-foreground/60 hover:bg-white/[0.035] hover:text-sidebar-foreground",
                      isCollapsed && "justify-center px-2"
                    )}
                  >
                    <item.icon
                      className={cn(
                        "h-[18px] w-[18px] shrink-0 transition-colors",
                        isActive ? "text-brand drop-shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70"
                      )}
                    />
                    <span
                      className={cn(
                        "transition-all duration-300 whitespace-nowrap overflow-hidden",
                        isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
                      )}
                    >
                      {item.label}
                    </span>
                    {isActive && !isCollapsed && (
                      <span className="ml-auto h-4 w-[3px] shrink-0 rounded-full bg-brand shadow-[0_0_10px_var(--brand-glow)]" />
                    )}
                  </Link>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  className={cn(!isCollapsed && "hidden")}
                >
                  {item.label}
                </TooltipContent>
              </Tooltip>
              </div>
            );
          })}
        </nav>

        {/* User section */}
        <div className="m-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          {/* Nome e e-mail ganham a linha inteira; as ações vão para a linha de
              baixo. Na mesma linha, o nome sumia em "Cl…". */}
          <div
            className={cn(
              "flex flex-wrap items-center gap-x-3 gap-y-2",
              isCollapsed && "flex-col flex-nowrap gap-2"
            )}
          >
            <Avatar
              className={cn(
                "border border-sidebar-border shrink-0 transition-all duration-300",
                isCollapsed ? "h-8 w-8" : "h-9 w-9"
              )}
            >
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-brand/20 text-brand text-xs font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div
              className={cn(
                "min-w-0 flex-1 overflow-hidden",
                isCollapsed ? "hidden" : "basis-[calc(100%-48px)]"
              )}
            >
              <p className="truncate text-sm font-medium text-sidebar-foreground">
                {profile?.full_name || profile?.name || "Usuário"}
              </p>
              <p className="truncate text-xs text-sidebar-foreground/50">
                {profile?.email}
              </p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setTheme(isDark ? "light" : "dark")}
                  className={cn(
                    "h-8 w-8 text-sidebar-foreground/50 hover:text-sidebar-foreground shrink-0",
                    isCollapsed && "mx-auto"
                  )}
                  aria-label="Alternar tema"
                >
                  {mounted && !isDark ? (
                    <Moon className="h-4 w-4" />
                  ) : (
                    <Sun className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {isDark ? "Tema claro" : "Tema escuro"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleValues}
                  className={cn(
                    "h-8 w-8 text-sidebar-foreground/50 hover:text-sidebar-foreground shrink-0",
                    isCollapsed && "mx-auto",
                    valuesHidden && "text-brand/70"
                  )}
                >
                  {valuesHidden ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {valuesHidden ? "Exibir valores" : "Ocultar valores"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  className={cn(
                    "h-8 w-8 text-sidebar-foreground/50 hover:text-destructive shrink-0",
                    isCollapsed && "mx-auto"
                  )}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Sair</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </aside>

      {/* Spacer for main content - syncs with sidebar width */}
      <div
        className={cn(
          "hidden shrink-0 transition-[width] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] lg:block",
          isHydrated ? sidebarWidth : "w-[256px]"
        )}
        aria-hidden="true"
      />
    </TooltipProvider>
  );
}
