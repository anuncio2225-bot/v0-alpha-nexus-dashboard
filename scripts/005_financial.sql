-- 005: Bank Accounts + Cashflow + Sales tables with RLS

-- Bank accounts
create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  bank text,
  balance numeric default 0,
  color text default '#10b981',
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.bank_accounts enable row level security;

create policy "bank_accounts_select_own" on public.bank_accounts
  for select using (auth.uid() = user_id);
create policy "bank_accounts_insert_own" on public.bank_accounts
  for insert with check (auth.uid() = user_id);
create policy "bank_accounts_update_own" on public.bank_accounts
  for update using (auth.uid() = user_id);
create policy "bank_accounts_delete_own" on public.bank_accounts
  for delete using (auth.uid() = user_id);

-- Cashflow entries
create table if not exists public.cashflow (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  bank_account_id uuid references public.bank_accounts(id) on delete set null,
  type text not null default 'expense', -- income | expense
  category text not null,
  description text,
  amount numeric not null default 0,
  reference_date date not null default current_date,
  is_recurring boolean default false,
  recurrence_type text, -- daily | weekly | monthly | yearly
  paid boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_cashflow_user_date on public.cashflow(user_id, reference_date);

alter table public.cashflow enable row level security;

create policy "cashflow_select_own" on public.cashflow
  for select using (auth.uid() = user_id);
create policy "cashflow_insert_own" on public.cashflow
  for insert with check (auth.uid() = user_id);
create policy "cashflow_update_own" on public.cashflow
  for update using (auth.uid() = user_id);
create policy "cashflow_delete_own" on public.cashflow
  for delete using (auth.uid() = user_id);

-- Sales (simplified view for financial calculations)
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  attendant_id uuid references public.attendants(id) on delete set null,
  status text not null default 'pending',
  sale_value numeric default 0,
  net_value numeric default 0,
  commission_value numeric default 0,
  sale_date timestamptz,
  payment_date timestamptz,
  src text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_sales_user_date on public.sales(user_id, sale_date);
create index if not exists idx_sales_user_status on public.sales(user_id, status);

alter table public.sales enable row level security;

create policy "sales_select_own" on public.sales
  for select using (auth.uid() = user_id);
