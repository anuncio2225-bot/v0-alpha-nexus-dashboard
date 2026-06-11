-- 006: Meta Ads tables with RLS

-- Meta configuration per user (OAuth tokens, app config)
create table if not exists public.meta_config (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  access_token_encrypted text,
  app_id text,
  token_expires_at timestamptz,
  validation_status text default 'pending', -- pending | valid | expired | invalid
  last_sync_at timestamptz,
  sync_status text default 'idle', -- idle | syncing | error
  sync_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.meta_config enable row level security;

create policy "meta_config_select_own" on public.meta_config
  for select using (auth.uid() = user_id);
create policy "meta_config_insert_own" on public.meta_config
  for insert with check (auth.uid() = user_id);
create policy "meta_config_update_own" on public.meta_config
  for update using (auth.uid() = user_id);
create policy "meta_config_delete_own" on public.meta_config
  for delete using (auth.uid() = user_id);

-- Meta ad accounts linked to user
create table if not exists public.meta_ad_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  ad_account_id text not null,
  name text,
  currency text default 'BRL',
  timezone_name text,
  is_active boolean default true,
  connection_status text default 'connected', -- connected | disconnected | error
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, ad_account_id)
);

create index if not exists idx_meta_ad_accounts_user on public.meta_ad_accounts(user_id);

alter table public.meta_ad_accounts enable row level security;

create policy "meta_ad_accounts_select_own" on public.meta_ad_accounts
  for select using (auth.uid() = user_id);
create policy "meta_ad_accounts_insert_own" on public.meta_ad_accounts
  for insert with check (auth.uid() = user_id);
create policy "meta_ad_accounts_update_own" on public.meta_ad_accounts
  for update using (auth.uid() = user_id);
create policy "meta_ad_accounts_delete_own" on public.meta_ad_accounts
  for delete using (auth.uid() = user_id);

-- Meta ads performance data (daily level)
create table if not exists public.meta_ads_performance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  ad_account_id text not null,
  date date not null,
  
  -- Campaign info
  campaign_id text,
  campaign_name text,
  adset_id text,
  adset_name text,
  ad_id text,
  ad_name text,
  
  -- Spend (in BRL, already in reais from Meta API)
  spend numeric default 0,
  
  -- Metrics
  impressions integer default 0,
  clicks integer default 0,
  reach integer default 0,
  cpc numeric default 0,
  cpm numeric default 0,
  ctr numeric default 0,
  
  -- Conversions
  actions jsonb,
  action_values jsonb,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  -- Prevent duplicate entries
  unique(user_id, ad_account_id, date, campaign_id, adset_id, coalesce(ad_id, ''))
);

create index if not exists idx_meta_performance_user_date on public.meta_ads_performance(user_id, date);
create index if not exists idx_meta_performance_account on public.meta_ads_performance(user_id, ad_account_id, date);

alter table public.meta_ads_performance enable row level security;

create policy "meta_performance_select_own" on public.meta_ads_performance
  for select using (auth.uid() = user_id);
create policy "meta_performance_insert_own" on public.meta_ads_performance
  for insert with check (auth.uid() = user_id);
create policy "meta_performance_update_own" on public.meta_ads_performance
  for update using (auth.uid() = user_id);
create policy "meta_performance_delete_own" on public.meta_ads_performance
  for delete using (auth.uid() = user_id);
