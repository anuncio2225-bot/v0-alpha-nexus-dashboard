-- Pagamento registrado À MÃO na Cobrança para uma venda que veio do gateway
-- (ex.: AfterPay em que o cliente adiantou o pagamento por fora).
-- pago_manual_em marca a venda como paga pelo dono; o webhook não a desfaz
-- (agendado/aguardando/frustrado/cancelado do gateway são ignorados — só
-- reembolso passa). status_antes_manual permite desfazer.
alter table public.transactions add column if not exists pago_manual_em timestamptz;
alter table public.transactions add column if not exists status_antes_manual text;
