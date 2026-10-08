"use client";

import { useState } from "react";
import {
  Boxes,
  Calculator,
  Handshake,
  Headset,
  Landmark,
  Megaphone,
  Package,
  Percent,
  ShoppingCart,
  Truck,
  Wallet,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import {
  CampoAuto,
  CampoNumero,
  CampoPercentual,
  Escolha,
  Leitura,
  LinhaToggle,
  Secao,
  fmtMoeda,
  fmtPct,
  fmtQtd,
} from "./campos";
import { simularTrafego, type Entradas, type Resultado } from "@/lib/previsibilidade/calculo";

type Up = <K extends keyof Entradas>(k: K, patch: Partial<Entradas[K]>) => void;

export function PainelEntradas({
  e,
  r,
  onChange,
}: {
  e: Entradas;
  r: Resultado;
  onChange: (e: Entradas) => void;
}) {
  const up: Up = (k, patch) => onChange({ ...e, [k]: { ...e[k], ...patch } });

  const kitsPorPedido = e.faturamento.kitsPorPedido || 1;
  const kitsAuto = r.enviados * kitsPorPedido;
  const potesAuto = r.kits * e.faturamento.potesPorKit;
  const logisticaAuto = r.enviados * e.logistica.custoPorPedido + e.logistica.outros;
  const investimentoAuto = r.propria.pedidos * e.investimento.cpa;

  return (
    <div className="space-y-4">
      {/* ------------------------------ PEDIDOS ------------------------------ */}
      <Secao
        titulo="Pedidos"
        descricao="Quantos pedidos vão (ou já estão) na rua. Agendado paga quando recebe; antecipado paga antes de sair."
        icone={<ShoppingCart className="h-4 w-4" />}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <CampoNumero label="Pedidos agendados" value={e.pedidos.agendados} min={0} onChange={(v) => up("pedidos", { agendados: v ?? 0 })} />
          <CampoNumero label="Pedidos antecipados" value={e.pedidos.antecipados} min={0} onChange={(v) => up("pedidos", { antecipados: v ?? 0 })} />
          <Leitura rotulo="Total de pedidos" valor={fmtQtd(r.pedidos)} destaque />
          <CampoNumero
            label="Agendados que já pagaram"
            value={e.pedidos.agendadosJaPagos}
            min={0}
            onChange={(v) => up("pedidos", { agendadosJaPagos: v ?? 0 })}
            dica="Para acompanhar com os pedidos na rua"
          />
          <CampoNumero
            label="Leads / conversas (opcional)"
            value={e.conversao.leads || null}
            permiteVazio
            min={0}
            onChange={(v) => up("conversao", { leads: v ?? 0 })}
            dica="Só para a % de conversão"
          />
          <Leitura rotulo="% de conversão" valor={r.taxaConversao === null ? "—" : fmtPct(r.taxaConversao)} />
        </div>
      </Secao>

      {/* ----------------------------- CONVERSÃO ----------------------------- */}
      <Secao
        titulo="Conversão"
        descricao="Frustrado = agendado que saiu e não pagou. Mexa e veja o lucro mudar na hora."
        icone={<Percent className="h-4 w-4" />}
      >
        <div className="space-y-4">
          <CampoPercentual
            label="% de frustração (agendados)"
            value={e.conversao.frustracao}
            onChange={(v) => up("conversao", { frustracao: v })}
            max={60}
            passo={0.5}
            tom="danger"
            rapidos={[10, 15, 20, 25, 30]}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <CampoNumero
              label="% de agendados pagos"
              value={Math.round((100 - e.conversao.frustracao) * 100) / 100}
              sufixo="%"
              min={0}
              max={100}
              onChange={(v) => up("conversao", { frustracao: 100 - (v ?? 100) })}
            />
            <Leitura rotulo="Frustrados" valor={fmtQtd(r.frustrados)} tom="danger" />
            <Leitura rotulo="Pedidos pagos (total)" valor={`${fmtQtd(r.pagos)} · ${fmtPct(r.taxaPagos)}`} tom="brand" destaque />
          </div>
          {e.pedidos.antecipados > 0 && (
            <CampoPercentual
              label="% de antecipados que não pagam"
              value={e.conversao.naoPagamentoAntecipado}
              onChange={(v) => up("conversao", { naoPagamentoAntecipado: v })}
              max={60}
              passo={0.5}
              tom="warning"
              dica="Pix/boleto que vence sem pagar. Não sai produto, então não tem frete nem custo de produto."
            />
          )}
        </div>
      </Secao>

      {/* ----------------------------- FATURAMENTO ---------------------------- */}
      <Secao
        titulo="Faturamento"
        descricao="Só pedido pago fatura."
        icone={<Wallet className="h-4 w-4" />}
        valor={r.faturamento}
        valorRotulo="previsto"
        tomValor="receita"
      >
        <div className="space-y-3">
          <Escolha
            opcoes={[
              { valor: "ticket", rotulo: "Valor médio por pedido" },
              { valor: "kit", rotulo: "Valor do kit" },
            ]}
            valor={e.faturamento.base}
            onChange={(v) => up("faturamento", { base: v })}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {e.faturamento.base === "ticket" ? (
              <CampoNumero label="Valor médio por pedido" prefixo="R$" value={e.faturamento.ticketMedio} min={0} onChange={(v) => up("faturamento", { ticketMedio: v ?? 0 })} />
            ) : (
              <CampoNumero label="Valor do kit" prefixo="R$" value={e.faturamento.valorKit} min={0} onChange={(v) => up("faturamento", { valorKit: v ?? 0 })} />
            )}
            <CampoNumero label="Kits por pedido (média)" value={e.faturamento.kitsPorPedido} min={0} onChange={(v) => up("faturamento", { kitsPorPedido: v ?? 1 })} />
            <CampoNumero label="Potes por kit (média)" value={e.faturamento.potesPorKit} min={0} onChange={(v) => up("faturamento", { potesPorKit: v ?? 0 })} />
            <CampoAuto label="Kits que saem" manual={e.faturamento.kitsManual} auto={kitsAuto} onChange={(v) => up("faturamento", { kitsManual: v })} />
            <CampoAuto label="Potes que saem" manual={e.faturamento.potesManual} auto={potesAuto} onChange={(v) => up("faturamento", { potesManual: v })} />
            <Leitura rotulo="Ticket por pedido pago" valor={<SensitiveValue>{fmtMoeda(r.ticket)}</SensitiveValue>} />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Leitura rotulo="Potencial (100% pago)" valor={<SensitiveValue>{fmtMoeda(r.faturamentoPotencial)}</SensitiveValue>} />
            <Leitura rotulo="Previsto (após frustração)" valor={<SensitiveValue>{fmtMoeda(r.faturamento)}</SensitiveValue>} tom="brand" destaque />
            <Leitura rotulo="Já recebido" valor={<SensitiveValue>{fmtMoeda(r.jaRecebido)}</SensitiveValue>} />
            <Leitura rotulo="Falta receber" valor={<SensitiveValue>{fmtMoeda(r.faltaReceber)}</SensitiveValue>} tom="info" />
          </div>
          <p className="text-[11px] text-muted-foreground/70">
            Kits e potes que saem = pedidos enviados ({fmtQtd(r.enviados)}): todo agendado (o frustrado também saiu) + antecipados pagos.
          </p>
        </div>
      </Secao>

      {/* ------------------------------ PRODUTO ------------------------------ */}
      <Secao
        titulo="Custo dos produtos"
        descricao="Sobre o que sai: kits e potes dos pedidos enviados."
        icone={<Package className="h-4 w-4" />}
        ativo={e.produto.ativo}
        onAtivo={(v) => up("produto", { ativo: v })}
        valor={r.custos.produto}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <CampoNumero label="Custo do kit" prefixo="R$" value={e.produto.custoKit} min={0} onChange={(v) => up("produto", { custoKit: v ?? 0 })} />
          <CampoNumero label="Custo por pote" prefixo="R$" value={e.produto.custoPote} min={0} onChange={(v) => up("produto", { custoPote: v ?? 0 })} />
          <CampoNumero label="Outros (por pedido)" prefixo="R$" value={e.produto.outrosPorPedido} min={0} onChange={(v) => up("produto", { outrosPorPedido: v ?? 0 })} dica="Embalagem, brinde, bula…" />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground/70">
          Na Análise de Lucro o estoque não desconta (já foi pago antes). Aqui você escolhe: desligue para simular igual.
        </p>
      </Secao>

      {/* ----------------------------- LOGÍSTICA ----------------------------- */}
      <Secao
        titulo="Logística"
        descricao="Pedidos enviados × custo por pedido + outros."
        icone={<Truck className="h-4 w-4" />}
        ativo={e.logistica.ativo}
        onAtivo={(v) => up("logistica", { ativo: v })}
        valor={r.custos.logistica}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <CampoNumero label="Custo por pedido" prefixo="R$" value={e.logistica.custoPorPedido} min={0} onChange={(v) => up("logistica", { custoPorPedido: v ?? 0 })} />
          <CampoNumero label="Outros custos logísticos" prefixo="R$" value={e.logistica.outros} min={0} onChange={(v) => up("logistica", { outros: v ?? 0 })} dica="Valor fixo no período" />
          <CampoAuto label="Total de logística" prefixo="R$" manual={e.logistica.totalManual} auto={logisticaAuto} onChange={(v) => up("logistica", { totalManual: v })} />
        </div>
      </Secao>

      {/* ------------------------------ ATENDENTE ----------------------------- */}
      <Secao
        titulo="Atendente"
        descricao="Escolha percentual, valor fixo, os dois ou nenhum."
        icone={<Headset className="h-4 w-4" />}
        valor={r.custos.atendente}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <LinhaToggle titulo="Taxa percentual" ativo={e.atendente.percentualAtivo} onAtivo={(v) => up("atendente", { percentualAtivo: v })}>
            <CampoNumero label="% sobre o faturamento pago" sufixo="%" value={e.atendente.percentual} min={0} max={100} onChange={(v) => up("atendente", { percentual: v ?? 0 })} />
          </LinhaToggle>
          <LinhaToggle titulo="Custo fixo" ativo={e.atendente.fixoAtivo} onAtivo={(v) => up("atendente", { fixoAtivo: v })}>
            <div className="space-y-2">
              <CampoNumero label="Valor fixo" prefixo="R$" value={e.atendente.fixo} min={0} onChange={(v) => up("atendente", { fixo: v ?? 0 })} />
              <Escolha
                opcoes={[
                  { valor: "venda", rotulo: "por venda paga" },
                  { valor: "pedido", rotulo: "por pedido" },
                  { valor: "total", rotulo: "no período" },
                ]}
                valor={e.atendente.fixoPor}
                onChange={(v) => up("atendente", { fixoPor: v })}
              />
            </div>
          </LinhaToggle>
        </div>
        {e.afiliados.ativo && (
          <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={e.atendente.incluiAfiliados} onCheckedChange={(v) => up("atendente", { incluiAfiliados: v === true })} />
            A atendente também atende os pedidos de afiliados
          </label>
        )}
      </Secao>

      {/* ------------------------------ PLATAFORMA ---------------------------- */}
      <Secao
        titulo="Plataforma"
        descricao="Taxa do gateway sobre o faturamento pago."
        icone={<Landmark className="h-4 w-4" />}
        ativo={e.plataforma.ativo}
        onAtivo={(v) => up("plataforma", { ativo: v })}
        valor={r.custos.plataforma}
      >
        <div className="grid grid-cols-2 gap-3">
          <CampoNumero label="Taxa da plataforma" sufixo="%" value={e.plataforma.percentual} min={0} max={100} onChange={(v) => up("plataforma", { percentual: v ?? 0 })} />
          <CampoNumero label="Fixo por venda" prefixo="R$" value={e.plataforma.fixoPorVenda} min={0} onChange={(v) => up("plataforma", { fixoPorVenda: v ?? 0 })} />
        </div>
      </Secao>

      {/* ------------------------------ AFILIADOS ----------------------------- */}
      <Secao
        titulo="Afiliados"
        descricao="Calcular comissão de afiliado? A parte dos afiliados não paga tráfego — o custo é a comissão."
        icone={<Handshake className="h-4 w-4" />}
        valor={r.custos.afiliado}
      >
        <div className="space-y-3">
          <Escolha
            opcoes={[
              { valor: "sim", rotulo: "Sim" },
              { valor: "nao", rotulo: "Não" },
            ]}
            valor={e.afiliados.ativo ? "sim" : "nao"}
            onChange={(v) => up("afiliados", { ativo: v === "sim" })}
          />
          {e.afiliados.ativo && (
            <>
              <CampoPercentual
                label="% dos pedidos que vêm de afiliados"
                value={e.afiliados.participacao}
                onChange={(v) => up("afiliados", { participacao: v })}
                tom="info"
              />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <CampoNumero label="Comissão do afiliado" sufixo="%" value={e.afiliados.comissao} min={0} max={100} onChange={(v) => up("afiliados", { comissao: v ?? 0 })} />
                <Leitura rotulo="Pedidos de afiliados" valor={fmtQtd(r.afiliados.pedidos)} tom="info" />
                <Leitura rotulo="Pagos de afiliados" valor={fmtQtd(r.afiliados.pagos)} tom="info" />
              </div>
            </>
          )}
        </div>
      </Secao>

      {/* ------------------------------- IMPOSTOS ----------------------------- */}
      <Secao
        titulo="Impostos"
        descricao="Sobre o faturamento pago."
        icone={<Receipt className="h-4 w-4" />}
        ativo={e.imposto.ativo}
        onAtivo={(v) => up("imposto", { ativo: v })}
        valor={r.custos.imposto}
      >
        <CampoNumero label="Percentual do imposto" sufixo="%" value={e.imposto.percentual} min={0} max={100} onChange={(v) => up("imposto", { percentual: v ?? 0 })} className="max-w-[200px]" />
      </Secao>

      {/* ----------------------------- INVESTIMENTO --------------------------- */}
      <Secao
        titulo="Investimento"
        descricao="Tráfego da operação própria: pedidos próprios × CPA."
        icone={<Megaphone className="h-4 w-4" />}
        valor={r.custos.investimento}
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <CampoNumero label="CPA por pedido" prefixo="R$" value={e.investimento.cpa} min={0} onChange={(v) => up("investimento", { cpa: v ?? 0 })} />
          <CampoAuto label="Investimento em anúncio" prefixo="R$" manual={e.investimento.totalManual} auto={investimentoAuto} onChange={(v) => up("investimento", { totalManual: v })} />
          <Leitura rotulo="CPA por pedido pago" valor={r.cpaPago === null ? "—" : <SensitiveValue>{fmtMoeda(r.cpaPago)}</SensitiveValue>} />
        </div>
        <div className="mt-3">
          <LinhaToggle
            titulo="Imposto da Meta sobre o anúncio"
            ativo={e.investimento.impostoAnuncioAtivo}
            onAtivo={(v) => up("investimento", { impostoAnuncioAtivo: v })}
          >
            <CampoNumero label="Percentual" sufixo="%" value={e.investimento.impostoAnuncio} min={0} max={100} onChange={(v) => up("investimento", { impostoAnuncio: v ?? 0 })} className="max-w-[200px]" />
          </LinhaToggle>
        </div>
        <SimuladorTrafego
          cpaInicial={e.investimento.cpa}
          onUsar={(pedidos, cpa) => {
            // Mantém a proporção agendados/antecipados atual.
            const total = e.pedidos.agendados + e.pedidos.antecipados;
            const fatiaAg = total > 0 ? e.pedidos.agendados / total : 1;
            // Pedidos de tráfego são os próprios: com afiliados, o total cresce na proporção.
            const partPr = e.afiliados.ativo ? 1 - e.afiliados.participacao / 100 : 1;
            const totalNovo = partPr > 0 ? pedidos / partPr : pedidos;
            const ag = Math.round(totalNovo * fatiaAg);
            onChange({
              ...e,
              pedidos: { ...e.pedidos, agendados: ag, antecipados: Math.round(totalNovo) - ag },
              investimento: { ...e.investimento, cpa, totalManual: null },
            });
          }}
        />
      </Secao>

      {/* -------------------------------- OUTROS ------------------------------ */}
      <Secao
        titulo="Outros custos"
        descricao="Custos fixos da operação no período (ferramentas, equipe fixa…)."
        icone={<Boxes className="h-4 w-4" />}
        valor={r.custos.outros}
      >
        <CampoNumero label="Outros custos fixos" prefixo="R$" value={e.outros.fixos} min={0} onChange={(v) => up("outros", { fixos: v ?? 0 })} className="max-w-[240px]" />
      </Secao>
    </div>
  );
}

/** CPA × vendas = investimento · investimento ÷ CPA = vendas. */
function SimuladorTrafego({ cpaInicial, onUsar }: { cpaInicial: number; onUsar: (pedidos: number, cpa: number) => void }) {
  const [modo, setModo] = useState<"vendas" | "investimento">("vendas");
  const [cpa, setCpa] = useState<number>(cpaInicial || 120);
  const [vendas, setVendas] = useState<number>(100);
  const [investimento, setInvestimento] = useState<number>(15000);
  const r = simularTrafego(modo === "vendas" ? { cpa, vendas } : { cpa, investimento });

  return (
    <div className="mt-4 rounded-xl border border-dashed border-[var(--border-glass-strong)] p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13px] font-medium text-foreground">
          <Calculator className="h-4 w-4 text-warning" /> Simulador de tráfego
        </span>
        <Escolha
          opcoes={[
            { valor: "vendas", rotulo: "Quanto investir" },
            { valor: "investimento", rotulo: "Quantas vendas" },
          ]}
          valor={modo}
          onChange={setModo}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <CampoNumero label="CPA" prefixo="R$" value={cpa} min={0} onChange={(v) => setCpa(v ?? 0)} />
        {modo === "vendas" ? (
          <CampoNumero label="Vendas desejadas" value={vendas} min={0} onChange={(v) => setVendas(v ?? 0)} />
        ) : (
          <CampoNumero label="Investimento total" prefixo="R$" value={investimento} min={0} onChange={(v) => setInvestimento(v ?? 0)} />
        )}
        <Leitura
          rotulo={modo === "vendas" ? "Investimento necessário" : "Vendas estimadas"}
          valor={modo === "vendas" ? <SensitiveValue>{fmtMoeda(r.investimento)}</SensitiveValue> : fmtQtd(r.vendas)}
          tom="warning"
          destaque
        />
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3 h-auto min-h-8 whitespace-normal py-1.5 text-left"
        disabled={r.vendas <= 0}
        onClick={() => onUsar(Math.round(r.vendas), cpa)}
      >
        Usar {fmtQtd(Math.round(r.vendas))} pedidos e CPA {fmtMoeda(cpa)} na simulação
      </Button>
    </div>
  );
}
