-- Payt: venda REEMBOLSADA ficava como PAGA no painel.
-- O aviso de reembolso da Payt chega com o status principal de ENVIO
-- (tracking_received, forwarded…) e o reembolso só em
-- transaction.payment_status = 'refunded'. O normalizador lia o primeiro e a
-- venda seguia paga (com os valores zerados por cima). O código foi corrigido;
-- aqui acertamos as vendas que já passaram por isso: se algum aviso daquela
-- venda disse que o pagamento foi reembolsado/estornado/cancelado, a venda
-- vira "devolvido" e o cartão do CRM vai para a coluna de devolução/cancelado.
do $$
declare
  n integer;
begin
  with desfeitas as (
    select distinct t.id
      from public.transactions t
      join public.webhook_logs l
        on l.user_id = t.user_id
       and l.gateway = 'payt'
       and t.external_id in (l.payload->>'transaction_id', l.payload->>'cart_id', l.payload->>'code', l.payload->>'transaction_code')
     where t.gateway = 'payt'
       and t.status = 'pago'
       and t.pago_manual_em is null
       and lower(coalesce(l.payload->>'transaction.payment_status', '')) in
           ('refunded', 'chargeback', 'cancelled', 'canceled', 'estornado', 'reembolsado')
  )
  update public.transactions t
     set status = 'devolvido',
         original_status = 'refunded',
         updated_at = now()
    from desfeitas d
   where t.id = d.id;
  get diagnostics n = row_count;
  raise notice 'Vendas Payt reembolsadas acertadas: %', n;

  -- Cartão do CRM: sai de "Pago" para a coluna de devolução (ou cancelado).
  update public.collection_clients c
     set status_id = s.id,
         status_name = s.name,
         paid_value = 0,
         remaining_value = 0,
         updated_at = now()
    from public.transactions t
    cross join lateral (
      select st.id, st.name from public.collection_statuses st
       where st.user_id = t.user_id
         and (st.name ilike 'devolu%' or st.name ilike 'cancel%')
       order by (st.name ilike 'devolu%') desc, st.position
       limit 1
    ) s
   where c.transaction_id = t.id
     and t.gateway = 'payt'
     and t.status = 'devolvido'
     and t.original_status = 'refunded'
     and lower(coalesce(c.status_name, '')) = 'pago';
end $$;
