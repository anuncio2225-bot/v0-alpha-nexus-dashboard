-- O Pag2Pay não manda "Postado"/"Em trânsito" por webhook (só código,
-- saiu para entrega, retirada e entregue). Uma rotina consulta o rastreio
-- público de tempos em tempos; esta coluna diz quando cada venda foi
-- consultada pela última vez, para a fila andar das mais antigas primeiro.
alter table public.transactions add column if not exists tracking_checked_at timestamptz;
create index if not exists transactions_rastreio_fila_idx
  on public.transactions (tracking_checked_at nulls first)
  where tracking_code is not null and status in ('agendado', 'aguardando');
