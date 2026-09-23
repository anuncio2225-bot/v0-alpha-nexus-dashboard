"use client";

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import type { KpiData } from "@/types";
import type { LucideIcon } from "lucide-react";
import { SensitiveValue } from "@/components/ui/sensitive-value";

interface KpiCardProps {
  data: KpiData;
  /** Mantido por compatibilidade. O ícone não é mais desenhado: ícone
   *  decorativo no canto de todo cartão era ruído, não informação. */
  icon?: LucideIcon;
  loading?: boolean;
  className?: string;
  /** Tailwind text-size class for the value, e.g. "text-2xl", "text-xl", "text-lg" */
  textSize?: string;
  /** Removes extra padding for smaller faixas */
  compact?: boolean;
  /** Even more compact: xs label */
  mini?: boolean;
}

/**
 * Cor do número = significado, não enfeite.
 * - negativo → vermelho
 * - zero → apagado (zero não é "bom", não pode sair verde)
 * - "danger" explícito com valor diferente de zero → vermelho (métrica ruim, ex.: frustradas)
 * - qualquer outro caso → cor normal do texto
 */
function valueTone(data: KpiData): string {
  if (data.value < 0) return "text-danger";
  if (data.value === 0) return "text-muted-foreground";
  if (data.color === "danger") return "text-danger";
  return "text-foreground";
}

export function KpiCard({ data, loading, className, textSize, compact, mini }: KpiCardProps) {
  const padding = mini ? "p-3" : compact ? "p-3.5" : "p-4";
  const labelSize = mini ? "text-xs" : "text-[13px]";
  const valueSize = textSize ?? "metric";

  if (loading) {
    return (
      <Card className={cn("gap-0 py-0 bg-card border-border", className)}>
        <CardContent className={padding}>
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className={cn("w-32", mini ? "h-5" : compact ? "h-6" : "h-8")} />
          </div>
        </CardContent>
      </Card>
    );
  }

  const label = (
    <span
      className={cn(
        labelSize,
        "text-muted-foreground truncate",
        data.tooltip && "cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-4"
      )}
    >
      {data.label}
    </span>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <Card className={cn("gap-0 py-0 bg-card border-border card-hover h-full overflow-hidden", className)}>
        <CardContent className={cn(padding, "h-full flex flex-col justify-center")}>
          <div className="space-y-1 min-w-0">
            {data.tooltip ? (
              <Tooltip>
                <TooltipTrigger asChild>{label}</TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  {data.tooltip}
                </TooltipContent>
              </Tooltip>
            ) : (
              label
            )}
            <p
              className={cn(
                valueSize === "metric" ? "metric" : `font-semibold tabular-nums tracking-tight ${valueSize}`,
                valueTone(data)
              )}
            >
              <SensitiveValue>{data.formatted}</SensitiveValue>
            </p>
            {data.subtitle && (
              <p className="text-xs leading-none mt-0.5 text-muted-foreground truncate">{data.subtitle}</p>
            )}
            {data.changeLabel && (
              <p
                className={cn(
                  "text-xs tabular-nums",
                  data.change && data.change >= 0 ? "text-success" : "text-danger"
                )}
              >
                {data.change && data.change >= 0 ? "+" : ""}
                {data.change?.toFixed(1).replace(".", ",")}% {data.changeLabel}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
