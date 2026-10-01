-- Consulta do rastreio Pag2Pay a cada 20 minutos (o webhook deles não manda
-- "Postado"/"Em trânsito"). Mesmo segredo do relatório diário, guardado no
-- Vault como 'relatorio_cron_secret' (= RELATORIO_CRON_SECRET na Vercel).
select cron.schedule('rastreio-pag2pay', '*/20 * * * *', $job$
  select net.http_get(
    url := 'https://alphanexusdashboardbr.vercel.app/api/cron/rastreio',
    headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'relatorio_cron_secret')),
    timeout_milliseconds := 60000
  );
$job$);
