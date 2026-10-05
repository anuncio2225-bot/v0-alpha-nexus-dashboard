-- Ordem dos cartões de atendentes escolhida pelo dono (null = fim da lista, por nome).
alter table public.attendants add column if not exists sort_order integer;
