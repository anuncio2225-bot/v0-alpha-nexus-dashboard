-- 004: Attendants + Attendant Rules tables with RLS

create table if not exists public.attendants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  src_key text not null,
  commission_type text default 'percentage', -- percentage | fixed
  commission_value numeric default 0,
  bonus numeric default 0,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_attendants_user on public.attendants(user_id);
create index if not exists idx_attendants_src on public.attendants(user_id, src_key);

alter table public.attendants enable row level security;

create policy "attendants_select_own" on public.attendants
  for select using (auth.uid() = user_id);
create policy "attendants_insert_own" on public.attendants
  for insert with check (auth.uid() = user_id);
create policy "attendants_update_own" on public.attendants
  for update using (auth.uid() = user_id);
create policy "attendants_delete_own" on public.attendants
  for delete using (auth.uid() = user_id);

-- Attendant progressive rules (commission tiers based on sales count)
create table if not exists public.attendant_rules (
  id uuid primary key default gen_random_uuid(),
  attendant_id uuid not null references public.attendants(id) on delete cascade,
  min_sales integer not null default 0,
  max_sales integer,
  commission_type text default 'percentage',
  commission_value numeric default 0,
  bonus_value numeric default 0,
  created_at timestamptz default now()
);

alter table public.attendant_rules enable row level security;

-- Rules inherit access from parent attendant
create policy "attendant_rules_select" on public.attendant_rules
  for select using (
    exists (
      select 1 from public.attendants
      where public.attendants.id = attendant_id
      and public.attendants.user_id = auth.uid()
    )
  );
create policy "attendant_rules_insert" on public.attendant_rules
  for insert with check (
    exists (
      select 1 from public.attendants
      where public.attendants.id = attendant_id
      and public.attendants.user_id = auth.uid()
    )
  );
create policy "attendant_rules_update" on public.attendant_rules
  for update using (
    exists (
      select 1 from public.attendants
      where public.attendants.id = attendant_id
      and public.attendants.user_id = auth.uid()
    )
  );
create policy "attendant_rules_delete" on public.attendant_rules
  for delete using (
    exists (
      select 1 from public.attendants
      where public.attendants.id = attendant_id
      and public.attendants.user_id = auth.uid()
    )
  );
