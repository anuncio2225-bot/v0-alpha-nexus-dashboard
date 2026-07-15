-- Análise de Lucro: tabelas de configuração (aditivas, idempotentes).
-- NÃO altera nenhuma tabela existente. Apenas cria novas tabelas de config.

-- 1.1 Configuração de custos / simulação / distribuição
CREATE TABLE IF NOT EXISTS public.profit_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cost_per_unit NUMERIC DEFAULT 0,
  shipping_cost NUMERIC DEFAULT 0,
  affiliate_percent NUMERIC DEFAULT 50,
  affiliate_platform_fee NUMERIC DEFAULT 5.99,
  affiliate_platform_fixed NUMERIC DEFAULT 1,
  company_reserve_percent NUMERIC DEFAULT 33.33,
  excluded_cashflow_categories TEXT[] DEFAULT ARRAY['Investimento Ads','Meta Ads']::text[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE public.profit_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profit_config_user" ON public.profit_config;
CREATE POLICY "profit_config_user" ON public.profit_config
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 1.2 Sócios (distribuição de lucro)
CREATE TABLE IF NOT EXISTS public.profit_partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  percent NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.profit_partners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profit_partners_user" ON public.profit_partners;
CREATE POLICY "profit_partners_user" ON public.profit_partners
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 1.3 Custos de kits (produtos)
CREATE TABLE IF NOT EXISTS public.product_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  product_keyword TEXT NOT NULL,
  units_per_kit INTEGER NOT NULL DEFAULT 3,
  custom_shipping NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.product_costs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "product_costs_user" ON public.product_costs;
CREATE POLICY "product_costs_user" ON public.product_costs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_profit_partners_user ON public.profit_partners(user_id);
CREATE INDEX IF NOT EXISTS idx_product_costs_user ON public.product_costs(user_id);
