-- Conta nova também ganha a coluna "Cobrar (AfterPay)".
CREATE OR REPLACE FUNCTION public.seed_collection_defaults(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s record;
  p record;
begin
  -- Só o próprio dono (ou membro da equipe dele) ou o backend (service role).
  if coalesce(auth.role(), '') <> 'service_role'
     and p_user_id is distinct from public.effective_user_id() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Status padrao: automaticos do webhook (pagamento + entrega) e manuais.
  for s in select * from (values
    ('Agendado', '#0ea5e9', 'calendar-check', 0, false, true),
    ('Postado', '#6366f1', 'package', 1, false, true),
    ('Em Trânsito', '#8b5cf6', 'truck', 2, false, true),
    ('Saiu para Entrega', '#d946ef', 'map-pin', 3, false, true),
    ('Aguardando Retirada', '#f59e0b', 'store', 4, false, true),
    ('Entregue', '#14b8a6', 'package-check', 5, false, true),
    ('Cobrar (AfterPay)', '#f97316', 'hand-coins', 5, false, true),
    ('Falha na Entrega', '#dc2626', 'package-x', 6, false, true),
    ('Aguardando Pagamento', '#3b82f6', 'clock', 7, false, true),
    ('Pagamento Pendente', '#ef4444', 'alert-triangle', 8, true, true),
    ('Negociacao', '#eab308', 'handshake', 9, false, false),
    ('Prometeu Pagar', '#a855f7', 'calendar-clock', 10, false, false),
    ('Pagamento Parcial', '#f97316', 'circle-dollar-sign', 11, false, false),
    ('Aguardando Confirmacao', '#06b6d4', 'clock', 12, false, false),
    ('Nao Responde', '#1f2937', 'phone-off', 13, false, false),
    ('Base Correios', '#a16207', 'truck', 14, false, false),
    ('Frustrado', '#374151', 'x-circle', 15, false, true),
    ('Cancelado', '#ea580c', 'ban', 16, false, true),
    ('Pago', '#22c55e', 'check', 17, false, true),
    ('Devolucao', '#f59e0b', 'undo-2', 18, false, true)
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
