/**
 * Janela de contagem por conta de anúncio (Integrações › Meta).
 *
 * Cada conta pode ter "contar a partir de" e/ou "contar até". O gasto fora
 * dessa janela continua importado em meta_ads_performance (nada é apagado),
 * só não entra em investimento, dashboard, lucro nem previsibilidade.
 * Vazio = sem limite naquele lado.
 */
export interface ContaComJanela {
  account_id: string;
  contar_desde?: string | null;
  contar_ate?: string | null;
}

/** Devolve `conta(accountId, "YYYY-MM-DD")` → true se aquele dia conta. */
export function filtroJanelaDasContas(contas: ContaComJanela[] | null | undefined) {
  const janelas = new Map<string, { desde: string | null; ate: string | null }>();
  for (const c of contas || []) {
    janelas.set(c.account_id, {
      desde: c.contar_desde ? String(c.contar_desde).slice(0, 10) : null,
      ate: c.contar_ate ? String(c.contar_ate).slice(0, 10) : null,
    });
  }
  return (accountId: string, dia: string) => {
    const j = janelas.get(accountId);
    if (!j) return true;
    const d = String(dia).slice(0, 10);
    if (j.desde && d < j.desde) return false;
    if (j.ate && d > j.ate) return false;
    return true;
  };
}

/** "2026-10-08" válido ou null. */
export function dataOuNull(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}
