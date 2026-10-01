-- Modalidade da venda no CRM (afterpay | antecipado | recuperacao): AfterPay e
-- antecipado rodam juntos no mesmo quadro e o card precisa dizer qual é qual.
alter table public.collection_clients add column if not exists sale_type text;

update public.collection_clients c
   set sale_type = t.sale_type
  from public.transactions t
 where t.id = c.transaction_id
   and c.sale_type is distinct from t.sale_type;
