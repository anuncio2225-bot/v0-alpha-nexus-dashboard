"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import {
  Handshake,
  Users,
  ShoppingCart,
  Wallet,
  CalendarRange,
  Trophy,
} from "lucide-react";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type PeriodFilter = "all" | "last_month" | "30" | "60" | "90" | "custom";

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function computePeriod(
  filter: PeriodFilter,
  customStart: string,
  customEnd: string
): { start: string; end: string } | null {
  const today = new Date();
  switch (filter) {
    case "all":
      return null;
    case "last_month": {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { start: ymd(start), end: ymd(end) };
    }
    case "30":
    case "60":
    case "90": {
      const days = parseInt(filter, 10);
      const start = new Date(today);
      start.setDate(start.getDate() - days);
      return { start: ymd(start), end: ymd(today) };
    }
    case "custom":
      return customStart && customEnd
        ? { start: customStart, end: customEnd }
        : null;
    default:
      return null;
  }
}

interface AffiliateGroup {
  affiliate_name: string;
  approved_sales: number;
  total_commission: number;
  total_volume: number;
}

interface AffiliationData {
  summary: {
    total_affiliates: number;
    approved_sales: number;
    total_commission: number;
    total_volume: number;
  };
  groups: AffiliateGroup[];
}

export default function AffiliationPage() {
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const period = useMemo(
    () => computePeriod(periodFilter, customStart, customEnd),
    [periodFilter, customStart, customEnd]
  );

  const url = period
    ? `/api/affiliation?period_start=${period.start}&period_end=${period.end}`
    : "/api/affiliation";
  const { data, isLoading } = useSWR<AffiliationData>(url, fetcher);

  const summary = data?.summary;
  const groups = data?.groups || [];

  // Ranking por quantidade de vendas aprovadas (quem vende mais primeiro).
  const ranked = useMemo(
    () => [...groups].sort((a, b) => b.approved_sales - a.approved_sales),
    [groups]
  );
  const topSales = ranked[0]?.approved_sales ?? 0;

  const kpis = [
    {
      label: "Afiliados",
      value: summary ? String(summary.total_affiliates) : "—",
      icon: Users,
      sensitive: false,
    },
    {
      label: "Vendas aprovadas",
      value: summary ? String(summary.approved_sales) : "—",
      icon: ShoppingCart,
      sensitive: false,
    },
    {
      label: "Comissão dos afiliados",
      value: summary ? formatCurrency(summary.total_commission) : "—",
      icon: Handshake,
      sensitive: true,
    },
    {
      label: "Volume de vendas",
      value: summary ? formatCurrency(summary.total_volume) : "—",
      icon: Wallet,
      sensitive: true,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-heading">
            Afiliação
          </h1>
          <p className="text-sm text-muted-foreground">
            Vendas de afiliados externos dos seus produtos. Não entram no
            Dashboard, Atendentes nem Cobrança.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={periodFilter}
            onValueChange={(v) => setPeriodFilter(v as PeriodFilter)}
          >
            <SelectTrigger className="w-[180px] bg-card-elevated border-border">
              <CalendarRange className="mr-1 h-4 w-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todo o período</SelectItem>
              <SelectItem value="last_month">Mês passado</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="60">Últimos 60 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
          {periodFilter === "custom" && (
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="w-[150px] bg-card-elevated border-border"
                aria-label="Data inicial"
              />
              <span className="text-muted-foreground text-sm">até</span>
              <Input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="w-[150px] bg-card-elevated border-border"
                aria-label="Data final"
              />
            </div>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-card border-border">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-brand/10 p-2">
                <k.icon className="h-5 w-5 text-brand" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{k.label}</p>
                <p className="text-lg font-bold text-foreground truncate">
                  {k.sensitive ? (
                    <SensitiveValue>{k.value}</SensitiveValue>
                  ) : (
                    k.value
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-64" />
        </div>
      ) : summary && summary.approved_sales === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Handshake className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              Nenhuma venda aprovada de afiliado externo no período
            </p>
            <p className="text-sm text-muted-foreground/70">
              Quando um afiliado de fora tiver uma venda aprovada de um produto
              seu, ela aparece aqui automaticamente.
            </p>
          </CardContent>
        </Card>
      ) : (
        /* Ranking por afiliado: quem vende mais */
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <h2 className="mb-1 text-sm font-semibold text-foreground">
              Ranking de afiliados
            </h2>
            <p className="mb-4 text-xs text-muted-foreground">
              Ordenado por quantidade de vendas aprovadas.
            </p>
            <div className="space-y-2">
              {ranked.map((g, i) => {
                const pct = topSales > 0 ? (g.approved_sales / topSales) * 100 : 0;
                const isLeader = i === 0;
                return (
                  <div
                    key={g.affiliate_name}
                    className={`flex items-center gap-3 rounded-lg border p-3 ${
                      isLeader
                        ? "border-brand/40 bg-brand/5"
                        : "border-border bg-card-elevated"
                    }`}
                  >
                    {/* Posição */}
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        isLeader
                          ? "bg-brand text-brand-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isLeader ? <Trophy className="h-4 w-4" /> : i + 1}
                    </div>

                    {/* Nome + barra de volume relativo */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium text-foreground">
                          {g.affiliate_name}
                        </p>
                        {isLeader && (
                          <span className="shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
                            Top
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${
                            isLeader ? "bg-brand" : "bg-muted-foreground/40"
                          }`}
                          style={{ width: `${Math.max(pct, 4)}%` }}
                        />
                      </div>
                    </div>

                    {/* Métricas */}
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-foreground">
                        {g.approved_sales}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          {g.approved_sales === 1 ? "venda" : "vendas"}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Comissão:{" "}
                        <span className="font-medium text-success">
                          <SensitiveValue>
                            {formatCurrency(g.total_commission)}
                          </SensitiveValue>
                        </span>
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
