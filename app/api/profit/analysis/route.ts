import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { carregarVersoes, diaSP, versaoDoDia, type VersaoCustos } from "@/lib/profit/versoes";
import { resolveKitUnits } from "@/lib/stock/kit";

/**
 * ANÁLISE DE LUCRO (somente leitura).
 * Lê transactions, meta_ads_performance, ad_investments, cashflow e as tabelas
 * de configuração (profit_config, profit_partners, product_costs) para calcular
 * custos de kit, lucro por operação, lucro geral e distribuição.
 * NÃO altera nenhum dado nem cálculo existente.
 */

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

interface Tx {
  origin_type: string | null;
  status: string | null;
  commission: number | null;
  producer_commission: number | null;
  affiliate_commission: number | null;
  product_price: number | null;
  total_value: number | null;
  amount: number | null;
  product_name: string | null;
  plan_name: string | null;
  sale_date: string | null;
  payment_date: string | null;
  created_at: string | null;
  sale_type?: string | null;
}

interface ProductCost {
  product_keyword: string;
  units_per_kit: number;
  custom_shipping: number | null;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = await getEffectiveUserId(supabase, user.id);

  const { searchParams } = new URL(request.url);
  const fromRaw = searchParams.get("from");
  const toRaw = searchParams.get("to");
  if (!fromRaw || !toRaw)
    return NextResponse.json(
      { error: "Missing from/to params" },
      { status: 400 }
    );

  // Janela ancorada no horário de Brasília (-03:00), igual ao dashboard, para
  // que "pago no período" respeite o dia-calendário local.
  const fromDate = fromRaw.slice(0, 10);
  const toDate = toRaw.slice(0, 10);
  const fromTs = `${fromDate}T00:00:00-03:00`;
  const toTs = `${toDate}T23:59:59-03:00`;
  const fromMs = new Date(fromTs).getTime();
  const toMs = new Date(toTs).getTime();

  // 1. Configuração
  const { data: configRow } = await supabase
    .from("profit_config")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const config = {
    cost_per_unit: num(configRow?.cost_per_unit),
    shipping_cost: num(configRow?.shipping_cost),
    affiliate_percent: num(configRow?.affiliate_percent),
    affiliate_platform_fee: num(configRow?.affiliate_platform_fee),
    affiliate_platform_fixed: num(configRow?.affiliate_platform_fixed),
    company_reserve_percent: num(configRow?.company_reserve_percent),
    excluded_cashflow_categories: (configRow?.excluded_cashflow_categories ||
      []) as string[],
  };

  // 2. Kits (custos)
  const { data: productCostsRaw } = await supabase
    .from("product_costs")
    .select("product_keyword, units_per_kit, custom_shipping")
    .eq("user_id", userId);
  const productCosts = (productCostsRaw || []) as ProductCost[];

  // Custos por PERÍODO: cada venda usa os custos vigentes no dia em que foi
  // paga (mudar o envio hoje não altera o lucro de meses já fechados). Sem
  // versões gravadas, vale a configuração atual para tudo.
  const versoes = await carregarVersoes(supabase, userId);
  const atual: VersaoCustos = {
    vigente_desde: "2000-01-01",
    config: {
      cost_per_unit: config.cost_per_unit,
      shipping_cost: config.shipping_cost,
      affiliate_percent: config.affiliate_percent,
      affiliate_platform_fee: config.affiliate_platform_fee,
      affiliate_platform_fixed: config.affiliate_platform_fixed,
    },
    kits: productCosts,
  };
  const custosDa = (tx: Tx, ref = tx.payment_date || tx.sale_date || tx.created_at): VersaoCustos =>
    (ref && versaoDoDia(versoes, diaSP(ref))) || atual;

  // Envio do kit: o próprio do kit (se configurado) ou o padrão.
  const envioDo = (tx: Tx, v: VersaoCustos): number => {
    const hay = `${tx.plan_name || ""} ${tx.product_name || ""}`.toLowerCase();
    const match = v.kits.find(
      (pc) => pc.product_keyword && hay.includes(pc.product_keyword.trim().toLowerCase())
    );
    return match && match.custom_shipping !== null && match.custom_shipping !== undefined
      ? num(match.custom_shipping)
      : num(v.config.shipping_cost);
  };

  // Custo de cada venda paga = potes do kit × custo do pote + envio. Potes pela
  // MESMA regra da baixa de estoque ("2+1", kit cadastrado, "6 MESES" no nome);
  // antes, kit sem cadastro (ex.: 6 MESES) contava como 1 pote só.
  // O pote entra aqui (e não na compra do estoque, que não é saída do caixa da
  // análise): cada venda leva o custo do que saiu da prateleira.
  const kitCostFor = (tx: Tx): { produto: number; envio: number } => {
    const v = custosDa(tx);
    const { units } = resolveKitUnits(tx.plan_name, tx.product_name, v.kits);
    return { produto: units * num(v.config.cost_per_unit), envio: envioDo(tx, v) };
  };

  // 3. Sócios
  const { data: partnersRaw } = await supabase
    .from("profit_partners")
    .select("id, name, percent")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  const partners = (partnersRaw || []) as {
    id: string;
    name: string;
    percent: number;
  }[];

  // 4. Transações pagas do período (own + affiliate_incoming)
  const { data: txRaw } = await fetchAll(supabase
    .from("transactions")
    .select(
      "origin_type, status, commission, producer_commission, affiliate_commission, product_price, total_value, amount, product_name, plan_name, sale_date, payment_date, created_at"
    )
    .eq("user_id", userId)
    .eq("status", "pago")
    .in("origin_type", ["own", "affiliate_incoming"]));

  // AfterPay frustrado: o kit foi enviado e o cliente não pagou. O pote volta
  // para o estoque, mas o envio já foi pago — é custo do mês em que saiu.
  const { data: frustRaw } = await fetchAll(supabase
    .from("transactions")
    .select("origin_type, status, product_name, plan_name, sale_date, payment_date, created_at, sale_type")
    .eq("user_id", userId)
    .eq("status", "frustrado")
    .eq("sale_type", "afterpay")
    .or("origin_type.eq.own,origin_type.is.null")
    .gte("sale_date", fromTs)
    .lte("sale_date", toTs));
  const frustradas = (frustRaw || []) as Tx[];
  const envioFrustradas = frustradas.reduce((s, t) => {
    const v = custosDa(t, t.sale_date || t.created_at);
    return s + envioDo(t, v);
  }, 0);

  const inPeriod = (tx: Tx): boolean => {
    const ref = tx.payment_date || tx.sale_date || tx.created_at;
    if (!ref) return false;
    const t = new Date(ref).getTime();
    return t >= fromMs && t <= toMs;
  };

  const txs = ((txRaw || []) as Tx[]).filter(inPeriod);
  const ownTxs = txs.filter(
    (t) => t.origin_type === "own" || t.origin_type === null
  );
  const affTxs = txs.filter((t) => t.origin_type === "affiliate_incoming");

  // 5. Investimento em ads (mesma base do dashboard: manual deduplicado + Meta)
  const { data: adInvestments } = await fetchAll(supabase
    .from("ad_investments")
    .select("investment_value, date, platform")
    .eq("user_id", userId)
    .gte("date", fromDate)
    .lte("date", toDate));

  const { data: activeMetaAccounts } = await supabase
    .from("meta_ad_accounts")
    .select("account_id, apply_meta_tax")
    .eq("user_id", userId)
    .eq("is_active", true);
  const activeMetaIds = (activeMetaAccounts || []).map((a) => a.account_id);
  // Contas ISENTAS do imposto da Meta (só conversão/IOF, sem ads_tax).
  const exemptMetaIds = new Set(
    (activeMetaAccounts || [])
      .filter((a) => a.apply_meta_tax === false)
      .map((a) => a.account_id)
  );

  const metaAutoDateSet = new Set<string>();
  let metaSpendTotal = 0;
  let metaExemptSpend = 0;
  if (activeMetaIds.length > 0) {
    const { data: metaPerf } = await fetchAll(supabase
      .from("meta_ads_performance")
      .select("ad_account_id, date, spend")
      .eq("user_id", userId)
      .in("ad_account_id", activeMetaIds)
      .gte("date", fromDate)
      .lte("date", toDate));
    (metaPerf || []).forEach((row) => {
      const spend = num(row.spend);
      metaSpendTotal += spend;
      if (exemptMetaIds.has(row.ad_account_id)) metaExemptSpend += spend;
      if (spend > 0) metaAutoDateSet.add(row.date as string);
    });
  }

  const manualSpend = (adInvestments || []).reduce((s, a) => {
    if (a.platform === "meta_ads" && metaAutoDateSet.has(a.date as string))
      return s;
    return s + num(a.investment_value);
  }, 0);

  // Imposto sobre ads: o dashboard principal calcula o "Investimento" como
  // (manual + Meta) * (1 + ads_tax_percentage/100). Aplicamos EXATAMENTE a mesma
  // fórmula aqui para que investimento, ROI e CPA batam com o dashboard e fiquem
  // em tempo real (ambos leem meta_ads_performance + ad_investments).
  const { data: settingsRow } = await supabase
    .from("settings")
    .select("ads_tax_percentage")
    .eq("user_id", userId)
    .maybeSingle();
  const adsTaxPercent = num(settingsRow?.ads_tax_percentage ?? 6);

  // O imposto da Meta incide só sobre a parcela NÃO isenta (manual + Meta com
  // apply_meta_tax=true). Contas isentas entram só convertidas/IOF, sem imposto.
  const rawSpend = manualSpend + metaSpendTotal;
  const taxableSpend = rawSpend - metaExemptSpend;
  const adsInvestment =
    taxableSpend + taxableSpend * (adsTaxPercent / 100) + metaExemptSpend;

  // 6. Saídas do fluxo de caixa (excluindo categorias configuradas p/ evitar
  // dupla contagem, ex.: investimento em ads já descontado na operação interna)
  const excluded = new Set(
    config.excluded_cashflow_categories.map((c) => c.trim().toLowerCase())
  );
  const { data: cashflowRaw } = await fetchAll(supabase
    .from("cashflow")
    .select("type, category, amount, date, include_in_profit")
    .eq("user_id", userId)
    .gte("date", fromTs)
    .lte("date", toTs));

  const cashflowExits = (cashflowRaw || []).reduce((s, row) => {
    const isExpense =
      (row.type || "").toLowerCase() === "expense" || num(row.amount) < 0;
    if (!isExpense) return s;
    // Controle por lançamento: o usuário pode marcar uma saída para NÃO entrar
    // na Análise de Lucro. include_in_profit === false exclui explicitamente.
    if (row.include_in_profit === false) return s;
    // Filtro adicional por categoria (ex.: Investimento Ads) evita dupla
    // contagem, já que ads já é descontado na operação interna.
    if (excluded.has((row.category || "").trim().toLowerCase())) return s;
    return s + Math.abs(num(row.amount));
  }, 0);

  // ---- CÁLCULOS ----

  // 2.2 Simulação como afiliado (só das vendas próprias)
  // Base da receita = PREÇO DO PRODUTO (product_price, sem juros de parcelamento),
  // com fallback para o valor da venda quando o preço não está disponível.
  // O afiliado NÃO arca com custo de kit/envio (quem paga o produto é o produtor),
  // então o lucro/ROI da simulação consideram apenas o investimento em ads.
  let simRevenue = 0;
  let ownKitCosts = 0;
  let ownProduto = 0;
  let ownEnvio = 0;
  for (const t of ownTxs) {
    const price = num(t.product_price) || num(t.total_value) || num(t.amount);
    const c = custosDa(t).config;
    const gross = price * (num(c.affiliate_percent) / 100);
    const net =
      gross * (1 - num(c.affiliate_platform_fee) / 100) -
      num(c.affiliate_platform_fixed);
    simRevenue += Math.max(0, net);
    const k = kitCostFor(t); // reutilizado na operação interna (2.4)
    ownProduto += k.produto;
    ownEnvio += k.envio;
    ownKitCosts += k.produto + k.envio;
  }
  const simProfit = simRevenue - adsInvestment;
  const simRoi = adsInvestment > 0 ? simRevenue / adsInvestment : 0;
  const simCpa = ownTxs.length > 0 ? adsInvestment / ownTxs.length : 0;

  // 2.3 Lucro com afiliados externos (receita = comissão de produtor)
  let affCommission = 0;
  let affKitCosts = 0;
  for (const t of affTxs) {
    affCommission += num(t.producer_commission);
    const k = kitCostFor(t);
    affKitCosts += k.produto + k.envio;
  }
  const affProfit = affCommission - affKitCosts;

  // 2.4 Lucro operação interna (receita = comissão líquida das vendas próprias)
  const internalRevenue = ownTxs.reduce((s, t) => s + num(t.commission), 0);
  const internalProfit = internalRevenue - ownKitCosts - envioFrustradas - adsInvestment;

  // 2.5 Lucro produtor total
  const producerTotal = internalProfit + affProfit;

  // 2.6 Lucro geral
  const generalProfit = producerTotal - cashflowExits;

  // 2.7 Distribuição
  const companyReserve =
    generalProfit * (config.company_reserve_percent / 100);
  const remaining = generalProfit - companyReserve;
  const distributionPartners = partners.map((p) => ({
    id: p.id,
    name: p.name,
    percent: num(p.percent),
    value: remaining * (num(p.percent) / 100),
  }));

  return NextResponse.json({
    period: { from: fromDate, to: toDate },
    simulation_affiliate: {
      revenue: simRevenue,
      kit_costs: ownKitCosts,
      ads_investment: adsInvestment,
      profit: simProfit,
      roi: simRoi,
      cpa: simCpa,
    },
    affiliate_external: {
      commission_total: affCommission,
      sales_count: affTxs.length,
      kit_costs: affKitCosts,
      profit: affProfit,
    },
    internal_operation: {
      revenue: internalRevenue,
      sales_count: ownTxs.length,
      kit_costs: ownKitCosts,
      kit_produto: ownProduto,
      kit_envio: ownEnvio,
      frustradas_envio: envioFrustradas,
      frustradas_count: frustradas.length,
      ads_investment: adsInvestment,
      profit: internalProfit,
    },
    producer_total: {
      internal_profit: internalProfit,
      affiliate_profit: affProfit,
      total: producerTotal,
    },
    general: {
      producer_total: producerTotal,
      cashflow_exits: cashflowExits,
      profit: generalProfit,
    },
    distribution: {
      company_reserve: {
        percent: config.company_reserve_percent,
        value: companyReserve,
      },
      remaining,
      partners: distributionPartners,
    },
  });
}
