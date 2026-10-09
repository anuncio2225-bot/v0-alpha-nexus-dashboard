/**
 * "Calcular gasto" por conta de anúncio (Integrações › Meta).
 *
 * Cada conta guarda as PAUSAS em que o gasto não conta: desligou o botão,
 * abre uma pausa a partir daquele dia; ligou de novo, a pausa fecha no dia
 * anterior e o gasto volta a contar dali em diante. O gasto dos dias pausados
 * continua importado em meta_ads_performance (nada é apagado), só não entra
 * em investimento, dashboard, relatório, lucro nem previsibilidade.
 *
 * pausas = [{ desde: "YYYY-MM-DD" | null, ate: "YYYY-MM-DD" | null }]
 *   desde null = desde sempre · ate null = pausa em andamento
 */
export interface Pausa {
  desde: string | null;
  ate: string | null;
}

export interface ContaComPausas {
  account_id: string;
  pausas?: unknown;
}

/** "2026-10-08" válido ou null. */
export function dataOuNull(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

/** Lista de pausas limpa (descarta lixo e pausa invertida), no máximo 50. */
export function normalizarPausas(raw: unknown): Pausa[] {
  if (!Array.isArray(raw)) return [];
  const out: Pausa[] = [];
  for (const p of raw.slice(0, 50)) {
    if (!p || typeof p !== "object") continue;
    const desde = dataOuNull((p as Pausa).desde);
    const ate = dataOuNull((p as Pausa).ate);
    if (desde && ate && ate < desde) continue;
    if (!desde && !ate) continue; // pausa sem começo nem fim = conta inteira; use desmarcar a conta
    out.push({ desde, ate });
  }
  return out;
}

/** Devolve `conta(accountId, "YYYY-MM-DD")` → true se o gasto daquele dia conta. */
export function filtroJanelaDasContas(contas: ContaComPausas[] | null | undefined) {
  const porConta = new Map<string, Pausa[]>();
  for (const c of contas || []) porConta.set(c.account_id, normalizarPausas(c.pausas));
  return (accountId: string, dia: string) => {
    const pausas = porConta.get(accountId);
    if (!pausas || pausas.length === 0) return true;
    const d = String(dia).slice(0, 10);
    return !pausas.some((p) => (!p.desde || d >= p.desde) && (!p.ate || d <= p.ate));
  };
}
