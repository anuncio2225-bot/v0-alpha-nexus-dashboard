import type {
  Attendant,
  AttendantRule,
  CommissionResult,
  CommissionBonus,
} from "@/types";

/**
 * Transação mínima necessária para o cálculo de comissão.
 * A tabela `transactions` é somente leitura — aqui só consumimos os campos.
 */
export interface CommissionTx {
  status: string | null;
  amount: number | null;
  total_value: number | null;
  paid_value: number | null;
  commission: number | null;
  affiliate_commission: number | null;
  sale_date: string | null;
  payment_date: string | null;
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Calcula o período de fechamento atual com base no dia de fechamento.
 * Ex.: closingDay = 9 e hoje = 06/07 → período 09/06 até 08/07.
 */
export function getCurrentPeriod(closingDay: number): { start: string; end: string } {
  const clamp = Math.min(Math.max(closingDay || 1, 1), 28);
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  let start: Date;
  let end: Date;

  if (today.getDate() >= clamp) {
    start = new Date(year, month, clamp);
    end = new Date(year, month + 1, clamp - 1);
  } else {
    start = new Date(year, month - 1, clamp);
    end = new Date(year, month, clamp - 1);
  }

  return { start: toYMD(start), end: toYMD(end) };
}

/**
 * Valor base de uma venda para efeito de comissão da atendente.
 */
export function saleBaseValue(tx: CommissionTx, attendant: Attendant): number {
  if (attendant.calc_mode === "producer") {
    const gross =
      Number(tx.total_value) || Number(tx.amount) || Number(tx.paid_value) || 0;
    const afterPct = gross * (1 - (attendant.platform_fee_percent || 0) / 100);
    const afterFixed = afterPct - (attendant.platform_fee_fixed || 0);
    const producerPct = attendant.producer_affiliate_percent || 0;
    const base = producerPct > 0 ? afterFixed * (producerPct / 100) : afterFixed;
    return Math.max(base, 0);
  }
  // affiliate: valor já descontado que o dono recebe por venda
  return (
    Number(tx.affiliate_commission) ||
    Number(tx.commission) ||
    Number(tx.paid_value) ||
    Number(tx.total_value) ||
    Number(tx.amount) ||
    0
  );
}

/** Dedução da plataforma por venda (apenas para relatório, modo produtor). */
function platformDeduction(tx: CommissionTx, attendant: Attendant): number {
  if (attendant.calc_mode !== "producer") return 0;
  const gross =
    Number(tx.total_value) || Number(tx.amount) || Number(tx.paid_value) || 0;
  return gross * ((attendant.platform_fee_percent || 0) / 100) + (attendant.platform_fee_fixed || 0);
}

/**
 * Calcula a comissão de uma atendente para um conjunto de vendas pagas.
 * Faixas progressivas são RETROATIVAS: a % da faixa atual aplica-se a todas as vendas.
 */
export function calculateCommission(
  attendant: Attendant,
  rules: AttendantRule[],
  paidSales: CommissionTx[],
  period: { start: string; end: string }
): CommissionResult {
  const totalSales = paidSales.length;

  const baseValueTotal = paidSales.reduce(
    (sum, tx) => sum + saleBaseValue(tx, attendant),
    0
  );
  const platformDeductions = paidSales.reduce(
    (sum, tx) => sum + platformDeduction(tx, attendant),
    0
  );

  // Faixas de comissão progressivas
  const commissionRules = rules
    .filter((r) => r.rule_type === "commission")
    .sort((a, b) => a.min_sales - b.min_sales);

  let tierPercent = 0;
  let tierLabel = "Sem faixa";
  let nextTier: CommissionResult["next_tier"] = null;

  if (commissionRules.length > 0) {
    let matchIndex = -1;
    for (let i = 0; i < commissionRules.length; i++) {
      const r = commissionRules[i];
      const withinMin = totalSales >= r.min_sales;
      const withinMax = r.max_sales == null || totalSales <= r.max_sales;
      if (withinMin && withinMax) {
        matchIndex = i;
        break;
      }
    }
    // Se ultrapassou todas as faixas, usa a última
    if (matchIndex === -1 && totalSales >= commissionRules[0].min_sales) {
      matchIndex = commissionRules.length - 1;
    }
    if (matchIndex >= 0) {
      const r = commissionRules[matchIndex];
      tierPercent = r.commission_value;
      tierLabel = r.label || `Faixa ${matchIndex + 1}`;
      const next = commissionRules[matchIndex + 1];
      if (next) {
        nextTier = {
          percent: next.commission_value,
          sales_needed: Math.max(next.min_sales - totalSales, 0),
          label: next.label || `Faixa ${matchIndex + 2}`,
        };
      }
    } else {
      // Ainda não atingiu a primeira faixa
      const first = commissionRules[0];
      nextTier = {
        percent: first.commission_value,
        sales_needed: Math.max(first.min_sales - totalSales, 0),
        label: first.label || "Faixa 1",
      };
    }
  } else {
    // Sem faixas configuradas: usa commission_rate simples da atendente
    tierPercent = attendant.commission_rate || 0;
    tierLabel = tierPercent > 0 ? `Comissão fixa ${tierPercent}%` : "Sem faixa";
  }

  const commissionValue = baseValueTotal * (tierPercent / 100);
  const fixedPerSaleTotal = totalSales * (attendant.fixed_per_sale || 0);

  // Bonificações cumulativas
  const bonusRules = rules
    .filter((r) => r.rule_type === "bonus")
    .sort((a, b) => a.min_sales - b.min_sales);

  const bonuses: CommissionBonus[] = bonusRules.map((r) => {
    const achieved = totalSales >= r.min_sales;
    return {
      label: r.label || `${r.min_sales} vendas`,
      value: r.bonus_value,
      achieved,
      remaining: achieved ? undefined : r.min_sales - totalSales,
    };
  });

  const bonusTotal = bonuses
    .filter((b) => b.achieved)
    .reduce((sum, b) => sum + b.value, 0);

  const totalToPay = commissionValue + fixedPerSaleTotal + bonusTotal;

  return {
    period,
    total_sales: totalSales,
    commission_tier: { percent: tierPercent, label: tierLabel },
    next_tier: nextTier,
    base_value_total: baseValueTotal,
    commission_value: commissionValue,
    fixed_per_sale_total: fixedPerSaleTotal,
    bonuses,
    bonus_total: bonusTotal,
    platform_deductions: platformDeductions,
    total_to_pay: totalToPay,
  };
}
