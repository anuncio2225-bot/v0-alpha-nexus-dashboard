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
import { DateFilter } from "@/components/dashboard/date-filter";
import { ProductMultiSelect } from "@/components/dashboard/product-multi-select";
import { ModeMultiSelect } from "@/components/dashboard/mode-multi-select";
import { getDateRange, formatCurrency, cn } from "@/lib/utils";
import type { FilterPreset, DashboardMetrics, DateRange, OperationalMode, Profile } from "@/types";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
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
  BarChart3,
  ShoppingCart,
  RefreshCw,
} from "lucide-react";
import { SensitiveValue } from "@/components/ui/sensitive-value";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const PIE_COLORS = ["#22c55e", "#f59e0b", "#ef4444", "#6366f1", "#8b5cf6"];

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

  const formattedDate = now
    ? format(now, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })
    : "";

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
      {/* Saudacao personalizada */}
      {greeting && (
        <div className="fade-up">
          <h2 className="text-2xl font-bold text-foreground sm:text-3xl text-balance">
            {greeting}
            {firstName ? `, ${firstName}` : ""} {"\u{1F44B}"}
          </h2>
          {formattedDate && (
            <p className="mt-1 text-sm capitalize text-muted-foreground">
              {formattedDate}
            </p>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-heading">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Visão geral das suas operações
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
      {/* BLOCO 1: STATUS DAS VENDAS (3 cards) */}
      {/* ================================================================ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger">
        <KpiCard
          data={kpis?.agendadas || { label: "Agendadas", value: 0, formatted: "R$ 0" }}
          icon={Calendar}
          loading={isLoading}
        />
        <KpiCard
          data={kpis?.antecipadas || { label: "Antecipadas", value: 0, formatted: "R$ 0" }}
          icon={Clock}
          loading={isLoading}
        />
        <KpiCard
          data={kpis?.frustradas || { label: "Frustradas", value: 0, formatted: "R$ 0" }}
          icon={XCircle}
          loading={isLoading}
        />
      </div>

      {/* BLOCO 2: PAGAS NO PERIODO (card destaque) */}
      <div className="grid gap-4 sm:grid-cols-1 stagger">
        <KpiCard
          data={
            kpis?.entradasHoje || {
              label: "Pagas no Período",
              subtitle: "Baseado na data de pagamento",
              value: 0,
              formatted: "R$ 0",
              color: "success",
            }
          }
          icon={CheckCircle}
          loading={isLoading}
        />
      </div>

      {/* ================================================================ */}
      {/* BLOCO 3: COMISSOES (3 cards) */}
      {/* ================================================================ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger">
        <KpiCard
          data={kpis?.comissaoReal || { label: "Comissão Real", value: 0, formatted: "R$ 0" }}
          icon={DollarSign}
          loading={isLoading}
        />
        <KpiCard
          data={kpis?.comissaoProjetada || { label: "Comissão Projetada", value: 0, formatted: "R$ 0" }}
          icon={TrendingUp}
          loading={isLoading}
        />
        <KpiCard
          data={kpis?.valorReceber || { label: "A Receber", value: 0, formatted: "R$ 0" }}
          icon={Target}
          loading={isLoading}
        />
      </div>

      {/* ================================================================ */}
      {/* BLOCO 4: INVESTIMENTO & PERFORMANCE (6 cards - 2 rows of 3) */}
      {/* ================================================================ */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger">
        <KpiCard
          data={kpis?.investimento || { label: "Investimento", value: 0, formatted: "R$ 0" }}
          icon={AlertTriangle}
          loading={isLoading}
        />
        <KpiCard
          data={kpis?.roi || { label: "ROI", value: 0, formatted: "0%" }}
          icon={Percent}
          loading={isLoading}
        />
        <KpiCard
          data={kpis?.lucro || { label: "Lucro", value: 0, formatted: "R$ 0" }}
          icon={Zap}
          loading={isLoading}
        />
      </div>

      {/* BLOCO 5: METRICAS AVANCADAS (4 cards novos) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger">
        <KpiCard
          data={kpis?.cpa || { label: "CPA", value: 0, formatted: "R$ 0" }}
          icon={ShoppingCart}
          loading={isLoading}
        />
        <KpiCard
          data={kpis?.ticketMedio || { label: "Ticket Médio", value: 0, formatted: "R$ 0" }}
          icon={BarChart3}
          loading={isLoading}
        />
        <KpiCard
          data={kpis?.taxaConversao || { label: "Taxa Conversão", value: 0, formatted: "0%" }}
          icon={Target}
          loading={isLoading}
        />
        <KpiCard
          data={kpis?.taxaFrustracao || { label: "Taxa Frustração", value: 0, formatted: "0%" }}
          icon={XCircle}
          loading={isLoading}
        />
      </div>

      {/* BLOCO 6: CAIXA ESPERADO (card destaque) */}
      <div className="grid gap-4 sm:grid-cols-1 stagger">
        <KpiCard
          data={
            kpis?.caixaEsperado || {
              label: "Caixa Esperado",
              value: 0,
              formatted: "R$ 0",
              color: "brand",
            }
          }
          icon={Wallet}
          loading={isLoading}
        />
      </div>

      {/* ================================================================ */}
      {/* GRAFICOS: Comissao vs Investimento + Vendas por Status */}
      {/* ================================================================ */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Comissao vs Investimento */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium text-foreground">
              Comissão vs Investimento
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : dailyData.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                Sem dados no período
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={dailyData}>
                  <defs>
                    <linearGradient id="colorComissao" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorInvestimento" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#a1a1aa", fontSize: 12 }}
                    axisLine={{ stroke: "#262626" }}
                  />
                  <YAxis
                    tick={{ fill: "#a1a1aa", fontSize: 12 }}
                    axisLine={{ stroke: "#262626" }}
                    tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#141414",
                      border: "1px solid #262626",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ color: "#fafafa" }}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Area
                    type="monotone"
                    dataKey="comissao"
                    name="Comissão"
                    stroke="#10b981"
                    fillOpacity={1}
                    fill="url(#colorComissao)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="investimento"
                    name="Investimento"
                    stroke="#f59e0b"
                    fillOpacity={1}
                    fill="url(#colorInvestimento)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Vendas por Status */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium text-foreground">
              Vendas por Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : dailyData.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                Sem dados no período
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dailyData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: "#a1a1aa", fontSize: 12 }}
                    axisLine={{ stroke: "#262626" }}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={{ fill: "#a1a1aa", fontSize: 12 }}
                    axisLine={{ stroke: "#262626" }}
                    width={50}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#141414",
                      border: "1px solid #262626",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ color: "#fafafa" }}
                  />
                  <Bar dataKey="pagas" name="Pagas" fill="#22c55e" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="agendadas" name="Agendadas" fill="#a1a1aa" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="frustradas" name="Frustradas" fill="#ef4444" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ================================================================ */}
      {/* GRAFICOS NOVOS: Pizza Financeiro + Funil Operacional */}
      {/* ================================================================ */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pizza Financeiro */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium text-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-brand" />
              Distribuição Financeira
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : financialBreakdown.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                Sem dados financeiros no período
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={financialBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={4}
                      dataKey="value"
                      nameKey="label"
                    >
                      {financialBreakdown.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#141414",
                        border: "1px solid #262626",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number) => formatCurrency(value)}
                    />
                    <Legend
                      verticalAlign="bottom"
                      formatter={(value: string) => (
                        <span className="text-sm text-muted-foreground">{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Funil Operacional */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium text-foreground flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-brand" />
              Funil Operacional
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : operationalFunnel.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                Sem dados operacionais no período
              </div>
            ) : (
              <div className="space-y-4 py-4">
                {operationalFunnel.map((step, idx) => {
                  const maxVal = Math.max(...operationalFunnel.map((s) => s.value));
                  const pct = maxVal > 0 ? (step.value / maxVal) * 100 : 0;
                  const totalAll = operationalFunnel.reduce((s, f) => s + f.value, 0);
                  const share = totalAll > 0 ? ((step.value / totalAll) * 100).toFixed(1) : "0";

                  return (
                    <div key={idx} className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">
                          {step.label}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {step.value}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ({share}%)
                          </span>
                        </div>
                      </div>
                      <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            backgroundColor:
                              step.label === "Pagas"
                                ? "#22c55e"
                                : step.label === "Frustradas"
                                  ? "#ef4444"
                                  : step.label === "Antecipadas"
                                    ? "#6366f1"
                                    : "#a1a1aa",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ================================================================ */}
      {/* CAMPANHAS & RANKING ATENDENTES */}
      {/* ================================================================ */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Campanhas */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium text-foreground flex items-center gap-2">
              <Zap className="h-4 w-4 text-brand" />
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
              <Users className="h-4 w-4 text-brand" />
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
                        <p className="text-sm font-semibold text-brand">
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
