-- ============================================================================
-- 011_attendants_v2.sql
-- Comissionamento progressivo + auto-deteccao de atendentes pelo SRC.
-- ADITIVO e IDEMPOTENTE. NAO altera a tabela transactions (somente leitura).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Novos campos na tabela attendants
--    (email, phone, role, monthly_goal, commission_rate, src ja existem)
-- ----------------------------------------------------------------------------
ALTER TABLE public.attendants ADD COLUMN IF NOT EXISTS payment_closing_day INTEGER DEFAULT 1;
ALTER TABLE public.attendants ADD COLUMN IF NOT EXISTS calc_mode TEXT DEFAULT 'affiliate';
ALTER TABLE public.attendants ADD COLUMN IF NOT EXISTS producer_affiliate_percent NUMERIC DEFAULT 0;
ALTER TABLE public.attendants ADD COLUMN IF NOT EXISTS platform_fee_percent NUMERIC DEFAULT 0;
ALTER TABLE public.attendants ADD COLUMN IF NOT EXISTS platform_fee_fixed NUMERIC DEFAULT 0;
ALTER TABLE public.attendants ADD COLUMN IF NOT EXISTS fixed_per_sale NUMERIC DEFAULT 0;
ALTER TABLE public.attendants ADD COLUMN IF NOT EXISTS auto_detected BOOLEAN DEFAULT FALSE;

-- ----------------------------------------------------------------------------
-- 2. Tabela attendant_rules (faixas progressivas + bonificacoes)
--    rule_type = 'commission' -> faixa progressiva (usa commission_value = %)
--    rule_type = 'bonus'      -> bonificacao por meta (usa bonus_value = R$)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendant_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  attendant_id UUID NOT NULL REFERENCES public.attendants(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL DEFAULT 'commission',
  label TEXT,
  min_sales INTEGER DEFAULT 0,
  max_sales INTEGER,
  commission_value NUMERIC DEFAULT 0,
  bonus_value NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendant_rules_attendant ON public.attendant_rules(attendant_id);
CREATE INDEX IF NOT EXISTS idx_attendant_rules_user ON public.attendant_rules(user_id);

ALTER TABLE public.attendant_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attendant_rules_user" ON public.attendant_rules;
CREATE POLICY "attendant_rules_user" ON public.attendant_rules
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- 3. Tabela attendant_payments (historico de pagamentos)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendant_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  attendant_id UUID NOT NULL REFERENCES public.attendants(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_sales INTEGER DEFAULT 0,
  commission_percent NUMERIC DEFAULT 0,
  commission_value NUMERIC DEFAULT 0,
  bonus_total NUMERIC DEFAULT 0,
  fixed_per_sale_total NUMERIC DEFAULT 0,
  platform_deductions NUMERIC DEFAULT 0,
  total_to_pay NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendant_payments_attendant ON public.attendant_payments(attendant_id);
CREATE INDEX IF NOT EXISTS idx_attendant_payments_user ON public.attendant_payments(user_id);

ALTER TABLE public.attendant_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attendant_payments_user" ON public.attendant_payments;
CREATE POLICY "attendant_payments_user" ON public.attendant_payments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
