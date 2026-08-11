-- Recalcula o spend (BRL) das linhas já importadas de uma conta, aplicando o
-- IOF informado sobre o valor original + câmbio TRAVADO de cada dia. Assim,
-- mudar o IOF na tela reflete no cálculo sem precisar reimportar da Meta.
-- Espelha a lógica do sync (toPerformanceRow): contas BRL não sofrem câmbio/IOF.
CREATE OR REPLACE FUNCTION public.recalc_meta_account_spend(
  p_user uuid,
  p_account text,
  p_iof numeric
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.meta_ads_performance
  SET iof_percent = p_iof,
      spend = CASE
        WHEN upper(coalesce(currency, 'BRL')) = 'BRL'
          THEN coalesce(spend_original, spend)
        ELSE ROUND(
          (coalesce(spend_original, spend) * coalesce(exchange_rate, 1)
            * (1 + p_iof / 100))::numeric, 2)
      END,
      updated_at = now()
  WHERE user_id = p_user
    AND ad_account_id = p_account;
$$;
