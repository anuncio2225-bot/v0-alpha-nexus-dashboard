/**
 * Resolve quantos potes/unidades um kit vendido representa, reutilizando a
 * mesma configuração de `product_costs` da Análise de Lucro.
 *
 * Match por keyword no plan_name/product_name (ex.: "3 MESES" -> 3 potes).
 * Quando nenhum kit casa, retorna fallback de 1 pote com matched=false para o
 * usuário revisar manualmente ("Kit não identificado").
 */
export interface KitRow {
  product_keyword: string | null;
  units_per_kit: number | null;
}

export function resolveKitUnits(
  planName: string | null | undefined,
  productName: string | null | undefined,
  kits: KitRow[]
): { units: number; matched: boolean } {
  const hay = `${planName || ""} ${productName || ""}`.toLowerCase();
  const match = kits.find(
    (k) =>
      k.product_keyword &&
      hay.includes(k.product_keyword.trim().toLowerCase())
  );
  if (match) {
    const units = Number(match.units_per_kit);
    return { units: Number.isFinite(units) && units > 0 ? units : 1, matched: true };
  }
  return { units: 1, matched: false };
}
