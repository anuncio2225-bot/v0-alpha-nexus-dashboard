-- Um mesmo celular pode receber de MAIS DE UMA conta (ex.: dono com duas
-- operações). Antes o endpoint era único na tabela: ativar na segunda conta
-- tirava o aparelho da primeira. Agora a chave é (conta, endpoint).
alter table public.push_subscriptions drop constraint if exists push_subscriptions_endpoint_key;
alter table public.push_subscriptions
  add constraint push_subscriptions_owner_endpoint_key unique (owner_id, endpoint);
create index if not exists push_subscriptions_endpoint_idx on public.push_subscriptions (endpoint);
