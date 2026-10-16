-- O lançamento "Reembolso para alphanexus" (15/10, R$ 3.167,19) entrou com a
-- categoria "Ajuste de plataforma" porque ela era a primeira da lista (vinha
-- marcada por padrão) e foi descontado das Pagas no Período. Volta para
-- "Outros": continua no Fluxo de Caixa, só sai do ajuste das Pagas.
do $$
declare
  u uuid;
  n integer;
begin
  select id into u from public.profiles where email ilike 'gynoflux29@%';
  update public.cashflow
     set category = 'Outros', updated_at = now()
   where user_id = u
     and category = 'Ajuste de plataforma'
     and type = 'expense'
     and description ilike 'Reembolso para alphanexus%';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Esperava 1 lançamento, achou %', n; end if;
end $$;
