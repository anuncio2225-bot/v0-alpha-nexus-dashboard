-- Relatório do dia no celular: o Supabase chama /api/cron/relatorio de hora em
-- hora (a Vercel Hobby só aceita cron diário). A rota decide quem recebe
-- naquela hora (push_preferencias.relatorio_hora, horário de Brasília).
--
-- O segredo NÃO está aqui (repo público): fica no Vault do Supabase com o nome
-- 'relatorio_cron_secret' e na Vercel como RELATORIO_CRON_SECRET — os dois
-- precisam ser iguais. Criado à parte, por consulta direta.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Mesmo nome = substitui o agendamento existente.
select cron.schedule('relatorio-diario-push', '0 * * * *', $job$
  select net.http_get(
    url := 'https://alphanexusdashboardbr.vercel.app/api/cron/relatorio',
    headers := jsonb_build_object('x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'relatorio_cron_secret')),
    timeout_milliseconds := 60000
  );
$job$);
