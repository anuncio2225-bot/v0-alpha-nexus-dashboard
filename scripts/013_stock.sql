-- Aba Estoque: movimentações e configuração (aditivo, idempotente)
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                -- 'entry' (entrada manual) ou 'exit' (saída automática)
  quantity INTEGER NOT NULL,         -- quantidade de potes (sempre positivo)
  unit_cost NUMERIC DEFAULT 0,       -- custo unitário por pote (entradas)
  total_cost NUMERIC DEFAULT 0,      -- quantity × unit_cost (entradas)
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  product_name TEXT,                 -- nome do kit vendido (saídas)
  description TEXT,
  kit_matched BOOLEAN DEFAULT true,  -- false quando o kit não foi identificado (fallback 1 pote)
  date TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stock_movements_user" ON public.stock_movements;
CREATE POLICY "stock_movements_user" ON public.stock_movements
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_user ON public.stock_movements(user_id, date);
CREATE INDEX IF NOT EXISTS idx_stock_movements_transaction ON public.stock_movements(transaction_id);
-- Garante no máximo 1 saída automática por transação (idempotência do sync/webhook)
CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_exit_per_tx
  ON public.stock_movements(transaction_id)
  WHERE type = 'exit' AND transaction_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.stock_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  default_unit_cost NUMERIC DEFAULT 0,
  low_stock_alert INTEGER DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE public.stock_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stock_config_user" ON public.stock_config;
CREATE POLICY "stock_config_user" ON public.stock_config
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
