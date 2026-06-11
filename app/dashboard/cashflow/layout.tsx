"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/dashboard/cashflow", label: "Lançamentos" },
  { href: "/dashboard/cashflow/faturamento", label: "Faturamento Total" },
  { href: "/dashboard/cashflow/bills", label: "Contas a Pagar" },
];

export default function CashflowLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <div className="border-b border-border">
        <nav className="flex gap-4">
          {tabs.map((tab) => {
            const isActive =
              tab.href === "/dashboard/cashflow"
                ? pathname === "/dashboard/cashflow"
                : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "pb-3 text-sm font-medium border-b-2 transition-colors",
                  isActive
                    ? "border-brand text-brand"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {children}
    </div>
  );
}
