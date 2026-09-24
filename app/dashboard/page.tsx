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
  Megaphone,
  BarChart3,
  ShoppingCart,
  RefreshCw,
} from "lucide-react";
import { SensitiveValue } from "@/components/ui/sensitive-value";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Caixa de detalhe dos gráficos em vidro escuro.
const GLASS_TOOLTIP = {
  backgroundColor: "rgba(15, 16, 19, 0.92)",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  borderRadius: "12px",
  boxShadow: "0 20px 40px -16px rgba(0, 0, 0, 0.9)",
  backdropFilter: "blur(12px)",
};

// Sem roxo/índigo: é a paleta "de IA" e não significa nada aqui.
const PIE_COLORS = ["#10b981", "#f59e0b", "#ef4444", "#71717a", "#38bdf8"];

// Eixo em reais legível em qualquer escala: "R$ 340", "R$ 1,2 mil", "R$ 3,4 mi".
// O formato antigo (`R$${v/1000}k`) mostrava "R$0k" em todas as marcas abaixo de mil.
const axisBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
function formatAxisBRL(value: number): string {
  return axisBRL.format(value);
}

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
          <h1 className="mt-3 text-[34px] font-semibold leading-[1.05] sm:text-[40px]">
            Visão geral
            <br />
            da operação
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
                    <filter id="lineGlow" filterUnits="userSpaceOnUse" x="-100" y="-100" width="3000" height="1000">
                      <feGaussianBlur stdDeviation="4" result="b" />
                      <feMerge>
                        <feMergeNode in="b" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    axisLine={false} tickLine={false}
                    width={72}
                    tickFormatter={formatAxisBRL}
                  />
                  <Tooltip
                    contentStyle={GLASS_TOOLTIP}
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
                    strokeWidth={2.5}
                    filter="url(#lineGlow)"
                    activeDot={{ r: 5, stroke: "#10b981", strokeWidth: 2, fill: "#0b0c0f" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="investimento"
                    name="Investimento"
                    stroke="#f59e0b"
                    fillOpacity={1}
                    fill="url(#colorInvestimento)"
                    strokeWidth={2.5}
                    filter="url(#lineGlow)"
                    activeDot={{ r: 5, stroke: "#f59e0b", strokeWidth: 2, fill: "#0b0c0f" }}
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
            ) : dailyData.every((d) => !d.pagas && !d.agendadas && !d.frustradas) ? (
              <div className="flex h-[300px] flex-col items-center justify-center gap-1 text-center">
                <p className="text-sm text-foreground">Nenhuma venda neste período</p>
                <p className="text-xs text-muted-foreground">
                  Pagas, agendadas e frustradas aparecem aqui dia a dia.
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dailyData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    axisLine={false} tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    axisLine={false} tickLine={false}
                    width={50}
                  />
                  <Tooltip
                    contentStyle={GLASS_TOOLTIP}
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
            ) : financialBreakdown.length === 1 ? (
              // Rosca de uma fatia só não compara nada: diz em texto.
              <div className="flex h-[300px] flex-col items-center justify-center gap-1 text-center">
                <p className="text-xs text-muted-foreground">Todo o valor do período é</p>
                <p className="text-sm text-foreground">{financialBreakdown[0].label}</p>
                <p className="metric-sm text-foreground">
                  <SensitiveValue>{formatCurrency(financialBreakdown[0].value)}</SensitiveValue>
                </p>
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
                      contentStyle={GLASS_TOOLTIP}
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
