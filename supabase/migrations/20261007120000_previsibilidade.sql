-- PREVISIBILIDADE: simulador da operação (pedidos → frustração → pagos →
-- faturamento → custos → lucro → ROI).
--
-- previsibilidade_config     = o simulador aberto da conta (uma linha por dono):
--                              entradas (todos os valores editáveis) e cenários.
-- previsibilidade_historico  = cada simulação salva, com as entradas e o
--                              resultado do momento (consulta e comparação depois).
--
-- Mesmo modelo das outras tabelas: dono e equipe leem os dados da conta;
-- criar/editar/apagar dependem das permissões do membro.

create table if not exists public.previsibilidade_config (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  entradas jsonb not null default '{}'::jsonb,
  cenarios jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.previsibilidade_historico (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  nome text not null,
  entradas jsonb not null,
  resultado jsonb not null,
  criado_por uuid,
  created_at timestamptz not null default now()
);

create index if not exists previsibilidade_historico_user_idx
  on public.previsibilidade_historico (user_id, created_at desc);

alter table public.previsibilidade_config enable row level security;
alter table public.previsibilidade_historico enable row level security;

create policy previsibilidade_config_select on public.previsibilidade_config
  for select to authenticated using (user_id = public.effective_user_id());
create policy previsibilidade_config_insert on public.previsibilidade_config
  for insert to authenticated with check (user_id = public.effective_user_id() and public.team_can_edit());
create policy previsibilidade_config_update on public.previsibilidade_config
  for update to authenticated using (user_id = public.effective_user_id() and public.team_can_edit());

create policy previsibilidade_historico_select on public.previsibilidade_historico
  for select to authenticated using (user_id = public.effective_user_id());
create policy previsibilidade_historico_insert on public.previsibilidade_historico
  for insert to authenticated with check (user_id = public.effective_user_id() and public.team_can_edit());
create policy previsibilidade_historico_delete on public.previsibilidade_historico
  for delete to authenticated using (user_id = public.effective_user_id() and public.team_can_delete());
