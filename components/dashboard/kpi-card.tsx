"use client";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
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
import { GlowCard } from "@/components/ui/spotlight-card";
import { Sparkline } from "@/components/dashboard/sparkline";

interface KpiCardProps {
  data: KpiData;
  icon?: LucideIcon;
  loading?: boolean;
  className?: string;
  /** Tailwind text-size class for the value, e.g. "text-2xl", "text-xl", "text-lg" */
  textSize?: string;
  /** Cartão menor (grade de métricas). */
  compact?: boolean;
  /** Ainda menor. */
  mini?: boolean;
  /** Série para o mini-gráfico luminoso no rodapé (cartões de destaque). */
  trend?: number[];
  /** Classes do item da grade (ex.: quantas colunas ocupa). */
  itemClassName?: string;
  /** Detalhe no rodapé (ex.: agendadas × antecipadas). Toma o lugar do mini-gráfico. */
  partes?: { rotulo: string; valor: string; cor: string }[];
}

type Tone = "brand" | "success" | "warning" | "danger" | "neutral" | "info";

// Cor de cada tom: azulejo do ícone, barrinha, brilho de fundo e mini-gráfico.
const TONES: Record<Tone, { hex: string; ambient: string }> = {
  brand: { hex: "#10b981", ambient: "rgba(16,185,129,0.20)" },
  success: { hex: "#22c55e", ambient: "rgba(34,197,94,0.18)" },
  warning: { hex: "#f59e0b", ambient: "rgba(245,158,11,0.20)" },
  danger: { hex: "#f43f5e", ambient: "rgba(244,63,94,0.20)" },
  neutral: { hex: "#94a3b8", ambient: "rgba(148,163,184,0.14)" },
  info: { hex: "#60a5fa", ambient: "rgba(96,165,250,0.18)" },
};

function resolveTone(data: KpiData): Tone {
  if (data.value < 0) return "danger";
  const c = data.color as string | undefined;
  if (c && c in TONES) return c as Tone;
  return data.value > 0 ? "brand" : "neutral";
}

export function KpiCard({ data, icon: Icon, loading, className, textSize, compact, mini, trend, itemClassName, partes }: KpiCardProps) {
  const small = compact || mini;
  const tone = resolveTone(data);
  const { hex, ambient } = TONES[tone];
  const negative = data.value < 0;

  if (loading) {
    return (
      <Card className={cn("gap-0 py-0 rounded-[20px] border-[var(--border-glass)]", small ? "min-h-[84px] sm:min-h-[112px]" : "min-h-[124px] sm:min-h-[196px]", className, itemClassName)}>
        <div className={cn("space-y-3", small ? "p-3 sm:p-4" : "p-3.5 sm:p-5")}>
          <div className="flex items-center gap-3">
            <Skeleton className={cn("rounded-xl", small ? "h-8 w-8" : "h-10 w-10")} />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className={cn("w-36", small ? "h-6" : "h-9")} />
        </div>
      </Card>
    );
  }

  const label = (
    <span
      className={cn(
        "truncate text-[12px] text-muted-foreground sm:text-[13px]",
        data.tooltip && "cursor-help underline decoration-dotted decoration-muted-foreground/30 underline-offset-4"
      )}
    >
      {data.label}
    </span>
  );

  const valueClass = cn(
    small ? "metric-sm" : "metric",
    !small && textSize ? textSize : "",
    // No celular os valores encolhem para caberem dois cartões por linha.
    small ? "text-[17px] sm:text-[22px]" : "text-[21px] sm:text-[30px]",
    negative
      ? "bg-[linear-gradient(90deg,#fda4af,#f43f5e_60%,#be123c)] bg-clip-text text-transparent"
      : "text-metal-fade"
  );

  return (
    <TooltipProvider delayDuration={300}>
      <GlowCard glowColor={tone === "info" ? "neutral" : tone} className={cn("h-full rounded-[20px]", itemClassName)}>
        <Card
          className={cn(
            "ambient card-hover relative h-full gap-0 overflow-hidden rounded-[20px] border-[var(--border-glass)] py-0",
            small ? "min-h-[84px] sm:min-h-[112px]" : "min-h-[124px] sm:min-h-[196px]",
            className
          )}
          style={{ ["--tone" as string]: ambient }}
        >
          <div className={cn("relative z-10 flex h-full flex-col", small ? "p-3 sm:p-4" : "p-3.5 sm:p-5")}>
            {/* Ícone + rótulo */}
            <div className="flex items-center gap-2 sm:gap-3">
              {Icon && (
                <span
                  className={cn("icon-tile shrink-0", small ? "h-7 w-7 sm:h-8 sm:w-8" : "h-8 w-8 sm:h-10 sm:w-10")}
                  style={{ ["--tile" as string]: hex }}
                >
                  <Icon className={small ? "h-3.5 w-3.5 sm:h-4 sm:w-4" : "h-4 w-4 sm:h-[18px] sm:w-[18px]"} />
                </span>
              )}
              <div className="min-w-0 leading-tight">
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
                {data.subtitle && !small && (
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground/60">{data.subtitle}</p>
                )}
              </div>
            </div>

            {/* Valor com barrinha de destaque na borda, como nas referências */}
            <div className={cn("relative", small ? "mt-2 sm:mt-3" : "mt-3 sm:mt-5")}>
              <span
                className="absolute -left-3.5 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full sm:-left-5"
                style={{ background: hex, boxShadow: `0 0 12px ${hex}` }}
                aria-hidden="true"
              />
              <p className={valueClass}>
                <SensitiveValue>{data.formatted}</SensitiveValue>
              </p>
              {data.subtitle && small && (
                <p className="mt-1 truncate text-[11px] text-muted-foreground/60">{data.subtitle}</p>
              )}
            </div>

            {partes && partes.length > 0 && (
              <div className="mt-auto space-y-1 pt-3">
                {partes.map((p) => (
                  <div key={p.rotulo} className="flex items-center justify-between gap-2 text-[11px] sm:text-xs">
                    <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: p.cor, boxShadow: `0 0 6px ${p.cor}` }} />
                      <span className="truncate">{p.rotulo}</span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-foreground">
                      <SensitiveValue>{p.valor}</SensitiveValue>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {data.changeLabel && (
              <span
                className={cn(
                  "mt-3 inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums",
                  data.change && data.change >= 0 ? "bg-success/15 text-success" : "bg-danger/15 text-danger"
                )}
              >
                {data.change && data.change >= 0 ? "+ " : "- "}
                {Math.abs(data.change ?? 0).toFixed(1).replace(".", ",")}% {data.changeLabel}
              </span>
            )}
          </div>

          {/* Mini-gráfico luminoso no rodapé */}
          {trend && !small && !(partes && partes.length > 0) && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[40px] opacity-90 sm:h-[72px]">
              <Sparkline data={trend} color={hex} />
            </div>
          )}
        </Card>
      </GlowCard>
    </TooltipProvider>
  );
}
