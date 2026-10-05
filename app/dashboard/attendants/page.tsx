"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn, formatCurrency } from "@/lib/utils";
import {
  Plus,
  Users,
  Wallet,
  ShoppingCart,
  Trophy,
  RefreshCw,
  GitMerge,
  CalendarRange,
  Clock,
  ArrowUpDown,
  Check,
  X,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { Attendant, CommissionResult } from "@/types";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import { AttendantCard } from "@/components/attendants/attendant-card";
import { useTeamPermissions } from "@/hooks/use-team-permissions";
import { ConfigModal } from "@/components/attendants/config-modal";
import { DetailsModal } from "@/components/attendants/details-modal";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type PeriodFilter = "current" | "last_month" | "30" | "60" | "90" | "custom";

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Converte o filtro selecionado num intervalo fixo {start,end}.
 * Retorna null para "Período atual" — nesse caso cada atendente usa o próprio
 * dia de fechamento no backend.
 */
function computePeriod(
  filter: PeriodFilter,
  customStart: string,
  customEnd: string
): { start: string; end: string } | null {
  const today = new Date();
  switch (filter) {
    case "current":
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

interface Summary {
  total_attendants: number;
  total_to_pay: number;
  total_paid_sales: number;
  total_pendente?: number;
  top_seller: { name: string; sales: number } | null;
  ranking?: Posicao[];
}

interface Posicao {
  id: string;
  name: string;
  vendas: number;
  vendido: number;
  a_receber: number;
  a_liberar: number;
  afterpay_abertos: number;
}

type Ordenacao = "minha" | "ranking" | "nome";
const CHAVE_ORDEM = "atendentes:ordenar";

// 1º ouro, 2º prata, 3º bronze.
const MEDALHAS = ["bg-amber-400 text-amber-950", "bg-slate-300 text-slate-900", "bg-orange-600 text-orange-50"];

export default function AttendantsPage() {
  // Atendente vinculada vê só o próprio resultado: sem ações de gestão.
  const { atendenteEm } = useTeamPermissions();
  const somenteLeitura = !!atendenteEm("atendentes");
  const [newOpen, setNewOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [merging, setMerging] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [autoRan, setAutoRan] = useState(false);

  // Ordem dos cartões: a do dono (salva), pelo ranking ou por nome.
  const [ordenarPor, setOrdenarPor] = useState<Ordenacao>("minha");
  useEffect(() => {
    try {
      const v = localStorage.getItem(CHAVE_ORDEM);
      if (v === "minha" || v === "ranking" || v === "nome") setOrdenarPor(v);
    } catch {}
  }, []);
  const escolherOrdem = (v: Ordenacao) => {
    setOrdenarPor(v);
    try {
      localStorage.setItem(CHAVE_ORDEM, v);
    } catch {}
  };
  // Modo "Organizar": ids na ordem em edição (null = fora do modo).
  const [ordemEditando, setOrdemEditando] = useState<string[] | null>(null);
  const [salvandoOrdem, setSalvandoOrdem] = useState(false);

  const [configTarget, setConfigTarget] = useState<Attendant | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<Attendant | null>(null);
  const [detailsPeriod, setDetailsPeriod] = useState<{ start: string; end: string } | null>(null);

  // Filtro de período (topo da página)
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("current");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const period = useMemo(
    () => computePeriod(periodFilter, customStart, customEnd),
    [periodFilter, customStart, customEnd]
  );

  const { data, mutate, isLoading } = useSWR<{ attendants: Attendant[] }>(
    "/api/attendants",
    fetcher
  );
  const summaryUrl = period
    ? `/api/attendants/summary?period_start=${period.start}&period_end=${period.end}`
    : "/api/attendants/summary";
  const { data: summary, mutate: mutateSummary } = useSWR<Summary>(
    summaryUrl,
    fetcher
  );

  const attendants = data?.attendants || [];
  const ranking = summary?.ranking || [];
  const posicaoDe = new Map(ranking.filter((r) => r.vendas > 0).map((r, i) => [r.id, i + 1]));
  const filtradas = showInactive
    ? attendants
    : attendants.filter((a) => a.status !== "inactive");
  const visibleAttendants = useMemo(() => {
    if (ordemEditando) {
      const porId = new Map(filtradas.map((a) => [a.id, a]));
      return ordemEditando.map((id) => porId.get(id)).filter((a): a is Attendant => !!a);
    }
    if (ordenarPor === "nome") return [...filtradas].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    if (ordenarPor === "ranking") {
      const idx = new Map(ranking.map((r, i) => [r.id, i]));
      return [...filtradas].sort((a, b) => (idx.get(a.id) ?? 999) - (idx.get(b.id) ?? 999));
    }
    return filtradas; // já vem na ordem salva pelo dono
  }, [filtradas, ordenarPor, ranking, ordemEditando]);
  const maxVendas = Math.max(1, ...ranking.map((r) => r.vendas));

  const mover = (i: number, direcao: -1 | 1) =>
    setOrdemEditando((ids) => {
      if (!ids) return ids;
      const novo = [...ids];
      const j = i + direcao;
      if (j < 0 || j >= novo.length) return ids;
      [novo[i], novo[j]] = [novo[j], novo[i]];
      return novo;
    });

  async function salvarOrdem() {
    if (!ordemEditando) return;
    setSalvandoOrdem(true);
    try {
      // As inativas escondidas ficam depois das visíveis, na ordem em que estavam.
      const resto = attendants.map((a) => a.id).filter((id) => !ordemEditando.includes(id));
      const res = await fetch("/api/attendants/ordem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...ordemEditando, ...resto] }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      toast.success("Ordem salva");
      escolherOrdem("minha");
      setOrdemEditando(null);
      mutate();
    } catch (e) {
      toast.error((e as Error).message || "Erro ao salvar a ordem");
    } finally {
      setSalvandoOrdem(false);
    }
  }
  const inactiveCount = attendants.filter((a) => a.status === "inactive").length;

  const runMerge = async () => {
    setMerging(true);
    try {
      const res = await fetch("/api/attendants/merge", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error();
      toast.success(
        json.merged > 0
          ? `${json.merged} atendente(s) mesclado(s)`
          : "Nenhum duplicado encontrado"
      );
      if (json.merged > 0) {
        mutate();
        mutateSummary();
      }
    } catch {
      toast.error("Erro ao mesclar duplicados");
    } finally {
      setMerging(false);
    }
  };

  const runAutoDetect = async (silent = false) => {
    setDetecting(true);
    try {
      const res = await fetch("/api/attendants/auto-detect", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error();
      if (!silent) {
        toast.success(
          json.created > 0
            ? `${json.created} atendente(s) detectado(s)`
            : "Nenhum novo atendente encontrado"
        );
      }
      if (json.created > 0) {
        mutate();
        mutateSummary();
      }
    } catch {
      if (!silent) toast.error("Erro ao detectar atendentes");
    } finally {
      setDetecting(false);
    }
  };

  // Auto-detecta ao abrir a página se não houver atendentes
  useEffect(() => {
    if (!isLoading && !autoRan && attendants.length === 0) {
      setAutoRan(true);
      runAutoDetect(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, attendants.length, autoRan]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/attendants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          src: fd.get("src") || null,
          email: fd.get("email") || null,
          phone: fd.get("phone") || null,
          role: fd.get("role") || "closer",
          payment_closing_day: parseInt(fd.get("closing_day") as string) || 1,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Atendente criado");
      setNewOpen(false);
      mutate();
      mutateSummary();
    } catch {
      toast.error("Erro ao criar atendente");
    } finally {
      setCreating(false);
    }
  }

  const kpis = [
    {
      label: "A pagar (liberado)",
      hint: "comissão de clientes que já pagaram",
      value: summary ? formatCurrency(summary.total_to_pay) : "—",
      icon: Wallet,
      cor: "text-success bg-success/10",
      sensitive: true,
    },
    {
      label: "AfterPay a liberar",
      hint: "entra quando o cliente pagar",
      value: summary ? formatCurrency(summary.total_pendente || 0) : "—",
      icon: Clock,
      cor: "text-warning bg-warning/10",
      sensitive: true,
    },
    {
      label: "Vendas pagas",
      hint: "no período",
      value: summary ? String(summary.total_paid_sales) : "—",
      icon: ShoppingCart,
      cor: "text-brand bg-brand/10",
      sensitive: false,
    },
    {
      label: "Atendentes ativas",
      hint: summary?.top_seller ? `destaque: ${summary.top_seller.name}` : "equipe",
      value: summary ? String(summary.total_attendants) : "—",
      icon: Users,
      cor: "text-violet-400 bg-violet-500/10",
      sensitive: false,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-heading">Atendentes</h1>
          <p className="text-sm text-muted-foreground">
            Comissionamento progressivo com cálculo automático pelas vendas
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
              <SelectItem value="current">Período atual</SelectItem>
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
          {!somenteLeitura && (<>
          <Button variant="outline" onClick={() => runAutoDetect(false)} disabled={detecting}>
            <RefreshCw className={detecting ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
            Detectar
          </Button>
          <Button variant="outline" onClick={runMerge} disabled={merging}>
            <GitMerge className={merging ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
            Mesclar Duplicados
          </Button>
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <Button className="bg-brand hover:bg-brand/90">
                <Plus className="mr-2 h-4 w-4" />
                Novo Atendente
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>Novo Atendente</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input id="name" name="name" required className="bg-card-elevated border-border" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="src">SRC Key</Label>
                  <Input id="src" name="src" placeholder="Identificador nas vendas" className="bg-card-elevated border-border" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" name="email" type="email" className="bg-card-elevated border-border" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input id="phone" name="phone" className="bg-card-elevated border-border" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="role">Função</Label>
                    <Select name="role" defaultValue="closer">
                      <SelectTrigger className="bg-card-elevated border-border"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="closer">Closer</SelectItem>
                        <SelectItem value="sdr">SDR</SelectItem>
                        <SelectItem value="cobrador">Cobrador</SelectItem>
                        <SelectItem value="outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="closing_day">Dia de fechamento</Label>
                    <Select name="closing_day" defaultValue="1">
                      <SelectTrigger className="bg-card-elevated border-border"><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                          <SelectItem key={d} value={String(d)}>Dia {d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setNewOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={creating} className="bg-brand hover:bg-brand/90">
                    {creating ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          </>)}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-card border-border">
            <CardContent className="flex items-center gap-3 p-3 sm:p-4">
              <div className={cn("shrink-0 rounded-lg p-2", k.cor)}>
                <k.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">{k.label}</p>
                <p className="truncate text-lg font-bold text-foreground">
                  {k.sensitive ? <SensitiveValue>{k.value}</SensitiveValue> : k.value}
                </p>
                <p className="hidden truncate text-[11px] text-muted-foreground/80 sm:block">{k.hint}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Ranking das vendedoras no período */}
      {!somenteLeitura && ranking.length > 1 && (
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-semibold text-foreground">
                <Trophy className="h-4 w-4 text-amber-400" /> Ranking do período
              </h2>
              <span className="text-xs text-muted-foreground">por vendas pagas</span>
            </div>
            <ol className="space-y-2">
              {ranking.map((r, i) => (
                <li key={r.id} className="grid grid-cols-[1.75rem_1fr_auto] items-center gap-3">
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                      r.vendas > 0 && i < 3 ? MEDALHAS[i] : "bg-muted text-muted-foreground"
                    )}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{r.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{r.vendas}</span> paga{r.vendas !== 1 ? "s" : ""}
                        {r.afterpay_abertos > 0 && ` · ${r.afterpay_abertos} AfterPay em aberto`}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-brand transition-all"
                        style={{ width: `${(r.vendas / maxVendas) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="w-24 text-right text-xs sm:w-40">
                    <p className="font-semibold text-success">
                      <SensitiveValue>{formatCurrency(r.a_receber)}</SensitiveValue>
                    </p>
                    {r.a_liberar > 0 && (
                      <p className="text-[11px] text-warning">
                        +<SensitiveValue>{formatCurrency(r.a_liberar)}</SensitiveValue> a liberar
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-80" />
          ))}
        </div>
      ) : attendants.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Nenhum atendente encontrado</p>
            <p className="text-sm text-muted-foreground/70">
              Clique em &quot;Detectar&quot; para buscar pelos SRC das vendas ou crie manualmente
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Ordem dos cartões */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {ordemEditando ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Use as setas de cada cartão para mudar a posição.
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setOrdemEditando(null)} disabled={salvandoOrdem}>
                    <X className="mr-1.5 h-4 w-4" /> Cancelar
                  </Button>
                  <Button size="sm" className="bg-brand hover:bg-brand/90" onClick={salvarOrdem} disabled={salvandoOrdem}>
                    <Check className="mr-1.5 h-4 w-4" /> {salvandoOrdem ? "Salvando..." : "Salvar ordem"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Select value={ordenarPor} onValueChange={(v) => escolherOrdem(v as Ordenacao)}>
                    <SelectTrigger className="h-9 w-[190px] bg-card-elevated border-border">
                      <ArrowUpDown className="mr-1 h-4 w-4 text-muted-foreground" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="minha">Minha ordem</SelectItem>
                      <SelectItem value="ranking">Ranking (mais vendas)</SelectItem>
                      <SelectItem value="nome">Nome (A–Z)</SelectItem>
                    </SelectContent>
                  </Select>
                  {!somenteLeitura && filtradas.length > 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9"
                      onClick={() => setOrdemEditando(visibleAttendants.map((a) => a.id))}
                    >
                      Organizar
                    </Button>
                  )}
                </div>
                {inactiveCount > 0 && (
                  <div className="flex items-center gap-2">
                    <Label htmlFor="show-inactive" className="text-xs text-muted-foreground cursor-pointer">
                      Mostrar inativas ({inactiveCount})
                    </Label>
                    <Switch
                      id="show-inactive"
                      checked={showInactive}
                      onCheckedChange={setShowInactive}
                    />
                  </div>
                )}
              </>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleAttendants.map((att, i) => (
              <AttendantCard
                key={att.id}
                somenteLeitura={somenteLeitura}
                attendant={att}
                period={period}
                posicao={posicaoDe.get(att.id)}
                organizando={!!ordemEditando}
                ordem={i + 1}
                primeiro={i === 0}
                ultimo={i === visibleAttendants.length - 1}
                onMover={(d) => mover(i, d)}
                onConfigure={(a) => setConfigTarget(a)}
                onDetails={(a, commission: CommissionResult) => {
                  setDetailsTarget(a);
                  setDetailsPeriod(commission.period);
                }}
                onChanged={() => {
                  mutate();
                  mutateSummary();
                }}
              />
            ))}
          </div>
        </>
      )}

      <ConfigModal
        attendant={configTarget}
        open={!!configTarget}
        onOpenChange={(v) => !v && setConfigTarget(null)}
        onSaved={() => {
          mutate();
          mutateSummary();
        }}
      />
      <DetailsModal
        attendant={detailsTarget}
        initialPeriod={detailsPeriod}
        open={!!detailsTarget}
        onOpenChange={(v) => !v && setDetailsTarget(null)}
      />
    </div>
  );
}
