"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowRight,
  Boxes,
  CalendarClock,
  Coins,
  Gauge,
  Package,
  Percent,
  Receipt,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { cn, formatCurrency } from "@/lib/utils";
import type { OperacaoReal } from "@/lib/previsibilidade/real";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const qtd = (v: number) => new Intl.NumberFormat("pt-BR").format(v);
const pct = (v: number | null) =>
  v === null || !Number.isFinite(v) ? "—" : `${v.toFixed(1).replace(".", ",")}%`;

/**
 * RESULTADO DA OPERAÇÃO na Visão Geral: pedidos feitos no período e o que
 * aconteceu com eles, todos os custos, lucro líquido e ROI real — separando
 * agendados × antecipados e própria × afiliados.
 */
export function OperacaoRealSection({ from, to, periodo }: { from: string; to: string; periodo: string }) {
  const { data, isLoading } = useSWR<OperacaoReal & { restrito?: boolean; error?: string }>(
    `/api/dashboard/operacao?from=${from}&to=${to}`,
    fetcher,
    { refreshInterval: 60000 }
  );

  if (data?.restrito) return null;
  if (data?.error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        Erro ao calcular o resultado da operação.
      </div>
    );
  }

  const op = data;
  const carregando = isLoading || !op;
  const c = op?.custos;
  const custosTooltip = c
    ? [
        `Plataforma e repasses ${formatCurrency(c.plataforma)}`,
        `Comissão de afiliados ${formatCurrency(c.afiliado)}`,
        `Logística ${formatCurrency(c.logistica)}`,
        `Atendentes ${formatCurrency(c.atendente)}`,
        `Imposto ${formatCurrency(c.imposto)}`,
        `Investimento ${formatCurrency(c.investimento)}`,
      ].join(" · ")
    : undefined;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="live-dot" />
          <h2 className="text-sm font-medium text-muted-foreground">
            Resultado da operação <span className="text-muted-foreground/60">· depois de todos os custos · {periodo}</span>
          </h2>
        </div>
        <Link href="/dashboard/previsibilidade" className="inline-flex items-center gap-1 text-xs text-brand hover:underline">
          Simular na Previsibilidade <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Resultado: 5 cartões (o Investimento já está nos destaques acima).
          Celular 2+2+1, tablet 3+2 numa grade de 6, tela larga 5 iguais. */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-6 sm:gap-3 xl:grid-cols-5">
        <KpiCard
          compact
          itemClassName="sm:col-span-3 xl:col-span-1"
          loading={carregando}
          icon={Coins}
          data={{
            label: "Faturamento",
            value: op?.faturamento ?? 0,
            formatted: formatCurrency(op?.faturamento ?? 0),
            tooltip: "Valor bruto dos pedidos do período que já foram pagos (própria + afiliados)",
            color: "brand",
          }}
        />
        <KpiCard
          compact
          itemClassName="sm:col-span-3 xl:col-span-1"
          loading={carregando}
          icon={Receipt}
          data={{
            label: "Custos totais",
            value: op?.custoTotal ?? 0,
            formatted: formatCurrency(op?.custoTotal ?? 0),
            tooltip: custosTooltip,
            color: "danger",
          }}
        />
        <KpiCard
          compact
          itemClassName="sm:col-span-2 xl:col-span-1"
          loading={carregando}
          icon={Zap}
          data={{
            label: "Lucro líquido",
            value: op?.lucro ?? 0,
            formatted: formatCurrency(op?.lucro ?? 0),
            tooltip: "Faturamento − custos totais. O estoque não desconta (já foi pago — regra da Análise de Lucro).",
            color: (op?.lucro ?? 0) >= 0 ? "success" : "danger",
          }}
        />
        <KpiCard
          compact
          itemClassName="sm:col-span-2 xl:col-span-1"
          loading={carregando}
          icon={Percent}
          data={{
            label: "Margem líquida",
            value: op?.margem ?? 0,
            formatted: pct(op?.margem ?? null),
            tooltip: "Lucro líquido ÷ faturamento",
            color: (op?.margem ?? 0) >= 0 ? "brand" : "danger",
          }}
        />
        <KpiCard
          compact
          itemClassName="col-span-2 sm:col-span-2 xl:col-span-1"
          loading={carregando}
          icon={TrendingUp}
          data={{
            label: "ROI real",
            value: op?.roi ?? 0,
            formatted: pct(op?.roi ?? null),
            tooltip: "Lucro líquido ÷ investimento — o retorno depois de TODOS os custos (não é ROAS)",
            color: (op?.roi ?? 0) >= 0 ? "brand" : "danger",
          }}
        />
      </div>

      {/* Agendados × antecipados — nunca misturados */}
      <div className="grid gap-3 lg:grid-cols-2">
        <PainelTipo
          titulo="Pedidos agendados"
          sub="AfterPay — paga quando recebe"
          icone={<CalendarClock className="h-4 w-4" />}
          cor="#60a5fa"
          carregando={carregando}
          itens={[
            { rotulo: "Total", valor: qtd(op?.agendados.total ?? 0) },
            { rotulo: "Pagos", valor: qtd(op?.agendados.pagos ?? 0), tom: "brand" },
            { rotulo: "Frustrados", valor: qtd(op?.agendados.frustrados ?? 0), tom: "danger" },
            { rotulo: "Faturamento", valor: <SensitiveValue>{formatCurrency(op?.agendados.faturamento ?? 0)}</SensitiveValue> },
          ]}
          rodape={
            op && (
              <>
                {qtd(op.agendados.emAberto)} em aberto · frustração {pct(op.taxaFrustracao)}
                {op.previsao.decididos > 0 && ` (de ${qtd(op.previsao.decididos)} decididos)`}
                {op.previsao.emAberto > 0 && op.previsao.taxaPagamento === null && (
                  <> · previsão quando houver 10 agendados decididos (pagos ou frustrados)</>
                )}
                {op.previsao.emAberto > 0 && op.previsao.taxaPagamento !== null && (
                  <>
                    {" "}· se pagarem na taxa atual ({pct(op.previsao.taxaPagamento)}): +
                    <SensitiveValue>{formatCurrency(op.previsao.faturamentoExtra)}</SensitiveValue>, lucro previsto{" "}
                    <SensitiveValue>
                      <span className={op.previsao.lucroPrevisto < 0 ? "text-danger" : "text-brand"}>
                        {formatCurrency(op.previsao.lucroPrevisto)}
                      </span>
                    </SensitiveValue>
                  </>
                )}
              </>
            )
          }
        />
        <PainelTipo
          titulo="Pedidos antecipados"
          sub="Pagam antes de sair (inclui recuperação)"
          icone={<Gauge className="h-4 w-4" />}
          cor="#10b981"
          carregando={carregando}
          itens={[
            { rotulo: "Total", valor: qtd(op?.antecipados.total ?? 0) },
            { rotulo: "Pagos", valor: qtd(op?.antecipados.pagos ?? 0), tom: "brand" },
            { rotulo: "Não pagos", valor: qtd(op?.antecipados.naoPagos ?? 0), tom: "danger" },
            { rotulo: "Faturamento", valor: <SensitiveValue>{formatCurrency(op?.antecipados.faturamento ?? 0)}</SensitiveValue> },
          ]}
          rodape={op && op.antecipados.aguardando > 0 ? `${qtd(op.antecipados.aguardando)} Pix/boleto aguardando pagamento` : undefined}
        />
      </div>

      {/* Própria × afiliados + volumes */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <ProprioAfiliadosReal op={op} carregando={carregando} />
        <div className="grid grid-cols-3 gap-2.5 lg:grid-cols-1">
          <KpiCard
            compact
            loading={carregando}
            icon={XCircle}
            data={{
              label: "Pedidos frustrados",
              value: op?.agendados.frustrados ?? 0,
              formatted: qtd(op?.agendados.frustrados ?? 0),
              subtitle: `taxa ${pct(op?.taxaFrustracao ?? null)}`,
              color: "danger",
            }}
          />
          <KpiCard
            compact
            loading={carregando}
            icon={Boxes}
            data={{
              label: "Kits vendidos",
              value: op?.kits ?? 0,
              formatted: qtd(op?.kits ?? 0),
              subtitle: `${qtd(op?.enviados ?? 0)} pedidos saíram`,
              color: "neutral",
            }}
          />
          <KpiCard
            compact
            loading={carregando}
            icon={Package}
            data={{
              label: "Potes vendidos",
              value: op?.potes ?? 0,
              formatted: qtd(op?.potes ?? 0),
              subtitle: op ? `${qtd(op.estoque.potes)} saíram do estoque` : undefined,
              tooltip: op ? `Estoque que saiu: ${qtd(op.estoque.potes)} potes (${formatCurrency(op.estoque.valor)}) — já pago, não desconta` : undefined,
              color: "neutral",
            }}
          />
        </div>
      </div>
    </section>
  );
}

function PainelTipo({
  titulo,
  sub,
  icone,
  cor,
  itens,
  rodape,
  carregando,
}: {
  titulo: string;
  sub: string;
  icone: ReactNode;
  cor: string;
  itens: { rotulo: string; valor: ReactNode; tom?: "brand" | "danger" }[];
  rodape?: ReactNode;
  carregando: boolean;
}) {
  return (
    <Card className="gap-0 rounded-[20px] border-[var(--border-glass)] py-0">
      <div className="flex items-center gap-3 px-4 pt-4 sm:px-5">
        <span className="icon-tile h-8 w-8 shrink-0" style={{ ["--tile" as string]: cor }}>
          {icone}
        </span>
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold tracking-tight text-foreground">{titulo}</h3>
          <p className="text-[11px] text-muted-foreground">{sub}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4 sm:px-5">
        {itens.map((i) => (
          <div key={i.rotulo} className="min-w-0 rounded-xl bg-[var(--glass-1)] px-3 py-2.5">
            <p className="truncate text-[11px] text-muted-foreground">{i.rotulo}</p>
            {carregando ? (
              <Skeleton className="mt-1 h-5 w-16" />
            ) : (
              <p
                className={cn(
                  "truncate text-[17px] font-semibold tabular-nums",
                  i.tom === "brand" ? "text-brand" : i.tom === "danger" ? "text-danger" : "text-foreground"
                )}
              >
                {i.valor}
              </p>
            )}
          </div>
        ))}
      </div>
      {rodape && !carregando && <p className="border-t border-[var(--hairline)] px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground sm:px-5">{rodape}</p>}
    </Card>
  );
}

function ProprioAfiliadosReal({ op, carregando }: { op?: OperacaoReal; carregando: boolean }) {
  const M = ({ v, forte }: { v: number; forte?: boolean }) => (
    <SensitiveValue>
      <span className={cn(forte && "font-semibold", forte && (v < 0 ? "text-danger" : "text-brand"))}>{formatCurrency(v)}</span>
    </SensitiveValue>
  );
  const p = op?.propria;
  const a = op?.afiliados;
  const linhas: { rotulo: string; p: ReactNode; a: ReactNode; t: ReactNode; forte?: boolean }[] =
    p && a
      ? [
          { rotulo: "Pedidos", p: qtd(p.pedidos), a: qtd(a.pedidos), t: qtd(p.pedidos + a.pedidos) },
          { rotulo: "Agendamentos", p: qtd(p.agendamentos), a: qtd(a.agendamentos), t: qtd(p.agendamentos + a.agendamentos) },
          { rotulo: "Pedidos pagos", p: qtd(p.pagos), a: qtd(a.pagos), t: qtd(p.pagos + a.pagos) },
          { rotulo: "Faturamento", p: <M v={p.faturamento} />, a: <M v={a.faturamento} />, t: <M v={p.faturamento + a.faturamento} /> },
          { rotulo: "Comissão de afiliado", p: "—", a: <M v={a.comissao} />, t: <M v={a.comissao} /> },
          { rotulo: "Custos", p: <M v={p.custos} />, a: <M v={a.custos} />, t: <M v={p.custos + a.custos} /> },
          { rotulo: "Lucro", p: <M v={p.lucro} forte />, a: <M v={a.lucro} forte />, t: <M v={p.lucro + a.lucro} forte />, forte: true },
        ]
      : [];
  return (
    <Card className="gap-0 rounded-[20px] border-[var(--border-glass)] py-0">
      <div className="px-4 pt-4 sm:px-5">
        <h3 className="text-[14px] font-semibold tracking-tight text-foreground">Operação própria × afiliados</h3>
        <p className="text-[11px] text-muted-foreground">
          Própria paga o tráfego e as atendentes; afiliados custam a comissão. Faturamento e lucro total = própria + afiliados.
        </p>
      </div>
      <div className="overflow-x-auto px-2 pb-3 pt-2 sm:px-5">
        {carregando ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : (
          <table className="w-full min-w-[340px] text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="py-1.5 text-left font-normal" />
                <th className="py-1.5 text-right font-normal">Própria</th>
                <th className="py-1.5 text-right font-normal text-info">Afiliados</th>
                <th className="py-1.5 text-right font-normal">Total</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.rotulo} className={cn("border-t border-[var(--hairline)]", l.forte && "bg-[var(--glass-1)]")}>
                  <td className="py-2 pr-2 text-xs text-muted-foreground">{l.rotulo}</td>
                  <td className="py-2 text-right tabular-nums">{l.p}</td>
                  <td className="py-2 text-right tabular-nums">{l.a}</td>
                  <td className="py-2 text-right tabular-nums">{l.t}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}
