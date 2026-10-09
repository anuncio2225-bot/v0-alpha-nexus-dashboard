-- Janela de contagem por conta de anúncio da Meta (Integrações).
-- O gasto fora de [contar_desde, contar_ate] continua em meta_ads_performance,
-- só não entra em investimento, dashboard, lucro nem previsibilidade.
-- Vazio = sem limite naquele lado.
alter table public.meta_ad_accounts
  add column if not exists contar_desde date,
  add column if not exists contar_ate date;
