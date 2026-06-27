"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatCurrency, cn } from "@/lib/utils";
import {
  Plus,
  Trash2,
  Edit,
  DollarSign,
  TrendingUp,
  Calendar,
  Target,
  Megaphone,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Info,
} from "lucide-react";
import { AD_PLATFORMS } from "@/types";
import type { AdInvestment } from "@/types";
import { SensitiveValue } from "@/components/ui/sensitive-value";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const platformLabel = (value: string) =>
  AD_PLATFORMS.find((p) => p.value === value)?.label || value;

const platformColor = (value: string): string => {
  const colors: Record<string, string> = {
    meta_ads: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    google_ads: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    tiktok_ads: "bg-pink-500/10 text-pink-400 border-pink-500/20",
    kwai_ads: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    youtube_ads: "bg-red-500/10 text-red-400 border-red-500/20",
    taboola: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    outros: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  };
  return colors[value] || colors.outros;
};

export default function InvestimentoAdsPage() {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [filterPlatform, setFilterPlatform] = useState("all");
  // Month/Year navigation
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const monthStart = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const monthEnd = `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${lastDay}`;

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];

  const queryUrl = `/api/ad-investments?from=${monthStart}&to=${monthEnd}${
    filterPlatform !== "all" ? `&platform=${filterPlatform}` : ""
  }`;

  const { data, mutate, isLoading } = useSWR<{
    investments: AdInvestment[];
    totalInvested: number;
  }>(queryUrl, fetcher, { refreshInterval: 30000 });

  // Settings for tax
  const { data: settingsData, mutate: mutateSettings } = useSWR<{
    settings: { ads_tax_percentage?: number };
  }>("/api/settings", fetcher);

  // Spend automatico vindo do Meta (tabela meta_ads_performance).
  // Polling de 60s para refletir o que o cron/sync gravou no banco.
  const {
    data: metaInsights,
    mutate: mutateMeta,
  } = useSWR<{
    spend: number;
    conversions: number;
    conversionValue: number;
    byDay: { date: string; spend: number }[];
    history: {
      date: string;
      accountId: string;
      accountName: string;
      spend: number;
    }[];
  }>(`/api/meta/insights?from=${monthStart}&to=${monthEnd}`, fetcher, {
    refreshInterval: 60000,
  });

  // Status da conexao Meta (last_sync_at / sync_status) — polling leve.
  const { data: metaSyncStatus, mutate: mutateSyncStatus } = useSWR<{
    lastSync: string | null;
    syncStatus: string;
    syncError: string | null;
  }>("/api/meta/sync", fetcher, { refreshInterval: 60000 });

  const metaAutoSpend = Number(metaInsights?.spend || 0);
  const metaHistory = metaInsights?.history || [];

  // O gasto do Meta entra como plataforma "meta_ads". Quando o usuario filtra
  // outra plataforma, o automatico do Meta nao deve contar.
  const includeMeta =
    filterPlatform === "all" || filterPlatform === "meta_ads";

  // Auto-sync no front a cada 5 min enquanto a pagina estiver aberta.
  // O Vercel Hobby so permite cron 1x/dia, entao mantemos os dados frescos
  // disparando o sync incremental (ultimos 3 dias + hoje) pelo proprio cliente.
  const autoSyncRunning = useRef(false);
  useEffect(() => {
    async function autoSync() {
      // Evita concorrencia local e respeita um sync ja em andamento no server.
      if (autoSyncRunning.current) return;
      if (metaSyncStatus?.syncStatus === "syncing") return;
      autoSyncRunning.current = true;
      try {
        const res = await fetch("/api/meta/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lookbackDays: 3 }),
        });
        if (res.ok) {
          mutateMeta();
          mutateSyncStatus();
        }
      } catch {
        // silencioso: auto-sync nao deve incomodar o usuario
      } finally {
        autoSyncRunning.current = false;
      }
    }

    const interval = setInterval(autoSync, 300000); // 5 minutos
    return () => clearInterval(interval);
  }, [metaSyncStatus?.syncStatus, mutateMeta, mutateSyncStatus]);

  const adsTax = settingsData?.settings?.ads_tax_percentage ?? 6;
  const investments = data?.investments || [];

  // Summary by platform
  const platformSummary = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    investments.forEach((inv) => {
      const existing = map.get(inv.platform) || { total: 0, count: 0 };
      existing.total += Number(inv.investment_value);
      existing.count += 1;
      map.set(inv.platform, existing);
    });
    return Array.from(map.entries())
      .map(([platform, stats]) => ({ platform, ...stats }))
      .sort((a, b) => b.total - a.total);
  }, [investments]);

  // Total manual BRUTO (todos os lancamentos, sem deduplicacao — usado nos cards de breakdown)
  const manualTotal = investments.reduce(
    (s, i) => s + Number(i.investment_value),
    0
  );
  // Gasto automatico do Meta entra somente quando a plataforma filtrada
  // inclui o Meta ("all" ou "meta_ads").
  const metaContribution = includeMeta ? metaAutoSpend : 0;
  // totalInvested e calculado depois de dedupedManualTotal (definido apos unifiedHistory)

  // Historico unificado: lancamentos manuais + gasto automatico do Meta (1 por
  // dia/conta), ordenado por data desc. O Meta so entra quando o filtro inclui
  // a plataforma "meta_ads".
  //
  // DEDUPLICACAO: se houver dado automatico do Meta para uma data em que tambem
  // existe lancamento manual de plataforma "meta_ads", o manual e marcado como
  // `superseded=true` e NAO entra na soma (o automatico tem prioridade).
  // Manuais de OUTRAS plataformas (Google, TikTok etc.) NUNCA sao suprimidos.
  type HistoryEntry = {
    key: string;
    date: string;
    value: number;
    source: "manual" | "meta";
    label: string;
    platform?: string;
    investment?: AdInvestment;
    /** true = manual suprimido pelo automatico do Meta naquela data */
    superseded?: boolean;
  };

  const unifiedHistory = useMemo<HistoryEntry[]>(() => {
    // Conjunto de datas que tem dado automatico do Meta (para deduplicacao)
    const metaDates = new Set<string>(metaHistory.map((h) => h.date));

    const manual: HistoryEntry[] = investments.map((inv) => {
      // Suprime manuais de meta_ads quando ha automatico do Meta na mesma data
      const isMetaPlatform = inv.platform === "meta_ads";
      const hasMetaAutoForDate = isMetaPlatform && metaDates.has(inv.date);
      return {
        key: `manual-${inv.id}`,
        date: inv.date,
        value: Number(inv.investment_value),
        source: "manual",
        label: inv.campaign_name || platformLabel(inv.platform),
        platform: inv.platform,
        investment: inv,
        superseded: hasMetaAutoForDate,
      };
    });

    const meta: HistoryEntry[] = includeMeta
      ? metaHistory.map((h) => ({
          key: `meta-${h.date}-${h.accountId}`,
          date: h.date,
          value: h.spend,
          source: "meta",
          label: h.accountName,
        }))
      : [];

    return [...manual, ...meta].sort((a, b) => b.date.localeCompare(a.date));
  }, [investments, metaHistory, includeMeta]);

  // A soma do manual EXCLUI entradas suprimidas (meta tem prioridade naquele dia)
  const dedupedManualTotal = useMemo(
    () =>
      unifiedHistory
        .filter((e) => e.source === "manual" && !e.superseded)
        .reduce((s, e) => s + e.value, 0),
    [unifiedHistory]
  );

  // KPIs: manual deduplicado + automatico Meta
  const totalInvested = dedupedManualTotal + metaContribution;
  const taxValue = totalInvested * (adsTax / 100);
  const totalWithTax = totalInvested + taxValue;
  const hasAnyInvestment = investments.length > 0 || metaContribution > 0;
  const avgDaily = hasAnyInvestment ? totalInvested / lastDay : 0;

  // Navigate months
  const prevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };
  const nextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);

    const payload = {
      date: form.get("date"),
      platform: form.get("platform"),
      campaign_name: form.get("campaign_name") || null,
      investment_value: form.get("investment_value"),
    };

    try {
      const isEditing = !!editingId;
      const res = await fetch("/api/ad-investments", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEditing ? { id: editingId, ...payload } : payload),
      });

      if (!res.ok) throw new Error("Erro ao salvar");
      toast.success(isEditing ? "Investimento atualizado" : "Investimento registrado");
      setOpen(false);
      setEditingId(null);
      mutate();
    } catch {
      toast.error("Erro ao salvar investimento");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/ad-investments?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao deletar");
      toast.success("Investimento removido");
      mutate();
    } catch {
      toast.error("Erro ao remover investimento");
    }
  };

  const editItem = (inv: AdInvestment) => {
    setEditingId(inv.id);
    setOpen(true);
  };

  // Sync manual: re-puxa hoje + ultimos 3 dias para atualizar rapido.
  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/meta/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lookbackDays: 3 }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        toast.success("Dados do Meta atualizados");
        mutateMeta();
        mutateSyncStatus();
      } else if (res.status === 409) {
        toast.info("Já existe uma sincronização em andamento");
      } else {
        toast.error(result.error || "Erro ao sincronizar");
      }
    } catch {
      toast.error("Erro ao sincronizar com o Meta");
    } finally {
      setSyncing(false);
    }
  };

  const editingInv = editingId
    ? investments.find((i) => i.id === editingId)
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-heading">
            Investimento em Ads
          </h1>
          <p className="text-sm text-muted-foreground">
            Registre e acompanhe seus gastos com trafego pago
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleSync}
            disabled={syncing || metaSyncStatus?.syncStatus === "syncing"}
          >
            <RefreshCw
              className={cn(
                "h-4 w-4 mr-2",
                (syncing || metaSyncStatus?.syncStatus === "syncing") &&
                  "animate-spin"
              )}
            />
            {syncing || metaSyncStatus?.syncStatus === "syncing"
              ? "Sincronizando..."
              : "Sincronizar Meta"}
          </Button>
          {/* Add button */}
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) setEditingId(null);
            }}
          >
            <DialogTrigger asChild>
              <Button className="bg-brand hover:bg-brand/90">
                <Plus className="h-4 w-4 mr-2" />
                Registrar Investimento
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">
                  {editingId ? "Editar Investimento" : "Novo Investimento"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data</Label>
                    <Input
                      name="date"
                      type="date"
                      defaultValue={
                        editingInv?.date ||
                        new Date().toISOString().split("T")[0]
                      }
                      required
                      className="bg-card-elevated border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Plataforma</Label>
                    <Select
                      name="platform"
                      defaultValue={editingInv?.platform || "meta_ads"}
                    >
                      <SelectTrigger className="bg-card-elevated border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AD_PLATFORMS.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Campanha (opcional)</Label>
                  <Input
                    name="campaign_name"
                    placeholder="Nome da campanha"
                    defaultValue={editingInv?.campaign_name || ""}
                    className="bg-card-elevated border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valor Investido (R$)</Label>
                  <Input
                    name="investment_value"
                    type="number"
                    step="0.01"
                    required
                    defaultValue={editingInv?.investment_value || ""}
                    placeholder="0,00"
                    className="bg-card-elevated border-border"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setOpen(false);
                      setEditingId(null);
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="bg-brand hover:bg-brand/90"
                  >
                    {loading ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-foreground min-w-[160px] text-center">
            {monthNames[selectedMonth]} {selectedYear}
          </span>
          <Button variant="outline" size="icon" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Select value={filterPlatform} onValueChange={setFilterPlatform}>
          <SelectTrigger className="w-[220px] bg-card-elevated border-border">
            <Megaphone className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Todas plataformas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as plataformas</SelectItem>
            {AD_PLATFORMS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-brand/10">
                <DollarSign className="h-5 w-5 text-brand" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Investido</p>
                <p className="text-lg font-bold text-foreground">
                  <SensitiveValue>{formatCurrency(totalInvested)}</SensitiveValue>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/10">
                <Target className="h-5 w-5 text-warning" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Imposto ({adsTax}%)
                </p>
                <p className="text-lg font-bold text-foreground">
                  <SensitiveValue>{formatCurrency(taxValue)}</SensitiveValue>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-danger/10">
                <TrendingUp className="h-5 w-5 text-danger" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Total + Imposto
                </p>
                <p className="text-lg font-bold text-foreground">
                  <SensitiveValue>{formatCurrency(totalWithTax)}</SensitiveValue>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted/20">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Media Diaria</p>
                <p className="text-lg font-bold text-foreground">
                  <SensitiveValue>{formatCurrency(avgDaily)}</SensitiveValue>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Spend automatico Meta vs manual */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Investimento no período
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            {/* Automatico (Meta) */}
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs"
                >
                  Automático (Meta)
                </Badge>
              </div>
              <p className="mt-2 text-lg font-bold text-foreground">
                <SensitiveValue>{formatCurrency(metaAutoSpend)}</SensitiveValue>
              </p>
              <p className="text-xs text-muted-foreground">
                Sincronizado da API do Meta
              </p>
            </div>

            {/* Manual */}
            <div className="rounded-lg border border-border bg-card-elevated p-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  Manual
                </Badge>
              </div>
              <p className="mt-2 text-lg font-bold text-foreground">
                <SensitiveValue>{formatCurrency(dedupedManualTotal)}</SensitiveValue>
              </p>
              <p className="text-xs text-muted-foreground">
                Lançamentos digitados (excluindo dias cobertos pelo Meta)
              </p>
            </div>

            {/* Combinado */}
            <div className="rounded-lg border border-brand/20 bg-brand/5 p-4">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-brand/30 bg-brand/10 text-brand text-xs"
                >
                  Total combinado
                </Badge>
              </div>
              <p className="mt-2 text-lg font-bold text-foreground">
                <SensitiveValue>
                  {formatCurrency(totalInvested)}
                </SensitiveValue>
              </p>
              <p className="text-xs text-muted-foreground">
                Meta automático + manuais (sem duplicação)
              </p>
            </div>
          </div>

          {/* Ultima sincronizacao + aviso sobre o dia atual */}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Última sincronização:{" "}
              {metaSyncStatus?.lastSync
                ? new Date(metaSyncStatus.lastSync).toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                  })
                : "Ainda não sincronizado"}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0" />
              O gasto de hoje pode levar algumas horas para consolidar no Meta
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Platform breakdown */}
      {platformSummary.length > 1 && (
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground text-sm">
              Por Plataforma
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {platformSummary.map(({ platform, total, count }) => (
                <div
                  key={platform}
                  className="flex items-center justify-between p-3 rounded-lg bg-card-elevated"
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn("text-xs", platformColor(platform))}
                    >
                      {platformLabel(platform)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {count} lancamento(s)
                    </span>
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    <SensitiveValue>{formatCurrency(total)}</SensitiveValue>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* List */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Histórico - {monthNames[selectedMonth]} {selectedYear}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-16 rounded-lg bg-card-elevated animate-pulse"
                />
              ))}
            </div>
          ) : unifiedHistory.length === 0 ? (
            <div className="text-center py-12">
              <Megaphone className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                Sem dados no periodo
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Registrar Primeiro
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {unifiedHistory.map((entry) => (
                <div
                  key={entry.key}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg transition-colors group",
                    entry.superseded
                      ? "bg-muted/20 opacity-60"
                      : "bg-card-elevated hover:bg-muted/10"
                  )}
                  title={
                    entry.superseded
                      ? "Substituído pelo gasto automático do Meta nesta data — não somado para evitar duplicação"
                      : undefined
                  }
                >
                  <div className="flex items-center gap-3">
                    <div className="text-center min-w-[45px]">
                      <p className={cn("text-lg font-bold leading-none", entry.superseded ? "text-muted-foreground" : "text-foreground")}>
                        {new Date(entry.date + "T12:00:00").getDate()}
                      </p>
                      <p className="text-[10px] text-muted-foreground uppercase">
                        {new Date(entry.date + "T12:00:00").toLocaleDateString(
                          "pt-BR",
                          { month: "short" }
                        )}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {entry.source === "meta" ? (
                          <Badge
                            variant="outline"
                            className="text-xs border-blue-500/30 bg-blue-500/10 text-blue-400"
                          >
                            Automatico (Meta)
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs",
                              entry.superseded
                                ? "border-muted text-muted-foreground line-through"
                                : platformColor(entry.platform || "outros")
                            )}
                          >
                            {platformLabel(entry.platform || "outros")}
                          </Badge>
                        )}
                        <span className={cn("text-xs", entry.superseded ? "text-muted-foreground line-through" : "text-muted-foreground")}>
                          {entry.label}
                        </span>
                        {entry.superseded && (
                          <Badge
                            variant="outline"
                            className="text-[10px] border-amber-500/30 bg-amber-500/10 text-amber-400"
                          >
                            Substituido pelo Meta
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={cn("text-sm font-bold", entry.superseded ? "text-muted-foreground line-through" : "text-foreground")}>
                      <SensitiveValue>
                        {formatCurrency(entry.value)}
                      </SensitiveValue>
                    </span>
                    {/* Acoes so para lancamentos manuais; o Meta e automatico */}
                    {entry.source === "manual" && entry.investment && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => editItem(entry.investment!)}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-danger"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="bg-card border-border">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-foreground">
                                Remover investimento?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Essa ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  handleDelete(entry.investment!.id)
                                }
                                className="bg-danger hover:bg-danger/90"
                              >
                                Remover
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
