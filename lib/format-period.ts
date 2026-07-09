/**
 * Formata um intervalo de datas (YYYY-MM-DD) de forma curta: "dd/MM - dd/MM".
 * Se o período cruzar o ano, usa "dd/MM/YY - dd/MM/YY" para não ficar ambíguo.
 */
export function formatPeriodRange(start?: string | null, end?: string | null): string {
  if (!start || !end) return "";
  const crossesYear = start.slice(0, 4) !== end.slice(0, 4);
  return `${fmtShort(start, crossesYear)} - ${fmtShort(end, crossesYear)}`;
}

function fmtShort(d: string, withYear: boolean): string {
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return withYear ? `${day}/${m}/${y.slice(2)}` : `${day}/${m}`;
}
