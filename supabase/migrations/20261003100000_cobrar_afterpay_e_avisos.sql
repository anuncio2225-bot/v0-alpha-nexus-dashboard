-- 1) Coluna "Cobrar (AfterPay)": AfterPay entregue esperando o cliente pagar
--    tinha caído em "Aguardando Pagamento", misturado com Pix/boleto gerado.
-- 2) Aviso único por venda e evento (o gateway mandou "pagamento aprovado"
--    duas vezes no mesmo segundo e chegaram duas notificações).
-- 3) Confirmação de CADA notificação no aparelho (antes só a última ficava).

-- 1. coluna nova logo depois de "Entregue", em todo quadro existente
do $$
declare u record; anchor int;
begin
  for u in select distinct user_id from public.collection_statuses loop
    continue when exists (select 1 from public.collection_statuses
                          where user_id = u.user_id and lower(name) = 'cobrar (afterpay)');
    select coalesce((select position from public.collection_statuses
                     where user_id = u.user_id and lower(name) = 'entregue' limit 1), 6) into anchor;
    update public.collection_statuses set position = position + 1
     where user_id = u.user_id and position > anchor;
    insert into public.collection_statuses (user_id, name, color, icon, position, is_default, is_system)
    values (u.user_id, 'Cobrar (AfterPay)', '#f97316', 'hand-coins', anchor + 1, false, true);
  end loop;
end $$;

-- AfterPay que hoje está em "Aguardando Pagamento" vai para a coluna nova
update public.collection_clients c
   set status_id = s.id, status_name = s.name, updated_at = now()
  from public.collection_statuses s
 where s.user_id = c.user_id and s.name = 'Cobrar (AfterPay)'
   and c.sale_type = 'afterpay' and c.status_name = 'Aguardando Pagamento';

-- 2. trava de aviso único
create table if not exists public.push_avisos (
  owner_id uuid not null,
  referencia text not null,
  evento text not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, referencia, evento)
);
alter table public.push_avisos enable row level security;

-- 3. confirmação por notificação
alter table public.push_envios add column if not exists recebidos integer not null default 0;
alter table public.push_envios add column if not exists recebido_em timestamptz;
