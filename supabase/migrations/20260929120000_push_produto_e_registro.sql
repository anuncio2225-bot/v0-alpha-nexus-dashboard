-- 1) Cada pessoa escolhe se o nome do produto aparece na notificação
--    (tela de bloqueio à vista de outras pessoas).
-- 2) Registro de cada envio: responde "por que não chegou" sem adivinhar —
--    evento, para quantos aparelhos foi e, se não foi, o motivo.
alter table public.push_preferencias
  add column if not exists mostrar_produto boolean not null default true;

create table if not exists public.push_envios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  evento text not null,
  titulo text,
  referencia text,          -- ex.: código da venda
  enviados integer not null default 0,
  tentados integer not null default 0,
  ignorado text,            -- motivo quando não saiu nada
  created_at timestamptz not null default now()
);
create index if not exists push_envios_owner_idx on public.push_envios (owner_id, created_at desc);
alter table public.push_envios enable row level security;
