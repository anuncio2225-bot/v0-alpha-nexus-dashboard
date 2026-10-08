"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Plus, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import { cn } from "@/lib/utils";
import { CampoNumero, fmtMoeda, fmtPct, fmtQtd } from "./campos";
import { ROTULO_CUSTO } from "./resultado";
import {
  aplicarCenario,
  calcular,
  curvaFrustracao,
  type Cenario,
  type Entradas,
  type Resultado,
} from "@/lib/previsibilidade/calculo";

const axisBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });

export function AbaCenarios({
  e,
  cenarios,
  onChange,
  onSalvar,
  podeEditar,
}: {
  e: Entradas;
  cenarios: Cenario[];
  onChange: (c: Cenario[]) => void;
  onSalvar: (c: Cenario) => void;
  podeEditar: boolean;
}) {
  // Quais entram na comparação (padrão: todos).
  const [fora, setFora] = useState<Set<string>>(new Set());
  const base = useMemo(() => calcular(e), [e]);
  const calculados = useMemo(
    () => cenarios.map((c) => ({ c, r: calcular(aplicarCenario(e, c)) })),
    [e, cenarios]
  );
  const comparados = calculados.filter(({ c }) => !fora.has(c.id));

  const editar = (id: string, patch: Partial<Cenario>) =>
    onChange(cenarios.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const novo = () => {
    const f = Math.min(e.conversao.frustracao + 5 * (cenarios.length + 1), 90);
    onChange([...cenarios, { id: crypto.randomUUID(), nome: `Cenário ${cenarios.length + 1}`, frustracao: f }]);
  };

  return (
    <div className="space-y-4">
      {/* --------------------------- Lista editável --------------------------- */}
      <Card className="gap-0 rounded-[20px] border-[var(--border-glass)] py-0">
        <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-3">
          <div>
            <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Cenários</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Cada cenário usa todos os custos do simulador e troca só o que você preencher. Campo vazio = igual ao simulador.
            </p>
          </div>
          <Button size="sm" onClick={novo} disabled={!podeEditar || cenarios.length >= 20} className="gap-1.5">
            <Plus className="h-4 w-4" /> Novo cenário
          </Button>
        </div>
        <div className="space-y-3 px-5 pb-5">
          {cenarios.length === 0 && (
            <p className="rounded-xl border border-dashed border-[var(--border-glass)] p-6 text-center text-sm text-muted-foreground">
              Nenhum cenário. Crie um para comparar, por exemplo, 15% contra 25% de frustração.
            </p>
          )}
          {calculados.map(({ c, r }) => (
            <div key={c.id} className="rounded-xl border border-[var(--border-glass)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-muted-foreground" title="Entrar na comparação">
                  <Checkbox
                    checked={!fora.has(c.id)}
                    onCheckedChange={(v) => {
                      const s = new Set(fora);
                      if (v === true) s.delete(c.id);
                      else s.add(c.id);
                      setFora(s);
                    }}
                  />
                </label>
                <input
                  value={c.nome}
                  disabled={!podeEditar}
                  onChange={(ev) => editar(c.id, { nome: ev.target.value })}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-sm font-semibold text-foreground outline-none hover:border-[var(--border-glass)] focus:border-brand/60"
                  aria-label="Nome do cenário"
                />
                <span className={cn("text-sm font-semibold tabular-nums", r.lucro < 0 ? "text-danger" : "text-brand")}>
                  <SensitiveValue>{fmtMoeda(r.lucro)}</SensitiveValue>
                </span>
                <span className="w-16 text-right text-xs tabular-nums text-muted-foreground">ROI {fmtPct(r.roi)}</span>
                <Button size="icon" variant="ghost" className="h-8 w-8" title="Salvar no histórico" disabled={!podeEditar} onClick={() => onSalvar(c)}>
                  <Save className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-danger"
                  title="Excluir cenário"
                  disabled={!podeEditar}
                  onClick={() => onChange(cenarios.filter((x) => x.id !== c.id))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                <CampoNumero label="Frustração" sufixo="%" permiteVazio min={0} max={100} value={c.frustracao ?? null} placeholder={String(e.conversao.frustracao)} disabled={!podeEditar} onChange={(v) => editar(c.id, { frustracao: v })} />
                <CampoNumero label="Agendados" permiteVazio min={0} value={c.agendados ?? null} placeholder={String(e.pedidos.agendados)} disabled={!podeEditar} onChange={(v) => editar(c.id, { agendados: v })} />
                <CampoNumero label="Antecipados" permiteVazio min={0} value={c.antecipados ?? null} placeholder={String(e.pedidos.antecipados)} disabled={!podeEditar} onChange={(v) => editar(c.id, { antecipados: v })} />
                <CampoNumero label="CPA" prefixo="R$" permiteVazio min={0} value={c.cpa ?? null} placeholder={String(e.investimento.cpa)} disabled={!podeEditar} onChange={(v) => editar(c.id, { cpa: v })} />
                <CampoNumero label="Ticket médio" prefixo="R$" permiteVazio min={0} value={c.ticketMedio ?? null} placeholder={String(Math.round(base.ticket * 100) / 100)} disabled={!podeEditar} onChange={(v) => editar(c.id, { ticketMedio: v })} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ------------------------- Comparação lado a lado ------------------------- */}
      <TabelaComparacao
        colunas={[{ nome: "Simulador", r: base, base: true }, ...comparados.map(({ c, r }) => ({ nome: c.nome || "Cenário", r }))]}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <GraficoFrustracao e={e} cenarios={comparados} />
        <QuantoPerco e={e} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

type Coluna = { nome: string; r: Resultado; base?: boolean; sub?: string };

/** Tabela de comparação (cenários e também simulações do histórico). */
export function TabelaComparacao({ colunas, titulo = "Comparação lado a lado" }: { colunas: Coluna[]; titulo?: string }) {
  const ref = colunas[0]?.r;
  type Linha = { rotulo: string; v: (r: Resultado) => number | null; tipo: "moeda" | "qtd" | "pct"; destaque?: boolean; custo?: boolean };
  const linhas: Linha[] = [
    { rotulo: "Pedidos", v: (r) => r.pedidos, tipo: "qtd" },
    { rotulo: "Frustração", v: (r) => (r.agendados > 0 ? (r.frustrados / r.agendados) * 100 : 0), tipo: "pct" },
    { rotulo: "Pedidos pagos", v: (r) => r.pagos, tipo: "qtd" },
    { rotulo: "Faturamento", v: (r) => r.faturamento, tipo: "moeda" },
    ...(Object.keys(ROTULO_CUSTO) as (keyof Resultado["custos"])[]).map((k) => ({
      rotulo: ROTULO_CUSTO[k],
      v: (r: Resultado) => r.custos[k],
      tipo: "moeda" as const,
      custo: true,
    })),
    { rotulo: "Custo total", v: (r) => r.custoTotal, tipo: "moeda", custo: true, destaque: true },
    { rotulo: "Lucro líquido", v: (r) => r.lucro, tipo: "moeda", destaque: true },
    { rotulo: "Margem", v: (r) => r.margem, tipo: "pct" },
    { rotulo: "ROI real", v: (r) => r.roi, tipo: "pct", destaque: true },
  ];
  // Linhas de custo zeradas em todas as colunas não aparecem.
  const visiveis = linhas.filter((l) => !l.custo || l.destaque || colunas.some((c) => (l.v(c.r) ?? 0) !== 0));
  const fmt = (v: number | null, t: Linha["tipo"]) =>
    v === null ? "—" : t === "moeda" ? fmtMoeda(v) : t === "pct" ? fmtPct(v) : fmtQtd(v);

  if (colunas.length < 2) {
    return (
      <Card className="rounded-[20px] border-[var(--border-glass)] p-6 text-center text-sm text-muted-foreground">
        Marque pelo menos um cenário para comparar.
      </Card>
    );
  }

  return (
    <Card className="gap-0 overflow-hidden rounded-[20px] border-[var(--border-glass)] py-0">
      <div className="p-5 pb-3">
        <h3 className="text-[15px] font-semibold tracking-tight text-foreground">{titulo}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">A diferença embaixo de cada número é contra a primeira coluna.</p>
      </div>
      <div className="overflow-x-auto px-2 pb-4 sm:px-5">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-card py-2 pr-3 text-left text-xs font-normal text-muted-foreground" />
              {colunas.map((c, i) => (
                <th key={i} className="px-2 py-2 text-right align-bottom">
                  <span className={cn("block text-[13px] font-semibold", c.base ? "text-brand" : "text-foreground")}>{c.nome}</span>
                  {c.sub && <span className="block text-[10px] font-normal text-muted-foreground">{c.sub}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <tr key={l.rotulo} className={cn("border-t border-[var(--hairline)]", l.destaque && "bg-[var(--glass-1)]")}>
                <td className={cn("sticky left-0 z-10 bg-card py-2 pr-3 text-xs", l.destaque ? "font-semibold text-foreground" : "text-muted-foreground")}>
                  {l.rotulo}
                </td>
                {colunas.map((c, i) => {
                  const v = l.v(c.r);
                  const r0 = ref ? l.v(ref) : null;
                  const delta = i > 0 && v !== null && r0 !== null ? v - r0 : null;
                  const bom = delta === null ? null : l.custo ? delta < 0 : delta > 0;
                  const negativo = l.rotulo === "Lucro líquido" || l.rotulo === "ROI real" ? (v ?? 0) < 0 : false;
                  return (
                    <td key={i} className="px-2 py-2 text-right tabular-nums">
                      <span className={cn(l.destaque && "font-semibold", negativo ? "text-danger" : l.rotulo === "Lucro líquido" ? "text-brand" : "text-foreground")}>
                        <SensitiveValue>{fmt(v, l.tipo)}</SensitiveValue>
                      </span>
                      {delta !== null && Math.abs(delta) > 0.004 && (
                        <span className={cn("block text-[10px]", bom ? "text-brand" : "text-danger")}>
                          <SensitiveValue>
                            {delta > 0 ? "+" : "−"}
                            {l.tipo === "pct" ? `${fmtPct(Math.abs(delta)).replace("%", "")} p.p.` : fmt(Math.abs(delta), l.tipo)}
                          </SensitiveValue>
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function GraficoFrustracao({ e, cenarios }: { e: Entradas; cenarios: { c: Cenario; r: Resultado }[] }) {
  const ate = Math.max(50, Math.ceil((e.conversao.frustracao + 10) / 5) * 5);
  const pontos = useMemo(() => curvaFrustracao(e, ate, 2.5), [e, ate]);
  const atual = calcular(e);
  return (
    <Card className="gap-0 overflow-hidden rounded-[20px] border-[var(--border-glass)] py-0">
      <div className="p-5 pb-2">
        <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Lucro × frustração</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">Com todos os outros números do simulador. Pontos azuis = cenários.</p>
      </div>
      <div className="h-[280px] px-2 pb-4 sm:px-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={pontos} margin={{ top: 10, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="frustracao" type="number" domain={[0, ate]} tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={(v) => `${v}%`} stroke="transparent" />
            <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={(v) => axisBRL.format(v)} width={64} stroke="transparent" />
            <ReferenceLine y={0} stroke="rgba(244,63,94,0.5)" strokeDasharray="4 4" />
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.[0] ? (
                  <div className="rounded-xl border border-[var(--hairline)] bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur-xl">
                    <p className="text-muted-foreground">Frustração {fmtPct(Number(payload[0].payload.frustracao))}</p>
                    <p className="font-semibold text-foreground">
                      Lucro <SensitiveValue>{fmtMoeda(Number(payload[0].value))}</SensitiveValue>
                    </p>
                  </div>
                ) : null
              }
            />
            <Line type="monotone" dataKey="lucro" stroke="#10b981" strokeWidth={2.5} dot={false} isAnimationActive={false} />
            <ReferenceDot x={e.conversao.frustracao} y={atual.lucro} r={6} fill="#10b981" stroke="#07080a" strokeWidth={2} />
            {cenarios.map(({ c, r }) => (
              <ReferenceDot
                key={c.id}
                x={c.frustracao ?? e.conversao.frustracao}
                y={r.lucro}
                r={5}
                fill="#60a5fa"
                stroke="#07080a"
                strokeWidth={2}
                label={{ value: c.nome, position: "top", fill: "#9ca3af", fontSize: 10 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

/** "Se minha frustração subir de 15% para 25%, quanto eu perco de lucro?" */
function QuantoPerco({ e }: { e: Entradas }) {
  const [de, setDe] = useState<number>(e.conversao.frustracao);
  const [para, setPara] = useState<number>(Math.min(e.conversao.frustracao + 10, 100));
  const rDe = calcular({ ...e, conversao: { ...e.conversao, frustracao: de } });
  const rPara = calcular({ ...e, conversao: { ...e.conversao, frustracao: para } });
  const diff = rPara.lucro - rDe.lucro;
  const item = (rotulo: string, a: ReactNode, b: ReactNode) => (
    <tr className="border-t border-[var(--hairline)]">
      <td className="py-1.5 text-muted-foreground">{rotulo}</td>
      <td className="py-1.5 text-right tabular-nums">{a}</td>
      <td className="py-1.5 text-right tabular-nums">{b}</td>
    </tr>
  );
  return (
    <Card className="gap-0 rounded-[20px] border-[var(--border-glass)] py-0">
      <div className="p-5">
        <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Se a frustração mudar, quanto muda o lucro?</h3>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <CampoNumero label="Frustração de" sufixo="%" min={0} max={100} value={de} onChange={(v) => setDe(v ?? 0)} />
          <CampoNumero label="para" sufixo="%" min={0} max={100} value={para} onChange={(v) => setPara(v ?? 0)} />
        </div>
        <div
          className="ambient relative mt-4 overflow-hidden rounded-2xl border border-[var(--border-glass)] p-4"
          style={{ ["--tone" as string]: diff < 0 ? "rgba(244,63,94,0.2)" : "rgba(16,185,129,0.2)" }}
        >
          <p className="relative z-10 text-xs text-muted-foreground">{diff < 0 ? "Você perde" : diff > 0 ? "Você ganha" : "Sem diferença"}</p>
          <p className={cn("metric relative z-10 mt-1 text-[28px]", diff < 0 ? "text-danger" : "text-brand")}>
            <SensitiveValue>{fmtMoeda(Math.abs(diff))}</SensitiveValue>
          </p>
          <p className="relative z-10 text-xs text-muted-foreground">
            de lucro ({fmtQtd(Math.abs(rDe.pagos - rPara.pagos))} pedidos pagos {rPara.pagos < rDe.pagos ? "a menos" : "a mais"})
          </p>
        </div>
        <table className="mt-3 w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-1 text-left font-normal" />
              <th className="py-1 text-right font-normal">{fmtPct(de)}</th>
              <th className="py-1 text-right font-normal">{fmtPct(para)}</th>
            </tr>
          </thead>
          <tbody>
            {item("Pagos", fmtQtd(rDe.pagos), fmtQtd(rPara.pagos))}
            {item("Faturamento", <SensitiveValue>{fmtMoeda(rDe.faturamento)}</SensitiveValue>, <SensitiveValue>{fmtMoeda(rPara.faturamento)}</SensitiveValue>)}
            {item("Lucro", <SensitiveValue>{fmtMoeda(rDe.lucro)}</SensitiveValue>, <SensitiveValue>{fmtMoeda(rPara.lucro)}</SensitiveValue>)}
            {item("ROI", fmtPct(rDe.roi), fmtPct(rPara.roi))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
