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
import { Info } from "lucide-react";
import type { KpiData } from "@/types";
import type { LucideIcon } from "lucide-react";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import { GlowCard } from "@/components/ui/spotlight-card";

interface KpiCardProps {
  data: KpiData;
  icon?: LucideIcon;
  loading?: boolean;
  className?: string;
  /** Tailwind text-size class for the value, e.g. "text-2xl", "text-xl", "text-lg" */
  textSize?: string;
  /** Removes extra padding for smaller faixas */
  compact?: boolean;
  /** Even more compact: smaller icon, xs label */
  mini?: boolean;
}

const colorClasses = {
  brand: {
    bg: "bg-brand/10",
    text: "text-brand",
    icon: "text-brand",
  },
  success: {
    bg: "bg-success/10",
    text: "text-success",
    icon: "text-success",
  },
  warning: {
    bg: "bg-warning/10",
    text: "text-warning",
    icon: "text-warning",
  },
  danger: {
    bg: "bg-danger/10",
    text: "text-danger",
    icon: "text-danger",
  },
  neutral: {
    bg: "bg-muted",
    text: "text-foreground",
    icon: "text-muted-foreground",
  },
};

export function KpiCard({ data, icon: Icon, loading, className, textSize, compact, mini }: KpiCardProps) {
  // If color not set, auto-color negative values red and positive green
  const autoColor = !data.color
    ? data.value < 0
      ? "danger"
      : data.value > 0
        ? "success"
        : "neutral"
    : data.color;
  const colors = colorClasses[autoColor];

  const padding = mini ? "p-3" : compact ? "p-3.5" : "p-4";
  const labelSize = mini ? "text-xs" : "text-sm";
  const valueSize = textSize ?? "metric";
  const iconSize = mini ? "h-4 w-4" : "h-5 w-5";
  const iconPad = mini ? "p-2" : "p-2.5";

  if (loading) {
    return (
      <Card className={cn("bg-card border-border", className)}>
        <CardContent className={padding}>
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className={cn("w-32", mini ? "h-5" : compact ? "h-6" : "h-8")} />
            </div>
            <Skeleton className={cn("rounded-lg", mini ? "h-8 w-8" : "h-10 w-10")} />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <GlowCard glowColor={autoColor} className="fade-up">
        <Card
          className={cn(
            "bg-card border-border card-hover h-full overflow-hidden",
            className
          )}
        >
        <CardContent className={cn(padding, "h-full flex flex-col justify-center")}>
          <div className="flex items-center justify-between">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={cn(labelSize, "text-muted-foreground truncate")}>
                  {data.label}
                </span>
                {data.tooltip && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      {data.tooltip}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <p className={cn(valueSize === "metric" ? "metric" : `font-bold tabular-nums ${valueSize}`, colors.text)}>
                <SensitiveValue>{data.formatted}</SensitiveValue>
              </p>
              {data.subtitle && (
                <p className="text-xs leading-none mt-0.5 text-muted-foreground truncate">{data.subtitle}</p>
              )}
              {data.changeLabel && (
                <p
                  className={cn(
                    "text-xs",
                    data.change && data.change >= 0
                      ? "text-success"
                      : "text-danger"
                  )}
                >
                  {data.change && data.change >= 0 ? "+" : ""}
                  {data.change?.toFixed(1)}% {data.changeLabel}
                </p>
              )}
            </div>
            {Icon && (
              <div className={cn("rounded-lg shrink-0", iconPad, colors.bg)}>
                <Icon className={cn(iconSize, colors.icon)} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      </GlowCard>
    </TooltipProvider>
  );
}
