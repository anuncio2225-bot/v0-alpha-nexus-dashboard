"use client";

import { useMemo, type ReactNode } from "react";
import { format, parseISO, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import { cn, formatCurrency } from "@/lib/utils";
import type { DailyData } from "@/types";

/* -------------------------------------------------------------------------- */
/* Peças compartilhadas                                                        */
/* -------------------------------------------------------------------------- */

const AXIS_TICK = { fill: "#6b7280", fontSize: 11 };
const GRID = "rgba(255,255,255,0.05)";

const axisBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
const formatAxisBRL = (v: number) => axisBRL.format(v);
const formatInt = (v: number) => new Intl.NumberFormat("pt-BR").format(Math.round(v));

interface TooltipRow {
  name?: string | number;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

/**
 * Caixa de detalhe em vidro, legível: data em cima, uma linha por série com a
 * bolinha da cor, nome e valor. (A padrão do Recharts pintava o texto com a
 * cor da série sobre o fundo escuro e ficava ilegível.)
 */
function GlassTooltip({
  active,
  payload,
  label,
  money = true,
  labelPrefix,
  reverse = false,
}: {
  active?: boolean;
  payload?: TooltipRow[];
  label?: string | number;
  money?: boolean;
  labelPrefix?: string;
  /** Inverte a ordem das linhas (séries desenhadas de trás para frente). */
  reverse?: boolean;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const rows = reverse ? [...payload].reverse() : payload;
  return (
    <div className="min-w-[180px] rounded-xl border border-[var(--hairline)] bg-popover/95 px-3.5 py-3 shadow-[0_24px_48px_-16px_rgba(0,0,0,0.95)] backdrop-blur-xl">
      {label !== undefined && label !== "" && (
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {labelPrefix}
          {label}
        </p>
      )}
      <div className="space-y-1.5">
        {rows.map((row) => (
          <div key={String(row.dataKey ?? row.name)} className="flex items-center justify-between gap-6 text-[13px]">
            <span className="flex items-center gap-2 text-foreground/80">
              <span className="h-2 w-2 rounded-full" style={{ background: row.color, boxShadow: `0 0 8px ${row.color}` }} />
              {row.name}
            </span>
            <span className="font-semibold tabular-nums text-foreground">
              <SensitiveValue>{money ? formatCurrency(Number(row.value) || 0) : formatInt(Number(row.value) || 0)}</SensitiveValue>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Chip de legenda com total: bolinha brilhante + nome + valor. */
function LegendStat({ color, label, value }: { color: string; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-[var(--hairline)] bg-[var(--glass-1)] py-1 pl-2 pr-3">
      <span className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

/** Moldura dos gráficos: título, subtítulo, legenda com totais e conteúdo. */
export function ChartCard({
  title,
  subtitle,
  legend,
  loading,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  legend?: ReactNode;
  loading?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 overflow-hidden rounded-[20px] border-[var(--border-glass)] py-0", className)}>
      <div className="flex flex-col gap-3 p-5 pb-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {legend && <div className="flex flex-wrap gap-2">{legend}</div>}
      </div>
      <div className="px-3 pb-4 sm:px-5">{loading ? <Skeleton className="h-[280px] w-full rounded-xl" /> : children}</div>
    </Card>
  );
}

function EmptyChart({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex h-[280px] flex-col items-center justify-center gap-1 text-center">
      <p className="text-sm text-foreground">{title}</p>
      <p className="max-w-xs text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/**
 * Períodos longos viram semanas: 150 barras de 2 px não se leem. Até 45 dias
 * mantém o dia a dia. Semana começa na segunda-feira.
 */
export function bucketByWeek(data: DailyData[]): { rows: DailyData[]; weekly: boolean } {
  if (data.length <= 45) return { rows: data, weekly: false };
  const byWeek = new Map<string, DailyData>();
  for (const d of data) {
    const start = startOfWeek(parseISO(d.date), { weekStartsOn: 1 });
    const key = format(start, "yyyy-MM-dd");
    const acc = byWeek.get(key) ?? {
      date: key,
      label: format(start, "dd/MM", { locale: ptBR }),
      agendadas: 0,
      antecipadas: 0,
      pagas: 0,
      frustradas: 0,
      comissao: 0,
      investimento: 0,
    };
    acc.agendadas += d.agendadas;
    acc.antecipadas += d.antecipadas;
    acc.pagas += d.pagas;
    acc.frustradas += d.frustradas;
    acc.comissao += d.comissao;
    acc.investimento += d.investimento;
    byWeek.set(key, acc);
  }
  return { rows: [...byWeek.values()], weekly: true };
}

function useBuckets(data: DailyData[]) {
  return useMemo(() => bucketByWeek(data), [data]);
}

/* -------------------------------------------------------------------------- */
/* Comissão vs Investimento                                                    */
/* -------------------------------------------------------------------------- */

export function CommissionInvestmentChart({ data, loading }: { data: DailyData[]; loading?: boolean }) {
  const { rows, weekly } = useBuckets(data);
  const totals = useMemo(
    () => data.reduce((a, d) => ({ c: a.c + d.comissao, i: a.i + d.investimento }), { c: 0, i: 0 }),
    [data]
  );

  return (
    <ChartCard
      title="Comissão vs Investimento"
      subtitle={weekly ? "Soma por semana" : "Dia a dia"}
      loading={loading}
      legend={
        data.length > 0 && (
          <>
            <LegendStat color="#10b981" label="Comissão" value={<SensitiveValue>{formatCurrency(totals.c)}</SensitiveValue>} />
            <LegendStat color="#f59e0b" label="Investimento" value={<SensitiveValue>{formatCurrency(totals.i)}</SensitiveValue>} />
          </>
        )
      }
    >
      {data.length === 0 ? (
        <EmptyChart title="Sem dados no período" hint="Comissão e investimento aparecem aqui dia a dia." />
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={rows} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="ci-fill-c" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="ci-fill-i" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
              <filter id="ci-glow" filterUnits="userSpaceOnUse" x="-100" y="-100" width="4000" height="1200">
                <feGaussianBlur stdDeviation="3.5" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="4 8" stroke={GRID} />
            <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={28} tickMargin={10} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={70} tickFormatter={formatAxisBRL} />
            <Tooltip
              cursor={{ stroke: "rgba(255,255,255,0.18)", strokeWidth: 1, strokeDasharray: "4 4" }}
              content={<GlassTooltip reverse labelPrefix={weekly ? "Semana de " : ""} />}
            />
            <Area
              type="monotone"
              dataKey="investimento"
              name="Investimento"
              stroke="#f59e0b"
              strokeWidth={2.25}
              fill="url(#ci-fill-i)"
              filter="url(#ci-glow)"
              dot={false}
              activeDot={{ r: 5, stroke: "#f59e0b", strokeWidth: 2, fill: "#0b0c0f" }}
            />
            <Area
              type="monotone"
              dataKey="comissao"
              name="Comissão"
              stroke="#10b981"
              strokeWidth={2.5}
              fill="url(#ci-fill-c)"
              filter="url(#ci-glow)"
              dot={false}
              activeDot={{ r: 5, stroke: "#10b981", strokeWidth: 2, fill: "#0b0c0f" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Vendas por status (barras empilhadas na vertical)                           */
/* -------------------------------------------------------------------------- */

const STATUS_SERIES = [
  { key: "pagas", name: "Pagas", color: "#10b981", from: "#34d399", to: "#047857" },
  { key: "agendadas", name: "Agendadas", color: "#60a5fa", from: "#93c5fd", to: "#1d4ed8" },
  { key: "frustradas", name: "Frustradas", color: "#f43f5e", from: "#fb7185", to: "#9f1239" },
] as const;

export function SalesStatusChart({ data, loading }: { data: DailyData[]; loading?: boolean }) {
  const { rows, weekly } = useBuckets(data);
  const totals = useMemo(
    () => data.reduce((a, d) => ({ pagas: a.pagas + d.pagas, agendadas: a.agendadas + d.agendadas, frustradas: a.frustradas + d.frustradas }), { pagas: 0, agendadas: 0, frustradas: 0 }),
    [data]
  );
  const empty = totals.pagas + totals.agendadas + totals.frustradas === 0;

  return (
    <ChartCard
      title="Vendas por Status"
      subtitle={weekly ? "Quantidade por semana" : "Quantidade por dia"}
      loading={loading}
      legend={
        !empty &&
        STATUS_SERIES.map((s) => (
          <LegendStat key={s.key} color={s.color} label={s.name} value={formatInt(totals[s.key])} />
        ))
      }
    >
      {empty ? (
        <EmptyChart title="Nenhuma venda neste período" hint="Pagas, agendadas e frustradas aparecem aqui dia a dia." />
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={rows} margin={{ top: 16, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
            <defs>
              {STATUS_SERIES.map((s) => (
                <linearGradient key={s.key} id={`st-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={s.from} />
                  <stop offset="100%" stopColor={s.to} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="4 8" stroke={GRID} />
            <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={24} tickMargin={10} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={36} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: "rgba(255,255,255,0.04)", radius: 8 }}
              content={<GlassTooltip money={false} labelPrefix={weekly ? "Semana de " : ""} />}
            />
            {STATUS_SERIES.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.name}
                stackId="status"
                fill={`url(#st-${s.key})`}
                radius={i === STATUS_SERIES.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                maxBarSize={28}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Distribuição financeira (rosca com total no centro)                         */
/* -------------------------------------------------------------------------- */

const SLICE_COLORS: Record<string, string> = {
  Receita: "#10b981",
  Investimento: "#f59e0b",
  Frustradas: "#f43f5e",
};

export function FinancialDonut({
  data,
  loading,
}: {
  data: { label: string; value: number }[];
  loading?: boolean;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const rows = data.map((d) => ({ ...d, color: SLICE_COLORS[d.label] ?? "#94a3b8" }));

  return (
    <ChartCard title="Distribuição Financeira" subtitle="Para onde foi o dinheiro do período" loading={loading}>
      {rows.length === 0 ? (
        <EmptyChart title="Sem dados financeiros no período" hint="Receita, investimento e frustradas aparecem aqui." />
      ) : (
        <div className="grid items-center gap-6 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="relative mx-auto h-[240px] w-full max-w-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <defs>
                  <filter id="donut-glow" filterUnits="userSpaceOnUse" x="-50" y="-50" width="400" height="400">
                    <feGaussianBlur stdDeviation="5" result="b" />
                    <feMerge>
                      <feMergeNode in="b" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <Pie
                  data={rows}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="72%"
                  outerRadius="92%"
                  paddingAngle={rows.length > 1 ? 4 : 0}
                  cornerRadius={10}
                  stroke="none"
                  startAngle={90}
                  endAngle={-270}
                  filter="url(#donut-glow)"
                >
                  {rows.map((r) => (
                    <Cell key={r.label} fill={r.color} />
                  ))}
                </Pie>
                <Tooltip content={<GlassTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Total</span>
              <span className="text-metal-fade text-xl font-semibold tabular-nums tracking-tight">
                <SensitiveValue>{formatCurrency(total)}</SensitiveValue>
              </span>
            </div>
          </div>
          <div className="space-y-2.5">
            {rows.map((r) => {
              const pct = total > 0 ? (r.value / total) * 100 : 0;
              return (
                <div key={r.label} className="rounded-xl border border-[var(--hairline)] bg-[var(--glass-1)] px-3.5 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-sm text-foreground/85">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color, boxShadow: `0 0 10px ${r.color}` }} />
                      {r.label}
                    </span>
                    <span className="text-xs tabular-nums text-muted-foreground">{pct.toFixed(1).replace(".", ",")}%</span>
                  </div>
                  <p className="mt-1 text-[15px] font-semibold tabular-nums text-foreground">
                    <SensitiveValue>{formatCurrency(r.value)}</SensitiveValue>
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </ChartCard>
  );
}

/* -------------------------------------------------------------------------- */
/* Funil operacional (barras luminosas)                                         */
/* -------------------------------------------------------------------------- */

const FUNNEL_COLORS: Record<string, { from: string; to: string; glow: string }> = {
  Agendadas: { from: "#93c5fd", to: "#2563eb", glow: "rgba(96,165,250,0.55)" },
  Antecipadas: { from: "#67e8f9", to: "#0891b2", glow: "rgba(34,211,238,0.5)" },
  Pagas: { from: "#6ee7b7", to: "#059669", glow: "rgba(16,185,129,0.55)" },
  Frustradas: { from: "#fda4af", to: "#e11d48", glow: "rgba(244,63,94,0.55)" },
};

export function OperationalFunnel({
  steps,
  loading,
}: {
  steps: { label: string; value: number }[];
  loading?: boolean;
}) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  const total = steps.reduce((s, f) => s + f.value, 0);

  return (
    <ChartCard title="Funil Operacional" subtitle={total > 0 ? `${formatInt(total)} pedidos no período` : undefined} loading={loading}>
      {steps.length === 0 || total === 0 ? (
        <EmptyChart title="Sem dados operacionais no período" hint="Agendadas, antecipadas, pagas e frustradas aparecem aqui." />
      ) : (
        <div className="space-y-5 py-4">
          {steps.map((step) => {
            const c = FUNNEL_COLORS[step.label] ?? { from: "#cbd5e1", to: "#64748b", glow: "rgba(148,163,184,0.4)" };
            const width = (step.value / max) * 100;
            const share = total > 0 ? (step.value / total) * 100 : 0;
            return (
              <div key={step.label}>
                <div className="mb-2 flex items-end justify-between">
                  <span className="text-sm font-medium text-foreground/90">{step.label}</span>
                  <span className="flex items-baseline gap-2">
                    <span className="text-lg font-semibold tabular-nums tracking-tight text-foreground">{formatInt(step.value)}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">{share.toFixed(1).replace(".", ",")}%</span>
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full border border-[var(--hairline)] bg-[var(--glass-1)]">
                  <div
                    className="h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]"
                    style={{
                      width: `${width}%`,
                      backgroundImage: `linear-gradient(90deg, ${c.to}, ${c.from})`,
                      boxShadow: `0 0 16px ${c.glow}, inset 0 1px 0 rgba(255,255,255,0.35)`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ChartCard>
  );
}
