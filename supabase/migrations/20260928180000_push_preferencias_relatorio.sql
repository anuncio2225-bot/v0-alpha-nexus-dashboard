-- Preferências de notificação por PESSOA (não mais por aparelho) + controle
-- do dono sobre a equipe + relatório diário.
--
-- owner_id  = dono da conta (de quem são as vendas)
-- member_id = a pessoa (o próprio dono ou um membro da equipe)
-- permitido = o DONO decide se aquele membro recebe notificações (o dono
--             sempre recebe; para ele o campo é ignorado)
-- relatorio_* = resumo do dia enviado no horário escolhido (hora de Brasília)

create table if not exists public.push_preferencias (
  owner_id uuid not null,
  member_id uuid not null,
  preferencias jsonb not null default '{}'::jsonb,
  permitido boolean not null default true,
  relatorio_ativo boolean not null default true,
  relatorio_hora smallint not null default 21 check (relatorio_hora between 0 and 23),
  relatorio_enviado_em date,
  updated_at timestamptz not null default now(),
  primary key (owner_id, member_id)
);

alter table public.push_preferencias enable row level security;

-- As escolhas agora moram em push_preferencias (a tabela de aparelhos ainda
-- não tinha nenhuma linha quando isto foi aplicado).
alter table public.push_subscriptions drop column if exists preferencias;
