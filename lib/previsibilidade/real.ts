import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { carregarVersoes, diaSP, versaoDoDia, type VersaoCustos } from "@/lib/profit/versoes";
import { resolveKitUnits } from "@/lib/stock/kit";
import { calculateCommission, type CommissionTx } from "@/lib/attendants/commission";
import { investimentoDoPeriodo } from "@/lib/dashboard/investimento";
import type { Attendant, AttendantRule } from "@/types";

/**
 * OPERAÇÃO REAL do período — a mesma cadeia da Previsibilidade, com os dados
 * que chegaram pelos webhooks:
 *
 *   pedidos feitos no período → o que aconteceu com eles (pago, frustrado,
 *   em aberto) → faturamento dos pagos → custos → lucro → ROI
 *
 * É uma COORTE: conta os pedidos feitos no período (data do pedido) e tudo o
 * que já aconteceu com eles. Por isso pode diferir das "Pagas no Período" do
 * painel, que contam pela data do pagamento.
 *
 * Custos, cada um uma vez:
 *  - Plataforma e repasses: faturamento bruto − o que caiu para você − comissão
 *    do afiliado (taxa, juros e repasses que a plataforma reteve).
 *  - Afiliado: a comissão das vendas de afiliados.
 *  - Logística: o frete de todo pedido que saiu (AfterPay sai antes de pagar;
 *    antecipado só quando paga), pela configuração da Análise de Lucro.
 *  - Atendente: regras de comissão de cada atendente sobre as vendas pagas dela.
 *  - Imposto: % do mês (Fluxo de Caixa › Faturamento) sobre o faturamento pago.
 *  - Investimento: anúncios do período (mesma conta do dashboard), só própria.
 *  - Produto: NÃO desconta — o estoque já foi pago (decisão da Análise de
 *    Lucro). Aparece só como informação.
 */

interface Tx {
  origin_type: string | null;
  sale_type: string | null;
  status: string | null;
  amount: number | null;
  total_value: number | null;
  paid_value: number | null;
  product_price: number | null;
  commission: number | null;
  affiliate_commission: number | null;
  producer_commission: number | null;
  plan_name: string | null;
  product_name: string | null;
  src: string | null;
  sale_date: string | null;
  payment_date: string | null;
  created_at: string | null;
}

/** Mínimo de agendados decididos para usar a taxa real em previsão. */
const AMOSTRA_MINIMA = 10;

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export interface LadoReal {
  pedidos: number;
  agendamentos: number;
  pagos: number;
  faturamento: number;
  /** O que caiu para você (líquido da plataforma). */
  liquido: number;
  comissao: number;
  custos: number;
  lucro: number;
}

export interface OperacaoReal {
  periodo: { from: string; to: string };
  agendados: { total: number; pagos: number; frustrados: number; emAberto: number; faturamento: number };
  antecipados: { total: number; pagos: number; naoPagos: number; aguardando: number; faturamento: number };
  kits: number;
  potes: number;
  estoque: { potes: number; valor: number };
  enviados: number;
  faturamento: number;
  custos: {
    plataforma: number;
    afiliado: number;
    logistica: number;
    atendente: number;
    imposto: number;
    investimento: number;
  };
  custoTotal: number;
  lucro: number;
  margem: number | null;
  roi: number | null;
  taxaFrustracao: number | null;
  impostoPercent: number;
  propria: LadoReal;
  afiliados: LadoReal;
  previsao: {
    emAberto: number;
    /** Agendados já decididos (pagos + frustrados) — tamanho da amostra. */
    decididos: number;
    taxaPagamento: number | null;
    faturamentoExtra: number;
    lucroPrevisto: number;
  };
  /** Valores reais prontos para preencher o simulador. */
  sugestao: {
    agendados: number;
    antecipados: number;
    agendadosJaPagos: number;
    frustracao: number | null;
    naoPagamentoAntecipado: number | null;
    ticketMedio: number | null;
    potesPorKit: number | null;
    custoPote: number;
    fretePorPedido: number | null;
    cpa: number | null;
    plataformaPercent: number | null;
    participacaoAfiliados: number | null;
    comissaoAfiliado: number | null;
    impostoPercent: number;
    impostoAnuncio: number;
  };
}

export async function calcularOperacaoReal(
  supabase: SupabaseClient,
  ownerId: string,
  fromRaw: string,
  toRaw: string
): Promise<OperacaoReal> {
  const fromDate = fromRaw.slice(0, 10);
  const toDate = toRaw.slice(0, 10);
  const fromTs = `${fromDate}T00:00:00-03:00`;
  const toTs = `${toDate}T23:59:59-03:00`;
  const fromMs = new Date(fromTs).getTime();
  const toMs = new Date(toTs).getTime();

  const [
    { data: txRaw, error },
    versoes,
    { data: cfg },
    { data: kitsAtuais },
    { data: settings },
    { data: impostoMes },
    { data: atendentes },
    { data: regras },
    invest,
  ] = await Promise.all([
    fetchAll(
      supabase
        .from("transactions")
        .select(
          "origin_type, sale_type, status, amount, total_value, paid_value, product_price, commission, affiliate_commission, producer_commission, plan_name, product_name, src, sale_date, payment_date, created_at"
        )
        .eq("user_id", ownerId)
        .or("origin_type.eq.own,origin_type.eq.affiliate_incoming,origin_type.is.null")
        .or(
          `and(sale_date.gte.${fromTs},sale_date.lte.${toTs}),and(sale_date.is.null,created_at.gte.${fromTs},created_at.lte.${toTs})`
        )
    ),
    carregarVersoes(supabase, ownerId),
    supabase.from("profit_config").select("cost_per_unit, shipping_cost, affiliate_percent, affiliate_platform_fee, affiliate_platform_fixed").eq("user_id", ownerId).maybeSingle(),
    supabase.from("product_costs").select("product_keyword, units_per_kit, custom_shipping").eq("user_id", ownerId),
    supabase.from("settings").select("tax_percentage").eq("user_id", ownerId).maybeSingle(),
    supabase
      .from("monthly_tax_config")
      .select("tax_percentage")
      .eq("user_id", ownerId)
      .eq("year", Number(toDate.slice(0, 4)))
      .eq("month", Number(toDate.slice(5, 7)))
      .maybeSingle(),
    supabase.from("attendants").select("*").eq("user_id", ownerId).eq("status", "active"),
    supabase.from("attendant_rules").select("*").eq("user_id", ownerId),
    investimentoDoPeriodo(supabase, ownerId, fromDate, toDate),
  ]);
  if (error) throw new Error(error.message);

  const noPeriodo = (t: Tx) => {
    const ref = t.sale_date || t.created_at;
    if (!ref) return false;
    const ms = new Date(ref).getTime();
    return ms >= fromMs && ms <= toMs;
  };
  const txs = ((txRaw || []) as Tx[]).filter(noPeriodo);

  // Custos vigentes no dia em que o pedido saiu (mesma regra da Análise de Lucro).
  // profit_config só o dono lê; para a equipe vale a última versão gravada.
  const ultima = versoes[versoes.length - 1];
  const atual: VersaoCustos = !cfg && ultima ? ultima : {
    vigente_desde: "2000-01-01",
    config: {
      cost_per_unit: num(cfg?.cost_per_unit),
      shipping_cost: num(cfg?.shipping_cost),
      affiliate_percent: num(cfg?.affiliate_percent),
      affiliate_platform_fee: num(cfg?.affiliate_platform_fee),
      affiliate_platform_fixed: num(cfg?.affiliate_platform_fixed),
    },
    kits: (kitsAtuais || []).map((k) => ({
      product_keyword: k.product_keyword,
      units_per_kit: num(k.units_per_kit),
      custom_shipping: k.custom_shipping == null ? null : num(k.custom_shipping),
    })),
  };
  const ehAfterpay = (t: Tx) => t.sale_type === "afterpay";
  const dataDoEnvio = (t: Tx) =>
    ehAfterpay(t) ? t.sale_date || t.created_at : t.payment_date || t.sale_date || t.created_at;
  const custosDa = (t: Tx) => {
    const ref = dataDoEnvio(t);
    return (ref && versaoDoDia(versoes, diaSP(ref))) || atual;
  };
  const freteDo = (t: Tx, v: VersaoCustos) => {
    const hay = `${t.plan_name || ""} ${t.product_name || ""}`.toLowerCase();
    const kit = v.kits.find((k) => k.product_keyword && hay.includes(k.product_keyword.trim().toLowerCase()));
    return kit && kit.custom_shipping != null ? num(kit.custom_shipping) : num(v.config.shipping_cost);
  };
  const ENVIADO_AFTERPAY = new Set(["agendado", "aguardando", "pago", "frustrado", "devolvido"]);
  const foiEnviado = (t: Tx) =>
    ehAfterpay(t) ? ENVIADO_AFTERPAY.has(t.status || "") : t.status === "pago" || t.status === "devolvido";

  const ehAfiliado = (t: Tx) => t.origin_type === "affiliate_incoming";
  const pago = (t: Tx) => t.status === "pago";
  const bruto = (t: Tx) => num(t.total_value) || num(t.paid_value) || num(t.product_price) || num(t.amount);
  // O que caiu para você: na própria, a mesma comissão do dashboard; na de
  // afiliado, a comissão de produtor.
  const liquido = (t: Tx) =>
    ehAfiliado(t)
      ? num(t.producer_commission) || num(t.commission) || Math.max(bruto(t) - num(t.affiliate_commission), 0)
      : num(t.affiliate_commission) || num(t.commission) || bruto(t);
  const comissaoAfiliado = (t: Tx) => (ehAfiliado(t) ? num(t.affiliate_commission) : 0);

  // -------- Agendados × antecipados --------
  const ag = txs.filter(ehAfterpay);
  const an = txs.filter((t) => !ehAfterpay(t));
  const PERDIDO = new Set(["frustrado", "cancelado", "devolvido"]);
  const agPagos = ag.filter(pago);
  const agFrustrados = ag.filter((t) => PERDIDO.has(t.status || ""));
  const agAbertos = ag.filter((t) => t.status === "agendado" || t.status === "aguardando");
  const anPagos = an.filter(pago);
  const anNaoPagos = an.filter((t) => PERDIDO.has(t.status || ""));
  const anAguardando = an.filter((t) => t.status === "agendado" || t.status === "aguardando");
  const soma = (l: Tx[], f: (t: Tx) => number) => l.reduce((s, t) => s + f(t), 0);

  // -------- Envios, kits e potes --------
  const enviados = txs.filter(foiEnviado);
  let frete = 0;
  let fretePropria = 0;
  let potesEnviados = 0;
  let valorEstoque = 0;
  for (const t of enviados) {
    const v = custosDa(t);
    const f = freteDo(t, v);
    frete += f;
    if (!ehAfiliado(t)) fretePropria += f;
    const p = resolveKitUnits(t.plan_name, t.product_name, v.kits).units;
    potesEnviados += p;
    valorEstoque += p * num(v.config.cost_per_unit);
  }
  const pagos = txs.filter(pago);
  const potesVendidos = pagos.reduce(
    (s, t) => s + resolveKitUnits(t.plan_name, t.product_name, custosDa(t).kits).units,
    0
  );

  // -------- Atendentes (regras de cada uma, vendas próprias pagas da coorte) --------
  const regrasPor = new Map<string, AttendantRule[]>();
  for (const r of (regras || []) as AttendantRule[]) {
    regrasPor.set(r.attendant_id, [...(regrasPor.get(r.attendant_id) || []), r]);
  }
  let atendente = 0;
  for (const att of (atendentes || []) as Attendant[]) {
    const src = (att.src || "").trim().toLowerCase();
    if (!src) continue;
    const vendas = pagos.filter((t) => !ehAfiliado(t) && (t.src || "").trim().toLowerCase() === src);
    if (vendas.length === 0) continue;
    const r = calculateCommission(att, regrasPor.get(att.id) || [], vendas as unknown as CommissionTx[], {
      start: fromDate,
      end: toDate,
    });
    atendente += num(r.total_to_pay);
  }

  // -------- Imposto sobre o faturamento --------
  const impostoPercent = num(impostoMes?.tax_percentage ?? settings?.tax_percentage ?? 0);

  // -------- Lados --------
  const lado = (lista: Tx[], afiliado: boolean): LadoReal & { _frete: number; _imposto: number; _plataforma: number } => {
    const pg = lista.filter(pago);
    const faturamento = soma(pg, bruto);
    const liq = soma(pg, liquido);
    const comissao = soma(pg, comissaoAfiliado);
    const plataforma = Math.max(faturamento - liq - comissao, 0);
    const imp = faturamento * (impostoPercent / 100);
    const fr = afiliado ? frete - fretePropria : fretePropria;
    const custos = plataforma + comissao + fr + imp + (afiliado ? 0 : atendente + invest.total);
    return {
      pedidos: lista.length,
      agendamentos: lista.filter(ehAfterpay).length,
      pagos: pg.length,
      faturamento,
      liquido: liq,
      comissao,
      custos,
      lucro: faturamento - custos,
      _frete: fr,
      _imposto: imp,
      _plataforma: plataforma,
    };
  };
  const pr = lado(txs.filter((t) => !ehAfiliado(t)), false);
  const af = lado(txs.filter(ehAfiliado), true);
  const limpar = ({ _frete, _imposto, _plataforma, ...r }: ReturnType<typeof lado>): LadoReal => {
    void _frete; void _imposto; void _plataforma;
    return r;
  };

  const faturamento = pr.faturamento + af.faturamento;
  const custos = {
    plataforma: pr._plataforma + af._plataforma,
    afiliado: af.comissao,
    logistica: frete,
    atendente,
    imposto: pr._imposto + af._imposto,
    investimento: invest.total,
  };
  const custoTotal = Object.values(custos).reduce((s, v) => s + v, 0);
  const lucro = faturamento - custoTotal;

  // -------- Previsão dos agendados em aberto --------
  // Taxa de pagamento dos agendados já decididos (pagos ÷ pagos + frustrados).
  // Com menos de 10 decididos a amostra engana (1 pago = "100%"): sem previsão.
  const decididos = agPagos.length + agFrustrados.length;
  const taxaPagamento = decididos >= AMOSTRA_MINIMA ? agPagos.length / decididos : null;
  const ticketAg = agPagos.length > 0 ? soma(agPagos, bruto) / agPagos.length : 0;
  const liquidoAg = agPagos.length > 0 ? soma(agPagos, liquido) / agPagos.length : 0;
  const pagariam = taxaPagamento !== null ? agAbertos.length * taxaPagamento : 0;
  const faturamentoExtra = pagariam * ticketAg;
  const lucroPrevisto = lucro + pagariam * liquidoAg - faturamentoExtra * (impostoPercent / 100);

  // -------- Sugestões para o simulador --------
  const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);
  const ticketMedio = pagos.length > 0 ? faturamento / pagos.length : null;
  const brutoProprio = pr.faturamento;

  return {
    periodo: { from: fromDate, to: toDate },
    agendados: {
      total: ag.length,
      pagos: agPagos.length,
      frustrados: agFrustrados.length,
      emAberto: agAbertos.length,
      faturamento: soma(agPagos, bruto),
    },
    antecipados: {
      total: an.length,
      pagos: anPagos.length,
      naoPagos: anNaoPagos.length,
      aguardando: anAguardando.length,
      faturamento: soma(anPagos, bruto),
    },
    kits: pagos.length,
    potes: potesVendidos,
    estoque: { potes: potesEnviados, valor: valorEstoque },
    enviados: enviados.length,
    faturamento,
    custos,
    custoTotal,
    lucro,
    margem: faturamento > 0 ? (lucro / faturamento) * 100 : null,
    roi: invest.total > 0 ? (lucro / invest.total) * 100 : null,
    taxaFrustracao: pct(agFrustrados.length, decididos),
    impostoPercent,
    propria: limpar(pr),
    afiliados: limpar(af),
    previsao: {
      emAberto: agAbertos.length,
      decididos,
      taxaPagamento: taxaPagamento === null ? null : taxaPagamento * 100,
      faturamentoExtra,
      lucroPrevisto,
    },
    sugestao: {
      agendados: ag.length,
      antecipados: an.length,
      agendadosJaPagos: agPagos.length,
      // Amostra pequena não troca a frustração do simulador.
      frustracao: decididos >= AMOSTRA_MINIMA ? pct(agFrustrados.length, decididos) : null,
      naoPagamentoAntecipado: pct(anNaoPagos.length, anPagos.length + anNaoPagos.length),
      ticketMedio,
      potesPorKit: pagos.length > 0 ? potesVendidos / pagos.length : null,
      custoPote: num(atual.config.cost_per_unit),
      fretePorPedido: enviados.length > 0 ? frete / enviados.length : num(atual.config.shipping_cost) || null,
      cpa: pr.pedidos > 0 && invest.total > 0 ? invest.semImposto / pr.pedidos : null,
      plataformaPercent: pct(pr._plataforma, brutoProprio),
      participacaoAfiliados: pct(af.pedidos, txs.length),
      comissaoAfiliado: pct(af.comissao, af.faturamento),
      impostoPercent,
      impostoAnuncio: invest.impostoPercent,
    },
  };
}
