-- Custos da Análise de Lucro valendo por PERÍODO.
--
-- Antes, mudar o custo do envio (ex.: 25 → 30) recalculava também os meses
-- já fechados e pagos. Agora cada alteração vira uma versão com data de
-- início; cada venda usa a versão vigente no dia em que foi paga.
--
-- config = custos e percentuais (cost_per_unit, shipping_cost,
--          affiliate_percent, affiliate_platform_fee, affiliate_platform_fixed)
-- kits   = [{ product_keyword, units_per_kit, custom_shipping }]

create table if not exists public.profit_config_versoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  vigente_desde date not null,
  config jsonb not null,
  kits jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, vigente_desde)
);

alter table public.profit_config_versoes enable row level security;

-- Dono e equipe leem as versões da conta; escrita só pelo backend.
create policy profit_config_versoes_select on public.profit_config_versoes
  for select to authenticated
  using (user_id = public.effective_user_id());

-- Versão inicial = os valores de hoje valendo desde sempre (o resultado dos
-- períodos passados fica exatamente como está agora).
insert into public.profit_config_versoes (user_id, vigente_desde, config, kits)
select u.user_id,
       date '2000-01-01',
       jsonb_build_object(
         'cost_per_unit', coalesce(pc.cost_per_unit, 0),
         'shipping_cost', coalesce(pc.shipping_cost, 0),
         'affiliate_percent', coalesce(pc.affiliate_percent, 50),
         'affiliate_platform_fee', coalesce(pc.affiliate_platform_fee, 5.99),
         'affiliate_platform_fixed', coalesce(pc.affiliate_platform_fixed, 1)
       ),
       coalesce((
         select jsonb_agg(jsonb_build_object(
                  'product_keyword', k.product_keyword,
                  'units_per_kit', k.units_per_kit,
                  'custom_shipping', k.custom_shipping) order by k.created_at)
         from public.product_costs k where k.user_id = u.user_id
       ), '[]'::jsonb)
from (select user_id from public.profit_config
      union select user_id from public.product_costs) u
left join public.profit_config pc on pc.user_id = u.user_id
on conflict (user_id, vigente_desde) do nothing;
