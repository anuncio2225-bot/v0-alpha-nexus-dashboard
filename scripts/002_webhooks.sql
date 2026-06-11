-- 002: Webhooks tables with RLS

create table if not exists public.webhooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token uuid default gen_random_uuid(),
  name text not null,
  label text,
  sale_type text default 'agendado',
  braip_auth_key text,
  active boolean default true,
  received_count integer default 0,
  processed_count integer default 0,
  error_count integer default 0,
  last_received_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.webhooks enable row level security;

-- User can manage their own webhooks
create policy "webhooks_select_own" on public.webhooks
  for select using (auth.uid() = user_id);
create policy "webhooks_insert_own" on public.webhooks
  for insert with check (auth.uid() = user_id);
create policy "webhooks_update_own" on public.webhooks
  for update using (auth.uid() = user_id);
create policy "webhooks_delete_own" on public.webhooks
  for delete using (auth.uid() = user_id);

-- Service role needs full access for webhook processing (via admin client)
-- This is handled by using the service_role key which bypasses RLS

-- Webhook config table (alternative structure)
create table if not exists public.webhook_config (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token uuid default gen_random_uuid(),
  name text not null,
  platform text default 'braip',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.webhook_config enable row level security;

create policy "webhook_config_select_own" on public.webhook_config
  for select using (auth.uid() = user_id);
create policy "webhook_config_insert_own" on public.webhook_config
  for insert with check (auth.uid() = user_id);
create policy "webhook_config_update_own" on public.webhook_config
  for update using (auth.uid() = user_id);
create policy "webhook_config_delete_own" on public.webhook_config
  for delete using (auth.uid() = user_id);

-- RPC to increment webhook counters (called by service role)
create or replace function public.increment_webhook_count(
  p_webhook_id uuid,
  p_field text default 'received_count'
)
returns void
language plpgsql
security definer
as $$
begin
  if p_field = 'received_count' then
    update public.webhooks set received_count = received_count + 1, last_received_at = now() where id = p_webhook_id;
  elsif p_field = 'processed_count' then
    update public.webhooks set processed_count = processed_count + 1 where id = p_webhook_id;
  elsif p_field = 'error_count' then
    update public.webhooks set error_count = error_count + 1 where id = p_webhook_id;
  end if;
end;
$$;
