-- Faixas de comissão e pagamentos das atendentes: só o DONO lia
-- (auth.uid() = user_id). Atendente logada via comissão 0% ("Configure as
-- faixas") e "AfterPay a liberar" zerado, mesmo com 6 faixas cadastradas.
-- Mesmo modelo das outras tabelas: a equipe lê os dados da conta; editar e
-- excluir dependem das permissões do membro. (Atendente vinculada continua
-- sem alterar — as rotas da API bloqueiam.)

create policy team_select_attendant_rules on public.attendant_rules
  for select using (user_id = public.effective_user_id());
create policy team_insert_attendant_rules on public.attendant_rules
  for insert with check (user_id = public.effective_user_id() and public.team_can_edit());
create policy team_update_attendant_rules on public.attendant_rules
  for update using (user_id = public.effective_user_id() and public.team_can_edit());
create policy team_delete_attendant_rules on public.attendant_rules
  for delete using (user_id = public.effective_user_id() and public.team_can_delete());

create policy team_select_attendant_payments on public.attendant_payments
  for select using (user_id = public.effective_user_id());
create policy team_insert_attendant_payments on public.attendant_payments
  for insert with check (user_id = public.effective_user_id() and public.team_can_edit());
