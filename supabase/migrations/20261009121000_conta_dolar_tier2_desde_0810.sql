-- Pedido do dono (09/10/2026): na conta grupoalphanexus, a conta de anúncio
-- "01 - CONTA DÓLAR - TIER 2" só entra no investimento a partir de 08/10/2026
-- (06 e 07/10 ficam guardados, mas fora da conta).
-- Trava: só aplica se achar exatamente UMA conta com esse nome nesse login.
do $$
declare
  n integer;
begin
  update public.meta_ad_accounts a
     set contar_desde = date '2026-10-08',
         updated_at = now()
    from public.profiles p
   where p.id = a.user_id
     and p.email ilike 'grupoalphanexus@%'
     and a.account_name = '01 - CONTA DÓLAR - TIER 2';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'Esperava 1 conta "01 - CONTA DÓLAR - TIER 2" em grupoalphanexus, achou %', n;
  end if;
end $$;
