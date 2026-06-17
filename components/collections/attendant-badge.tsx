"use client";

import { cn } from "@/lib/utils";
import { attendantColor } from "@/lib/collections/colors";

interface AttendantBadgeProps {
  name: string | null | undefined;
  className?: string;
}

// Badge colorido por atendente (cor deterministica baseada no nome/SRC)
export function AttendantBadge({ name, className }: AttendantBadgeProps) {
  if (!name) {
    return <span className="text-muted-foreground">—</span>;
  }
  const c = attendantColor(name);
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
    </span>
  );
}
