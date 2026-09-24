"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

import { KpiCard } from "@/components/dashboard/kpi-card";
import {
  CommissionInvestmentChart,
  FinancialDonut,
  OperationalFunnel,
  SalesStatusChart,
} from "@/components/dashboard/charts";
import { DateFilter } from "@/components/dashboard/date-filter";
import { ProductMultiSelect } from "@/components/dashboard/product-multi-select";
import { ModeMultiSelect } from "@/components/dashboard/mode-multi-select";
import { getDateRange, formatCurrency, cn } from "@/lib/utils";
import type { FilterPreset, DashboardMetrics, DateRange, OperationalMode, Profile } from "@/types";
import {
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  DollarSign,
  TrendingUp,
  Target,
  AlertTriangle,
  Percent,
  Users,
  Zap,
  Inbox,
  Wallet,
  Megaphone,
  BarChart3,
  ShoppingCart,
  RefreshCw,
} from "lucide-react";
import { SensitiveValue } from "@/components/ui/sensitive-value";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function DashboardPage() {
  const [preset, setPreset] = useState<FilterPreset>("7d");
  const [range, setRange] = useState<DateRange>(getDateRange("7d"));
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  // Modos operacionais: múltipla seleção, persistida no localStorage.
  // [] = todas as modalidades (equivalente ao antigo "all").
  const [selectedModes, setSelectedModes] = useState<OperationalMode[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem("dashboard_modes");
      if (saved) return JSON.parse(saved) as OperationalMode[];
    } catch {}
    return [];
  });

  function handleModesChange(modes: OperationalMode[]) {
    setSelectedModes(modes);
    try {
      localStorage.setItem("dashboard_modes", JSON.stringify(modes));
    } catch {}
  }

  // Para a API, múltiplos modos viram parâmetros separados por vírgula.
  // Quando vazio, não envia parâmetro (= todos).
  const modeParam =
    selectedModes.length > 0 ? selectedModes.join(",") : null;

  // Perfil do usuario logado (mesmo padrao usado em settings/sidebar)
  const { data: profileData } = useSWR<{ profile: Profile }>(
    "/api/profile",
    fetcher
  );
  const profile = profileData?.profile;
  const firstName =
    (profile?.full_name || profile?.name || "").trim().split(/\s+/)[0] || "";

  // Saudacao e data calculadas no cliente (horario do navegador).
  // Evita mismatch de hidratacao so atualizando apos montar.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
  }, []);

  const greeting = (() => {
    if (!now) return "";
    const h = now.getHours();
    if (h >= 5 && h < 12) return "Bom dia";
    if (h >= 12 && h < 18) return "Boa tarde";
    return "Boa noite";
  })();

  // "Quarta-feira, 23 de setembro de 2026": só a primeira letra maiúscula.
  // (A classe CSS `capitalize` fazia "Quarta-Feira, 23 De Setembro De 2026".)
  const formattedDate = (() => {
    if (!now) return "";
    const s = format(now, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();

  const from = format(range.from, "yyyy-MM-dd'T'00:00:00");
  const to = format(range.to, "yyyy-MM-dd'T'23:59:59");

  const queryUrl = `/api/dashboard/metrics?from=${from}&to=${to}${
    selectedProducts.length > 0
      ? `&products=${encodeURIComponent(selectedProducts.join(","))}`
      : ""
  }${modeParam ? `&mode=${encodeURIComponent(modeParam)}` : ""}`;

  const { data, isLoading, error, mutate } = useSWR<DashboardMetrics>(
    queryUrl,
    fetcher,
    { refreshInterval: 60000 }
  );

  const [refreshing, setRefreshing] = useState(false);

  // Botao "Atualizar": mantem o refresh dos dados de vendas/pedidos (mutate do
  // SWR) E adiciona o sync incremental do Meta Ads (ultimos 3 dias + hoje) no
  // mesmo clique. Trata falha parcial sem derrubar a outra parte.
  const handleRefresh = async () => {
    setRefreshing(true);
    let metaFailed = false;
    let metaSkipped = false;
    try {
      // (2) dispara sync do Meta (sales/pedidos sao revalidados via mutate abaixo)
      try {
        const res = await fetch("/api/meta/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lookbackDays: 3 }),
        });
        if (res.status === 409) {
          // Ja existe um sync em andamento para o usuario; nao dispara outro.
          metaSkipped = true;
        } else if (!res.ok) {
          metaFailed = true;
        }
      } catch {
        metaFailed = true;
      }

      // (3) revalida os dados da tela (vendas/pedidos + investimento atualizado)
      await mutate();

      if (metaFailed) {
        toast.warning(
          "Vendas atualizadas. Falha ao sincronizar o Meta Ads — tente novamente."
        );
      } else if (metaSkipped) {
        toast.info("Vendas atualizadas. Sincronização do Meta já em andamento.");
      } else {
        toast.success("Dados atualizados (vendas + Meta Ads).");
      }
    } finally {
      setRefreshing(false);
    }
  };

  const kpis = data?.kpis;
  const dailyData = data?.dailyData || [];
  const campaigns = data?.campaigns || [];
  const attendants = data?.attendants || [];
  const products = data?.products || [];
  const financialBreakdown = data?.financialBreakdown || [];
  const operationalFunnel = data?.operationalFunnel || [];

  // Check if we have data - look at products or daily data, not just KPI values
  // KPI values can be 0 if no sales, but we still have data structure
  const totalSales =
    (kpis?.agendadas?.value || 0) +
    (kpis?.antecipadas?.value || 0) +
    (kpis?.pagas?.value || 0) +
    (kpis?.frustradas?.value || 0);

  // hasData should be true if we have ANY data from the API, not just sales values > 0
  const hasData = data !== undefined && data !== null;

  const scoreColors = {
    Escalar: "bg-success/20 text-success border-success/30",
    Testar: "bg-warning/20 text-warning border-warning/30",
    Pausar: "bg-danger/20 text-danger border-danger/30",
  };

  const modeLabels: Record<string, string> = {
    afterpay: "Afterpay (Pós-Pago)",
    antecipado: "Antecipado",
    recuperacao: "Recuperação",
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho: título metálico grande + filtros de vidro */}
      <div className="flex flex-col gap-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="live-dot" />
            <span>
              Ao vivo{formattedDate ? ` · ${formattedDate}` : ""}
            </span>
          </div>
          {/* Saudação pelo horário + primeiro nome da conta logada */}
          <h1 className="mt-3 text-[34px] font-semibold leading-[1.05] sm:text-[40px]">
            {greeting || "Olá"},
            <br />
            {firstName || "bem-vindo"}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Botao de Refresh Manual */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading || refreshing}
            className="gap-2"
          >
            <RefreshCw
              className={cn(
                "h-4 w-4",
                (isLoading || refreshing) && "animate-spin"
              )}
            />
            {refreshing ? "Atualizando..." : "Atualizar"}
          </Button>
          {/* Seletor de Modalidade (multi-select, persistido) */}
          <ModeMultiSelect
            selected={selectedModes}
            onChange={handleModesChange}
          />
          <ProductMultiSelect
            products={products}
            selected={selectedProducts}
            onChange={setSelectedProducts}
          />
          <DateFilter
            value={preset}
            onChange={setPreset}
            range={range}
            onRangeChange={setRange}
          />
        </div>
      </div>

      {/* Badges das modalidades ativas */}
      {selectedModes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {selectedModes.map((m) => (
            <Badge key={m} variant="outline" className="bg-brand/10 text-brand border-brand/30">
              {modeLabels[m]}
            </Badge>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground h-6"
            onClick={() => handleModesChange([])}
          >
            Limpar filtro
          </Button>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          Erro ao carregar métricas. Tente novamente.
        </div>
      )}

      {/* Empty state - only show if no sales AND no data returned from API */}
      {!isLoading && totalSales === 0 && !error && products.length === 0 && (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
              <Inbox className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Nenhuma venda no período
            </h3>
            <p className="text-sm text-muted-foreground max-w-md">
              {selectedProducts.length > 0
            ? "Não há vendas para os produtos selecionados no período. Tente alterar o filtro."
            : "Ainda não recebemos webhooks para este período. Configure na página Webhooks."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ================================================================ */}
      {/* DESTAQUES — 5 cartões iguais com mini-gráfico dos dias do período */}
      {/* ================================================================ */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6 xl:grid-cols-5">
        <KpiCard
          data={(() => {
            const fmt = (d: Date) => format(d, "dd/MM", { locale: ptBR });
            const subtitle =
              preset === "today"
                ? `Hoje, ${fmt(range.from)}`
                : preset === "yesterday"
                  ? `Ontem, ${fmt(range.from)}`
                  : `${fmt(range.from)} – ${fmt(range.to)}`;
            return kpis?.entradasHoje
              ? { ...kpis.entradasHoje, subtitle, color: "brand" as const }
              : { label: "Pagas no Período", subtitle, value: 0, formatted: "R$ 0,00", color: "brand" as const };
          })()}
          icon={CheckCircle}
          loading={isLoading}
          itemClassName="lg:col-span-3 xl:col-span-1"
          trend={dailyData.map((d) => d.pagas)}
        />
        <KpiCard
          data={{ ...(kpis?.agendadas || { label: "Agendadas", value: 0, formatted: "R$ 0,00" }), color: "info" as const }}
          icon={Calendar}
          loading={isLoading}
          itemClassName="lg:col-span-3 xl:col-span-1"
          trend={dailyData.map((d) => d.agendadas)}
        />
        <KpiCard
          data={{ ...(kpis?.investimento || { label: "Investimento", value: 0, formatted: "R$ 0,00" }), color: "warning" as const }}
          icon={Megaphone}
          loading={isLoading}
          itemClassName="lg:col-span-2 xl:col-span-1"
          trend={dailyData.map((d) => d.investimento)}
        />
        <KpiCard
          data={kpis?.lucro || { label: "Lucro", value: 0, formatted: "R$ 0,00" }}
          icon={Zap}
          loading={isLoading}
          itemClassName="lg:col-span-2 xl:col-span-1"
          trend={dailyData.map((d) => d.comissao - d.investimento)}
        />
        <KpiCard
          data={(() => {
            const raw = kpis?.roi;
            if (!raw) return { label: "ROI", value: 0, formatted: "1,00x", color: "neutral" as const };
            const multiplier = 1 + (raw.value ?? 0) / 100;
            return {
              ...raw,
              formatted: `${multiplier.toFixed(2).replace(".", ",")}x`,
              color: (multiplier >= 1 ? "brand" : "danger") as "brand" | "danger",
            };
          })()}
          icon={Percent}
          loading={isLoading}
          itemClassName="sm:col-span-2 lg:col-span-2 xl:col-span-1"
          trend={dailyData.map((d) => (d.investimento > 0 ? d.comissao / d.investimento : 0))}
        />
      </div>

      {/* ================================================================ */}
      {/* MÉTRICAS — 12 cartões do mesmo tamanho (divide por 2, 3, 4 e 6)  */}
      {/* ================================================================ */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <span className="live-dot" />
          <h2 className="text-sm font-medium text-muted-foreground">Métricas do período</h2>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          <KpiCard data={kpis?.cpa || { label: "CPA", value: 0, formatted: "R$ 0,00" }} icon={ShoppingCart} loading={isLoading} compact />
          <KpiCard data={kpis?.comissaoReal || { label: "Comissão Real", value: 0, formatted: "R$ 0,00" }} icon={DollarSign} loading={isLoading} compact />
          <KpiCard data={kpis?.antecipadas || { label: "Antecipadas", value: 0, formatted: "R$ 0,00" }} icon={Clock} loading={isLoading} compact />
          <KpiCard data={kpis?.recuperacoes || { label: "Recuperação", value: 0, formatted: "R$ 0,00" }} icon={RefreshCw} loading={isLoading} compact />
          <KpiCard data={kpis?.comissaoProjetada || { label: "Comissão Projetada", value: 0, formatted: "R$ 0,00" }} icon={TrendingUp} loading={isLoading} compact />
          <KpiCard data={kpis?.valorReceber || { label: "A Receber", value: 0, formatted: "R$ 0,00" }} icon={Target} loading={isLoading} compact />
          <KpiCard data={kpis?.ticketMedio || { label: "Ticket Médio", value: 0, formatted: "R$ 0,00" }} icon={BarChart3} loading={isLoading} compact />
          <KpiCard data={{ ...(kpis?.taxaConversao || { label: "Taxa Conversão", value: 0, formatted: "0,0%" }), color: "info" as const }} icon={Target} loading={isLoading} compact />
          <KpiCard data={{ ...(kpis?.taxaFrustracao || { label: "Taxa Frustração", value: 0, formatted: "0,0%" }), color: "warning" as const }} icon={AlertTriangle} loading={isLoading} compact />
          <KpiCard data={{ ...(kpis?.frustradas || { label: "Frustradas", value: 0, formatted: "R$ 0,00" }), color: "danger" as const }} icon={XCircle} loading={isLoading} compact />
          <KpiCard data={kpis?.caixaEsperado || { label: "Caixa Esperado", value: 0, formatted: "R$ 0,00", color: "brand" }} icon={Wallet} loading={isLoading} compact />
          <KpiCard
            data={
              kpis?.lucro
                ? {
                    ...kpis.lucro,
                    label: "Margem de Lucro",
                    formatted: kpis.investimento?.value
                      ? `${((kpis.lucro.value / kpis.investimento.value) * 100).toFixed(1).replace(".", ",")}%`
                      : "0,0%",
                    value: kpis.investimento?.value ? (kpis.lucro.value / kpis.investimento.value) * 100 : 0,
                  }
                : { label: "Margem de Lucro", value: 0, formatted: "0,0%" }
            }
            icon={Percent}
            loading={isLoading}
            compact
          />
        </div>
      </div>

      {/* ================================================================ */}
      {/* GRÁFICOS — componentes em components/dashboard/charts.tsx          */}
      {/* ================================================================ */}
      <div className="grid gap-4 xl:grid-cols-2">
        <CommissionInvestmentChart data={dailyData} loading={isLoading} />
        <SalesStatusChart data={dailyData} loading={isLoading} />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <FinancialDonut data={financialBreakdown} loading={isLoading} />
        <OperationalFunnel steps={operationalFunnel} loading={isLoading} />
      </div>

      {/* ================================================================ */}
      {/* CAMPANHAS & RANKING ATENDENTES */}
      {/* ================================================================ */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Campanhas */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium text-foreground flex items-center gap-2">
              Top Plataformas de Ads
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : campaigns.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Registre investimentos em Ads para ver as plataformas
              </p>
            ) : (
              <div className="space-y-3">
                {campaigns.map((campaign, idx) => (
                  <div
                    key={campaign.id}
                    className="flex items-center gap-3 rounded-lg border border-border bg-card-elevated p-3"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 text-sm font-bold text-brand">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {campaign.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {campaign.conversions} lançamento{campaign.conversions !== 1 ? "s" : ""} | <SensitiveValue>{formatCurrency(campaign.spend)}</SensitiveValue> investido
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        "shrink-0 font-medium",
                        scoreColors[campaign.score]
                      )}
                    >
                      {campaign.score}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Ranking Atendentes */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium text-foreground flex items-center gap-2">
              Ranking Atendentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : attendants.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhum atendente com vendas no período
              </p>
            ) : (
              <div className="space-y-3">
                {attendants.map((att, idx) => (
                  <div
                    key={att.id}
                    className="rounded-lg border border-border bg-card-elevated p-3"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold",
                          idx === 0
                            ? "bg-yellow-500/20 text-yellow-500"
                            : idx === 1
                              ? "bg-gray-400/20 text-gray-400"
                              : idx === 2
                                ? "bg-orange-500/20 text-orange-500"
                                : "bg-muted text-muted-foreground"
                        )}
                      >
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {att.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {att.sales} vendas | <SensitiveValue>{formatCurrency(att.commission)}</SensitiveValue> comissão
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={cn(
                            "text-sm font-semibold tabular-nums",
                            att.revenue > 0 ? "text-foreground" : "text-muted-foreground"
                          )}
                        >
                          <SensitiveValue>{formatCurrency(att.revenue)}</SensitiveValue>
                        </p>
                      </div>
                    </div>
                    {att.goal > 0 && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Meta</span>
                          <span>{att.goalProgress.toFixed(0)}%</span>
                        </div>
                        <Progress
                          value={Math.min(att.goalProgress, 100)}
                          className="h-1.5"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
