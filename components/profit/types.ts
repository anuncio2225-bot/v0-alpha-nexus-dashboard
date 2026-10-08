export interface ProfitAnalysis {
  period: { from: string; to: string };
  simulation_affiliate: {
    revenue: number;
    kit_costs: number;
    ads_investment: number;
    profit: number;
    roi: number;
    cpa: number;
  };
  affiliate_external: {
    commission_total: number;
    sales_count: number;
    kit_costs: number;
    profit: number;
  };
  internal_operation: {
    revenue: number;
    sales_count: number;
    /** Frete dos pedidos enviados no período (= envios.frete). */
    kit_costs: number;
    envios?: {
      pedidos: number;
      frete: number;
      afterpay_em_aberto: number;
      afterpay_pagos: number;
      antecipados: number;
      frustrados: number;
    };
    /** Potes que saíram do estoque — só informação, já pagos. */
    estoque_saiu?: { potes: number; valor: number };
    ads_investment: number;
    profit: number;
  };
  producer_total: {
    internal_profit: number;
    affiliate_profit: number;
    total: number;
  };
  general: {
    producer_total: number;
    cashflow_exits: number;
    profit: number;
  };
  distribution: {
    /** Lucro geral negativo: sem caixa, prejuízo dividido igualmente entre os sócios. */
    prejuizo?: boolean;
    company_reserve: { percent: number; value: number };
    remaining: number;
    partners: { id: string; name: string; percent: number; value: number }[];
  };
}

export interface ProfitConfig {
  cost_per_unit: number;
  shipping_cost: number;
  affiliate_percent: number;
  affiliate_platform_fee: number;
  affiliate_platform_fixed: number;
  company_reserve_percent: number;
  excluded_cashflow_categories: string[];
}

/** Custos valendo a partir de uma data (Análise de Lucro por período). */
export interface VersaoCustos {
  vigente_desde: string;
  config: {
    cost_per_unit: number;
    shipping_cost: number;
    affiliate_percent: number;
    affiliate_platform_fee: number;
    affiliate_platform_fixed: number;
  };
  kits: { product_keyword: string; units_per_kit: number; custom_shipping: number | null }[];
}

export interface Partner {
  id: string;
  name: string;
  percent: number;
}

export interface ProductCost {
  id: string;
  product_name: string;
  product_keyword: string;
  units_per_kit: number;
  custom_shipping: number | null;
}
