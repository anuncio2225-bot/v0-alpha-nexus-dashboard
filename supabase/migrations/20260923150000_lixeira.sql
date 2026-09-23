-- Lixeira: nada que é apagado de transactions, sales, webhook_logs e
-- webhook_errors some de vez. Antes do DELETE, um gatilho copia a linha
-- inteira para public.lixeira, onde ela fica 30 dias.
--
-- Por que gatilho e não código na rota: pega QUALQUER caminho de exclusão
-- (botão "Resetar tudo", "Limpar logs", exclusão avulsa na tela, rota admin,
-- SQL no painel) sem depender de cada lugar lembrar de copiar.
--
-- Para transações, guarda também quem apontava para ela (cobrança, estoque,
-- caixa), porque essas FKs são ON DELETE SET NULL e o vínculo se perderia.
--
-- Restaurar (feito pelo suporte, não pelo usuário):
--   insert into public.transactions
--     select * from jsonb_populate_record(null::public.transactions, dados)
--     from public.lixeira where tabela = 'transactions' and user_id = '<uuid>' and apagado_em > '<quando>';
--   e religar os vínculos com lixeira.vinculos.
--
-- Idempotente.

create table if not exists public.lixeira (
  id bigint generated always as identity primary key,
  tabela text not null,
  registro_id uuid,
  user_id uuid,
  dados jsonb not null,
  vinculos jsonb,
  apagado_em timestamptz not null default now(),
  apagado_por uuid default auth.uid()
);

create index if not exists idx_lixeira_user_tabela on public.lixeira (user_id, tabela, apagado_em desc);
create index if not exists idx_lixeira_apagado_em on public.lixeira (apagado_em);

-- Só o backend (service role) lê e escreve; nenhum usuário acessa pela API.
alter table public.lixeira enable row level security;
revoke all on public.lixeira from anon, authenticated;

create or replace function public.lixeira_guardar()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_vinculos jsonb;
begin
  if tg_table_name = 'transactions' then
    select jsonb_build_object(
      'collection_clients', coalesce((select jsonb_agg(id) from public.collection_clients where transaction_id = old.id), '[]'::jsonb),
      'stock_movements',    coalesce((select jsonb_agg(id) from public.stock_movements    where transaction_id = old.id), '[]'::jsonb),
      'cashflow',           coalesce((select jsonb_agg(id) from public.cashflow           where transaction_id = old.id), '[]'::jsonb)
    ) into v_vinculos;
  end if;

  insert into public.lixeira (tabela, registro_id, user_id, dados, vinculos)
  values (tg_table_name, old.id, old.user_id, to_jsonb(old), v_vinculos);

  return old;
end;
$function$;

-- Limpeza do que passou de 30 dias: uma vez por comando DELETE, não por linha.
create or replace function public.lixeira_expirar()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  delete from public.lixeira where apagado_em < now() - interval '30 days';
  return null;
end;
$function$;

revoke execute on function public.lixeira_guardar() from public, anon, authenticated;
revoke execute on function public.lixeira_expirar() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['transactions', 'sales', 'webhook_logs', 'webhook_errors'] loop
    execute format('drop trigger if exists trg_lixeira_guardar on public.%I', t);
    execute format('create trigger trg_lixeira_guardar before delete on public.%I for each row execute function public.lixeira_guardar()', t);
    execute format('drop trigger if exists trg_lixeira_expirar on public.%I', t);
    execute format('create trigger trg_lixeira_expirar after delete on public.%I for each statement execute function public.lixeira_expirar()', t);
  end loop;
end
$$;
