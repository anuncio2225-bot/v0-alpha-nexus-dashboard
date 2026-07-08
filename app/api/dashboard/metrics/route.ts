import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";
import { format, eachDayOfInterval, parseISO } from "date-fns";
import {
  formatCurrency,
  formatPercent,
  calcROI,
  calcCAC,
  calcLucro,
  getCampaignScore,
  safeNumber,
} from "@/lib/utils";
import type {
  DashboardMetrics,
  DailyData,
  CampaignData,
  AttendantRanking,
  ProductOption,
} from "@/types";

type Tx = {
  status: string | null;
  sale_type: string | null;
  amount: number | null;
  total_value: number | null;
  paid_value: number | null;
  commission: number | null;
  affiliate_commission: number | null;
  producer_commission: number | null;
  product_name: string | null;
  product_id: string | null;
  attendant_id: string | null;
  sale_date: string | null;
  payment_date: string | null;
  webhook_id: string | null;
  created_at: string | null;
};

export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const attendantId = searchParams.get("src");
  // Multi product filter: comma-separated list of product ids/names. Empty = all products.
  const productsParam = searchParams.get("products");
  const productFilters = productsParam
    ? productsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  // Suporta múltiplos modos separados por vírgula (ex.: "antecipado,recuperacao").
  // Quando vazio ou não enviado, equivale a "todos".
  const modeParam = searchParams.get("mode") || "";
  const modes = modeParam
    ? modeParam.split(",").map((m) => m.trim()).filter(Boolean) as Array<"afterpay" | "antecipado" | "recuperacao">
    : [];
  // Para compatibilidade com código legado que usava "mode" singular:
  const mode = modes.length === 1 ? modes[0] : modes.length === 0 ? "all" : "multi";

  if (!from || !to) {
    return NextResponse.json(
      { error: "Missing from/to params" },
      { status: 400 }
    );
  }

  try {
    // 1. Fetch ALL transactions in period
    // Use sale_date if available, otherwise use created_at as fallback
    // This ensures transactions without sale_date still appear
    let txQuery = supabase
      .from("transactions")
      .select(
        "status, sale_type, amount, total_value, paid_value, commission, affiliate_commission, producer_commission, product_name, product_id, attendant_id, sale_date, payment_date, webhook_id, created_at"
      )
      .eq("user_id", await getEffectiveUserId(supabase, user.id))
      // Apenas vendas PRÓPRIAS. Afiliados externos (affiliate_incoming) ficam de
      // fora do dashboard. Rows antigas (NULL) contam como próprias por segurança.
      .or("origin_type.eq.own,origin_type.is.null");

    // Flags de modalidade selecionadas ([] = todos)
    const hasAfterPay = modes.length === 0 || modes.includes("afterpay");
    const hasAntecipado = modes.length === 0 || modes.includes("antecipado");
    const hasRecuperacao = modes.length === 0 || modes.includes("recuperacao");

    // Estratégia de data:
    // Se APENAS antecipado e/ou recuperação estão selecionados (sem afterpay) →
    //   usamos payment_date (quando o dinheiro entrou de fato).
    // Em qualquer outro caso (afterpay presente, ou todos) →
    //   usamos sale_date (data do pedido) para não perder agendadas.
    const onlyPaymentBased = !hasAfterPay && (hasAntecipado || hasRecuperacao);

    if (onlyPaymentBased) {
      txQuery = txQuery
        .not("payment_date", "is", null)
        .gte("payment_date", from)
        .lte("payment_date", to);
    } else {
      txQuery = txQuery.or(
        `and(sale_date.gte.${from},sale_date.lte.${to}),and(sale_date.is.null,created_at.gte.${from},created_at.lte.${to})`
      );
    }

    // Filtrar por sale_type quando modos específicos foram selecionados
    if (modes.length > 0) {
      const saleTypes = modes.map(String);
      if (saleTypes.length === 1) {
        txQuery = txQuery.eq("sale_type", saleTypes[0]);
      } else {
        txQuery = txQuery.in("sale_type", saleTypes);
      }
    }

    if (attendantId) {
      txQuery = txQuery.eq("attendant_id", attendantId);
    }
    if (productFilters.length > 0) {
      // Match by product_id OR product_name (any of the selected)
      const orClauses = productFilters
        .flatMap((p) => [`product_id.eq.${p}`, `product_name.eq.${p}`])
        .join(",");
      txQuery = txQuery.or(orClauses);
    }

    const { data: transactions, error: txError } = await txQuery;
    if (txError) {
      console.error("[v0] Error fetching transactions:", txError);
      return NextResponse.json({ error: txError.message }, { status: 500 });
    }

    // Cast transactions to Tx[] immediately
    const txList = (transactions || []) as Tx[];

    // 1b. Filtrar transações pelas modalidades selecionadas usando sale_type.
    // Não filtramos por webhook aqui — o sale_type já identifica a modalidade.
    // Quando nenhum modo selecionado (hasAfterPay/Antecipado/Recuperacao todos true) → sem filtro.
    let filteredTxList = txList;
    if (modes.length > 0) {
      filteredTxList = txList.filter((t) => modes.includes(t.sale_type as typeof modes[number]));
    }

    // 2. Fetch product list (for filter dropdown) - ALWAYS the full list,
    // independent of current product filter, so the user can change selection.
    const { data: allProductsRaw } = await supabase
      .from("transactions")
      .select("product_id, product_name, webhook_id, sale_date, created_at")
      .eq("user_id", await getEffectiveUserId(supabase, user.id))
      .or("origin_type.eq.own,origin_type.is.null")
      .not("product_name", "is", null)
      .or(
        `and(sale_date.gte.${from},sale_date.lte.${to}),and(sale_date.is.null,created_at.gte.${from},created_at.lte.${to})`
      );

    // 2b. Fetch ALL webhooks to build product list AND webhook map
    const { data: webhooksRaw } = await supabase
      .from("webhooks")
      .select("id, name, product_name, is_active, operational_type")
      .eq("user_id", await getEffectiveUserId(supabase, user.id));

    const webhookById = new Map<string, { name: string; productName: string | null; operationalType: string }>();
    (webhooksRaw || []).forEach((w) => {
      if (!w.id) return;
      webhookById.set(w.id, {
        name: w.name || "Webhook",
        productName: w.product_name || null,
        operationalType: w.operational_type || "afterpay",
      });
    });

    const productMap = new Map<string, ProductOption>();
    (allProductsRaw || []).forEach((p) => {
      const name = p.product_name?.trim();
      if (!name) return;
      const key = p.product_id || name;
      const existing = productMap.get(key);
      if (existing) {
        existing.count += 1;
        // Keep first webhook found
        if (!existing.webhookName && p.webhook_id) {
          const wh = webhookById.get(p.webhook_id);
          if (wh) {
            existing.webhookName = wh.name;
            existing.webhookId = p.webhook_id;
          }
        }
      } else {
        const wh = p.webhook_id ? webhookById.get(p.webhook_id) : null;
        productMap.set(key, {
          id: key,
          name,
          count: 1,
          webhookId: p.webhook_id || null,
          webhookName: wh?.name || null,
        });
      }
    });
    // Also add products from webhooks that may not have transactions yet
    (webhooksRaw || []).forEach((w) => {
      if (!w.product_name || !w.is_active) return;
      const name = w.product_name.trim();
      if (!name) return;
      const key = name;
      if (!productMap.has(key)) {
        productMap.set(key, {
          id: key,
          name,
          count: 0,
          webhookId: w.id,
          webhookName: w.name || "Webhook",
        });
      }
    });

    const products: ProductOption[] = Array.from(productMap.values()).sort(
      (a, b) => b.count - a.count
    );

    // 2c. NEW METRIC: "Entradas no periodo" based on PAYMENT DATE (not sale date).
    // This is a SEPARATE query that finds paid orders whose payment_date falls
    // inside the selected period. Critical for affiliates: a sale created in
    // January but paid in May should count as a May "entrada".
    let paymentsQuery = supabase
      .from("transactions")
      .select(
        "status, sale_type, amount, total_value, paid_value, commission, affiliate_commission, producer_commission, product_id, product_name, payment_date"
      )
      .eq("user_id", await getEffectiveUserId(supabase, user.id))
      .or("origin_type.eq.own,origin_type.is.null")
      .eq("status", "pago")
      .not("payment_date", "is", null)
      .gte("payment_date", from)
      .lte("payment_date", to);

    if (productFilters.length > 0) {
      const orClauses = productFilters
        .flatMap((p) => [`product_id.eq.${p}`, `product_name.eq.${p}`])
        .join(",");
      paymentsQuery = paymentsQuery.or(orClauses);
    }

    const { data: paymentsByPaymentDate } = await paymentsQuery;

    // 3. Fetch Ad Investments (manual entries from ad_investments table)
    const dateFrom = from.split("T")[0];
    const dateTo = to.split("T")[0];
    const { data: adInvestments } = await supabase
      .from("ad_investments")
      .select("investment_value, date, platform, campaign_name")
      .eq("user_id", await getEffectiveUserId(supabase, user.id))
      .gte("date", dateFrom)
      .lte("date", dateTo);

    // 3b. Fetch Meta Ads spend (automatic) from meta_ads_performance.
    // Mesma logica/fonte usada em /api/meta/insights para que os numeros
    // BATAM entre o dashboard principal e a aba "Investimento em Ads":
    // consideramos apenas as contas ATIVAS do usuario e somamos o spend
    // do periodo (por dia). NUNCA altera/insere dados aqui (somente leitura).
    const { data: activeMetaAccounts } = await supabase
      .from("meta_ad_accounts")
      .select("account_id")
      .eq("user_id", await getEffectiveUserId(supabase, user.id))
      .eq("is_active", true);

    const activeMetaIds = (activeMetaAccounts || []).map((a) => a.account_id);

    // Mapa de spend Meta por dia (YYYY-MM-DD) e total agregado do periodo.
    const metaSpendByDay = new Map<string, number>();
    let metaSpendTotal = 0;
    if (activeMetaIds.length > 0) {
      const { data: metaPerf } = await supabase
        .from("meta_ads_performance")
        .select("date, spend")
        .eq("user_id", await getEffectiveUserId(supabase, user.id))
        .in("ad_account_id", activeMetaIds)
        .gte("date", dateFrom)
        .lte("date", dateTo);

      (metaPerf || []).forEach((row) => {
        const spend = safeNumber(row.spend);
        metaSpendTotal += spend;
        metaSpendByDay.set(
          row.date,
          (metaSpendByDay.get(row.date) || 0) + spend
        );
      });
    }

    // 4. Settings (ads_tax_percentage for tax on ad spend)
    const { data: settings } = await supabase
      .from("settings")
      .select("meta_tax_multiplier, ads_tax_percentage")
      .eq("user_id", await getEffectiveUserId(supabase, user.id))
      .maybeSingle();

    const adsTaxPercent = settings?.ads_tax_percentage ?? 6;

    // 5. Calculate KPIs from real data
    const adsList = adInvestments || [];

    // CRITICAL: User wants commission-based revenue, not full product price.
    // Priority: affiliate_commission > commission > paid_value > total_value > amount.
    // This represents what the user actually receives as an affiliate.
    // ALL values wrapped in safeNumber to prevent NaN from breaking the pipeline.
    const txValue = (t: Tx) => {
      const val = t.affiliate_commission || t.commission || t.paid_value || t.total_value || t.amount || 0;
      return safeNumber(val);
    };
    const txCommission = (t: Tx) => {
      return safeNumber(t.affiliate_commission || t.commission || 0);
    };

    // Status buckets (Portuguese canonical) - use filtered list
    const workingList = filteredTxList;

    const sumValue = (arr: Tx[]) => arr.reduce((s, t) => s + txValue(t), 0);
    const sumCommission = (arr: Tx[]) =>
      arr.reduce((s, t) => s + txCommission(t), 0);

    const pagas = workingList.filter((t) => t.status === "pago");
    const agendadas = workingList.filter((t) => t.status === "agendado");
    const aguardando = workingList.filter((t) => t.status === "aguardando");
    const canceladas = workingList.filter((t) => t.status === "cancelado");
    const devolvidas = workingList.filter((t) => t.status === "devolvido");
    const frustradasOnly = workingList.filter((t) => t.status === "frustrado");

    // Separar pagas por sale_type para cálculo correto por modo.
    // Antecipado e Recuperação = pagas no ato (dinheiro já entrou).
    const pagasAntecipadas = workingList.filter(
      (t) => t.sale_type === "antecipado" && t.status === "pago"
    );
    const pagasRecuperacao = workingList.filter(
      (t) => t.sale_type === "recuperacao" && t.status === "pago"
    );

    // "Antecipadas" card = pagas antecipadas + pagas recuperação (tudo pago no ato)
    const antecipadas = workingList.filter(
      (t) =>
        (t.sale_type === "antecipado" || t.sale_type === "recuperacao") &&
        t.status === "pago"
    );

    const valorPagasAntecipadas = sumValue(pagasAntecipadas);
    const valorPagasRecuperacao = sumValue(pagasRecuperacao);

    // Frustradas = cancelado + devolvido + frustrado
    const frustradas = [...canceladas, ...devolvidas, ...frustradasOnly];

    const valorPagas = sumValue(pagas);
    const valorAgendadas = sumValue(agendadas);
    const valorAntecipadas = sumValue(antecipadas);
    const valorFrustradas = sumValue(frustradas);

    // Entradas no periodo (by payment_date) - independent from "Pagas" (by sale_date).
    // Uses commission-first priority just like every other metric.
    const entradasList = (paymentsByPaymentDate || []) as Tx[];
    const valorEntradasCommission = entradasList.reduce(
      (s, t) => s + txValue(t),
      0
    );

    const comissaoReal = sumCommission(pagas);
    const comissaoProjetada = sumCommission([...agendadas, ...aguardando]);
    const valorReceber = valorAgendadas + sumValue(aguardando);

    // INVESTMENT: manual (ad_investments) + automatico (Meta) no periodo.
    // DEDUPLICACAO: manuais de plataforma "meta_ads" em datas que ja possuem
    // dado automatico do Meta sao ignorados na soma (evita contar dobrado).
    // Manuais de outras plataformas (Google, TikTok etc.) entram normalmente.
    const metaAutoDateSet = new Set<string>(metaSpendByDay.keys());
    const manualSpend = adsList.reduce((s, a) => {
      // Suprime o manual se for meta_ads E ja houver dado automatico naquele dia
      if (a.platform === "meta_ads" && metaAutoDateSet.has(a.date)) return s;
      return s + safeNumber(a.investment_value);
    }, 0);
    // totalSpend combinado = manual deduplicado + Meta (mesma base da aba Investimento em Ads)
    const totalSpend = safeNumber(manualSpend + metaSpendTotal);
    const safeTaxPercent = safeNumber(adsTaxPercent);
    const investimentoComImposto = safeNumber(
      totalSpend + totalSpend * (safeTaxPercent / 100)
    );

    // Quantidade de "lancamentos" considerando ambas as fontes (manual + dias com gasto Meta)
    const investmentEntriesCount = adsList.length + metaSpendByDay.size;

    // ============================================================
    // MODE-BASED CALCULATIONS
    // ============================================================
    // Cada modalidade contribui com sua parte na receita base:
    //   Afterpay    → AGENDADAS (projeção futura — NÃO muda com Recuperação)
    //   Antecipado  → PAGAS antecipadas (receita real)
    //   Recuperação → PAGAS recuperação (receita real, ADICIONA ao que já está)
    //
    // Recuperação NUNCA altera a base do Afterpay. Ela apenas SOMA.
    // Cenário B (Afterpay + Recuperação):
    //   receitaBase = agendadas + pagas_recuperacao
    //   quantidadeBase = agendadas.length + pagasRecuperacao.length
    // ============================================================

    // flags já declaradas acima (hasAfterPay / hasAntecipado / hasRecuperacao)
    let receitaBase = 0;
    let quantidadeBase = 0;

    if (hasAfterPay) {
      // Afterpay contribui com AGENDADAS (projeção)
      receitaBase += valorAgendadas;
      quantidadeBase += agendadas.length;
    }
    if (hasAntecipado) {
      // Antecipado contribui com PAGAS antecipadas (real)
      receitaBase += valorPagasAntecipadas;
      quantidadeBase += pagasAntecipadas.length;
    }
    if (hasRecuperacao) {
      // Recuperação contribui com PAGAS recuperação (real) — SOMA, não substitui
      receitaBase += valorPagasRecuperacao;
      quantidadeBase += pagasRecuperacao.length;
    }

    // ALL derived metrics wrapped in safeNumber - investment NEVER breaks sales
    const roi = safeNumber(
      investimentoComImposto > 0
        ? ((receitaBase - investimentoComImposto) / investimentoComImposto) * 100
        : 0
    );

    const lucro = safeNumber(receitaBase - investimentoComImposto);

    const cpa = safeNumber(
      quantidadeBase > 0 ? investimentoComImposto / quantidadeBase : 0
    );

    const ticketMedio = safeNumber(
      quantidadeBase > 0 ? receitaBase / quantidadeBase : 0
    );

    const totalRelevant = quantidadeBase + frustradas.length;
    const taxaConversao = safeNumber(
      totalRelevant > 0 ? (quantidadeBase / totalRelevant) * 100 : 0
    );

    const totalParaFrustracao = pagas.length + frustradas.length;
    const taxaFrustracao = safeNumber(
      totalParaFrustracao > 0 ? (frustradas.length / totalParaFrustracao) * 100 : 0
    );

    const cac = safeNumber(calcCAC(investimentoComImposto, pagas.length));

    const kpis: DashboardMetrics["kpis"] = {
      agendadas: {
        label: "Agendadas",
        value: valorAgendadas,
        formatted: formatCurrency(valorAgendadas),
        tooltip: `${agendadas.length} vendas agendadas`,
        color: "neutral",
      },
      antecipadas: {
        label: "Antecipadas",
        value: valorAntecipadas,
        formatted: formatCurrency(valorAntecipadas),
        tooltip: `${antecipadas.length} vendas antecipadas`,
        color: "brand",
      },
      recuperacoes: {
        label: "Recuperação",
        value: valorPagasRecuperacao,
        formatted: formatCurrency(valorPagasRecuperacao),
        tooltip: `${pagasRecuperacao.length} venda${pagasRecuperacao.length !== 1 ? "s" : ""} de recuperação pagas`,
        color: "success",
      },
      pagas: {
        label: "Pagas",
        value: valorPagas,
        formatted: formatCurrency(valorPagas),
        tooltip: `${pagas.length} vendas pagas`,
        color: "success",
      },
      frustradas: {
        label: "Frustradas",
        value: valorFrustradas,
        formatted: formatCurrency(valorFrustradas),
        tooltip: `${frustradas.length} vendas frustradas`,
        color: "danger",
      },
      entradasHoje: {
        label: "Pagas no Período",
        subtitle: "Baseado na data de pagamento",
        value: valorEntradasCommission,
        formatted: formatCurrency(valorEntradasCommission),
        tooltip: `${entradasList.length} pagamento(s) recebido(s) no período (por data de pagamento)`,
        color: "success",
      },
      comissaoReal: {
        label: "Comissão Real",
        value: comissaoReal,
        formatted: formatCurrency(comissaoReal),
        tooltip: "Comissão das vendas pagas",
        color: "success",
      },
      comissaoProjetada: {
        label: "Comissão Projetada",
        value: comissaoProjetada,
        formatted: formatCurrency(comissaoProjetada),
        tooltip: "Comissão esperada (agendadas + aguardando)",
        color: "brand",
      },
      valorReceber: {
        label: "A Receber",
        value: valorReceber,
        formatted: formatCurrency(valorReceber),
        tooltip: "Valor total a receber",
        color: "brand",
      },
      investimento: {
        label: "Investimento",
        value: investimentoComImposto,
        formatted: formatCurrency(investimentoComImposto),
        tooltip: `Meta ${formatCurrency(metaSpendTotal)} + manual ${formatCurrency(manualSpend)} (${investmentEntriesCount} lançamento${investmentEntriesCount !== 1 ? "s" : ""}) + ${adsTaxPercent}% imposto`,
        color: "warning",
      },
      roi: {
        label: "ROI",
        value: roi,
        formatted: investimentoComImposto > 0 ? formatPercent(roi) : "--",
        tooltip: `ROI: ((${formatCurrency(receitaBase)} - ${formatCurrency(investimentoComImposto)}) / ${formatCurrency(investimentoComImposto)}) x 100`,
        color: roi >= 100 ? "success" : roi >= 0 ? "warning" : "danger",
      },
      cac: {
        label: "CAC",
        value: cac,
        formatted: formatCurrency(cac),
        tooltip: "Custo de aquisição por cliente (vendas pagas)",
        color: "neutral",
      },
      lucro: {
        label: "Lucro",
        value: lucro,
        formatted: formatCurrency(lucro),
        tooltip: `${formatCurrency(receitaBase)} - ${formatCurrency(investimentoComImposto)}`,
        color: lucro >= 0 ? "success" : "danger",
      },
      taxaFrustracao: {
        label: "Taxa Frustração",
        value: taxaFrustracao,
        formatted: formatPercent(taxaFrustracao),
        tooltip: "Percentual de vendas frustradas",
        color:
          taxaFrustracao <= 10
            ? "success"
            : taxaFrustracao <= 20
              ? "warning"
              : "danger",
      },
      cpa: {
        label: "CPA",
        value: cpa,
        formatted: quantidadeBase > 0 ? formatCurrency(cpa) : "--",
        tooltip: `Custo por aquisição: ${formatCurrency(investimentoComImposto)} / ${quantidadeBase} pedidos`,
        color: "neutral",
      },
      caixaEsperado: {
        label: "Caixa Esperado",
        value: receitaBase,
        formatted: formatCurrency(receitaBase),
        tooltip: (() => {
          const parts: string[] = [];
          if (hasAfterPay) parts.push(`Agendadas: ${formatCurrency(valorAgendadas)}`);
          if (hasAntecipado) parts.push(`Antecipadas: ${formatCurrency(valorPagasAntecipadas)}`);
          if (hasRecuperacao) parts.push(`Recuperação: ${formatCurrency(valorPagasRecuperacao)}`);
          return parts.join(" + ") || formatCurrency(receitaBase);
        })(),
        color: "brand",
      },
      taxaConversao: {
        label: "Taxa Conversão",
        value: taxaConversao,
        formatted: formatPercent(taxaConversao),
        tooltip: `${quantidadeBase} convertidas de ${totalRelevant} total`,
        color: taxaConversao >= 70 ? "success" : "warning",
      },
      ticketMedio: {
        label: "Ticket Médio",
        value: ticketMedio,
        formatted: quantidadeBase > 0 ? formatCurrency(ticketMedio) : "--",
        tooltip: `${formatCurrency(receitaBase)} / ${quantidadeBase} pedidos`,
        color: "neutral",
      },
    };

    // 6. Daily series
    const days = eachDayOfInterval({
      start: parseISO(from),
      end: parseISO(to),
    });

    const dailyData: DailyData[] = days.map((day) => {
      const dayStr = format(day, "yyyy-MM-dd");
      // Use sale_date if available, otherwise created_at
      const dayTx = workingList.filter((t) => {
        const dateToUse = t.sale_date || t.created_at;
        return dateToUse && dateToUse.startsWith(dayStr);
      });
      const dayAds = adsList.filter((a) => a.date === dayStr);
      const dayMetaSpend = safeNumber(metaSpendByDay.get(dayStr) || 0);
      // Deduplicacao: manuais de meta_ads nao entram se ja ha automatico no dia
      const dayManualSpend = dayAds.reduce((s, a) => {
        if (a.platform === "meta_ads" && dayMetaSpend > 0) return s;
        return s + safeNumber(a.investment_value);
      }, 0);
      const dayAdSpend = dayManualSpend + dayMetaSpend;

      return {
        date: dayStr,
        label: format(day, "dd/MM"),
        agendadas: dayTx.filter((t) => t.status === "agendado").length,
        antecipadas: dayTx.filter(
          (t) =>
            (t.sale_type === "antecipado" || t.sale_type === "recuperacao") &&
            (t.status === "agendado" || t.status === "pago")
        ).length,
        pagas: dayTx.filter((t) => t.status === "pago").length,
        frustradas: dayTx.filter(
          (t) =>
            t.status === "cancelado" ||
            t.status === "devolvido" ||
            t.status === "frustrado"
        ).length,
        comissao: safeNumber(sumCommission(dayTx.filter((t) => t.status === "pago"))),
        investimento: safeNumber(dayAdSpend + dayAdSpend * (safeTaxPercent / 100)),
      };
    });

    // 7. Campaigns - group by platform from ad_investments (deduplicado)
    const platformMap = new Map<string, { spend: number; count: number }>();
    adsList.forEach((a) => {
      // Suprime manuais de meta_ads cobertos pelo automatico
      if (a.platform === "meta_ads" && metaAutoDateSet.has(a.date)) return;
      const key = a.platform || "outros";
      const existing = platformMap.get(key) || { spend: 0, count: 0 };
      existing.spend += safeNumber(a.investment_value);
      existing.count += 1;
      platformMap.set(key, existing);
    });
    // Inclui o gasto automatico do Meta na plataforma "meta_ads" para o
    // breakdown de campanhas ficar coerente com o total combinado.
    if (metaSpendTotal > 0) {
      const existing = platformMap.get("meta_ads") || { spend: 0, count: 0 };
      existing.spend += metaSpendTotal;
      existing.count += metaSpendByDay.size;
      platformMap.set("meta_ads", existing);
    }

    const platformLabels: Record<string, string> = {
      meta_ads: "Meta Ads",
      google_ads: "Google Ads",
      tiktok_ads: "TikTok Ads",
      kwai_ads: "Kwai Ads",
      youtube_ads: "YouTube Ads",
      taboola: "Taboola",
      outros: "Outros",
    };

    const campaigns: CampaignData[] = Array.from(platformMap.entries())
      .map(([platform, data]) => {
        const spendWithTax = safeNumber(
          data.spend + data.spend * (safeTaxPercent / 100)
        );
        const estRevenue = safeNumber(
          receitaBase > 0 && totalSpend > 0
            ? receitaBase * (data.spend / totalSpend)
            : 0
        );
        const roi = safeNumber(calcROI(estRevenue, spendWithTax));

        return {
          id: platform,
          name: platformLabels[platform] || platform,
          spend: spendWithTax,
          revenue: estRevenue,
          conversions: data.count,
          roi,
          ctr: 0,
          cpc: safeNumber(data.count > 0 ? data.spend / data.count : 0),
          score: getCampaignScore({ roi, conversions: data.count }),
        };
      })
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 6);

    // 8. Attendant ranking
    const { data: attendantsRaw } = await supabase
      .from("attendants")
      .select("id, name, monthly_goal")
      .eq("user_id", await getEffectiveUserId(supabase, user.id))
      .eq("status", "active");

    const attendants: AttendantRanking[] = (attendantsRaw || [])
      .map((att) => {
        const attTx = workingList.filter(
          (t) => t.attendant_id === att.id && t.status === "pago"
        );
        const revenue = safeNumber(sumValue(attTx));
        const commission = safeNumber(sumCommission(attTx));
        const goal = safeNumber(att.monthly_goal);
        const goalProgress = safeNumber(goal > 0 ? (revenue / goal) * 100 : 0);

        return {
          id: att.id,
          name: att.name,
          sales: attTx.length,
          revenue,
          commission,
          goal,
          goalProgress,
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);

    // Financial breakdown for pie chart (usando receitaBase do modo)
    const financialBreakdown = [
      { label: "Receita", value: safeNumber(receitaBase), color: "var(--success)" },
      { label: "Investimento", value: safeNumber(investimentoComImposto), color: "var(--warning)" },
      { label: "Frustradas", value: safeNumber(valorFrustradas), color: "var(--danger)" },
    ].filter((d) => d.value > 0);

    // Operational funnel
    const totalEntradas = agendadas.length + antecipadas.length + pagas.length + frustradas.length;
    const operationalFunnel = [
      { label: "Agendadas", value: agendadas.length, color: "var(--muted-foreground)" },
      { label: "Antecipadas", value: antecipadas.length, color: "var(--brand)" },
      { label: "Pagas", value: pagas.length, color: "var(--success)" },
      { label: "Frustradas", value: frustradas.length, color: "var(--danger)" },
    ].filter((d) => d.value > 0);

    const metrics: DashboardMetrics = {
      kpis,
      dailyData,
      campaigns,
      attendants,
      products,
      financialBreakdown,
      operationalFunnel,
    };

    return NextResponse.json(metrics);
  } catch (error) {
    console.error("[v0] Error calculating metrics:", error);
    const message =
      error instanceof Error ? error.message : "Failed to calculate metrics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
