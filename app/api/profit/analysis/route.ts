import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";

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

  const kitCostFor = (tx: Tx): number => {
    const hay = `${tx.plan_name || ""} ${tx.product_name || ""}`.toLowerCase();
    const match = productCosts.find(
      (pc) =>
        pc.product_keyword &&
        hay.includes(pc.product_keyword.trim().toLowerCase())
    );
    if (match) {
      const shipping =
        match.custom_shipping === null || match.custom_shipping === undefined
          ? config.shipping_cost
          : num(match.custom_shipping);
      return num(match.units_per_kit) * config.cost_per_unit + shipping;
    }
    // Fallback: 1 unidade + envio padrão
    return config.cost_per_unit + config.shipping_cost;
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
  const { data: txRaw } = await supabase
    .from("transactions")
    .select(
      "origin_type, status, commission, producer_commission, affiliate_commission, product_price, total_value, amount, product_name, plan_name, sale_date, payment_date, created_at"
    )
    .eq("user_id", userId)
    .eq("status", "pago")
    .in("origin_type", ["own", "affiliate_incoming"]);

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
  const { data: adInvestments } = await supabase
    .from("ad_investments")
    .select("investment_value, date, platform")
    .eq("user_id", userId)
    .gte("date", fromDate)
    .lte("date", toDate);

  const { data: activeMetaAccounts } = await supabase
    .from("meta_ad_accounts")
    .select("account_id")
    .eq("user_id", userId)
    .eq("is_active", true);
  const activeMetaIds = (activeMetaAccounts || []).map((a) => a.account_id);

  const metaAutoDateSet = new Set<string>();
  let metaSpendTotal = 0;
  if (activeMetaIds.length > 0) {
    const { data: metaPerf } = await supabase
      .from("meta_ads_performance")
      .select("date, spend")
      .eq("user_id", userId)
      .in("ad_account_id", activeMetaIds)
      .gte("date", fromDate)
      .lte("date", toDate);
    (metaPerf || []).forEach((row) => {
      metaSpendTotal += num(row.spend);
      if (num(row.spend) > 0) metaAutoDateSet.add(row.date as string);
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

  const rawSpend = manualSpend + metaSpendTotal;
  const adsInvestment = rawSpend + rawSpend * (adsTaxPercent / 100);

  // 6. Saídas do fluxo de caixa (excluindo categorias configuradas p/ evitar
  // dupla contagem, ex.: investimento em ads já descontado na operação interna)
  const excluded = new Set(
    config.excluded_cashflow_categories.map((c) => c.trim().toLowerCase())
  );
  const { data: cashflowRaw } = await supabase
    .from("cashflow")
    .select("type, category, amount, date")
    .eq("user_id", userId)
    .gte("date", fromTs)
    .lte("date", toTs);

  const cashflowExits = (cashflowRaw || []).reduce((s, row) => {
    const isExpense =
      (row.type || "").toLowerCase() === "expense" || num(row.amount) < 0;
    if (!isExpense) return s;
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
  for (const t of ownTxs) {
    const price = num(t.product_price) || num(t.total_value) || num(t.amount);
    const gross = price * (config.affiliate_percent / 100);
    const net =
      gross * (1 - config.affiliate_platform_fee / 100) -
      config.affiliate_platform_fixed;
    simRevenue += Math.max(0, net);
    ownKitCosts += kitCostFor(t); // reutilizado na operação interna (2.4)
  }
  const simProfit = simRevenue - adsInvestment;
  const simRoi = adsInvestment > 0 ? simRevenue / adsInvestment : 0;
  const simCpa = ownTxs.length > 0 ? adsInvestment / ownTxs.length : 0;

  // 2.3 Lucro com afiliados externos (receita = comissão de produtor)
  let affCommission = 0;
  let affKitCosts = 0;
  for (const t of affTxs) {
    affCommission += num(t.producer_commission);
    affKitCosts += kitCostFor(t);
  }
  const affProfit = affCommission - affKitCosts;

  // 2.4 Lucro operação interna (receita = comissão líquida das vendas próprias)
  const internalRevenue = ownTxs.reduce((s, t) => s + num(t.commission), 0);
  const internalProfit = internalRevenue - ownKitCosts - adsInvestment;

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
