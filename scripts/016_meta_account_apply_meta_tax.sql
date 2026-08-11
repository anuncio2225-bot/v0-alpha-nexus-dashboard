-- Controle POR CONTA se o gasto entra no "imposto da Meta" (ads_tax_percentage).
-- true (default) = comportamento atual: converte p/ BRL + IOF e AINDA aplica o imposto da Meta.
-- false (isenta)  = apenas converte p/ BRL + IOF, SEM o imposto da Meta.
ALTER TABLE public.meta_ad_accounts
  ADD COLUMN IF NOT EXISTS apply_meta_tax BOOLEAN NOT NULL DEFAULT true;
