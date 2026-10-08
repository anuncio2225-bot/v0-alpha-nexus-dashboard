"use client";

import { useState } from "react";
import { ChevronDown, FolderOpen, History, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import { cn } from "@/lib/utils";
import { fmtMoeda, fmtPct, fmtQtd } from "./campos";
import { ROTULO_CUSTO } from "./resultado";
import { TabelaComparacao } from "./cenarios";
import type { Entradas, Resultado } from "@/lib/previsibilidade/calculo";

export interface ItemHistorico {
  id: string;
  nome: string;
  entradas: Entradas;
  resultado: Resultado;
  created_at: string;
}

/** "07/10/2026 — 21:15" no horário de Brasília. */
export function dataHora(iso: string) {
  const d = new Date(iso);
  const data = d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  return `${data} — ${hora}`;
}

export function AbaHistorico({
  itens,
  carregando,
  onAbrir,
  onApagar,
  podeApagar,
}: {
  itens: ItemHistorico[];
  carregando: boolean;
  onAbrir: (i: ItemHistorico) => void;
  onApagar: (i: ItemHistorico) => void;
  podeApagar: boolean;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [marcados, setMarcados] = useState<string[]>([]);
  const selecionados = marcados.map((id) => itens.find((i) => i.id === id)).filter(Boolean) as ItemHistorico[];

  if (carregando) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-[20px]" />
        ))}
      </div>
    );
  }

  if (itens.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 rounded-[20px] border-[var(--border-glass)] p-10 text-center">
        <History className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-foreground">Nenhuma simulação salva ainda</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Use “Salvar no histórico” no simulador ou em um cenário. Cada registro guarda a data, a hora, todos os números e o resultado.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {selecionados.length >= 2 ? (
        <TabelaComparacao
          titulo="Simulações salvas lado a lado"
          colunas={selecionados.map((s) => ({ nome: s.nome, sub: dataHora(s.created_at), r: s.resultado }))}
        />
      ) : (
        <p className="text-xs text-muted-foreground">Marque duas ou mais simulações para comparar lado a lado.</p>
      )}

      <div className="space-y-3">
        {itens.map((i) => {
          const r = i.resultado;
          const e = i.entradas;
          const exp = aberto === i.id;
          return (
            <Card key={i.id} className="gap-0 rounded-[20px] border-[var(--border-glass)] py-0">
              <div className="flex items-start gap-3 p-4">
                <Checkbox
                  className="mt-1"
                  checked={marcados.includes(i.id)}
                  onCheckedChange={(v) => setMarcados(v === true ? [...marcados, i.id] : marcados.filter((x) => x !== i.id))}
                  aria-label="Comparar"
                />
                <button type="button" onClick={() => setAberto(exp ? null : i.id)} className="min-w-0 flex-1 text-left">
                  <p className="text-[11px] text-muted-foreground">{dataHora(i.created_at)}</p>
                  <p className="text-sm font-semibold text-foreground">{i.nome}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fmtQtd(r.pedidos)} pedidos · {fmtPct(e.conversao?.frustracao)} frustração · {fmtQtd(r.pagos)} pagos
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    <SensitiveValue>
                      {fmtMoeda(r.faturamentoPotencial)} potencial · {fmtMoeda(r.faturamento)} faturamento · {fmtMoeda(r.custos.investimento)} investimento ·{" "}
                      {fmtMoeda(r.custoTotal)} custos
                    </SensitiveValue>
                  </p>
                </button>
                <div className="shrink-0 text-right">
                  <p className={cn("text-sm font-semibold tabular-nums", r.lucro < 0 ? "text-danger" : "text-brand")}>
                    <SensitiveValue>{fmtMoeda(r.lucro)}</SensitiveValue>
                  </p>
                  <p className="text-xs tabular-nums text-muted-foreground">ROI {fmtPct(r.roi)}</p>
                  <button
                    type="button"
                    onClick={() => setAberto(exp ? null : i.id)}
                    className="mt-1 inline-flex items-center text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    detalhes <ChevronDown className={cn("ml-0.5 h-3 w-3 transition-transform", exp && "rotate-180")} />
                  </button>
                </div>
              </div>
              {exp && (
                <div className="border-t border-[var(--hairline)] px-4 pb-4 pt-3">
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-3">
                    <Item rotulo="Pedidos" v={fmtQtd(r.pedidos)} />
                    <Item rotulo="Antecipados" v={fmtQtd(r.antecipados)} />
                    <Item rotulo="Agendados" v={fmtQtd(r.agendados)} />
                    <Item rotulo="% frustração" v={fmtPct(e.conversao?.frustracao)} />
                    <Item rotulo="Pedidos pagos" v={fmtQtd(r.pagos)} />
                    <Item rotulo="Kits" v={fmtQtd(r.kits)} />
                    <Item rotulo="Potes" v={fmtQtd(r.potes)} />
                    <Item rotulo="Faturamento" v={fmtMoeda(r.faturamento)} />
                    <Item rotulo="CPA" v={fmtMoeda(e.investimento?.cpa ?? 0)} />
                    {(Object.keys(ROTULO_CUSTO) as (keyof Resultado["custos"])[]).map((k) => (
                      <Item key={k} rotulo={ROTULO_CUSTO[k]} v={fmtMoeda(r.custos[k])} />
                    ))}
                    <Item rotulo="Custo total" v={fmtMoeda(r.custoTotal)} />
                    <Item rotulo="Lucro líquido" v={fmtMoeda(r.lucro)} />
                    <Item rotulo="Margem" v={fmtPct(r.margem)} />
                    <Item rotulo="ROI" v={fmtPct(r.roi)} />
                  </dl>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onAbrir(i)}>
                      <FolderOpen className="h-4 w-4" /> Abrir no simulador
                    </Button>
                    {podeApagar && (
                      <Button size="sm" variant="ghost" className="gap-1.5 text-muted-foreground hover:text-danger" onClick={() => onApagar(i)}>
                        <Trash2 className="h-4 w-4" /> Apagar
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Item({ rotulo, v }: { rotulo: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-[var(--hairline)] py-1">
      <dt className="truncate text-muted-foreground">{rotulo}</dt>
      <dd className="shrink-0 tabular-nums text-foreground">
        <SensitiveValue>{v}</SensitiveValue>
      </dd>
    </div>
  );
}
