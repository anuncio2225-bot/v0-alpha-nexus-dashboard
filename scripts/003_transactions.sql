-- 003: Transactions + Transaction Logs tables with RLS

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  webhook_id uuid references public.webhooks(id) on delete set null,
  
  -- Braip transaction identifiers
  trans_key text not null,
  transaction_code text,
  
  -- Product info
  product_name text,
  product_id text,
  plan_name text,
  
  -- Buyer info
  buyer_name text,
  buyer_email text,
  buyer_phone text,
  buyer_document text,
  
  -- Financial values (in BRL, already divided by 100 from Braip centavos)
  sale_value numeric default 0,
  net_value numeric default 0,
  commission_value numeric default 0,
  platform_fee numeric default 0,
  
  -- Status
  status text not null default 'pending',
  status_code integer,
  previous_status text,
  payment_method text,
  payment_type text,
  
  -- Sale classification
  sale_type text default 'agendado', -- agendado | antecipado | pago
  
  -- Tracking / UTM
  src text,
  sck text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  
  -- Dates
  sale_date timestamptz,
  payment_date timestamptz,
  warranty_date timestamptz,
  next_charge_date timestamptz,
  
  -- Subscription
  is_subscription boolean default false,
  subscription_id text,
  charge_number integer,
  
  -- Tracking info
  tracking_code text,
  tracking_url text,
  tracking_status text,
  
  -- Metadata
  raw_event text,
  
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  
  -- Prevent duplicates per user
  unique(user_id, trans_key)
);

-- Indexes for common queries
create index if not exists idx_transactions_user_status on public.transactions(user_id, status);
create index if not exists idx_transactions_user_date on public.transactions(user_id, sale_date);
create index if not exists idx_transactions_user_src on public.transactions(user_id, src);
create index if not exists idx_transactions_sale_type on public.transactions(user_id, sale_type);

alter table public.transactions enable row level security;

-- Users can read their own transactions
create policy "transactions_select_own" on public.transactions
  for select using (auth.uid() = user_id);

-- Only service role inserts/updates (webhook processing uses admin client)
-- Users cannot directly insert/update/delete transactions

-- Transaction logs (raw payloads from webhooks)
create table if not exists public.transaction_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  webhook_id uuid references public.webhooks(id) on delete set null,
  event_type text,
  raw_payload jsonb,
  processed boolean default false,
  error_message text,
  created_at timestamptz default now()
);

create index if not exists idx_transaction_logs_user on public.transaction_logs(user_id, created_at desc);

alter table public.transaction_logs enable row level security;

create policy "transaction_logs_select_own" on public.transaction_logs
  for select using (auth.uid() = user_id);
