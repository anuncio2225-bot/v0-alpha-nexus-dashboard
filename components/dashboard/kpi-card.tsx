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

export function KpiCard({ data, icon: Icon, loading, className }: KpiCardProps) {
  const colors = colorClasses[data.color || "neutral"];

  if (loading) {
    return (
      <Card className={cn("bg-card border-border", className)}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32" />
            </div>
            <Skeleton className="h-10 w-10 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <GlowCard glowColor={data.color || "neutral"} className="fade-up">
        <Card
          className={cn(
            "bg-card border-border card-hover h-full",
            className
          )}
        >
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground">
                  {data.label}
                </span>
                {data.tooltip && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      {data.tooltip}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <p className={cn("metric", colors.text)}>
                <SensitiveValue>{data.formatted}</SensitiveValue>
              </p>
              {data.subtitle && (
                <p className="text-xs text-muted-foreground">{data.subtitle}</p>
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
              <div className={cn("rounded-lg p-2.5", colors.bg)}>
                <Icon className={cn("h-5 w-5", colors.icon)} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      </GlowCard>
    </TooltipProvider>
  );
}
