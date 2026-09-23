-- Fecha o acesso público ao banco (auditoria de 2026-09-23).
--
-- 1) Remove 13 policies "*_service" com USING/WITH CHECK (true) para o role
--    `public`. Elas foram criadas para "liberar o backend", mas o backend usa a
--    service role, que já ignora RLS. Na prática liberavam as tabelas para
--    QUALQUER pessoa com a chave anon (que vai no navegador): leitura de todos
--    os webhooks (com token) e de todos os payloads de venda, e gravação de
--    transações em nome de qualquer usuário. Cada tabela já tem a policy do
--    dono (auth.uid() / effective_user_id()) para o mesmo comando.
--
-- 2) Funções SECURITY DEFINER que recebem o id do usuário passam a recusar
--    quem tenta agir em nome de outro, e deixam de ser executáveis sem login.
--
-- Idempotente: pode rodar de novo sem efeito colateral.

drop policy if exists "cashflow_insert_service"        on public.cashflow;
drop policy if exists "meta_ads_perf_insert_service"   on public.meta_ads_performance;
drop policy if exists "meta_ads_perf_update_service"   on public.meta_ads_performance;
drop policy if exists "sales_insert_service"           on public.sales;
drop policy if exists "sales_update_service"           on public.sales;
drop policy if exists "team_activity_insert"           on public.team_activity_log;
drop policy if exists "transactions_insert_service"    on public.transactions;
drop policy if exists "transactions_update_service"    on public.transactions;
drop policy if exists "webhook_errors_insert_service"  on public.webhook_errors;
drop policy if exists "webhook_errors_select_service"  on public.webhook_errors;
drop policy if exists "webhook_logs_insert_service"    on public.webhook_logs;
drop policy if exists "webhook_logs_select_service"    on public.webhook_logs;
drop policy if exists "webhooks_select_service"        on public.webhooks;

create or replace function public.recalc_meta_account_spend(p_user uuid, p_account text, p_iof numeric)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  -- Só o próprio dono (ou membro da equipe dele) ou o backend (service role).
  if coalesce(auth.role(), '') <> 'service_role'
     and p_user is distinct from public.effective_user_id() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.meta_ads_performance
  set iof_percent = p_iof,
      spend = case
        when upper(coalesce(currency, 'BRL')) = 'BRL'
          then coalesce(spend_original, spend)
        else round(
          (coalesce(spend_original, spend) * coalesce(exchange_rate, 1)
            * (1 + p_iof / 100))::numeric, 2)
      end,
      updated_at = now()
  where user_id = p_user
    and ad_account_id = p_account;
end;
$function$;

create or replace function public.seed_collection_defaults(p_user_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  s record;
  p record;
begin
  -- Só o próprio dono (ou membro da equipe dele) ou o backend (service role).
  if coalesce(auth.role(), '') <> 'service_role'
     and p_user_id is distinct from public.effective_user_id() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Status padrao alinhados ao Braip (automaticos do webhook + manuais).
  for s in select * from (values
    ('Agendado', '#0ea5e9', 'calendar-check', 0, false, true),
    ('Aguardando Pagamento', '#3b82f6', 'clock', 1, false, true),
    ('Pagamento Pendente', '#ef4444', 'alert-triangle', 2, true, true),
    ('Negociacao', '#eab308', 'handshake', 3, false, false),
    ('Prometeu Pagar', '#a855f7', 'calendar-clock', 4, false, false),
    ('Pagamento Parcial', '#f97316', 'circle-dollar-sign', 5, false, false),
    ('Aguardando Confirmacao', '#06b6d4', 'clock', 6, false, false),
    ('Nao Responde', '#1f2937', 'phone-off', 7, false, false),
    ('Base Correios', '#a16207', 'truck', 8, false, false),
    ('Frustrado', '#374151', 'x-circle', 9, false, true),
    ('Cancelado', '#ea580c', 'ban', 10, false, true),
    ('Pago', '#22c55e', 'check', 11, false, true),
    ('Devolucao', '#f59e0b', 'undo-2', 12, false, true)
  ) as v(name, color, icon, position, is_default, is_system)
  loop
    if not exists (
      select 1 from public.collection_statuses
      where user_id = p_user_id and lower(name) = lower(s.name)
    ) then
      insert into public.collection_statuses (user_id, name, color, icon, position, is_default, is_system)
      values (p_user_id, s.name, s.color, s.icon, s.position, s.is_default, s.is_system);
    end if;
  end loop;

  -- Plataformas padrao
  for p in select * from (values
    ('Braip', true),
    ('Payt', true),
    ('Pag2Pay', false),
    ('PIX Manual', false),
    ('Boleto Manual', false),
    ('Cartao Manual', false)
  ) as v(name, is_system)
  loop
    if not exists (
      select 1 from public.collection_platforms
      where user_id = p_user_id and lower(name) = lower(p.name)
    ) then
      insert into public.collection_platforms (user_id, name, is_system)
      values (p_user_id, p.name, p.is_system);
    end if;
  end loop;
end
$function$;

-- Sem login ninguém executa; logado executa (e a função confere o dono).
revoke execute on function public.recalc_meta_account_spend(uuid, text, numeric) from public, anon;
revoke execute on function public.seed_collection_defaults(uuid) from public, anon;
grant  execute on function public.recalc_meta_account_spend(uuid, text, numeric) to authenticated, service_role;
grant  execute on function public.seed_collection_defaults(uuid) to authenticated, service_role;

-- Função de gatilho: só roda pelo trigger do cadastro, nunca por chamada direta.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
