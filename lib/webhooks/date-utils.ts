// Normalização de datas vindas dos gateways (Payt, Braip, etc.).
//
// PROBLEMA: os gateways enviam datas em horário de parede de Brasília SEM fuso
// (ex.: "2026-07-14 02:04:08.000000"). Ao gravar direto numa coluna timestamptz
// com o banco em UTC, o Postgres interpreta esse valor como se fosse UTC, o que
// atrasa a data em 3h (→ 13/07 23:04) e joga a venda para o dia anterior.
//
// SOLUÇÃO: quando a string NÃO tem fuso, tratamos como horário de Brasília
// (-03:00) e convertemos para um ISO 8601 correto (UTC). Strings que já vêm com
// fuso (Z ou ±HH:MM) e timestamps Unix são respeitados como estão.

const SP_OFFSET = "-03:00";

export function normalizeGatewayDate(
  raw: string | null | undefined
): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;

  // Timestamp Unix (segundos ou milissegundos)
  if (/^\d{10}$/.test(s)) {
    const d = new Date(Number(s) * 1000);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  if (/^\d{13}$/.test(s)) {
    const d = new Date(Number(s));
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }

  // Normaliza separador de data/hora e remove fração de segundos (JS não lida
  // bem com microssegundos de 6 dígitos como ".000000").
  const base = s.replace(" ", "T").replace(/\.\d+/, "");

  // Já possui informação de fuso (Z, +HH:MM, -HH:MM, +HHMM)?
  const hasTz = /[zZ]$/.test(base) || /[+-]\d{2}:?\d{2}$/.test(base);
  if (hasTz) {
    const d = new Date(base);
    return isNaN(d.getTime()) ? undefined : d.toISOString();
  }

  // Sem fuso: interpreta como horário de Brasília.
  // Caso tenha data e hora (contém "T").
  if (base.includes("T")) {
    const d = new Date(`${base}${SP_OFFSET}`);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // Somente data "YYYY-MM-DD".
  const dateOnly = new Date(`${base}T00:00:00${SP_OFFSET}`);
  if (!isNaN(dateOnly.getTime())) return dateOnly.toISOString();

  // Último recurso: tenta o parser nativo.
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? undefined : fallback.toISOString();
}
