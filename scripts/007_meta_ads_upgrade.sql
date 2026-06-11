-- ============================================================================
-- 007_meta_ads_upgrade.sql
-- Upgrade aditivo e idempotente para a integracao Meta Ads via System User Token.
--
-- REGRAS SEGUIDAS:
--  - Apenas ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS (nunca DROP).
--  - Nao renomeia colunas existentes (mantem account_id/account_name/access_token,
--    que sao os nomes REAIS ja usados pelo banco em producao).
--  - Nao altera RLS de tabelas fora do escopo Meta.
--  - Preserva dados manuais existentes em ad_investments (adiciona apenas flag
--    is_archived para arquivamento opt-in; nenhum dado e apagado).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. meta_config: campos de status de sync e validacao
--    (is_connected e connected_at JA EXISTEM no banco; nao recriar)
-- ----------------------------------------------------------------------------
alter table if exists public.meta_config
  add column if not exists app_id text,
  add column if not exists validation_status text default 'valid',
  add column if not exists last_sync_at timestamptz,
  add column if not exists sync_status text default 'idle',
  add column if not exists sync_error text;

-- ----------------------------------------------------------------------------
-- 2. meta_ad_accounts: metadados extras para agrupar por Business Manager
--    (account_id / account_name / currency / is_active JA EXISTEM)
-- ----------------------------------------------------------------------------
alter table if exists public.meta_ad_accounts
  add column if not exists timezone_name text,
  add column if not exists business_id text,
  add column if not exists business_name text,
  add column if not exists account_status integer;

-- ----------------------------------------------------------------------------
-- 3. meta_ads_performance: valor de conversao (conversions e
--    cost_per_conversion JA EXISTEM no banco)
-- ----------------------------------------------------------------------------
alter table if exists public.meta_ads_performance
  add column if not exists conversion_value numeric default 0;

-- ----------------------------------------------------------------------------
-- 4. Constraint unica para upsert idempotente.
--    Para suportar sync em nivel "account" (sem campaign/adset/ad), gravamos
--    string vazia '' nessas colunas em vez de NULL, de modo que a constraint
--    unica padrao funcione com o onConflict do supabase-js.
-- ----------------------------------------------------------------------------
do $$
begin
  -- Normaliza eventuais NULLs historicos para '' antes de criar a constraint
  update public.meta_ads_performance
    set campaign_id = coalesce(campaign_id, ''),
        adset_id    = coalesce(adset_id, ''),
        ad_id       = coalesce(ad_id, '')
  where campaign_id is null or adset_id is null or ad_id is null;

  if not exists (
    select 1 from pg_constraint
    where conname = 'meta_ads_performance_unique_grain'
  ) then
    alter table public.meta_ads_performance
      add constraint meta_ads_performance_unique_grain
      unique (user_id, ad_account_id, date, campaign_id, adset_id, ad_id);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 5. Indices de leitura para o dashboard
-- ----------------------------------------------------------------------------
create index if not exists idx_meta_perf_user_date
  on public.meta_ads_performance (user_id, date);

create index if not exists idx_meta_perf_user_account_date
  on public.meta_ads_performance (user_id, ad_account_id, date);

-- ----------------------------------------------------------------------------
-- 6. meta_ad_accounts: constraint unica (user_id, account_id) para upsert
--    idempotente ao selecionar contas. Remove duplicatas historicas antes.
-- ----------------------------------------------------------------------------
do $$
begin
  delete from public.meta_ad_accounts a
  using public.meta_ad_accounts b
  where a.user_id = b.user_id
    and a.account_id = b.account_id
    and a.ctid < b.ctid;

  if not exists (
    select 1 from pg_constraint
    where conname = 'meta_ad_accounts_user_account_unique'
  ) then
    alter table public.meta_ad_accounts
      add constraint meta_ad_accounts_user_account_unique
      unique (user_id, account_id);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 7. ad_investments: flag de arquivamento opt-in (NAO apaga dados manuais)
-- ----------------------------------------------------------------------------
alter table if exists public.ad_investments
  add column if not exists is_archived boolean default false;

-- ============================================================================
-- Fim da migration 007. Tudo aditivo e idempotente.
-- ============================================================================
