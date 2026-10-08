"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ChevronDown, Database, RotateCcw, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import { cn, getDateRange, nowSP } from "@/lib/utils";
import { PainelEntradas } from "@/components/previsibilidade/entradas";
import { PainelResultado } from "@/components/previsibilidade/resultado";
import { AbaCenarios } from "@/components/previsibilidade/cenarios";
import { AbaHistorico, type ItemHistorico } from "@/components/previsibilidade/historico";
import { fmtMoeda, fmtPct } from "@/components/previsibilidade/campos";
import {
  calcular,
  frustracaoDeEmpate,
  type Cenario,
  type Entradas,
} from "@/lib/previsibilidade/calculo";
import type { OperacaoReal } from "@/lib/previsibilidade/real";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Config {
  entradas: Entradas;
  cenarios: Cenario[];
  padroes: Entradas;
  salvo_em: string | null;
  pode_editar: boolean;
}

const PERIODOS = [
  { chave: "7d", rotulo: "Últimos 7 dias" },
  { chave: "30d", rotulo: "Últimos 30 dias" },
  { chave: "mes", rotulo: "Mês atual" },
  { chave: "mes_passado", rotulo: "Mês passado" },
] as const;

function intervalo(chave: (typeof PERIODOS)[number]["chave"]) {
  const ymd = (d: Date) => format(d, "yyyy-MM-dd");
  if (chave === "7d" || chave === "30d") {
    const r = getDateRange(chave);
    return { from: ymd(r.from), to: ymd(r.to) };
  }
  const base = chave === "mes" ? nowSP() : subMonths(nowSP(), 1);
  return { from: ymd(startOfMonth(base)), to: ymd(chave === "mes" ? nowSP() : endOfMonth(base)) };
}

export default function PrevisibilidadePage() {
  const { data: cfg, isLoading } = useSWR<Config>("/api/previsibilidade", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });
  const { data: hist, isLoading: carregandoHist, mutate: mutateHist } = useSWR<{ itens: ItemHistorico[] }>(
    "/api/previsibilidade/historico",
    fetcher,
    { revalidateOnFocus: false }
  );

  const [entradas, setEntradas] = useState<Entradas | null>(null);
  const [cenarios, setCenarios] = useState<Cenario[]>([]);
  const [aba, setAba] = useState("simulador");
  const [status, setStatus] = useState<"salvo" | "salvando" | "pendente" | "erro">("salvo");
  const [salvoEm, setSalvoEm] = useState<string | null>(null);
  const podeEditar = cfg?.pode_editar !== false;

  // Primeira carga: o que estava salvo (ou os custos da conta).
  useEffect(() => {
    if (cfg?.entradas && !entradas) {
      setEntradas(cfg.entradas);
      setCenarios(cfg.cenarios || []);
      setSalvoEm(cfg.salvo_em);
    }
  }, [cfg, entradas]);

  // Salvamento automático (o simulador volta do jeito que você deixou).
  const primeira = useRef(true);
  useEffect(() => {
    if (!entradas) return;
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    if (!podeEditar) return;
    setStatus("pendente");
    const t = setTimeout(async () => {
      setStatus("salvando");
      try {
        const res = await fetch("/api/previsibilidade", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entradas, cenarios }),
        });
        if (!res.ok) throw new Error();
        const j = await res.json();
        setSalvoEm(j.salvo_em);
        setStatus("salvo");
      } catch {
        setStatus("erro");
      }
    }, 900);
    return () => clearTimeout(t);
  }, [entradas, cenarios, podeEditar]);

  const resultado = useMemo(() => (entradas ? calcular(entradas) : null), [entradas]);
  const empate = useMemo(() => (entradas ? frustracaoDeEmpate(entradas) : null), [entradas]);

  /* ----------------------------- Dados reais ----------------------------- */
  const [puxando, setPuxando] = useState(false);
  const preencherComReais = async (chave: (typeof PERIODOS)[number]["chave"], rotulo: string) => {
    if (!entradas) return;
    setPuxando(true);
    try {
      const { from, to } = intervalo(chave);
      const res = await fetch(`/api/dashboard/operacao?from=${from}&to=${to}`);
      const op = (await res.json()) as OperacaoReal & { restrito?: boolean; error?: string };
      if (!res.ok || op.error) throw new Error(op.error || "Falha ao ler os dados");
      if (op.restrito) throw new Error("Seu acesso não inclui os números da operação inteira");
      const s = op.sugestao;
      if (s.agendados + s.antecipados === 0) {
        toast.info(`Nenhum pedido em ${rotulo.toLowerCase()} — nada foi trocado.`);
        return;
      }
      const e = structuredClone(entradas);
      e.pedidos.agendados = s.agendados;
      e.pedidos.antecipados = s.antecipados;
      e.pedidos.agendadosJaPagos = s.agendadosJaPagos;
      if (s.frustracao !== null) e.conversao.frustracao = Math.round(s.frustracao * 10) / 10;
      if (s.naoPagamentoAntecipado !== null) e.conversao.naoPagamentoAntecipado = Math.round(s.naoPagamentoAntecipado * 10) / 10;
      if (s.ticketMedio !== null) {
        e.faturamento.base = "ticket";
        e.faturamento.ticketMedio = Math.round(s.ticketMedio * 100) / 100;
      }
      if (s.potesPorKit !== null) {
        e.faturamento.kitsPorPedido = 1;
        e.faturamento.potesPorKit = Math.round(s.potesPorKit * 10) / 10;
      }
      e.faturamento.kitsManual = null;
      e.faturamento.potesManual = null;
      if (s.custoPote > 0) e.produto.custoPote = s.custoPote;
      if (s.fretePorPedido !== null) e.logistica.custoPorPedido = Math.round(s.fretePorPedido * 100) / 100;
      e.logistica.totalManual = null;
      if (s.cpa !== null) e.investimento.cpa = Math.round(s.cpa * 100) / 100;
      e.investimento.totalManual = null;
      e.investimento.impostoAnuncio = s.impostoAnuncio;
      e.investimento.impostoAnuncioAtivo = s.impostoAnuncio > 0;
      if (s.plataformaPercent !== null) {
        e.plataforma.ativo = true;
        e.plataforma.percentual = Math.round(s.plataformaPercent * 100) / 100;
        e.plataforma.fixoPorVenda = 0;
      }
      if (s.participacaoAfiliados !== null && s.participacaoAfiliados > 0) {
        e.afiliados.ativo = true;
        e.afiliados.participacao = Math.round(s.participacaoAfiliados * 10) / 10;
        if (s.comissaoAfiliado !== null) e.afiliados.comissao = Math.round(s.comissaoAfiliado * 10) / 10;
      } else {
        e.afiliados.ativo = false;
      }
      e.imposto.percentual = s.impostoPercent;
      e.imposto.ativo = s.impostoPercent > 0;
      setEntradas(e);
      toast.success(
        `Preenchido com ${rotulo.toLowerCase()}: ${s.agendados} agendados, ${s.antecipados} antecipados` +
          (s.frustracao !== null
            ? `, ${fmtPct(s.frustracao)} de frustração`
            : " (frustração mantida: menos de 10 agendados decididos no período)") +
          ". Atendente e outros custos continuam como estavam."
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao ler os dados reais");
    } finally {
      setPuxando(false);
    }
  };

  /* ------------------------------ Histórico ------------------------------ */
  const [salvarAberto, setSalvarAberto] = useState(false);
  const [salvarCenario, setSalvarCenario] = useState<Cenario | null>(null);
  const [nomeSalvar, setNomeSalvar] = useState("");
  const [salvandoHist, setSalvandoHist] = useState(false);
  const abrirSalvar = useCallback((c: Cenario | null) => {
    setSalvarCenario(c);
    setNomeSalvar(c?.nome || "Cenário Base");
    setSalvarAberto(true);
  }, []);
  const confirmarSalvar = async () => {
    if (!entradas) return;
    setSalvandoHist(true);
    try {
      const res = await fetch("/api/previsibilidade/historico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: nomeSalvar, entradas, cenario: salvarCenario }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Falha ao salvar");
      await mutateHist();
      setSalvarAberto(false);
      toast.success(`“${j.item.nome}” salvo no histórico.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setSalvandoHist(false);
    }
  };

  const [abrirItem, setAbrirItem] = useState<ItemHistorico | null>(null);
  const [apagarItem, setApagarItem] = useState<ItemHistorico | null>(null);
  const [recomecar, setRecomecar] = useState(false);

  const apagar = async (i: ItemHistorico) => {
    const res = await fetch(`/api/previsibilidade/historico?id=${i.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Não foi possível apagar");
      return;
    }
    await mutateHist();
    toast.success("Simulação apagada do histórico.");
  };

  if (isLoading || !entradas || !resultado) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-72 rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
          <Skeleton className="h-[600px] rounded-[20px]" />
          <Skeleton className="h-[500px] rounded-[20px]" />
        </div>
      </div>
    );
  }

  const textoStatus = !podeEditar
    ? "Somente leitura — alterações não são salvas"
    : status === "salvando"
      ? "Salvando…"
      : status === "pendente"
        ? "Alterações não salvas…"
        : status === "erro"
          ? "Não foi possível salvar — tente de novo"
          : salvoEm
            ? `Salvo às ${new Date(salvoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
            : "Valores iniciais da sua conta";

  return (
    <div className="space-y-6 pb-24 lg:pb-0">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-brand" />
            <span className={cn(status === "erro" && "text-danger")}>{textoStatus}</span>
          </div>
          <h1 className="mt-1.5 text-[28px] font-semibold leading-tight sm:text-[32px]">Previsibilidade</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Pedidos → frustração → pagos → faturamento → custos → lucro → ROI. Mude qualquer número e tudo recalcula na hora.
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2" disabled={puxando || !podeEditar}>
                <Database className={cn("h-4 w-4", puxando && "animate-pulse")} />
                {puxando ? "Lendo…" : "Preencher com dados reais"}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Pedidos, frustração, ticket, frete, CPA, plataforma e afiliados do período
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {PERIODOS.map((p) => (
                <DropdownMenuItem key={p.chave} onClick={() => preencherComReais(p.chave, p.rotulo)}>
                  {p.rotulo}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setRecomecar(true)} className="gap-2">
                <RotateCcw className="h-3.5 w-3.5" /> Recomeçar com os custos da conta
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" className="gap-2" onClick={() => abrirSalvar(null)} disabled={!podeEditar}>
            <Save className="h-4 w-4" /> Salvar no histórico
          </Button>
        </div>
      </div>

      <Tabs value={aba} onValueChange={setAba} className="space-y-5">
        <TabsList>
          <TabsTrigger value="simulador">Simulador</TabsTrigger>
          <TabsTrigger value="cenarios">Cenários{cenarios.length > 0 ? ` (${cenarios.length})` : ""}</TabsTrigger>
          <TabsTrigger value="historico">Histórico{hist?.itens?.length ? ` (${hist.itens.length})` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="simulador">
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px] xl:grid-cols-[minmax(0,1fr)_420px]">
            <fieldset disabled={!podeEditar} className="min-w-0">
              <PainelEntradas e={entradas} r={resultado} onChange={setEntradas} />
            </fieldset>
            <div className="lg:sticky lg:top-6">
              <PainelResultado e={entradas} r={resultado} empate={empate} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="cenarios">
          <AbaCenarios e={entradas} cenarios={cenarios} onChange={setCenarios} onSalvar={(c) => abrirSalvar(c)} podeEditar={podeEditar} />
        </TabsContent>

        <TabsContent value="historico">
          <AbaHistorico
            itens={hist?.itens || []}
            carregando={carregandoHist}
            onAbrir={setAbrirItem}
            onApagar={setApagarItem}
            podeApagar={podeEditar}
          />
        </TabsContent>
      </Tabs>

      {/* Celular: lucro e ROI sempre à vista enquanto mexe nos números */}
      {aba === "simulador" && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border-glass)] bg-background/90 px-4 py-3 backdrop-blur-xl lg:hidden">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground">Lucro líquido</p>
              <p className={cn("truncate text-lg font-semibold tabular-nums", resultado.lucro < 0 ? "text-danger" : "text-brand")}>
                <SensitiveValue>{fmtMoeda(resultado.lucro)}</SensitiveValue>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">ROI real · margem</p>
              <p className="text-lg font-semibold tabular-nums text-foreground">
                {fmtPct(resultado.roi)} <span className="text-xs text-muted-foreground">· {fmtPct(resultado.margem)}</span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Salvar no histórico */}
      <Dialog open={salvarAberto} onOpenChange={setSalvarAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Salvar no histórico</DialogTitle>
            <DialogDescription>
              {salvarCenario
                ? `Guarda o cenário “${salvarCenario.nome}” com todos os números de agora.`
                : "Guarda o simulador com todos os números de agora, com data e hora."}
            </DialogDescription>
          </DialogHeader>
          <label className="block">
            <span className="mb-1.5 block text-xs text-muted-foreground">Nome do cenário</span>
            <Input value={nomeSalvar} onChange={(ev) => setNomeSalvar(ev.target.value)} maxLength={80} autoFocus />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSalvarAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmarSalvar} disabled={salvandoHist || !nomeSalvar.trim()}>
              {salvandoHist ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Abrir simulação antiga */}
      <AlertDialog open={!!abrirItem} onOpenChange={(v) => !v && setAbrirItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abrir “{abrirItem?.nome}” no simulador?</AlertDialogTitle>
            <AlertDialogDescription>
              Os números atuais do simulador são trocados pelos dessa simulação. Os cenários continuam como estão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (abrirItem) {
                  setEntradas(abrirItem.entradas);
                  setAba("simulador");
                }
                setAbrirItem(null);
              }}
            >
              Abrir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Apagar do histórico */}
      <AlertDialog open={!!apagarItem} onOpenChange={(v) => !v && setApagarItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar “{apagarItem?.nome}”?</AlertDialogTitle>
            <AlertDialogDescription>A simulação sai do histórico. Isso não mexe em vendas nem em custos da conta.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (apagarItem) apagar(apagarItem);
                setApagarItem(null);
              }}
            >
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Recomeçar */}
      <AlertDialog open={recomecar} onOpenChange={setRecomecar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recomeçar o simulador?</AlertDialogTitle>
            <AlertDialogDescription>
              Volta aos custos configurados na conta (Análise de Lucro e Configurações). O histórico e os cenários não mudam.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (cfg?.padroes) setEntradas(structuredClone(cfg.padroes));
                setRecomecar(false);
              }}
            >
              Recomeçar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
