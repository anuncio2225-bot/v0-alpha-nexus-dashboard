-- "Calcular gasto" por conta de anúncio: liga/desliga em vez de datas.
-- pausas = [{desde, ate}] — dias em que o gasto da conta não entra na conta
-- (desde null = desde sempre; ate null = pausa em andamento).
-- Converte o que já foi salvo em contar_desde / contar_ate (PR #88).
-- As colunas antigas ficam até o código novo estar no ar.

alter table public.meta_ad_accounts
  add column if not exists pausas jsonb not null default '[]'::jsonb;

update public.meta_ad_accounts
   set pausas =
         (case when contar_desde is not null
               then jsonb_build_array(jsonb_build_object('desde', null, 'ate', to_char(contar_desde - 1, 'YYYY-MM-DD')))
               else '[]'::jsonb end)
         ||
         (case when contar_ate is not null
               then jsonb_build_array(jsonb_build_object('desde', to_char(contar_ate + 1, 'YYYY-MM-DD'), 'ate', null))
               else '[]'::jsonb end)
 where (contar_desde is not null or contar_ate is not null)
   and pausas = '[]'::jsonb;
