-- Controle por lançamento: define se a saída do fluxo de caixa entra no cálculo
-- da Análise de Lucro (repartição de lucros). Default true preserva o
-- comportamento anterior; a exclusão por categoria (ex.: Investimento Ads)
-- continua valendo como filtro adicional para evitar dupla contagem.
ALTER TABLE public.cashflow
  ADD COLUMN IF NOT EXISTS include_in_profit BOOLEAN NOT NULL DEFAULT true;
