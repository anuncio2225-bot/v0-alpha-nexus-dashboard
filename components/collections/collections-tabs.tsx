"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Users, CalendarDays, BarChart3, Settings } from "lucide-react";

const tabs = [
  { href: "/dashboard/collections", label: "Clientes", icon: Users },
  { href: "/dashboard/collections/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/dashboard/collections/reports", label: "Relatórios", icon: BarChart3 },
  { href: "/dashboard/collections/settings", label: "Configurações", icon: Settings },
];

export function CollectionsTabs() {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap gap-1 border-b border-border">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-brand text-brand"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
