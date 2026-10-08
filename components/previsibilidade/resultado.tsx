"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import { cn } from "@/lib/utils";
import { fmtMoeda, fmtPct, fmtQtd } from "./campos";
import type { Entradas, Resultado } from "@/lib/previsibilidade/calculo";

type ChaveCusto = keyof Resultado["custos"];

export const ROTULO_CUSTO: Record<ChaveCusto, string> = {
  produto: "Custo do produto",
  logistica: "Logística",
  atendente: "Atendente",
  plataforma: "Plataforma",
  afiliado: "Comissão de afiliado",
  imposto: "Imposto",
  investimento: "Investimento (tráfego)",
  outros: "Outros custos",
};

/** Qual custo está ligado nas entradas (para dizer o que foi aplicado). */
export function custosLigados(e: Entradas): Record<ChaveCusto, boolean> {
  return {
    produto: e.produto.ativo,
    logistica: e.logistica.ativo,
    atendente: e.atendente.percentualAtivo || e.atendente.fixoAtivo,
    plataforma: e.plataforma.ativo,
    afiliado: e.afiliados.ativo,
    imposto: e.imposto.ativo,
    investimento: true,
    outros: e.outros.fixos > 0,
  };
}

function Dinheiro({ v, className }: { v: number; className?: string }) {
  return (
    <SensitiveValue>
      <span className={className}>{fmtMoeda(v)}</span>
    </SensitiveValue>
  );
}

export function PainelResultado({ e, r, empate }: { e: Entradas; r: Resultado; empate: number | null }) {
  const ligados = custosLigados(e);
  const chaves = Object.keys(ROTULO_CUSTO) as ChaveCusto[];
  const aplicados = chaves.filter((k) => ligados[k] && r.custos[k] > 0);
  const desligados = chaves.filter((k) => !ligados[k] && k !== "outros");
  const base = Math.max(r.faturamento, 1);
  const positivo = r.lucro >= 0;

  return (
    <Card className="gap-0 overflow-hidden rounded-[20px] border-[var(--border-glass)] py-0">
      {/* LUCRO e ROI em destaque */}
      <div
        className="ambient relative p-5"
        style={{ ["--tone" as string]: positivo ? "rgba(16,185,129,0.22)" : "rgba(244,63,94,0.22)" }}
      >
        <div className="relative z-10 grid grid-cols-2 gap-4">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Lucro líquido</p>
            <p
              className={cn(
                "metric mt-1 truncate text-[26px] sm:text-[30px]",
                positivo
                  ? "text-metal-fade"
                  : "bg-[linear-gradient(90deg,#fda4af,#f43f5e_60%,#be123c)] bg-clip-text text-transparent"
              )}
            >
              <SensitiveValue>{fmtMoeda(r.lucro)}</SensitiveValue>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Margem <span className={cn("font-semibold", positivo ? "text-brand" : "text-danger")}>{fmtPct(r.margem)}</span>
            </p>
          </div>
          <div className="min-w-0 text-right">
            <p className="text-xs text-muted-foreground">ROI real</p>
            <p className={cn("metric mt-1 text-[26px] sm:text-[30px]", r.roi !== null && r.roi < 0 ? "text-danger" : "text-brand")}>
              {fmtPct(r.roi)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">lucro ÷ investimento</p>
          </div>
        </div>
      </div>

      {/* Cadeia: pedidos → frustração → pagos */}
      <div className="border-t border-[var(--hairline)] px-5 py-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{fmtQtd(r.pedidos)} pedidos</span>
          <span className="text-danger">− {fmtQtd(r.frustrados + r.antecipadosNaoPagos)} não pagos</span>
          <span className="font-semibold text-brand">= {fmtQtd(r.pagos)} pagos</span>
        </div>
        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-brand" style={{ width: `${r.pedidos > 0 ? (r.pagos / r.pedidos) * 100 : 0}%` }} />
          <div className="h-full bg-danger/80" style={{ width: `${r.pedidos > 0 ? ((r.frustrados + r.antecipadosNaoPagos) / r.pedidos) * 100 : 0}%` }} />
        </div>
      </div>

      {/* Faturamento − custos = lucro */}
      <div className="space-y-1.5 border-t border-[var(--hairline)] px-5 py-4 text-sm">
        <Linha rotulo={`Faturamento (${fmtQtd(r.pagos)} pagos)`} valor={<Dinheiro v={r.faturamento} className="font-semibold text-brand" />} />
        <p className="pb-1 text-[11px] text-muted-foreground/70">
          Potencial com 100% pago: <Dinheiro v={r.faturamentoPotencial} />
        </p>
        {aplicados.length === 0 && <p className="text-xs text-muted-foreground">Nenhum custo aplicado.</p>}
        {aplicados.map((k) => (
          <div key={k}>
            <Linha
              rotulo={ROTULO_CUSTO[k]}
              valor={<Dinheiro v={-r.custos[k]} className="tabular-nums text-foreground/90" />}
              extra={<span className="w-12 text-right text-[11px] tabular-nums text-muted-foreground">{fmtPct((r.custos[k] / base) * 100)}</span>}
            />
            <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-danger/60" style={{ width: `${Math.min((r.custos[k] / base) * 100, 100)}%` }} />
            </div>
          </div>
        ))}
        <div className="!mt-3 border-t border-[var(--hairline)] pt-2">
          <Linha rotulo="Custo total" valor={<Dinheiro v={-r.custoTotal} className="font-semibold text-danger" />} />
          <Linha
            rotulo="Lucro líquido"
            valor={<Dinheiro v={r.lucro} className={cn("text-base font-bold", positivo ? "text-brand" : "text-danger")} />}
          />
        </div>
        {desligados.length > 0 && (
          <p className="pt-1 text-[11px] text-muted-foreground/70">Desligados: {desligados.map((k) => ROTULO_CUSTO[k]).join(", ")}.</p>
        )}
      </div>

      {/* Indicadores secundários */}
      <div className="grid grid-cols-2 gap-px border-t border-[var(--hairline)] bg-[var(--hairline)] text-xs sm:grid-cols-4">
        <Mini rotulo="Retorno sobre tudo que saiu" valor={fmtPct(r.roiSobreCustos)} />
        <Mini rotulo="CPA por pago" valor={r.cpaPago === null ? "—" : fmtMoeda(r.cpaPago)} />
        <Mini rotulo="ROAS (só referência)" valor={r.roas === null ? "—" : `${r.roas.toFixed(2).replace(".", ",")}x`} />
        <Mini rotulo="Kits · potes que saem" valor={`${fmtQtd(r.kits)} · ${fmtQtd(r.potes)}`} />
      </div>

      {/* Sensibilidade à frustração */}
      <div className="border-t border-[var(--hairline)] px-5 py-4 text-xs leading-relaxed text-muted-foreground">
        Cada <strong className="text-foreground">1 ponto</strong> a mais de frustração tira{" "}
        <strong className="text-danger">
          <SensitiveValue>{fmtMoeda(r.custoPorPontoFrustracao)}</SensitiveValue>
        </strong>{" "}
        do lucro.{" "}
        {empate === null ? (
          "O lucro não zera nem com 100% de frustração."
        ) : empate <= 0 ? (
          <span className="text-danger">Mesmo sem nenhuma frustração a operação dá prejuízo.</span>
        ) : (
          <>
            O lucro zera com <strong className="text-warning">{fmtPct(empate)}</strong> de frustração.
          </>
        )}
      </div>

      {e.afiliados.ativo && <ProprioAfiliados r={r} />}
    </Card>
  );
}

function Linha({ rotulo, valor, extra }: { rotulo: string; valor: ReactNode; extra?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0 truncate text-muted-foreground">{rotulo}</span>
      <span className="flex shrink-0 items-center gap-2">
        {valor}
        {extra}
      </span>
    </div>
  );
}

function Mini({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="bg-card px-4 py-3">
      <p className="truncate text-[11px] text-muted-foreground">{rotulo}</p>
      <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-foreground">
        <SensitiveValue>{valor}</SensitiveValue>
      </p>
    </div>
  );
}

/** Operação própria × afiliados, com o total. */
export function ProprioAfiliados({ r }: { r: Resultado }) {
  const linhas: { rotulo: string; p: ReactNode; a: ReactNode; t: ReactNode }[] = [
    { rotulo: "Pedidos", p: fmtQtd(r.propria.pedidos), a: fmtQtd(r.afiliados.pedidos), t: fmtQtd(r.pedidos) },
    { rotulo: "Agendamentos", p: fmtQtd(r.propria.agendados), a: fmtQtd(r.afiliados.agendados), t: fmtQtd(r.agendados) },
    { rotulo: "Pagos", p: fmtQtd(r.propria.pagos), a: fmtQtd(r.afiliados.pagos), t: fmtQtd(r.pagos) },
    { rotulo: "Faturamento", p: <Dinheiro v={r.propria.faturamento} />, a: <Dinheiro v={r.afiliados.faturamento} />, t: <Dinheiro v={r.faturamento} /> },
    { rotulo: "Comissão", p: "—", a: <Dinheiro v={r.afiliados.custos.afiliado} />, t: <Dinheiro v={r.custos.afiliado} /> },
    { rotulo: "Custos", p: <Dinheiro v={r.propria.custoTotal} />, a: <Dinheiro v={r.afiliados.custoTotal} />, t: <Dinheiro v={r.custoTotal} /> },
    {
      rotulo: "Lucro",
      p: <Dinheiro v={r.propria.lucro} className={r.propria.lucro < 0 ? "text-danger" : "text-brand"} />,
      a: <Dinheiro v={r.afiliados.lucro} className={r.afiliados.lucro < 0 ? "text-danger" : "text-brand"} />,
      t: <Dinheiro v={r.lucro} className={cn("font-semibold", r.lucro < 0 ? "text-danger" : "text-brand")} />,
    },
  ];
  return (
    <div className="border-t border-[var(--hairline)] px-5 py-4">
      <p className="mb-2 text-xs font-medium text-foreground">Operação própria × afiliados</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[300px] text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="py-1 text-left font-normal" />
              <th className="py-1 text-right font-normal">Própria</th>
              <th className="py-1 text-right font-normal text-info">Afiliados</th>
              <th className="py-1 text-right font-normal">Total</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.rotulo} className="border-t border-[var(--hairline)]">
                <td className="py-1.5 text-muted-foreground">{l.rotulo}</td>
                <td className="py-1.5 text-right tabular-nums">{l.p}</td>
                <td className="py-1.5 text-right tabular-nums">{l.a}</td>
                <td className="py-1.5 text-right tabular-nums">{l.t}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
