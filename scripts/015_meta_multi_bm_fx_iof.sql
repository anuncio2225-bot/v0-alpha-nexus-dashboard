-- Multi-BM + conversão USD->BRL + IOF por conta
-- 1. Conexões (1 token/BM por linha)
CREATE TABLE IF NOT EXISTS public.meta_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label TEXT,
  access_token TEXT NOT NULL,
  business_id TEXT,
  business_name TEXT,
  status TEXT DEFAULT 'active',
  last_error TEXT,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "meta_connections_user" ON public.meta_connections;
CREATE POLICY "meta_connections_user" ON public.meta_connections
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_meta_connections_user ON public.meta_connections(user_id);

-- 2. Backfill: migra o token único atual (meta_config) para uma conexão
INSERT INTO public.meta_connections (user_id, label, access_token, business_id, business_name, created_at)
SELECT mc.user_id, 'Conexão principal', mc.access_token, NULL, NULL, COALESCE(mc.created_at, now())
FROM public.meta_config mc
WHERE mc.access_token IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.meta_connections c WHERE c.user_id = mc.user_id
  );

-- 3. meta_ad_accounts: vínculo à conexão + IOF por conta
ALTER TABLE public.meta_ad_accounts
  ADD COLUMN IF NOT EXISTS connection_id UUID REFERENCES public.meta_connections(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS iof_percent NUMERIC NOT NULL DEFAULT 0;

UPDATE public.meta_ad_accounts a
SET connection_id = c.id
FROM public.meta_connections c
WHERE a.connection_id IS NULL
  AND c.user_id = a.user_id
  AND c.label = 'Conexão principal';

-- 4. meta_ads_performance: moeda original, câmbio travado e IOF aplicado.
-- 'spend' passa a representar o valor JÁ EM BRL (dashboard/profit não mudam).
ALTER TABLE public.meta_ads_performance
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS spend_original NUMERIC,
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS iof_percent NUMERIC NOT NULL DEFAULT 0;

UPDATE public.meta_ads_performance
SET spend_original = spend
WHERE spend_original IS NULL;
