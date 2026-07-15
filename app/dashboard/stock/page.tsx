"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { StockTable } from "@/components/stock/stock-table";
import { EntryDialog } from "@/components/stock/entry-dialog";
import { ConfigDialog } from "@/components/stock/config-dialog";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, cn } from "@/lib/utils";
import {
  Package,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  RefreshCw,
  Settings,
  AlertTriangle,
} from "lucide-react";
import type { StockMovement, StockBalance } from "@/components/stock/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

type Preset = "today" | "7d" | "15d" | "month" | "last_month" | "custom";

function computeRange(
  preset: Preset,
  customFrom: string,
  customTo: string
): { from: string; to: string } {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (preset) {
    case "today":
      return { from: ymd(today), to: ymd(today) };
    case "7d":
      return { from: ymd(new Date(y, m, today.getDate() - 6)), to: ymd(today) };
    case "15d":
      return { from: ymd(new Date(y, m, today.getDate() - 14)), to: ymd(today) };
    case "month":
      return { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) };
    case "last_month":
      return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };
    case "custom":
      return { from: customFrom, to: customTo };
  }
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "7d", label: "7 dias" },
  { key: "15d", label: "15 dias" },
  { key: "month", label: "Este mês" },
  { key: "last_month", label: "Mês passado" },
  { key: "custom", label: "Personalizado" },
];

export default function StockPage() {
  const { toast } = useToast();
  const [preset, setPreset] = useState<Preset>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [entryOpen, setEntryOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const range = useMemo(
    () => computeRange(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );
  const canQuery = Boolean(range.from && range.to);
  const qs = canQuery ? `?from=${range.from}&to=${range.to}` : "";

  const {
    data: balance,
    isLoading: balanceLoading,
    mutate: mutateBalance,
  } = useSWR<StockBalance>(
    canQuery ? `/api/stock/balance${qs}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const {
    data: movesData,
    isLoading: movesLoading,
    mutate: mutateMoves,
  } = useSWR<{ movements: StockMovement[] }>(
    canQuery ? `/api/stock${qs}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  function refresh() {
    mutateBalance();
    mutateMoves();
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/stock/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error();
      toast({
        title: "Sincronização concluída",
        description: `${data.created} saída(s) criada(s) a partir de vendas pagas.`,
      });
      refresh();
    } catch {
      toast({ title: "Erro ao sincronizar vendas", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/15 text-brand">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold font-heading tracking-tight text-foreground">
              Estoque
            </h1>
            <p className="text-sm text-muted-foreground">
              Controle de entrada e saída de potes por venda
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setEntryOpen(true)}
            className="bg-emerald-600 text-white hover:bg-emerald-600/90"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Registrar Entrada
          </Button>
          <Button variant="outline" onClick={handleSync} disabled={syncing}>
            <RefreshCw
              className={cn("mr-1.5 h-4 w-4", syncing && "animate-spin")}
            />
            Sincronizar Vendas
          </Button>
          <Button variant="outline" size="icon" onClick={() => setConfigOpen(true)}>
            <Settings className="h-4 w-4" />
            <span className="sr-only">Configurações</span>
          </Button>
        </div>
      </div>

      {/* Alerta de estoque baixo */}
      {balance?.is_low && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Estoque baixo!</AlertTitle>
          <AlertDescription>
            Saldo atual de {balance.balance} potes está abaixo do limite de{" "}
            {balance.low_stock_alert}. Considere fazer reposição.
          </AlertDescription>
        </Alert>
      )}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Package}
          loading={balanceLoading}
          data={{
            label: "Saldo Atual",
            value: balance?.balance ?? 0,
            formatted: `${balance?.balance ?? 0} potes`,
            color: "brand",
          }}
        />
        <KpiCard
          icon={Wallet}
          loading={balanceLoading}
          data={{
            label: "Valor em Estoque",
            value: balance?.stock_value ?? 0,
            formatted: formatCurrency(balance?.stock_value ?? 0),
            subtitle: `Custo médio ${formatCurrency(balance?.avg_unit_cost ?? 0)}/pote`,
            color: "neutral",
          }}
        />
        <KpiCard
          icon={ArrowUpRight}
          loading={balanceLoading}
          data={{
            label: "Entradas (período)",
            value: balance?.period_entries ?? 0,
            formatted: `${balance?.period_entries ?? 0} potes`,
            color: "success",
          }}
        />
        <KpiCard
          icon={ArrowDownRight}
          loading={balanceLoading}
          data={{
            label: "Saídas (período)",
            value: balance?.period_exits ?? 0,
            formatted: `${balance?.period_exits ?? 0} potes`,
            color: "danger",
          }}
        />
      </div>

      {/* Filtro de período */}
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.key}
            variant={preset === p.key ? "default" : "outline"}
            size="sm"
            onClick={() => setPreset(p.key)}
            className={cn(
              preset === p.key &&
                "bg-brand text-brand-foreground hover:bg-brand/90"
            )}
          >
            {p.label}
          </Button>
        ))}
        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-9 w-auto"
            />
            <span className="text-muted-foreground">até</span>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-9 w-auto"
            />
          </div>
        )}
      </div>

      {/* Tabela */}
      <StockTable
        movements={movesData?.movements ?? []}
        isLoading={movesLoading}
        onEdited={refresh}
      />

      <EntryDialog
        open={entryOpen}
        onOpenChange={setEntryOpen}
        defaultUnitCost={balance?.default_unit_cost ?? 0}
        onSaved={refresh}
      />
      <ConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        onSaved={refresh}
      />
    </div>
  );
}
