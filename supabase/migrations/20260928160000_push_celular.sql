-- Notificações no celular (Web Push, app na tela inicial).
--
-- Uma linha por APARELHO. Cada aparelho escolhe o que quer receber
-- (preferencias), então o dono e cada pessoa da equipe decidem no próprio
-- celular. owner_id = de quem são as vendas (dono da conta); member_id = quem
-- estava logado quando ativou (o próprio dono ou um membro da equipe).
--
-- Só o backend (service role) lê e escreve: as rotas /api/push conferem a
-- sessão e o dono antes. Sem policy para anon/authenticated = sem acesso direto.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  member_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  preferencias jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  -- o serviço de push aceitou o último envio (não prova que apareceu)
  ultimo_sucesso_em timestamptz,
  -- o aparelho confirmou que MOSTROU o aviso (prova de vida)
  ultimo_recebido_em timestamptz
);

create index if not exists push_subscriptions_owner_idx on public.push_subscriptions (owner_id);

alter table public.push_subscriptions enable row level security;
