import type { PostgrestError } from "@supabase/supabase-js";

// O Supabase (PostgREST) devolve no máximo 1.000 linhas por consulta e corta o
// resto SEM erro nem aviso. Toda consulta que lista linhas para somar, contar
// ou exportar precisa passar por aqui, senão o número sai menor que o real
// assim que o período filtrado passar de 1.000 linhas.
const PAGE_SIZE = 1000;

interface PageableQuery<T> extends PromiseLike<{ data: T[] | null; error: PostgrestError | null }> {
  range(from: number, to: number): PageableQuery<T>;
  order(column: string, options?: { ascending?: boolean }): PageableQuery<T>;
}

/**
 * Executa a consulta página por página até acabar e devolve tudo junto, no
 * mesmo formato `{ data, error }` do Supabase.
 *
 * Passe a consulta montada, SEM `.range()`/`.limit()`. Um desempate por `id` é
 * acrescentado à ordenação para as páginas não repetirem nem pularem linhas.
 */
export async function fetchAll<T>(
  query: PageableQuery<T>,
  tieBreaker: string | null = "id",
): Promise<{ data: T[] | null; error: PostgrestError | null }> {
  const ordered = tieBreaker ? query.order(tieBreaker, { ascending: true }) : query;
  const rows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await ordered.range(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  return { data: rows, error: null };
}
