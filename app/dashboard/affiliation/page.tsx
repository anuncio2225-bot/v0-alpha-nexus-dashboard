"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import { Handshake, Users, ShoppingCart, Wallet, CalendarRange } from "lucide-react";

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
  total_sales: number;
  paid_sales: number;
  total_commission: number;
  total_volume: number;
}

interface SaleRow {
  affiliate_name: string;
  product_name: string | null;
  customer_name: string | null;
  gateway: string | null;
  status: string | null;
  commission: number;
  volume: number;
  date: string;
}

interface AffiliationData {
  summary: {
    total_affiliates: number;
    total_sales: number;
    paid_sales: number;
    total_commission: number;
    total_volume: number;
  };
  groups: AffiliateGroup[];
  sales: SaleRow[];
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
  const sales = data?.sales || [];

  const kpis = [
    {
      label: "Afiliados",
      value: summary ? String(summary.total_affiliates) : "—",
      icon: Users,
      sensitive: false,
    },
    {
      label: "Vendas pagas",
      value: summary ? String(summary.paid_sales) : "—",
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
      ) : summary && summary.total_sales === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Handshake className="mb-4 h-12 w-12 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              Nenhuma venda de afiliado externo no período
            </p>
            <p className="text-sm text-muted-foreground/70">
              Quando um afiliado de fora vender um produto seu, ela aparece aqui
              automaticamente.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Ranking por afiliado */}
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                Por afiliado
              </h2>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Afiliado</TableHead>
                      <TableHead className="text-right">Vendas pagas</TableHead>
                      <TableHead className="text-right">Volume</TableHead>
                      <TableHead className="text-right">Comissão</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.map((g) => (
                      <TableRow key={g.affiliate_name}>
                        <TableCell className="font-medium text-foreground">
                          {g.affiliate_name}
                        </TableCell>
                        <TableCell className="text-right">
                          {g.paid_sales}
                          <span className="text-muted-foreground">
                            {" "}
                            / {g.total_sales}
                          </span>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <SensitiveValue>
                            {formatCurrency(g.total_volume)}
                          </SensitiveValue>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap font-medium text-success">
                          <SensitiveValue>
                            {formatCurrency(g.total_commission)}
                          </SensitiveValue>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Vendas detalhadas */}
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <h2 className="mb-3 text-sm font-semibold text-foreground">
                Vendas recentes
              </h2>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Afiliado</TableHead>
                      <TableHead>Produto</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Volume</TableHead>
                      <TableHead className="text-right">Comissão</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sales.map((s, i) => (
                      <TableRow key={i}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {s.date || "—"}
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          {s.affiliate_name}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {s.product_name || "—"}
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate text-muted-foreground">
                          {s.customer_name || "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={
                              s.status === "pago"
                                ? "border-success/30 text-success"
                                : "border-border text-muted-foreground"
                            }
                          >
                            {s.status || "—"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <SensitiveValue>
                            {formatCurrency(s.volume)}
                          </SensitiveValue>
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap text-success">
                          <SensitiveValue>
                            {formatCurrency(s.commission)}
                          </SensitiveValue>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
