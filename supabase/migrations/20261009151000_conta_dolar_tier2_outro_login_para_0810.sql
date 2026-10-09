-- Pedido do dono (09/10/2026): a conta de anúncio "01 - CONTA DÓLAR - TIER 2"
-- está em dois logins. No grupoalphanexus ela conta a partir de 08/10; no
-- OUTRO login ela para de contar a partir de 08/10 ("Calcular gasto" desligado
-- desde 08/10). contar_ate também é gravado para valer já no código em produção.
-- Trava: só aplica se achar exatamente UM outro login com a mesma conta.
do $$
declare
  conta text;
  n integer;
begin
  select a.account_id into conta
    from public.meta_ad_accounts a
    join public.profiles p on p.id = a.user_id
   where p.email ilike 'grupoalphanexus@%'
     and a.account_name = '01 - CONTA DÓLAR - TIER 2';
  if conta is null then
    raise exception 'Conta "01 - CONTA DÓLAR - TIER 2" não encontrada em grupoalphanexus';
  end if;

  update public.meta_ad_accounts a
     set pausas = '[{"desde":"2026-10-08","ate":null}]'::jsonb,
         contar_ate = date '2026-10-07',
         updated_at = now()
    from public.profiles p
   where p.id = a.user_id
     and a.account_id = conta
     and p.email not ilike 'grupoalphanexus@%';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'Esperava 1 outro login com a conta %, achou %', conta, n;
  end if;
end $$;
