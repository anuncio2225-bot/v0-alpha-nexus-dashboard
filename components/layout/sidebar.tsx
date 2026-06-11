"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  FileText,
  Settings,
  LogOut,
  Webhook,
  Megaphone,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
} from "lucide-react";
import type { Profile } from "@/types";
import { useSidebar } from "@/hooks/use-sidebar";
import { useHideValues } from "@/contexts/hide-values-context";

interface SidebarProps {
  profile: Profile | null;
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/investimento-ads", label: "Investimento Ads", icon: Megaphone },
  { href: "/dashboard/connect", label: "Integrações", icon: Link2 },
  { href: "/dashboard/webhooks", label: "Webhooks", icon: Webhook },
  { href: "/dashboard/attendants", label: "Atendentes", icon: Users },
  { href: "/dashboard/financial", label: "Financeiro", icon: Wallet },
  { href: "/dashboard/cashflow", label: "Fluxo de Caixa", icon: ArrowLeftRight },
  { href: "/dashboard/logs", label: "Logs", icon: FileText },
  { href: "/dashboard/settings", label: "Configurações", icon: Settings },
];

export function Sidebar({ profile }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { isCollapsed, isHydrated, toggle } = useSidebar();
  const { hidden: valuesHidden, toggle: toggleValues } = useHideValues();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  const initials = profile?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "U";

  // Prevent layout shift during hydration
  const sidebarWidth = isCollapsed ? "w-[72px]" : "w-[232px]";

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 ease-in-out",
          sidebarWidth
        )}
      >
        {/* Logo + Toggle */}
        <div className="flex h-16 items-center justify-between px-4">
          <Link
            href="/dashboard"
            className={cn(
              "flex items-center gap-2 overflow-hidden transition-all duration-300",
              isCollapsed ? "w-0 opacity-0" : "w-auto opacity-100"
            )}
          >
            <span className="text-xl font-bold font-heading tracking-tight whitespace-nowrap">
              <span className="text-brand">Alpha</span>
              <span className="text-sidebar-foreground">Nexus</span>
            </span>
          </Link>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggle}
                className={cn(
                  "h-8 w-8 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent shrink-0",
                  isCollapsed && "mx-auto"
                )}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {isCollapsed ? "Expandir menu" : "Recolher menu"}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));

            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-300",
                      isActive
                        ? "bg-brand/15 text-brand"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                      isCollapsed && "justify-center px-2"
                    )}
                  >
                    <item.icon
                      className={cn(
                        "h-5 w-5 shrink-0",
                        isActive ? "text-brand" : "text-sidebar-foreground/50"
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
                      <div className="ml-auto h-1.5 w-1.5 rounded-full bg-brand shrink-0" />
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
            );
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-sidebar-border p-3">
          <div
            className={cn(
              "flex items-center gap-3 transition-all duration-300",
              isCollapsed && "flex-col gap-2"
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
                "flex-1 overflow-hidden transition-all duration-300",
                isCollapsed ? "w-0 h-0 opacity-0" : "w-auto opacity-100"
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
          "shrink-0 transition-all duration-300 ease-in-out",
          isHydrated ? sidebarWidth : "w-[232px]"
        )}
        aria-hidden="true"
      />
    </TooltipProvider>
  );
}
