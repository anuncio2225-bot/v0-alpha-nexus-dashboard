-- ============================================================
-- Modulo de Cobranca (CRM de Recuperacao de Pagamentos)
-- Migration ADITIVA e idempotente. Nao altera tabelas existentes.
-- ============================================================

-- 1.1 Status de cobranca (editaveis)
CREATE TABLE IF NOT EXISTS public.collection_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  icon TEXT,
  position INTEGER DEFAULT 0,
  is_default BOOLEAN DEFAULT FALSE,
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1.2 Plataformas de cobranca (editaveis)
CREATE TABLE IF NOT EXISTS public.collection_platforms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 1.3 Clientes de cobranca
CREATE TABLE IF NOT EXISTS public.collection_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  document TEXT,
  product_name TEXT,
  product_id TEXT,
  platform_id UUID REFERENCES public.collection_platforms(id) ON DELETE SET NULL,
  platform_name TEXT,
  attendant_id UUID REFERENCES public.attendants(id) ON DELETE SET NULL,
  attendant_name TEXT,
  src TEXT,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  total_value NUMERIC DEFAULT 0,
  paid_value NUMERIC DEFAULT 0,
  remaining_value NUMERIC DEFAULT 0,
  payment_method TEXT,
  payment_link TEXT,
  status_id UUID REFERENCES public.collection_statuses(id) ON DELETE SET NULL,
  status_name TEXT,
  order_date TIMESTAMPTZ,
  negotiation_date TIMESTAMPTZ,
  next_collection_date DATE,
  tracking_code TEXT,
  last_contact_at TIMESTAMPTZ,
  days_without_response INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collection_clients_user ON public.collection_clients(user_id);
CREATE INDEX IF NOT EXISTS idx_collection_clients_status ON public.collection_clients(user_id, status_id);
CREATE INDEX IF NOT EXISTS idx_collection_clients_next_date ON public.collection_clients(user_id, next_collection_date);
CREATE INDEX IF NOT EXISTS idx_collection_clients_attendant ON public.collection_clients(user_id, attendant_id);
CREATE INDEX IF NOT EXISTS idx_collection_clients_transaction ON public.collection_clients(user_id, transaction_id);

-- 1.4 Historico de negociacoes (timeline)
CREATE TABLE IF NOT EXISTS public.collection_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.collection_clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'note',
  description TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  payment_amount NUMERIC,
  payment_method TEXT,
  scheduled_date DATE,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collection_history_client ON public.collection_history(client_id);

-- 1.5 Emails para Google Agenda
CREATE TABLE IF NOT EXISTS public.collection_calendar_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 1.6 Template da mensagem de cobranca (1 por usuario)
CREATE TABLE IF NOT EXISTS public.collection_settings (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_template TEXT,
  auto_import BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.collection_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_platforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_calendar_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_settings ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'collection_statuses','collection_platforms','collection_clients',
    'collection_history','collection_calendar_emails','collection_settings'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_update ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_delete ON public.%I;', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT USING (auth.uid() = user_id);', t, t);
    EXECUTE format('CREATE POLICY %I_insert ON public.%I FOR INSERT WITH CHECK (auth.uid() = user_id);', t, t);
    EXECUTE format('CREATE POLICY %I_update ON public.%I FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);', t, t);
    EXECUTE format('CREATE POLICY %I_delete ON public.%I FOR DELETE USING (auth.uid() = user_id);', t, t);
  END LOOP;
END $$;

-- ============================================================
-- Funcao de seed: cria status e plataformas padrao para um usuario
-- (idempotente: so insere se o usuario ainda nao tiver nenhum)
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_collection_defaults(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.collection_statuses WHERE user_id = p_user_id) THEN
    INSERT INTO public.collection_statuses (user_id, name, color, icon, position, is_default, is_system) VALUES
      (p_user_id, 'Devendo', '#ef4444', 'alert-triangle', 0, TRUE, TRUE),
      (p_user_id, 'Negociacao', '#eab308', 'handshake', 1, FALSE, FALSE),
      (p_user_id, 'Prometeu Pagar', '#a855f7', 'calendar-clock', 2, FALSE, FALSE),
      (p_user_id, 'Pagamento Parcial', '#f97316', 'circle-dollar-sign', 3, FALSE, FALSE),
      (p_user_id, 'Aguardando Confirmacao', '#3b82f6', 'clock', 4, FALSE, FALSE),
      (p_user_id, 'Nao Responde', '#1f2937', 'phone-off', 5, FALSE, FALSE),
      (p_user_id, 'Base Correios', '#d97706', 'truck', 6, FALSE, FALSE),
      (p_user_id, 'Devolucao', '#dc2626', 'undo-2', 7, FALSE, FALSE),
      (p_user_id, 'Pago', '#22c55e', 'check', 8, FALSE, TRUE);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.collection_platforms WHERE user_id = p_user_id) THEN
    INSERT INTO public.collection_platforms (user_id, name, is_system) VALUES
      (p_user_id, 'Braip', TRUE),
      (p_user_id, 'Payt', TRUE),
      (p_user_id, 'Pag2Pay', FALSE),
      (p_user_id, 'PIX Manual', FALSE),
      (p_user_id, 'Boleto Manual', FALSE),
      (p_user_id, 'Cartao Manual', FALSE);
  END IF;
END $$;
