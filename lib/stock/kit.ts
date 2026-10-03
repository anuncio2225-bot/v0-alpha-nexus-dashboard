/**
 * Resolve quantos potes/unidades um kit vendido representa.
 *
 * Estratégia (em ordem de prioridade):
 *  1. Padrão "X+Y" na descrição (ex.: "4+2 DE BRINDE" -> 4+2 = 6 potes,
 *     "5+4" -> 9, "2+1" -> 3). É o formato usado nos nomes de checkout.
 *  2. Match por keyword configurada em `product_costs` (Análise de Lucro),
 *     ex.: "3 MESES" -> 3 potes.
 *  3. Quantidade escrita no nome: "6 MESES", "6 potes", "6 frascos",
 *     "6 unidades" (1 pote por mês). Antes, "🟢 GynoFlux - 6 MESES" sem kit
 *     cadastrado de 6 caía no fallback e dava saída de 1 pote só.
 *  4. Fallback de 1 pote com matched=false para revisão manual.
 */
export interface KitRow {
  product_keyword: string | null;
  units_per_kit: number | null;
}

/**
 * Extrai a soma de um padrão "X+Y" (compra + brinde) da string.
 * Ex.: "5+4 DE BRINDE - GynoFlux" -> 9. Retorna null se não houver o padrão.
 */
export function parseKitFromText(text: string): number | null {
  // Captura "N + N" com espaços opcionais. Ex.: "4+2", "5 + 4".
  const m = text.match(/(\d{1,2})\s*\+\s*(\d{1,2})/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const total = a + b;
  return total > 0 ? total : null;
}

/**
 * Extrai a quantidade escrita no nome do plano ("6 MESES", "9 potes").
 * Retorna null se não houver.
 */
export function parseUnidadesDoTexto(text: string): number | null {
  const m = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/(\d{1,2})\s*(meses|mes|potes?|frascos?|unidades?|caixas?)\b/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 && n <= 24 ? n : null;
}

export function resolveKitUnits(
  planName: string | null | undefined,
  productName: string | null | undefined,
  kits: KitRow[]
): { units: number; matched: boolean } {
  const hay = `${planName || ""} ${productName || ""}`;

  // 1. Padrão X+Y direto na descrição (prioritário e auto-suficiente).
  const parsed = parseKitFromText(hay);
  if (parsed !== null) {
    return { units: parsed, matched: true };
  }

  // 2. Keyword configurada em product_costs.
  const lower = hay.toLowerCase();
  const match = kits.find(
    (k) =>
      k.product_keyword &&
      lower.includes(k.product_keyword.trim().toLowerCase())
  );
  if (match) {
    const units = Number(match.units_per_kit);
    return { units: Number.isFinite(units) && units > 0 ? units : 1, matched: true };
  }

  // 3. Quantidade escrita no nome ("6 MESES").
  const doTexto = parseUnidadesDoTexto(hay);
  if (doTexto !== null) return { units: doTexto, matched: true };

  // 4. Fallback: revisar manualmente.
  return { units: 1, matched: false };
}
