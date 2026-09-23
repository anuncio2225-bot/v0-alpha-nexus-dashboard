-- ============================================================================
-- RETRATO DA ESTRUTURA DO BANCO DE PRODUÇÃO (schema public) — somente estrutura, sem dados.
-- Gerado a partir do catálogo do Postgres em 2026-09-23 (PostgreSQL 17.6).
-- Projeto Supabase: vkheedwuoppvodkqovgv.
--
-- Por que existe: o v0 aplicou mudanças direto no Supabase e parte delas nunca virou
-- arquivo em scripts/. Este arquivo é a fonte de verdade do que EXISTE hoje.
-- Mudanças novas vão em supabase/migrations/ — e este retrato é regerado depois.
--
-- Migrações registradas no banco (19):
--   20260509211846  create_monthly_tax_config
--   20260610020300  meta_ads_upgrade_007
--   20260610020734  meta_ad_accounts_unique_user_account
--   20260617001000  010_cobranca
--   20260617011558  011_cobranca_status_sync
--   20260622150001  collection_extra_fields
--   20260622163858  collection_braip_statuses_and_gross_value
--   20260622163919  update_seed_collection_defaults_braip
--   20260622180119  team_access_tables_and_functions
--   20260622180142  team_access_additive_rls
--   20260622190620  team_attendant_link_and_scope
--   20260706184906  attendants_v2
--   20260706215408  add_product_price_to_transactions
--   20260708152319  add_origin_type_and_affiliate_name
--   20260803194549  add_include_in_profit_to_cashflow
--   20260810203832  meta_multi_bm_fx_iof
--   20260811012222  meta_account_apply_meta_tax
--   20260811021013  recalc_meta_account_spend_fn
--   20260923182425  lixeira
-- ============================================================================

-- Aplicadas pelo SQL Editor (fora da tabela acima): 20260923130000_fechar_acesso_publico

-- Extensões instaladas: pg_graphql 1.5.11, pg_stat_statements 1.11, pgcrypto 1.3, plpgsql 1.0, supabase_vault 0.3.1, uuid-ossp 1.1

-- ---------------------------------------------------------------- TABELAS
create table public.account_balance_logs (
  id uuid default gen_random_uuid() not null,
  account_id uuid not null,
  user_id uuid not null,
  old_balance numeric not null,
  new_balance numeric not null,
  changed_at timestamp with time zone default now() not null,
  constraint account_balance_logs_pkey PRIMARY KEY (id)
);

create table public.ad_investments (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  date date not null,
  platform text default 'meta_ads'::text not null,
  campaign_name text,
  investment_value numeric default 0 not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  is_archived boolean default false,
  constraint ad_investments_pkey PRIMARY KEY (id)
);

create table public.attendant_payments (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  attendant_id uuid not null,
  period_start date not null,
  period_end date not null,
  total_sales integer default 0,
  commission_percent numeric default 0,
  commission_value numeric default 0,
  bonus_total numeric default 0,
  fixed_per_sale_total numeric default 0,
  platform_deductions numeric default 0,
  total_to_pay numeric default 0,
  status text default 'pending'::text,
  paid_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  constraint attendant_payments_pkey PRIMARY KEY (id)
);

create table public.attendant_rules (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  attendant_id uuid not null,
  rule_type text default 'commission'::text not null,
  label text,
  min_sales integer default 0,
  max_sales integer,
  commission_value numeric default 0,
  bonus_value numeric default 0,
  created_at timestamp with time zone default now(),
  constraint attendant_rules_pkey PRIMARY KEY (id)
);

create table public.attendants (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  name text not null,
  email text,
  phone text,
  role text default 'closer'::text,
  status text default 'active'::text,
  monthly_goal numeric default 0,
  commission_rate numeric default 0,
  total_sales integer default 0,
  total_revenue numeric default 0,
  avatar_url text,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  src text,
  payment_closing_day integer default 1,
  calc_mode text default 'affiliate'::text,
  producer_affiliate_percent numeric default 0,
  platform_fee_percent numeric default 0,
  platform_fee_fixed numeric default 0,
  fixed_per_sale numeric default 0,
  auto_detected boolean default false,
  constraint attendants_pkey PRIMARY KEY (id)
);

create table public.bank_accounts (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  name text not null,
  bank_name text,
  account_type text default 'checking'::text,
  balance numeric default 0,
  color text default '#10b981'::text,
  is_default boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  position integer default 0,
  category text default 'bank'::text,
  last_balance_update timestamp with time zone,
  constraint bank_accounts_pkey PRIMARY KEY (id)
);

create table public.bills (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  titulo text not null,
  categoria text default 'Outros'::text not null,
  valor numeric(12,2) default 0 not null,
  vencimento date not null,
  recorrente boolean default false not null,
  observacao text,
  status text default 'pendente'::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  constraint bills_pkey PRIMARY KEY (id)
);

create table public.cashflow (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  bank_account_id uuid,
  type text not null,
  category text not null,
  description text,
  amount numeric default 0 not null,
  date timestamp with time zone default now() not null,
  is_recurring boolean default false,
  recurrence_period text,
  status text default 'confirmed'::text,
  source text default 'manual'::text,
  transaction_id uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  payment_method text default 'pix'::text,
  notes text,
  include_in_profit boolean default true not null,
  constraint cashflow_type_check CHECK ((type = ANY (ARRAY['income'::text, 'expense'::text]))),
  constraint cashflow_pkey PRIMARY KEY (id)
);

create table public.collection_calendar_emails (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  email text not null,
  name text,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  constraint collection_calendar_emails_pkey PRIMARY KEY (id)
);

create table public.collection_clients (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  name text not null,
  phone text,
  email text,
  document text,
  product_name text,
  product_id text,
  platform_id uuid,
  platform_name text,
  attendant_id uuid,
  attendant_name text,
  src text,
  transaction_id uuid,
  total_value numeric default 0,
  paid_value numeric default 0,
  remaining_value numeric default 0,
  payment_method text,
  payment_link text,
  status_id uuid,
  status_name text,
  order_date timestamp with time zone,
  negotiation_date timestamp with time zone,
  next_collection_date date,
  tracking_code text,
  last_contact_at timestamp with time zone,
  days_without_response integer default 0,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  plan_name text,
  delivery_status text,
  shipping_company text,
  braip_status text,
  braip_status_code integer,
  address_full text,
  order_total_value numeric,
  payment_date timestamp with time zone,
  transaction_code text,
  constraint collection_clients_pkey PRIMARY KEY (id)
);

create table public.collection_history (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  client_id uuid not null,
  type text default 'note'::text not null,
  description text not null,
  old_status text,
  new_status text,
  payment_amount numeric,
  payment_method text,
  scheduled_date date,
  created_by text,
  created_at timestamp with time zone default now(),
  constraint collection_history_pkey PRIMARY KEY (id)
);

create table public.collection_platforms (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  name text not null,
  color text,
  is_system boolean default false,
  created_at timestamp with time zone default now(),
  constraint collection_platforms_pkey PRIMARY KEY (id)
);

create table public.collection_settings (
  user_id uuid not null,
  message_template text,
  auto_import boolean default false,
  updated_at timestamp with time zone default now(),
  constraint collection_settings_pkey PRIMARY KEY (user_id)
);

create table public.collection_statuses (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  name text not null,
  color text not null,
  icon text,
  position integer default 0,
  is_default boolean default false,
  is_system boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint collection_statuses_pkey PRIMARY KEY (id)
);

create table public.custom_categories (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  name text not null,
  type text default 'expense'::text not null,
  created_at timestamp with time zone default now() not null,
  constraint custom_categories_pkey PRIMARY KEY (id),
  constraint custom_categories_user_id_name_key UNIQUE (user_id, name)
);

create table public.lixeira (
  id bigint generated always as identity not null,
  tabela text not null,
  registro_id uuid,
  user_id uuid,
  dados jsonb not null,
  vinculos jsonb,
  apagado_em timestamp with time zone default now() not null,
  apagado_por uuid default auth.uid(),
  constraint lixeira_pkey PRIMARY KEY (id)
);

create table public.meta_ad_accounts (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  account_id text not null,
  account_name text,
  currency text default 'BRL'::text,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  timezone_name text,
  business_id text,
  business_name text,
  account_status integer,
  connection_id uuid,
  iof_percent numeric default 0 not null,
  apply_meta_tax boolean default true not null,
  constraint meta_ad_accounts_pkey PRIMARY KEY (id),
  constraint meta_ad_accounts_user_account_unique UNIQUE (user_id, account_id)
);

create table public.meta_ads_performance (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  ad_account_id text not null,
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  ad_id text,
  ad_name text,
  date date not null,
  impressions integer default 0,
  clicks integer default 0,
  spend numeric default 0,
  reach integer default 0,
  cpm numeric default 0,
  cpc numeric default 0,
  ctr numeric default 0,
  conversions integer default 0,
  cost_per_conversion numeric default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  conversion_value numeric default 0,
  currency text default 'BRL'::text not null,
  spend_original numeric,
  exchange_rate numeric default 1 not null,
  iof_percent numeric default 0 not null,
  constraint meta_ads_performance_pkey PRIMARY KEY (id),
  constraint meta_ads_performance_unique_grain UNIQUE (user_id, ad_account_id, date, campaign_id, adset_id, ad_id)
);

create table public.meta_config (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  access_token text,
  token_expires_at timestamp with time zone,
  is_connected boolean default false,
  connected_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  app_id text,
  validation_status text default 'valid'::text,
  last_sync_at timestamp with time zone,
  sync_status text default 'idle'::text,
  sync_error text,
  constraint meta_config_pkey PRIMARY KEY (id),
  constraint meta_config_user_id_key UNIQUE (user_id)
);

create table public.meta_connections (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  label text,
  access_token text not null,
  business_id text,
  business_name text,
  status text default 'active'::text,
  last_error text,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint meta_connections_pkey PRIMARY KEY (id)
);

create table public.monthly_tax_config (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  year integer not null,
  month integer not null,
  tax_percentage numeric(5,2) default 0 not null,
  status text default 'pending'::text not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint monthly_tax_config_month_check CHECK (((month >= 1) AND (month <= 12))),
  constraint monthly_tax_config_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text]))),
  constraint monthly_tax_config_pkey PRIMARY KEY (id),
  constraint monthly_tax_config_user_id_year_month_key UNIQUE (user_id, year, month)
);

create table public.product_costs (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  product_name text not null,
  product_keyword text not null,
  units_per_kit integer default 3 not null,
  custom_shipping numeric,
  created_at timestamp with time zone default now(),
  constraint product_costs_pkey PRIMARY KEY (id)
);

create table public.profiles (
  id uuid not null,
  email text,
  full_name text,
  name text,
  avatar_url text,
  role text default 'user'::text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  webhook_token uuid default gen_random_uuid(),
  constraint profiles_pkey PRIMARY KEY (id)
);

create table public.profit_config (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  cost_per_unit numeric default 0,
  shipping_cost numeric default 0,
  affiliate_percent numeric default 50,
  affiliate_platform_fee numeric default 5.99,
  affiliate_platform_fixed numeric default 1,
  company_reserve_percent numeric default 33.33,
  excluded_cashflow_categories text[] default ARRAY['Investimento Ads'::text, 'Meta Ads'::text],
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint profit_config_pkey PRIMARY KEY (id),
  constraint profit_config_user_id_key UNIQUE (user_id)
);

create table public.profit_partners (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  name text not null,
  percent numeric default 0 not null,
  created_at timestamp with time zone default now(),
  constraint profit_partners_pkey PRIMARY KEY (id)
);

create table public.sales (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  transaction_id uuid,
  product_name text,
  customer_name text,
  attendant_name text,
  amount numeric default 0,
  commission numeric default 0,
  status text,
  payment_method text,
  sale_date timestamp with time zone,
  created_at timestamp with time zone default now(),
  constraint sales_pkey PRIMARY KEY (id)
);

create table public.settings (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  meta_tax_multiplier numeric default 1.0,
  timezone text default 'America/Sao_Paulo'::text,
  currency text default 'BRL'::text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  tax_percentage numeric default 0,
  manual_scheduled_value numeric default 0,
  manual_scheduled_count integer default 0,
  manual_waiting_value numeric default 0,
  manual_waiting_count integer default 0,
  manual_late_value numeric default 0,
  manual_late_count integer default 0,
  ads_tax_percentage numeric default 6,
  constraint settings_pkey PRIMARY KEY (id),
  constraint settings_user_id_key UNIQUE (user_id)
);

create table public.stock_config (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  default_unit_cost numeric default 0,
  low_stock_alert integer default 50,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint stock_config_pkey PRIMARY KEY (id),
  constraint stock_config_user_id_key UNIQUE (user_id)
);

create table public.stock_movements (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  type text not null,
  quantity integer not null,
  unit_cost numeric default 0,
  total_cost numeric default 0,
  transaction_id uuid,
  product_name text,
  description text,
  kit_matched boolean default true,
  date timestamp with time zone default now(),
  created_at timestamp with time zone default now(),
  constraint stock_movements_pkey PRIMARY KEY (id)
);

create table public.team_activity_log (
  id uuid default gen_random_uuid() not null,
  owner_id uuid not null,
  member_id uuid,
  action text not null,
  page text,
  details text,
  created_at timestamp with time zone default now(),
  constraint team_activity_log_pkey PRIMARY KEY (id)
);

create table public.team_members (
  id uuid default gen_random_uuid() not null,
  owner_id uuid not null,
  invited_email text not null,
  invited_name text,
  invite_token uuid default gen_random_uuid(),
  member_user_id uuid,
  role text default 'viewer'::text not null,
  status text default 'pending'::text not null,
  permissions jsonb default '{"logs": false, "equipe": false, "cashflow": false, "cobranca": false, "settings": false, "webhooks": false, "dashboard": true, "atendentes": false, "financeiro": false, "integracoes": false, "investimento_ads": false}'::jsonb not null,
  can_edit boolean default false,
  can_delete boolean default false,
  can_export boolean default false,
  invited_at timestamp with time zone default now(),
  accepted_at timestamp with time zone,
  revoked_at timestamp with time zone,
  last_access_at timestamp with time zone,
  updated_at timestamp with time zone default now(),
  attendant_id uuid,
  attendant_src text,
  scope_mode text default 'all'::text not null,
  src_areas jsonb default '{"cobranca": true, "financeiro": true}'::jsonb not null,
  constraint team_members_pkey PRIMARY KEY (id),
  constraint team_members_owner_id_invited_email_key UNIQUE (owner_id, invited_email)
);

create table public.transactions (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  webhook_id uuid,
  transaction_code text,
  product_name text,
  product_id text,
  plan_name text,
  status text not null,
  original_status text,
  payment_method text,
  customer_name text,
  customer_email text,
  customer_phone text,
  customer_doc text,
  amount numeric default 0 not null,
  commission numeric default 0,
  currency text default 'BRL'::text,
  sale_date timestamp with time zone,
  guarantee_date timestamp with time zone,
  tracking_code text,
  tracking_url text,
  attendant_id uuid,
  source text default 'braip'::text,
  raw_payload jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  external_id text not null,
  gateway text default 'braip'::text not null,
  status_code text,
  total_value numeric default 0,
  paid_value numeric default 0,
  shipping_status text,
  utm_source text,
  utm_campaign text,
  src text,
  fbclid text,
  sale_type text default 'antecipado'::text,
  payment_date timestamp with time zone,
  pay_on_delivery boolean default false,
  affiliate_commission numeric default 0,
  producer_commission numeric default 0,
  payment_link text,
  address_full text,
  shipping_company text,
  product_price numeric,
  origin_type text default 'own'::text,
  affiliate_name text,
  constraint transactions_pkey PRIMARY KEY (id),
  constraint transactions_user_gateway_external_unique UNIQUE (user_id, gateway, external_id)
);

create table public.webhook_errors (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  gateway text default 'unknown'::text not null,
  error_message text not null,
  payload jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now(),
  webhook_id uuid,
  constraint webhook_errors_pkey PRIMARY KEY (id)
);

create table public.webhook_logs (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  gateway text default 'unknown'::text not null,
  event_type text,
  payload jsonb default '{}'::jsonb not null,
  headers jsonb default '{}'::jsonb,
  status text default 'received'::text,
  created_at timestamp with time zone default now(),
  webhook_id uuid,
  error_message text,
  constraint webhook_logs_pkey PRIMARY KEY (id)
);

create table public.webhooks (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  source text default 'braip'::text not null,
  event_type text,
  payload jsonb default '{}'::jsonb not null,
  status text default 'received'::text,
  error_message text,
  processed_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  name text not null,
  product_name text,
  token text default replace((gen_random_uuid())::text, '-'::text, ''::text) not null,
  is_active boolean default true,
  updated_at timestamp with time zone default now(),
  operational_type text default 'afterpay'::text,
  constraint webhooks_pkey PRIMARY KEY (id)
);

-- ---------------------------------------------------------------- CHAVES ESTRANGEIRAS
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.settings add constraint settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.webhooks add constraint webhooks_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.transactions add constraint fk_transactions_attendant FOREIGN KEY (attendant_id) REFERENCES attendants(id) ON DELETE SET NULL;
alter table public.transactions add constraint transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.transactions add constraint transactions_webhook_id_fkey FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE SET NULL;
alter table public.sales add constraint sales_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE;
alter table public.sales add constraint sales_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.attendants add constraint attendants_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.bank_accounts add constraint bank_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.cashflow add constraint cashflow_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id) ON DELETE SET NULL;
alter table public.cashflow add constraint cashflow_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL;
alter table public.cashflow add constraint cashflow_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.meta_config add constraint meta_config_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.meta_ad_accounts add constraint meta_ad_accounts_connection_id_fkey FOREIGN KEY (connection_id) REFERENCES meta_connections(id) ON DELETE CASCADE;
alter table public.meta_ad_accounts add constraint meta_ad_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.meta_ads_performance add constraint meta_ads_performance_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.webhook_logs add constraint webhook_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.webhook_logs add constraint webhook_logs_webhook_id_fkey FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE SET NULL;
alter table public.webhook_errors add constraint webhook_errors_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.webhook_errors add constraint webhook_errors_webhook_id_fkey FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE SET NULL;
alter table public.account_balance_logs add constraint account_balance_logs_account_id_fkey FOREIGN KEY (account_id) REFERENCES bank_accounts(id) ON DELETE CASCADE;
alter table public.bills add constraint bills_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.monthly_tax_config add constraint monthly_tax_config_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.collection_statuses add constraint collection_statuses_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.collection_platforms add constraint collection_platforms_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.collection_clients add constraint collection_clients_attendant_id_fkey FOREIGN KEY (attendant_id) REFERENCES attendants(id) ON DELETE SET NULL;
alter table public.collection_clients add constraint collection_clients_platform_id_fkey FOREIGN KEY (platform_id) REFERENCES collection_platforms(id) ON DELETE SET NULL;
alter table public.collection_clients add constraint collection_clients_status_id_fkey FOREIGN KEY (status_id) REFERENCES collection_statuses(id) ON DELETE SET NULL;
alter table public.collection_clients add constraint collection_clients_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL;
alter table public.collection_clients add constraint collection_clients_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.collection_history add constraint collection_history_client_id_fkey FOREIGN KEY (client_id) REFERENCES collection_clients(id) ON DELETE CASCADE;
alter table public.collection_history add constraint collection_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.collection_calendar_emails add constraint collection_calendar_emails_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.collection_settings add constraint collection_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.team_members add constraint team_members_attendant_id_fkey FOREIGN KEY (attendant_id) REFERENCES attendants(id) ON DELETE SET NULL;
alter table public.team_members add constraint team_members_member_user_id_fkey FOREIGN KEY (member_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public.team_members add constraint team_members_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.team_activity_log add constraint team_activity_log_member_id_fkey FOREIGN KEY (member_id) REFERENCES team_members(id) ON DELETE SET NULL;
alter table public.attendant_rules add constraint attendant_rules_attendant_id_fkey FOREIGN KEY (attendant_id) REFERENCES attendants(id) ON DELETE CASCADE;
alter table public.attendant_rules add constraint attendant_rules_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.attendant_payments add constraint attendant_payments_attendant_id_fkey FOREIGN KEY (attendant_id) REFERENCES attendants(id) ON DELETE CASCADE;
alter table public.attendant_payments add constraint attendant_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.profit_config add constraint profit_config_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.profit_partners add constraint profit_partners_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.product_costs add constraint product_costs_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.stock_movements add constraint stock_movements_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL;
alter table public.stock_movements add constraint stock_movements_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.stock_config add constraint stock_config_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public.meta_connections add constraint meta_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------- ÍNDICES
CREATE INDEX idx_balance_logs_account ON public.account_balance_logs USING btree (account_id);
CREATE INDEX idx_balance_logs_changed ON public.account_balance_logs USING btree (changed_at DESC);
CREATE INDEX idx_ad_investments_date ON public.ad_investments USING btree (date DESC);
CREATE INDEX idx_ad_investments_platform ON public.ad_investments USING btree (platform);
CREATE INDEX idx_ad_investments_user ON public.ad_investments USING btree (user_id);
CREATE INDEX idx_attendant_payments_attendant ON public.attendant_payments USING btree (attendant_id);
CREATE INDEX idx_attendant_payments_user ON public.attendant_payments USING btree (user_id);
CREATE INDEX idx_attendant_rules_attendant ON public.attendant_rules USING btree (attendant_id);
CREATE INDEX idx_attendant_rules_user ON public.attendant_rules USING btree (user_id);
CREATE INDEX idx_attendants_status ON public.attendants USING btree (status);
CREATE INDEX idx_attendants_user_id ON public.attendants USING btree (user_id);
CREATE INDEX idx_bank_accounts_user_id ON public.bank_accounts USING btree (user_id);
CREATE INDEX bills_user_id_idx ON public.bills USING btree (user_id);
CREATE INDEX bills_vencimento_idx ON public.bills USING btree (vencimento);
CREATE INDEX idx_cashflow_date ON public.cashflow USING btree (date DESC);
CREATE INDEX idx_cashflow_type ON public.cashflow USING btree (type);
CREATE INDEX idx_cashflow_user_id ON public.cashflow USING btree (user_id);
CREATE INDEX idx_cc_transaction_code ON public.collection_clients USING btree (transaction_code) WHERE (transaction_code IS NOT NULL);
CREATE INDEX idx_collection_clients_attendant ON public.collection_clients USING btree (user_id, attendant_id);
CREATE INDEX idx_collection_clients_next_date ON public.collection_clients USING btree (user_id, next_collection_date);
CREATE INDEX idx_collection_clients_status ON public.collection_clients USING btree (user_id, status_id);
CREATE INDEX idx_collection_clients_transaction ON public.collection_clients USING btree (user_id, transaction_id);
CREATE INDEX idx_collection_clients_user ON public.collection_clients USING btree (user_id);
CREATE INDEX idx_collection_history_client ON public.collection_history USING btree (client_id);
CREATE INDEX idx_custom_categories_user ON public.custom_categories USING btree (user_id);
CREATE INDEX idx_lixeira_apagado_em ON public.lixeira USING btree (apagado_em);
CREATE INDEX idx_lixeira_user_tabela ON public.lixeira USING btree (user_id, tabela, apagado_em DESC);
CREATE INDEX idx_meta_ad_accounts_user_id ON public.meta_ad_accounts USING btree (user_id);
CREATE INDEX idx_meta_ads_perf_campaign ON public.meta_ads_performance USING btree (campaign_id);
CREATE INDEX idx_meta_ads_perf_date ON public.meta_ads_performance USING btree (date DESC);
CREATE INDEX idx_meta_ads_perf_user_id ON public.meta_ads_performance USING btree (user_id);
CREATE INDEX idx_meta_perf_user_account_date ON public.meta_ads_performance USING btree (user_id, ad_account_id, date);
CREATE INDEX idx_meta_perf_user_date ON public.meta_ads_performance USING btree (user_id, date);
CREATE INDEX idx_meta_connections_user ON public.meta_connections USING btree (user_id);
CREATE INDEX idx_monthly_tax_config_user_year ON public.monthly_tax_config USING btree (user_id, year);
CREATE INDEX idx_product_costs_user ON public.product_costs USING btree (user_id);
CREATE UNIQUE INDEX idx_profiles_webhook_token ON public.profiles USING btree (webhook_token);
CREATE INDEX idx_profit_partners_user ON public.profit_partners USING btree (user_id);
CREATE INDEX idx_sales_sale_date ON public.sales USING btree (sale_date DESC);
CREATE INDEX idx_sales_user_id ON public.sales USING btree (user_id);
CREATE INDEX idx_stock_movements_transaction ON public.stock_movements USING btree (transaction_id);
CREATE INDEX idx_stock_movements_user ON public.stock_movements USING btree (user_id, date);
CREATE UNIQUE INDEX uq_stock_exit_per_tx ON public.stock_movements USING btree (transaction_id) WHERE ((type = 'exit'::text) AND (transaction_id IS NOT NULL));
CREATE INDEX idx_team_activity_owner ON public.team_activity_log USING btree (owner_id);
CREATE INDEX idx_team_members_member ON public.team_members USING btree (member_user_id);
CREATE INDEX idx_team_members_owner ON public.team_members USING btree (owner_id);
CREATE INDEX idx_team_members_token ON public.team_members USING btree (invite_token);
CREATE INDEX idx_transactions_affiliate_commission ON public.transactions USING btree (affiliate_commission) WHERE (affiliate_commission > (0)::numeric);
CREATE INDEX idx_transactions_attendant ON public.transactions USING btree (attendant_id);
CREATE INDEX idx_transactions_gateway ON public.transactions USING btree (gateway);
CREATE INDEX idx_transactions_origin_type ON public.transactions USING btree (user_id, origin_type);
CREATE INDEX idx_transactions_payment_date ON public.transactions USING btree (payment_date DESC);
CREATE INDEX idx_transactions_product ON public.transactions USING btree (product_name);
CREATE INDEX idx_transactions_sale_date ON public.transactions USING btree (sale_date DESC);
CREATE INDEX idx_transactions_sale_type ON public.transactions USING btree (sale_type);
CREATE INDEX idx_transactions_status ON public.transactions USING btree (status);
CREATE INDEX idx_transactions_transaction_code ON public.transactions USING btree (transaction_code);
CREATE INDEX idx_transactions_user_id ON public.transactions USING btree (user_id);
CREATE INDEX idx_transactions_webhook ON public.transactions USING btree (webhook_id);
CREATE INDEX idx_webhook_errors_created ON public.webhook_errors USING btree (created_at DESC);
CREATE INDEX idx_webhook_errors_user ON public.webhook_errors USING btree (user_id);
CREATE INDEX idx_webhook_errors_webhook ON public.webhook_errors USING btree (webhook_id);
CREATE INDEX idx_webhook_logs_created ON public.webhook_logs USING btree (created_at DESC);
CREATE INDEX idx_webhook_logs_gateway ON public.webhook_logs USING btree (gateway);
CREATE INDEX idx_webhook_logs_user ON public.webhook_logs USING btree (user_id);
CREATE INDEX idx_webhook_logs_webhook ON public.webhook_logs USING btree (webhook_id);
CREATE INDEX idx_webhooks_active ON public.webhooks USING btree (is_active);
CREATE INDEX idx_webhooks_created_at ON public.webhooks USING btree (created_at DESC);
CREATE INDEX idx_webhooks_source ON public.webhooks USING btree (source);
CREATE INDEX idx_webhooks_user ON public.webhooks USING btree (user_id);
CREATE INDEX idx_webhooks_user_id ON public.webhooks USING btree (user_id);
CREATE UNIQUE INDEX idx_webhooks_token_unique ON public.webhooks USING btree (token);

-- ---------------------------------------------------------------- FUNÇÕES
CREATE OR REPLACE FUNCTION public.effective_user_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner UUID;
BEGIN
  SELECT owner_id INTO v_owner
  FROM public.team_members
  WHERE member_user_id = auth.uid() AND status = 'active'
  LIMIT 1;

  IF v_owner IS NOT NULL THEN
    RETURN v_owner;
  END IF;

  RETURN auth.uid();
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, email, full_name, name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', null),
    coalesce(new.raw_user_meta_data ->> 'name', null),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', null)
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    name = coalesce(excluded.name, public.profiles.name),
    avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
    updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.lixeira_expirar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from public.lixeira where apagado_em < now() - interval '30 days';
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.lixeira_guardar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_vinculos jsonb;
begin
  if tg_table_name = 'transactions' then
    select jsonb_build_object(
      'collection_clients', coalesce((select jsonb_agg(id) from public.collection_clients where transaction_id = old.id), '[]'::jsonb),
      'stock_movements',    coalesce((select jsonb_agg(id) from public.stock_movements    where transaction_id = old.id), '[]'::jsonb),
      'cashflow',           coalesce((select jsonb_agg(id) from public.cashflow           where transaction_id = old.id), '[]'::jsonb)
    ) into v_vinculos;
  end if;

  insert into public.lixeira (tabela, registro_id, user_id, dados, vinculos)
  values (tg_table_name, old.id, old.user_id, to_jsonb(old), v_vinculos);

  return old;
end;
$function$;

CREATE OR REPLACE FUNCTION public.recalc_meta_account_spend(p_user uuid, p_account text, p_iof numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Só o próprio dono (ou membro da equipe dele) ou o backend (service role).
  if coalesce(auth.role(), '') <> 'service_role'
     and p_user is distinct from public.effective_user_id() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.meta_ads_performance
  set iof_percent = p_iof,
      spend = case
        when upper(coalesce(currency, 'BRL')) = 'BRL'
          then coalesce(spend_original, spend)
        else round(
          (coalesce(spend_original, spend) * coalesce(exchange_rate, 1)
            * (1 + p_iof / 100))::numeric, 2)
      end,
      updated_at = now()
  where user_id = p_user
    and ad_account_id = p_account;
end;
$function$;

CREATE OR REPLACE FUNCTION public.seed_collection_defaults(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s record;
  p record;
begin
  -- Só o próprio dono (ou membro da equipe dele) ou o backend (service role).
  if coalesce(auth.role(), '') <> 'service_role'
     and p_user_id is distinct from public.effective_user_id() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Status padrao alinhados ao Braip (automaticos do webhook + manuais).
  for s in select * from (values
    ('Agendado', '#0ea5e9', 'calendar-check', 0, false, true),
    ('Aguardando Pagamento', '#3b82f6', 'clock', 1, false, true),
    ('Pagamento Pendente', '#ef4444', 'alert-triangle', 2, true, true),
    ('Negociacao', '#eab308', 'handshake', 3, false, false),
    ('Prometeu Pagar', '#a855f7', 'calendar-clock', 4, false, false),
    ('Pagamento Parcial', '#f97316', 'circle-dollar-sign', 5, false, false),
    ('Aguardando Confirmacao', '#06b6d4', 'clock', 6, false, false),
    ('Nao Responde', '#1f2937', 'phone-off', 7, false, false),
    ('Base Correios', '#a16207', 'truck', 8, false, false),
    ('Frustrado', '#374151', 'x-circle', 9, false, true),
    ('Cancelado', '#ea580c', 'ban', 10, false, true),
    ('Pago', '#22c55e', 'check', 11, false, true),
    ('Devolucao', '#f59e0b', 'undo-2', 12, false, true)
  ) as v(name, color, icon, position, is_default, is_system)
  loop
    if not exists (
      select 1 from public.collection_statuses
      where user_id = p_user_id and lower(name) = lower(s.name)
    ) then
      insert into public.collection_statuses (user_id, name, color, icon, position, is_default, is_system)
      values (p_user_id, s.name, s.color, s.icon, s.position, s.is_default, s.is_system);
    end if;
  end loop;

  -- Plataformas padrao
  for p in select * from (values
    ('Braip', true),
    ('Payt', true),
    ('Pag2Pay', false),
    ('PIX Manual', false),
    ('Boleto Manual', false),
    ('Cartao Manual', false)
  ) as v(name, is_system)
  loop
    if not exists (
      select 1 from public.collection_platforms
      where user_id = p_user_id and lower(name) = lower(p.name)
    ) then
      insert into public.collection_platforms (user_id, name, is_system)
      values (p_user_id, p.name, p.is_system);
    end if;
  end loop;
end
$function$;

CREATE OR REPLACE FUNCTION public.team_can_delete()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_can BOOLEAN;
  v_found BOOLEAN := FALSE;
BEGIN
  SELECT can_delete INTO v_can
  FROM public.team_members
  WHERE member_user_id = auth.uid() AND status = 'active'
  LIMIT 1;
  v_found := FOUND;
  IF NOT v_found THEN
    RETURN TRUE;
  END IF;
  RETURN COALESCE(v_can, FALSE);
END;
$function$;

CREATE OR REPLACE FUNCTION public.team_can_edit()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_can BOOLEAN;
  v_found BOOLEAN := FALSE;
BEGIN
  SELECT can_edit INTO v_can
  FROM public.team_members
  WHERE member_user_id = auth.uid() AND status = 'active'
  LIMIT 1;
  v_found := FOUND;
  IF NOT v_found THEN
    RETURN TRUE; -- nao e membro => e dono => pode tudo (policies existentes)
  END IF;
  RETURN COALESCE(v_can, FALSE);
END;
$function$;

-- Permissão de execução (anon = sem login / authenticated = logado):
--   effective_user_id(): anon=sim, logado=sim
--   handle_new_user(): anon=não, logado=não
--   lixeira_expirar(): anon=não, logado=não
--   lixeira_guardar(): anon=não, logado=não
--   recalc_meta_account_spend(p_user uuid, p_account text, p_iof numeric): anon=não, logado=sim
--   seed_collection_defaults(p_user_id uuid): anon=não, logado=sim
--   team_can_delete(): anon=sim, logado=sim
--   team_can_edit(): anon=sim, logado=sim

-- ---------------------------------------------------------------- GATILHOS
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
CREATE TRIGGER trg_lixeira_expirar AFTER DELETE ON public.sales FOR EACH STATEMENT EXECUTE FUNCTION lixeira_expirar();
CREATE TRIGGER trg_lixeira_expirar AFTER DELETE ON public.transactions FOR EACH STATEMENT EXECUTE FUNCTION lixeira_expirar();
CREATE TRIGGER trg_lixeira_expirar AFTER DELETE ON public.webhook_errors FOR EACH STATEMENT EXECUTE FUNCTION lixeira_expirar();
CREATE TRIGGER trg_lixeira_expirar AFTER DELETE ON public.webhook_logs FOR EACH STATEMENT EXECUTE FUNCTION lixeira_expirar();
CREATE TRIGGER trg_lixeira_guardar BEFORE DELETE ON public.sales FOR EACH ROW EXECUTE FUNCTION lixeira_guardar();
CREATE TRIGGER trg_lixeira_guardar BEFORE DELETE ON public.transactions FOR EACH ROW EXECUTE FUNCTION lixeira_guardar();
CREATE TRIGGER trg_lixeira_guardar BEFORE DELETE ON public.webhook_errors FOR EACH ROW EXECUTE FUNCTION lixeira_guardar();
CREATE TRIGGER trg_lixeira_guardar BEFORE DELETE ON public.webhook_logs FOR EACH ROW EXECUTE FUNCTION lixeira_guardar();

-- ---------------------------------------------------------------- RLS (SEGURANÇA POR LINHA)
alter table public.account_balance_logs enable row level security;
alter table public.ad_investments enable row level security;
alter table public.attendant_payments enable row level security;
alter table public.attendant_rules enable row level security;
alter table public.attendants enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.bills enable row level security;
alter table public.cashflow enable row level security;
alter table public.collection_calendar_emails enable row level security;
alter table public.collection_clients enable row level security;
alter table public.collection_history enable row level security;
alter table public.collection_platforms enable row level security;
alter table public.collection_settings enable row level security;
alter table public.collection_statuses enable row level security;
alter table public.custom_categories enable row level security;
alter table public.lixeira enable row level security;
alter table public.meta_ad_accounts enable row level security;
alter table public.meta_ads_performance enable row level security;
alter table public.meta_config enable row level security;
alter table public.meta_connections enable row level security;
alter table public.monthly_tax_config enable row level security;
alter table public.product_costs enable row level security;
alter table public.profiles enable row level security;
alter table public.profit_config enable row level security;
alter table public.profit_partners enable row level security;
alter table public.sales enable row level security;
alter table public.settings enable row level security;
alter table public.stock_config enable row level security;
alter table public.stock_movements enable row level security;
alter table public.team_activity_log enable row level security;
alter table public.team_members enable row level security;
alter table public.transactions enable row level security;
alter table public.webhook_errors enable row level security;
alter table public.webhook_logs enable row level security;
alter table public.webhooks enable row level security;

create policy "Users can insert own balance logs" on public.account_balance_logs as permissive for insert to public
  with check ((auth.uid() = user_id));
create policy "Users can view own balance logs" on public.account_balance_logs as permissive for select to public
  using ((auth.uid() = user_id));
create policy "team_select_account_balance_logs" on public.account_balance_logs as permissive for select to public
  using ((user_id = effective_user_id()));
create policy "Users manage own ad investments" on public.ad_investments as permissive for all to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
create policy "team_delete_ad_investments" on public.ad_investments as permissive for delete to public
  using (((user_id = effective_user_id()) AND team_can_delete()));
create policy "team_insert_ad_investments" on public.ad_investments as permissive for insert to public
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "team_select_ad_investments" on public.ad_investments as permissive for select to public
  using ((user_id = effective_user_id()));
create policy "team_update_ad_investments" on public.ad_investments as permissive for update to public
  using (((user_id = effective_user_id()) AND team_can_edit()))
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "attendant_payments_user" on public.attendant_payments as permissive for all to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
create policy "attendant_rules_user" on public.attendant_rules as permissive for all to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
create policy "attendants_delete_own" on public.attendants as permissive for delete to public
  using ((auth.uid() = user_id));
create policy "attendants_insert_own" on public.attendants as permissive for insert to public
  with check ((auth.uid() = user_id));
create policy "attendants_select_own" on public.attendants as permissive for select to public
  using ((auth.uid() = user_id));
create policy "attendants_update_own" on public.attendants as permissive for update to public
  using ((auth.uid() = user_id));
create policy "team_delete_attendants" on public.attendants as permissive for delete to public
  using (((user_id = effective_user_id()) AND team_can_delete()));
create policy "team_insert_attendants" on public.attendants as permissive for insert to public
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "team_select_attendants" on public.attendants as permissive for select to public
  using ((user_id = effective_user_id()));
create policy "team_update_attendants" on public.attendants as permissive for update to public
  using (((user_id = effective_user_id()) AND team_can_edit()))
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "bank_accounts_delete_own" on public.bank_accounts as permissive for delete to public
  using ((auth.uid() = user_id));
create policy "bank_accounts_insert_own" on public.bank_accounts as permissive for insert to public
  with check ((auth.uid() = user_id));
create policy "bank_accounts_select_own" on public.bank_accounts as permissive for select to public
  using ((auth.uid() = user_id));
create policy "bank_accounts_update_own" on public.bank_accounts as permissive for update to public
  using ((auth.uid() = user_id));
create policy "team_delete_bank_accounts" on public.bank_accounts as permissive for delete to public
  using (((user_id = effective_user_id()) AND team_can_delete()));
create policy "team_insert_bank_accounts" on public.bank_accounts as permissive for insert to public
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "team_select_bank_accounts" on public.bank_accounts as permissive for select to public
  using ((user_id = effective_user_id()));
create policy "team_update_bank_accounts" on public.bank_accounts as permissive for update to public
  using (((user_id = effective_user_id()) AND team_can_edit()))
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "Users manage own bills" on public.bills as permissive for all to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
create policy "team_delete_bills" on public.bills as permissive for delete to public
  using (((user_id = effective_user_id()) AND team_can_delete()));
create policy "team_insert_bills" on public.bills as permissive for insert to public
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "team_select_bills" on public.bills as permissive for select to public
  using ((user_id = effective_user_id()));
create policy "team_update_bills" on public.bills as permissive for update to public
  using (((user_id = effective_user_id()) AND team_can_edit()))
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "cashflow_delete_own" on public.cashflow as permissive for delete to public
  using ((auth.uid() = user_id));
create policy "cashflow_insert_own" on public.cashflow as permissive for insert to public
  with check ((auth.uid() = user_id));
create policy "cashflow_select_own" on public.cashflow as permissive for select to public
  using ((auth.uid() = user_id));
create policy "cashflow_update_own" on public.cashflow as permissive for update to public
  using ((auth.uid() = user_id));
create policy "team_delete_cashflow" on public.cashflow as permissive for delete to public
  using (((user_id = effective_user_id()) AND team_can_delete()));
create policy "team_insert_cashflow" on public.cashflow as permissive for insert to public
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "team_select_cashflow" on public.cashflow as permissive for select to public
  using ((user_id = effective_user_id()));
create policy "team_update_cashflow" on public.cashflow as permissive for update to public
  using (((user_id = effective_user_id()) AND team_can_edit()))
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "collection_calendar_emails_delete" on public.collection_calendar_emails as permissive for delete to public
  using ((auth.uid() = user_id));
create policy "collection_calendar_emails_insert" on public.collection_calendar_emails as permissive for insert to public
  with check ((auth.uid() = user_id));
create policy "collection_calendar_emails_select" on public.collection_calendar_emails as permissive for select to public
  using ((auth.uid() = user_id));
create policy "collection_calendar_emails_update" on public.collection_calendar_emails as permissive for update to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
create policy "team_delete_collection_calendar_emails" on public.collection_calendar_emails as permissive for delete to public
  using (((user_id = effective_user_id()) AND team_can_delete()));
create policy "team_insert_collection_calendar_emails" on public.collection_calendar_emails as permissive for insert to public
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "team_select_collection_calendar_emails" on public.collection_calendar_emails as permissive for select to public
  using ((user_id = effective_user_id()));
create policy "team_update_collection_calendar_emails" on public.collection_calendar_emails as permissive for update to public
  using (((user_id = effective_user_id()) AND team_can_edit()))
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "collection_clients_delete" on public.collection_clients as permissive for delete to public
  using ((auth.uid() = user_id));
create policy "collection_clients_insert" on public.collection_clients as permissive for insert to public
  with check ((auth.uid() = user_id));
create policy "collection_clients_select" on public.collection_clients as permissive for select to public
  using ((auth.uid() = user_id));
create policy "collection_clients_update" on public.collection_clients as permissive for update to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
create policy "team_delete_collection_clients" on public.collection_clients as permissive for delete to public
  using (((user_id = effective_user_id()) AND team_can_delete()));
create policy "team_insert_collection_clients" on public.collection_clients as permissive for insert to public
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "team_select_collection_clients" on public.collection_clients as permissive for select to public
  using ((user_id = effective_user_id()));
create policy "team_update_collection_clients" on public.collection_clients as permissive for update to public
  using (((user_id = effective_user_id()) AND team_can_edit()))
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "collection_history_delete" on public.collection_history as permissive for delete to public
  using ((auth.uid() = user_id));
create policy "collection_history_insert" on public.collection_history as permissive for insert to public
  with check ((auth.uid() = user_id));
create policy "collection_history_select" on public.collection_history as permissive for select to public
  using ((auth.uid() = user_id));
create policy "collection_history_update" on public.collection_history as permissive for update to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
create policy "team_delete_collection_history" on public.collection_history as permissive for delete to public
  using (((user_id = effective_user_id()) AND team_can_delete()));
create policy "team_insert_collection_history" on public.collection_history as permissive for insert to public
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "team_select_collection_history" on public.collection_history as permissive for select to public
  using ((user_id = effective_user_id()));
create policy "team_update_collection_history" on public.collection_history as permissive for update to public
  using (((user_id = effective_user_id()) AND team_can_edit()))
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "collection_platforms_delete" on public.collection_platforms as permissive for delete to public
  using ((auth.uid() = user_id));
create policy "collection_platforms_insert" on public.collection_platforms as permissive for insert to public
  with check ((auth.uid() = user_id));
create policy "collection_platforms_select" on public.collection_platforms as permissive for select to public
  using ((auth.uid() = user_id));
create policy "collection_platforms_update" on public.collection_platforms as permissive for update to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
create policy "team_delete_collection_platforms" on public.collection_platforms as permissive for delete to public
  using (((user_id = effective_user_id()) AND team_can_delete()));
create policy "team_insert_collection_platforms" on public.collection_platforms as permissive for insert to public
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "team_select_collection_platforms" on public.collection_platforms as permissive for select to public
  using ((user_id = effective_user_id()));
create policy "team_update_collection_platforms" on public.collection_platforms as permissive for update to public
  using (((user_id = effective_user_id()) AND team_can_edit()))
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "collection_settings_delete" on public.collection_settings as permissive for delete to public
  using ((auth.uid() = user_id));
create policy "collection_settings_insert" on public.collection_settings as permissive for insert to public
  with check ((auth.uid() = user_id));
create policy "collection_settings_select" on public.collection_settings as permissive for select to public
  using ((auth.uid() = user_id));
create policy "collection_settings_update" on public.collection_settings as permissive for update to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
create policy "team_delete_collection_settings" on public.collection_settings as permissive for delete to public
  using (((user_id = effective_user_id()) AND team_can_delete()));
create policy "team_insert_collection_settings" on public.collection_settings as permissive for insert to public
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "team_select_collection_settings" on public.collection_settings as permissive for select to public
  using ((user_id = effective_user_id()));
create policy "team_update_collection_settings" on public.collection_settings as permissive for update to public
  using (((user_id = effective_user_id()) AND team_can_edit()))
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "collection_statuses_delete" on public.collection_statuses as permissive for delete to public
  using ((auth.uid() = user_id));
create policy "collection_statuses_insert" on public.collection_statuses as permissive for insert to public
  with check ((auth.uid() = user_id));
create policy "collection_statuses_select" on public.collection_statuses as permissive for select to public
  using ((auth.uid() = user_id));
create policy "collection_statuses_update" on public.collection_statuses as permissive for update to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
create policy "team_delete_collection_statuses" on public.collection_statuses as permissive for delete to public
  using (((user_id = effective_user_id()) AND team_can_delete()));
create policy "team_insert_collection_statuses" on public.collection_statuses as permissive for insert to public
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "team_select_collection_statuses" on public.collection_statuses as permissive for select to public
  using ((user_id = effective_user_id()));
create policy "team_update_collection_statuses" on public.collection_statuses as permissive for update to public
  using (((user_id = effective_user_id()) AND team_can_edit()))
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "Users manage own custom categories" on public.custom_categories as permissive for all to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
create policy "team_delete_custom_categories" on public.custom_categories as permissive for delete to public
  using (((user_id = effective_user_id()) AND team_can_delete()));
create policy "team_insert_custom_categories" on public.custom_categories as permissive for insert to public
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "team_select_custom_categories" on public.custom_categories as permissive for select to public
  using ((user_id = effective_user_id()));
create policy "team_update_custom_categories" on public.custom_categories as permissive for update to public
  using (((user_id = effective_user_id()) AND team_can_edit()))
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "meta_ad_accounts_delete_own" on public.meta_ad_accounts as permissive for delete to public
  using ((auth.uid() = user_id));
create policy "meta_ad_accounts_insert_own" on public.meta_ad_accounts as permissive for insert to public
  with check ((auth.uid() = user_id));
create policy "meta_ad_accounts_select_own" on public.meta_ad_accounts as permissive for select to public
  using ((auth.uid() = user_id));
create policy "meta_ad_accounts_update_own" on public.meta_ad_accounts as permissive for update to public
  using ((auth.uid() = user_id));
create policy "team_delete_meta_ad_accounts" on public.meta_ad_accounts as permissive for delete to public
  using (((user_id = effective_user_id()) AND team_can_delete()));
create policy "team_insert_meta_ad_accounts" on public.meta_ad_accounts as permissive for insert to public
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "team_select_meta_ad_accounts" on public.meta_ad_accounts as permissive for select to public
  using ((user_id = effective_user_id()));
create policy "team_update_meta_ad_accounts" on public.meta_ad_accounts as permissive for update to public
  using (((user_id = effective_user_id()) AND team_can_edit()))
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "meta_ads_perf_delete_own" on public.meta_ads_performance as permissive for delete to public
  using ((auth.uid() = user_id));
create policy "meta_ads_perf_insert_own" on public.meta_ads_performance as permissive for insert to public
  with check ((auth.uid() = user_id));
create policy "meta_ads_perf_select_own" on public.meta_ads_performance as permissive for select to public
  using ((auth.uid() = user_id));
create policy "meta_ads_perf_update_own" on public.meta_ads_performance as permissive for update to public
  using ((auth.uid() = user_id));
create policy "team_select_meta_ads_performance" on public.meta_ads_performance as permissive for select to public
  using ((user_id = effective_user_id()));
create policy "meta_config_delete_own" on public.meta_config as permissive for delete to public
  using ((auth.uid() = user_id));
create policy "meta_config_insert_own" on public.meta_config as permissive for insert to public
  with check ((auth.uid() = user_id));
create policy "meta_config_select_own" on public.meta_config as permissive for select to public
  using ((auth.uid() = user_id));
create policy "meta_config_update_own" on public.meta_config as permissive for update to public
  using ((auth.uid() = user_id));
create policy "team_delete_meta_config" on public.meta_config as permissive for delete to public
  using (((user_id = effective_user_id()) AND team_can_delete()));
create policy "team_insert_meta_config" on public.meta_config as permissive for insert to public
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "team_select_meta_config" on public.meta_config as permissive for select to public
  using ((user_id = effective_user_id()));
create policy "team_update_meta_config" on public.meta_config as permissive for update to public
  using (((user_id = effective_user_id()) AND team_can_edit()))
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "meta_connections_user" on public.meta_connections as permissive for all to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
create policy "Users can delete own monthly_tax_config" on public.monthly_tax_config as permissive for delete to public
  using ((auth.uid() = user_id));
create policy "Users can insert own monthly_tax_config" on public.monthly_tax_config as permissive for insert to public
  with check ((auth.uid() = user_id));
create policy "Users can update own monthly_tax_config" on public.monthly_tax_config as permissive for update to public
  using ((auth.uid() = user_id));
create policy "Users can view own monthly_tax_config" on public.monthly_tax_config as permissive for select to public
  using ((auth.uid() = user_id));
create policy "team_delete_monthly_tax_config" on public.monthly_tax_config as permissive for delete to public
  using (((user_id = effective_user_id()) AND team_can_delete()));
create policy "team_insert_monthly_tax_config" on public.monthly_tax_config as permissive for insert to public
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "team_select_monthly_tax_config" on public.monthly_tax_config as permissive for select to public
  using ((user_id = effective_user_id()));
create policy "team_update_monthly_tax_config" on public.monthly_tax_config as permissive for update to public
  using (((user_id = effective_user_id()) AND team_can_edit()))
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "product_costs_user" on public.product_costs as permissive for all to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
create policy "profiles_delete_own" on public.profiles as permissive for delete to public
  using ((auth.uid() = id));
create policy "profiles_insert_own" on public.profiles as permissive for insert to public
  with check ((auth.uid() = id));
create policy "profiles_select_own" on public.profiles as permissive for select to public
  using ((auth.uid() = id));
create policy "profiles_update_own" on public.profiles as permissive for update to public
  using ((auth.uid() = id));
create policy "team_select_owner_profile" on public.profiles as permissive for select to public
  using ((id = effective_user_id()));
create policy "profit_config_user" on public.profit_config as permissive for all to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
create policy "profit_partners_user" on public.profit_partners as permissive for all to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
create policy "sales_select_own" on public.sales as permissive for select to public
  using ((auth.uid() = user_id));
create policy "team_select_sales" on public.sales as permissive for select to public
  using ((user_id = effective_user_id()));
create policy "settings_delete_own" on public.settings as permissive for delete to public
  using ((auth.uid() = user_id));
create policy "settings_insert_own" on public.settings as permissive for insert to public
  with check ((auth.uid() = user_id));
create policy "settings_select_own" on public.settings as permissive for select to public
  using ((auth.uid() = user_id));
create policy "settings_update_own" on public.settings as permissive for update to public
  using ((auth.uid() = user_id));
create policy "team_delete_settings" on public.settings as permissive for delete to public
  using (((user_id = effective_user_id()) AND team_can_delete()));
create policy "team_insert_settings" on public.settings as permissive for insert to public
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "team_select_settings" on public.settings as permissive for select to public
  using ((user_id = effective_user_id()));
create policy "team_update_settings" on public.settings as permissive for update to public
  using (((user_id = effective_user_id()) AND team_can_edit()))
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "stock_config_user" on public.stock_config as permissive for all to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
create policy "stock_movements_user" on public.stock_movements as permissive for all to public
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));
create policy "team_activity_owner" on public.team_activity_log as permissive for select to public
  using ((auth.uid() = owner_id));
create policy "team_members_owner" on public.team_members as permissive for all to public
  using ((auth.uid() = owner_id))
  with check ((auth.uid() = owner_id));
create policy "team_members_self" on public.team_members as permissive for select to public
  using ((auth.uid() = member_user_id));
create policy "team_select_transactions" on public.transactions as permissive for select to public
  using ((user_id = effective_user_id()));
create policy "transactions_delete_own" on public.transactions as permissive for delete to public
  using ((auth.uid() = user_id));
create policy "transactions_insert_own" on public.transactions as permissive for insert to public
  with check ((auth.uid() = user_id));
create policy "transactions_select_own" on public.transactions as permissive for select to public
  using ((auth.uid() = user_id));
create policy "transactions_update_own" on public.transactions as permissive for update to public
  using ((auth.uid() = user_id));
create policy "team_select_webhook_errors" on public.webhook_errors as permissive for select to public
  using ((user_id = effective_user_id()));
create policy "webhook_errors_select_own" on public.webhook_errors as permissive for select to public
  using ((auth.uid() = user_id));
create policy "team_select_webhook_logs" on public.webhook_logs as permissive for select to public
  using ((user_id = effective_user_id()));
create policy "webhook_logs_select_own" on public.webhook_logs as permissive for select to public
  using ((auth.uid() = user_id));
create policy "team_delete_webhooks" on public.webhooks as permissive for delete to public
  using (((user_id = effective_user_id()) AND team_can_delete()));
create policy "team_insert_webhooks" on public.webhooks as permissive for insert to public
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "team_select_webhooks" on public.webhooks as permissive for select to public
  using ((user_id = effective_user_id()));
create policy "team_update_webhooks" on public.webhooks as permissive for update to public
  using (((user_id = effective_user_id()) AND team_can_edit()))
  with check (((user_id = effective_user_id()) AND team_can_edit()));
create policy "webhooks_delete_own" on public.webhooks as permissive for delete to public
  using ((auth.uid() = user_id));
create policy "webhooks_insert_own" on public.webhooks as permissive for insert to public
  with check ((auth.uid() = user_id));
create policy "webhooks_select_own" on public.webhooks as permissive for select to public
  using ((auth.uid() = user_id));
create policy "webhooks_update_own" on public.webhooks as permissive for update to public
  using ((auth.uid() = user_id));
