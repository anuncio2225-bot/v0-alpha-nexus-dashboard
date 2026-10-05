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
  GripVertical,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { Attendant, CommissionResult } from "@/types";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import { AttendantCard, MEDALHAS, corDoNome, iniciais } from "@/components/attendants/attendant-card";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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

type Alca = React.ButtonHTMLAttributes<HTMLButtonElement> & { ref?: (el: HTMLElement | null) => void };

/** Cartão que muda de lugar arrastando pela alça (⋮⋮). */
function CartaoArrastavel({
  id,
  children,
}: {
  id: string;
  children: (alca: Alca, arrastando: boolean) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("h-full", isDragging && "relative z-20")}
    >
      {children({ ref: setActivatorNodeRef, ...attributes, ...listeners } as Alca, isDragging)}
    </div>
  );
}

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
  // Arrastar só começa depois de mover um pouco (clique na alça não vira arrasto);
  // no celular, segurar a alça um instante.
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

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
    if (ordenarPor === "nome") return [...filtradas].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    if (ordenarPor === "ranking") {
      const idx = new Map(ranking.map((r, i) => [r.id, i]));
      return [...filtradas].sort((a, b) => (idx.get(a.id) ?? 999) - (idx.get(b.id) ?? 999));
    }
    return filtradas; // já vem na ordem salva pelo dono
  }, [filtradas, ordenarPor, ranking]);
  const maxVendas = Math.max(1, ...ranking.map((r) => r.vendas));
  const totalPagas = ranking.reduce((s, r) => s + r.vendas, 0);
  const inactiveCount = attendants.filter((a) => a.status === "inactive").length;

  // Soltou o cartão em outro lugar: vira "Minha ordem" e salva na hora.
  async function aoSoltar({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const ids = visibleAttendants.map((a) => a.id);
    const novo = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    // As inativas escondidas ficam depois das visíveis, na ordem em que estavam.
    const todos = [...novo, ...attendants.map((a) => a.id).filter((id) => !novo.includes(id))];
    const porId = new Map(attendants.map((a) => [a.id, a]));
    escolherOrdem("minha");
    mutate({ attendants: todos.map((id) => porId.get(id)).filter((a): a is Attendant => !!a) }, false);
    try {
      const res = await fetch("/api/attendants/ordem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: todos }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
    } catch (e) {
      toast.error((e as Error).message || "Erro ao salvar a ordem");
    } finally {
      mutate();
    }
  }

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

      {/* Resumo do período — uma faixa só, para sobrar espaço para as atendentes */}
      <Card className="gap-0 overflow-hidden border-border bg-card py-0">
        <div className="grid grid-cols-2 divide-border lg:grid-cols-4 lg:divide-x [&>*:nth-child(-n+2)]:border-b lg:[&>*:nth-child(-n+2)]:border-b-0 [&>*:nth-child(odd)]:border-r lg:[&>*:nth-child(odd)]:border-r-0">
          {kpis.map((k) => (
            <div key={k.label} className="flex items-center gap-2.5 px-4 py-2.5">
              <k.icon className={cn("h-4 w-4 shrink-0", k.cor.split(" ")[0])} />
              <div className="min-w-0">
                <p className="truncate text-[11px] text-muted-foreground">{k.label}</p>
                <p className="truncate text-base font-semibold tabular-nums leading-tight text-foreground">
                  {k.sensitive ? <SensitiveValue>{k.value}</SensitiveValue> : k.value}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>

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
            <div className="flex items-center gap-3">
              <Select value={ordenarPor} onValueChange={(v) => escolherOrdem(v as Ordenacao)}>
                <SelectTrigger className="h-9 w-[200px] bg-card-elevated border-border">
                  <ArrowUpDown className="mr-1 h-4 w-4 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minha">Minha ordem</SelectItem>
                  <SelectItem value="ranking">Mais vendas primeiro</SelectItem>
                  <SelectItem value="nome">Nome (A–Z)</SelectItem>
                </SelectContent>
              </Select>
              {!somenteLeitura && filtradas.length > 1 && (
                <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
                  <GripVertical className="h-3.5 w-3.5" /> arraste o cartão para organizar
                </span>
              )}
            </div>
            {inactiveCount > 0 && (
              <div className="flex items-center gap-2">
                <Label htmlFor="show-inactive" className="text-xs text-muted-foreground cursor-pointer">
                  Mostrar inativas ({inactiveCount})
                </Label>
                <Switch id="show-inactive" checked={showInactive} onCheckedChange={setShowInactive} />
              </div>
            )}
          </div>

          <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={aoSoltar}>
            <SortableContext items={visibleAttendants.map((a) => a.id)} strategy={rectSortingStrategy}>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {visibleAttendants.map((att) => (
                  <CartaoArrastavel key={att.id} id={att.id}>
                    {(alca, arrastando) => (
                      <AttendantCard
                        somenteLeitura={somenteLeitura}
                        attendant={att}
                        period={period}
                        posicao={posicaoDe.get(att.id)}
                        alca={somenteLeitura ? undefined : alca}
                        arrastando={arrastando}
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
                    )}
                  </CartaoArrastavel>
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {/* Ranking do período — embaixo, como tabela de placar */}
          {!somenteLeitura && ranking.length > 1 && (
            <Card className="gap-0 overflow-hidden border-border bg-card py-0">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Trophy className="h-4 w-4 text-amber-400" /> Ranking do período
                </h2>
                <span className="text-[11px] text-muted-foreground">{totalPagas} vendas pagas no total</span>
              </div>
              <div className="hidden grid-cols-[2rem_minmax(0,1fr)_5rem_6rem_7.5rem_7.5rem] gap-3 border-b border-border px-4 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground md:grid">
                <span>#</span>
                <span>Atendente</span>
                <span className="text-right">Pagas</span>
                <span className="text-right">AfterPay aberto</span>
                <span className="text-right">A receber</span>
                <span className="text-right">A liberar</span>
              </div>
              <ol className="divide-y divide-border">
                {ranking.map((r, i) => {
                  const medalha = r.vendas > 0 && i < 3 ? MEDALHAS[i] : null;
                  return (
                    <li
                      key={r.id}
                      className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/30 md:grid-cols-[2rem_minmax(0,1fr)_5rem_6rem_7.5rem_7.5rem]"
                    >
                      <span
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold",
                          medalha || "text-muted-foreground"
                        )}
                      >
                        {i + 1}
                      </span>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                            corDoNome(r.name)
                          )}
                        >
                          {iniciais(r.name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">{r.name}</p>
                          <div className="mt-1 h-1 w-full max-w-48 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-brand"
                              style={{ width: `${(r.vendas / maxVendas) * 100}%` }}
                            />
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted-foreground md:hidden">
                            {r.vendas} pagas · {r.afterpay_abertos} em aberto
                          </p>
                        </div>
                      </div>
                      <span
                        className={cn(
                          "hidden text-right text-sm font-semibold tabular-nums md:block",
                          r.vendas > 0 ? "text-foreground" : "text-muted-foreground/60"
                        )}
                      >
                        {r.vendas}
                      </span>
                      <span className="hidden text-right text-sm tabular-nums text-muted-foreground md:block">
                        {r.afterpay_abertos}
                      </span>
                      <div className="text-right md:contents">
                        <span
                          className={cn(
                            "block text-sm font-semibold tabular-nums md:text-right",
                            r.a_receber > 0 ? "text-success" : "text-muted-foreground/60"
                          )}
                        >
                          <SensitiveValue>{formatCurrency(r.a_receber)}</SensitiveValue>
                        </span>
                        <span
                          className={cn(
                            "block text-[11px] tabular-nums md:text-right md:text-sm",
                            r.a_liberar > 0 ? "text-warning" : "text-muted-foreground/60"
                          )}
                        >
                          <SensitiveValue>{formatCurrency(r.a_liberar)}</SensitiveValue>
                          <span className="md:hidden"> a liberar</span>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Card>
          )}
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
