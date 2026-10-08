/**
 * PREVISIBILIDADE — motor de cálculo (puro, sem banco, sem React).
 *
 * A ordem é sempre a mesma e cada custo entra UMA vez:
 *
 *   PEDIDOS → FRUSTRAÇÃO → PEDIDOS PAGOS → FATURAMENTO → CUSTOS → LUCRO → ROI
 *
 * Regras que evitam contar duas vezes:
 *  - Faturamento só dos pedidos PAGOS (frustrado não fatura).
 *  - Produto e logística valem para todo pedido ENVIADO: o agendado (AfterPay)
 *    sai antes de pagar, então o frustrado também custou; o antecipado só sai
 *    depois de pago, então o que não pagou não custou nada.
 *  - Atendente, plataforma, afiliado e imposto incidem sobre o faturamento pago.
 *  - Tráfego (CPA × pedidos) é só da operação própria: o afiliado paga o
 *    próprio anúncio — o custo dele para você é a comissão.
 *  - O imposto da Meta sobre anúncios entra uma vez, dentro do investimento.
 *
 * O mesmo arquivo roda no navegador (cálculo instantâneo) e no servidor
 * (histórico), para o número salvo ser exatamente o que estava na tela.
 */

export type Pct = number; // 0–100

export interface CustoToggle {
  ativo: boolean;
}

export interface Entradas {
  pedidos: {
    /** Pedidos agendados (AfterPay — o cliente paga quando recebe). */
    agendados: number;
    /** Pedidos antecipados (pagam antes do envio). */
    antecipados: number;
    /** Dos agendados, quantos já pagaram (acompanhamento com pedidos na rua). */
    agendadosJaPagos: number;
  };
  conversao: {
    /** % dos agendados que frustram (enviado e não pago). */
    frustracao: Pct;
    /** % dos antecipados que não pagam (Pix/boleto vencido — não sai produto). */
    naoPagamentoAntecipado: Pct;
    /** Conversas/leads que geraram os pedidos (opcional, só para a % de conversão). */
    leads: number;
  };
  faturamento: {
    /** "ticket" = valor médio por pedido; "kit" = valor do kit × kits por pedido. */
    base: "ticket" | "kit";
    ticketMedio: number;
    valorKit: number;
    kitsPorPedido: number;
    potesPorKit: number;
    /** Substituição manual (null = automático). */
    kitsManual: number | null;
    potesManual: number | null;
  };
  produto: CustoToggle & {
    custoKit: number;
    custoPote: number;
    /** Por pedido enviado (embalagem, brinde, bula…). */
    outrosPorPedido: number;
  };
  logistica: CustoToggle & {
    custoPorPedido: number;
    /** Valor fixo no período (motoboy, galpão…). */
    outros: number;
    /** Substitui o total calculado (null = automático). */
    totalManual: number | null;
  };
  atendente: {
    percentualAtivo: boolean;
    percentual: Pct;
    fixoAtivo: boolean;
    fixo: number;
    /** "venda" = por pedido pago; "pedido" = por pedido feito; "total" = valor do período. */
    fixoPor: "venda" | "pedido" | "total";
    /** A atendente também atende os pedidos de afiliados? */
    incluiAfiliados: boolean;
  };
  plataforma: CustoToggle & {
    percentual: Pct;
    /** Fixo por venda paga (ex.: R$ 1,00). */
    fixoPorVenda: number;
  };
  afiliados: CustoToggle & {
    /** % dos pedidos que vêm de afiliados. */
    participacao: Pct;
    comissao: Pct;
  };
  imposto: CustoToggle & {
    percentual: Pct;
  };
  investimento: {
    /** CPA por pedido da operação própria. */
    cpa: number;
    /** Substitui pedidos próprios × CPA (null = automático). */
    totalManual: number | null;
    /** Imposto da Meta sobre o anúncio (%). */
    impostoAnuncioAtivo: boolean;
    impostoAnuncio: Pct;
  };
  outros: {
    /** Outros custos da operação no período (ferramentas, equipe fixa…). */
    fixos: number;
  };
}

/** Cenário = a base com alguns campos trocados (vazio = herda da base). */
export interface Cenario {
  id: string;
  nome: string;
  frustracao?: number | null;
  agendados?: number | null;
  antecipados?: number | null;
  cpa?: number | null;
  ticketMedio?: number | null;
}

export interface Bloco {
  pedidos: number;
  agendados: number;
  antecipados: number;
  enviados: number;
  pagos: number;
  frustrados: number;
  faturamentoPotencial: number;
  faturamento: number;
  custos: {
    produto: number;
    logistica: number;
    atendente: number;
    plataforma: number;
    afiliado: number;
    imposto: number;
    investimento: number;
    outros: number;
  };
  custoTotal: number;
  lucro: number;
}

export interface Resultado {
  pedidos: number;
  agendados: number;
  antecipados: number;
  enviados: number;
  pagos: number;
  agendadosPagos: number;
  antecipadosPagos: number;
  frustrados: number;
  antecipadosNaoPagos: number;
  taxaPagos: Pct;
  taxaConversao: Pct | null;
  kits: number;
  potes: number;
  ticket: number;
  faturamentoPotencial: number;
  faturamento: number;
  faturamentoAgendados: number;
  faturamentoAntecipados: number;
  jaRecebido: number;
  faltaReceber: number;
  custos: Bloco["custos"];
  custoTotal: number;
  lucro: number;
  margem: Pct | null;
  /** Lucro ÷ investimento em tráfego (retorno real depois de todos os custos). */
  roi: Pct | null;
  /** Lucro ÷ tudo que saiu do caixa. */
  roiSobreCustos: Pct | null;
  /** Faturamento ÷ investimento — só referência, não é lucro. */
  roas: number | null;
  /** Investimento ÷ pedidos pagos próprios. */
  cpaPago: number | null;
  /** Quanto cada ponto de frustração custa em lucro. */
  custoPorPontoFrustracao: number;
  propria: Bloco;
  afiliados: Bloco;
}

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const pct = (v: unknown) => Math.min(Math.max(n(v), 0), 100) / 100;
const naoNeg = (v: unknown) => Math.max(n(v), 0);

export function entradasPadrao(): Entradas {
  return {
    pedidos: { agendados: 100, antecipados: 0, agendadosJaPagos: 0 },
    conversao: { frustracao: 15, naoPagamentoAntecipado: 0, leads: 0 },
    faturamento: {
      base: "ticket",
      ticketMedio: 150,
      valorKit: 150,
      kitsPorPedido: 1,
      potesPorKit: 3,
      kitsManual: null,
      potesManual: null,
    },
    produto: { ativo: true, custoKit: 0, custoPote: 0, outrosPorPedido: 0 },
    logistica: { ativo: true, custoPorPedido: 0, outros: 0, totalManual: null },
    atendente: {
      percentualAtivo: false,
      percentual: 0,
      fixoAtivo: false,
      fixo: 0,
      fixoPor: "venda",
      incluiAfiliados: false,
    },
    plataforma: { ativo: false, percentual: 0, fixoPorVenda: 0 },
    afiliados: { ativo: false, participacao: 0, comissao: 30 },
    imposto: { ativo: false, percentual: 0 },
    investimento: { cpa: 0, totalManual: null, impostoAnuncioAtivo: false, impostoAnuncio: 0 },
    outros: { fixos: 0 },
  };
}

/** Completa um objeto salvo com os campos que faltarem (versões antigas). */
export function normalizarEntradas(raw: unknown): Entradas {
  const base = entradasPadrao();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, Record<string, unknown>>;
  const out = { ...base } as unknown as Record<string, Record<string, unknown>>;
  for (const k of Object.keys(base) as (keyof Entradas)[]) {
    out[k] = { ...(base[k] as unknown as Record<string, unknown>), ...(r[k] || {}) };
  }
  return out as unknown as Entradas;
}

/** Aplica um cenário (só os campos preenchidos) sobre a base. */
export function aplicarCenario(base: Entradas, c?: Cenario | null): Entradas {
  if (!c) return base;
  const has = (v: number | null | undefined): v is number =>
    v !== null && v !== undefined && Number.isFinite(Number(v));
  return {
    ...base,
    pedidos: {
      ...base.pedidos,
      agendados: has(c.agendados) ? c.agendados : base.pedidos.agendados,
      antecipados: has(c.antecipados) ? c.antecipados : base.pedidos.antecipados,
    },
    conversao: {
      ...base.conversao,
      frustracao: has(c.frustracao) ? c.frustracao : base.conversao.frustracao,
    },
    faturamento: {
      ...base.faturamento,
      // Cenário com ticket próprio usa o ticket mesmo que a base esteja "por kit".
      ...(has(c.ticketMedio) ? { base: "ticket" as const, ticketMedio: c.ticketMedio } : {}),
    },
    investimento: {
      ...base.investimento,
      cpa: has(c.cpa) ? c.cpa : base.investimento.cpa,
      // Cenário que mexe em pedidos ou CPA volta o investimento para o automático.
      totalManual:
        has(c.cpa) || has(c.agendados) || has(c.antecipados) ? null : base.investimento.totalManual,
    },
  };
}

function blocoVazio(): Bloco {
  return {
    pedidos: 0,
    agendados: 0,
    antecipados: 0,
    enviados: 0,
    pagos: 0,
    frustrados: 0,
    faturamentoPotencial: 0,
    faturamento: 0,
    custos: {
      produto: 0,
      logistica: 0,
      atendente: 0,
      plataforma: 0,
      afiliado: 0,
      imposto: 0,
      investimento: 0,
      outros: 0,
    },
    custoTotal: 0,
    lucro: 0,
  };
}

function calcularSemSensibilidade(e: Entradas): Omit<Resultado, "custoPorPontoFrustracao"> {
  // ---------------- PEDIDOS ----------------
  const agendados = naoNeg(e.pedidos.agendados);
  const antecipados = naoNeg(e.pedidos.antecipados);
  const pedidos = agendados + antecipados;

  // ---------------- FRUSTRAÇÃO → PAGOS ----------------
  const frust = pct(e.conversao.frustracao);
  const naoPagaAnt = pct(e.conversao.naoPagamentoAntecipado);
  const agendadosPagos = agendados * (1 - frust);
  const frustrados = agendados - agendadosPagos;
  const antecipadosPagos = antecipados * (1 - naoPagaAnt);
  const antecipadosNaoPagos = antecipados - antecipadosPagos;
  const pagos = agendadosPagos + antecipadosPagos;
  // Agendado sai antes de pagar; antecipado só sai depois de pago.
  const enviados = agendados + antecipadosPagos;

  // ---------------- FATURAMENTO ----------------
  const f = e.faturamento;
  const kitsPorPedido = naoNeg(f.kitsPorPedido) || 1;
  const ticket = f.base === "kit" ? naoNeg(f.valorKit) * kitsPorPedido : naoNeg(f.ticketMedio);
  const faturamentoPotencial = pedidos * ticket;
  const faturamentoAgendados = agendadosPagos * ticket;
  const faturamentoAntecipados = antecipadosPagos * ticket;
  const faturamento = faturamentoAgendados + faturamentoAntecipados;
  const jaPagosAg = Math.min(naoNeg(e.pedidos.agendadosJaPagos), agendadosPagos);
  const jaRecebido = (jaPagosAg + antecipadosPagos) * ticket;

  // Kits e potes que SAEM (base do custo de produto). Manual substitui.
  const kitsAuto = enviados * kitsPorPedido;
  const kits = f.kitsManual !== null && f.kitsManual !== undefined ? naoNeg(f.kitsManual) : kitsAuto;
  const potesAuto = kits * naoNeg(f.potesPorKit);
  const potes = f.potesManual !== null && f.potesManual !== undefined ? naoNeg(f.potesManual) : potesAuto;

  // ---------------- PRÓPRIA × AFILIADOS ----------------
  // A participação dos afiliados divide pedidos, pagos e envios na mesma proporção.
  const partAf = e.afiliados.ativo ? pct(e.afiliados.participacao) : 0;
  const partPr = 1 - partAf;

  const prop = blocoVazio();
  const afil = blocoVazio();
  const dividir = (campo: "pedidos" | "agendados" | "antecipados" | "enviados" | "pagos" | "frustrados" | "faturamentoPotencial" | "faturamento", total: number) => {
    prop[campo] = total * partPr;
    afil[campo] = total * partAf;
  };
  dividir("pedidos", pedidos);
  dividir("agendados", agendados);
  dividir("antecipados", antecipados);
  dividir("enviados", enviados);
  dividir("pagos", pagos);
  dividir("frustrados", frustrados);
  dividir("faturamentoPotencial", faturamentoPotencial);
  dividir("faturamento", faturamento);

  // ---------------- CUSTOS ----------------
  // Produto: por kit + por pote + outros por pedido enviado.
  if (e.produto.ativo) {
    const totalProduto =
      kits * naoNeg(e.produto.custoKit) +
      potes * naoNeg(e.produto.custoPote) +
      enviados * naoNeg(e.produto.outrosPorPedido);
    prop.custos.produto = totalProduto * partPr;
    afil.custos.produto = totalProduto * partAf;
  }

  // Logística: pedidos enviados × custo + outros. Manual substitui o total.
  if (e.logistica.ativo) {
    const auto = enviados * naoNeg(e.logistica.custoPorPedido) + naoNeg(e.logistica.outros);
    const total =
      e.logistica.totalManual !== null && e.logistica.totalManual !== undefined
        ? naoNeg(e.logistica.totalManual)
        : auto;
    prop.custos.logistica = total * partPr;
    afil.custos.logistica = total * partAf;
  }

  // Atendente: % do faturamento pago e/ou fixo. Só nos blocos que ela atende.
  {
    const a = e.atendente;
    const atendeAf = a.incluiAfiliados;
    const custoDe = (b: Bloco, fatiaDoTotal: number) => {
      let c = 0;
      if (a.percentualAtivo) c += b.faturamento * pct(a.percentual);
      if (a.fixoAtivo) {
        if (a.fixoPor === "venda") c += b.pagos * naoNeg(a.fixo);
        else if (a.fixoPor === "pedido") c += b.pedidos * naoNeg(a.fixo);
        else c += naoNeg(a.fixo) * fatiaDoTotal;
      }
      return c;
    };
    // Fixo "total do período" fica com quem a atendente atende.
    const fatiaPr = atendeAf ? partPr : 1;
    const fatiaAf = atendeAf ? partAf : 0;
    prop.custos.atendente = custoDe(prop, fatiaPr);
    afil.custos.atendente = atendeAf ? custoDe(afil, fatiaAf) : 0;
  }

  // Plataforma: % + fixo por venda paga, em todas as vendas.
  if (e.plataforma.ativo) {
    for (const b of [prop, afil]) {
      b.custos.plataforma =
        b.faturamento * pct(e.plataforma.percentual) + b.pagos * naoNeg(e.plataforma.fixoPorVenda);
    }
  }

  // Afiliado: comissão sobre o faturamento das vendas dos afiliados.
  if (e.afiliados.ativo) {
    afil.custos.afiliado = afil.faturamento * pct(e.afiliados.comissao);
  }

  // Imposto: sobre o faturamento pago.
  if (e.imposto.ativo) {
    for (const b of [prop, afil]) b.custos.imposto = b.faturamento * pct(e.imposto.percentual);
  }

  // Investimento: pedidos próprios × CPA (+ imposto da Meta). Manual substitui.
  {
    const inv = e.investimento;
    const anuncio =
      inv.totalManual !== null && inv.totalManual !== undefined
        ? naoNeg(inv.totalManual)
        : prop.pedidos * naoNeg(inv.cpa);
    const comImposto = anuncio * (1 + (inv.impostoAnuncioAtivo ? pct(inv.impostoAnuncio) : 0));
    prop.custos.investimento = comImposto;
  }

  // Outros custos fixos da operação: ficam na operação própria.
  prop.custos.outros = naoNeg(e.outros.fixos);

  for (const b of [prop, afil]) {
    const c = b.custos;
    b.custoTotal =
      c.produto + c.logistica + c.atendente + c.plataforma + c.afiliado + c.imposto + c.investimento + c.outros;
    b.lucro = b.faturamento - b.custoTotal;
  }

  const custos = {} as Bloco["custos"];
  for (const k of Object.keys(prop.custos) as (keyof Bloco["custos"])[]) {
    custos[k] = prop.custos[k] + afil.custos[k];
  }
  const custoTotal = prop.custoTotal + afil.custoTotal;
  const lucro = faturamento - custoTotal;
  const investimento = custos.investimento;

  const leads = naoNeg(e.conversao.leads);

  return {
    pedidos,
    agendados,
    antecipados,
    enviados,
    pagos,
    agendadosPagos,
    antecipadosPagos,
    frustrados,
    antecipadosNaoPagos,
    taxaPagos: pedidos > 0 ? (pagos / pedidos) * 100 : 0,
    taxaConversao: leads > 0 ? (pedidos / leads) * 100 : null,
    kits,
    potes,
    ticket,
    faturamentoPotencial,
    faturamento,
    faturamentoAgendados,
    faturamentoAntecipados,
    jaRecebido,
    faltaReceber: Math.max(faturamento - jaRecebido, 0),
    custos,
    custoTotal,
    lucro,
    margem: faturamento > 0 ? (lucro / faturamento) * 100 : null,
    roi: investimento > 0 ? (lucro / investimento) * 100 : null,
    roiSobreCustos: custoTotal > 0 ? (lucro / custoTotal) * 100 : null,
    roas: investimento > 0 ? faturamento / investimento : null,
    cpaPago: prop.pagos > 0 && investimento > 0 ? investimento / prop.pagos : null,
    propria: prop,
    afiliados: afil,
  };
}

export function calcular(e: Entradas): Resultado {
  const r = calcularSemSensibilidade(e);
  // Sensibilidade: +1 ponto de frustração, mantendo todo o resto.
  const mais1 = calcularSemSensibilidade({
    ...e,
    conversao: { ...e.conversao, frustracao: Math.min(n(e.conversao.frustracao) + 1, 100) },
  });
  return { ...r, custoPorPontoFrustracao: r.lucro - mais1.lucro };
}

/** Curva lucro × frustração (0% a `ate`%), para o gráfico de sensibilidade. */
export function curvaFrustracao(e: Entradas, ate = 50, passo = 5) {
  const pontos: { frustracao: number; lucro: number; roi: number | null }[] = [];
  for (let f = 0; f <= ate; f += passo) {
    const r = calcularSemSensibilidade({ ...e, conversao: { ...e.conversao, frustracao: f } });
    pontos.push({ frustracao: f, lucro: r.lucro, roi: r.roi });
  }
  return pontos;
}

/** Frustração em que o lucro zera (null se não zera entre 0 e 100%). */
export function frustracaoDeEmpate(e: Entradas): number | null {
  const lucroEm = (f: number) =>
    calcularSemSensibilidade({ ...e, conversao: { ...e.conversao, frustracao: f } }).lucro;
  if (lucroEm(0) <= 0) return 0;
  if (lucroEm(100) > 0) return null;
  let lo = 0;
  let hi = 100;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (lucroEm(mid) > 0) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Simulador de tráfego: dois valores dão o terceiro. */
export function simularTrafego(p: { cpa: number; vendas?: number | null; investimento?: number | null }) {
  const cpa = naoNeg(p.cpa);
  if (p.vendas !== null && p.vendas !== undefined) {
    return { cpa, vendas: naoNeg(p.vendas), investimento: cpa * naoNeg(p.vendas) };
  }
  const inv = naoNeg(p.investimento);
  return { cpa, investimento: inv, vendas: cpa > 0 ? inv / cpa : 0 };
}
