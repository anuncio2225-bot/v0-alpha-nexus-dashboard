"use client";

import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  name: string | null;
  color?: string | null;
  className?: string;
  // Marca status de origem do sistema/plataforma (ex.: Braip)
  system?: boolean;
}

// Badge de status com cor dinamica vinda do banco (hex)
export function StatusBadge({ name, color, className, system }: StatusBadgeProps) {
  if (!name) {
    return (
      <span className={cn("inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground", className)}>
        Sem status
      </span>
    );
  }
  const c = color || "#6b7280";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        className
      )}
      style={{
        backgroundColor: `${c}1f`,
        color: c,
        border: `1px solid ${c}40`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c }} />
      {name}
      {system && <span className="opacity-60">(sistema)</span>}
    </span>
  );
}
