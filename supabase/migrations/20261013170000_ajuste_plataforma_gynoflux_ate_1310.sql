-- Conciliação pedida pelo dono (13/10/2026), conta Gynoflux, de 28/09 a 13/10:
-- vendas pagas no painel R$ 5.191,88 × saldos Payt + Pag2Pay + Pix R$ 5.156,72.
-- A diferença (R$ 35,16) são taxas cobradas fora da venda (reembolso na Payt,
-- tarifas) e a diferença do link pago por fora. Lançada no Fluxo de Caixa como
-- "Ajuste de plataforma" (desconta das Pagas no Período do Dashboard).
-- Não duplica se rodar de novo.
do $$
declare
  u uuid;
begin
  select id into u from public.profiles where email ilike 'gynoflux29@%';
  if u is null then raise exception 'Conta Gynoflux não encontrada'; end if;

  if not exists (
    select 1 from public.cashflow
     where user_id = u and category = 'Ajuste de plataforma'
       and description like 'Conciliação 28/09 a 13/10%'
  ) then
    insert into public.cashflow (user_id, type, category, description, amount, date, status, source, payment_method, notes, include_in_profit)
    values (u, 'expense', 'Ajuste de plataforma',
            'Conciliação 28/09 a 13/10 — taxas Payt (reembolso e tarifas) e diferença de link',
            35.16, timestamptz '2026-10-13 12:00:00-03', 'confirmed', 'manual', 'outro',
            'Painel R$ 5.191,88 × saldos Payt + Pag2Pay + Pix R$ 5.156,72', true);
  end if;
end $$;
