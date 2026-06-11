import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { startOfDay, endOfDay, subDays, format } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import type { FilterPreset, DateRange, CampaignData } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TZ = "America/Sao_Paulo";

export function nowSP() {
  return toZonedTime(new Date(), TZ);
}

export function formatCurrency(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(safe);
}

export function formatNumber(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat("pt-BR").format(safe);
}

export function formatPercent(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toFixed(1)}%`;
}

export function formatDate(date: string | Date, fmt = "dd/MM/yyyy"): string {
  // Para datas no formato YYYY-MM-DD, extrair partes diretamente sem conversão de timezone
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}/.test(date)) {
    const [datePart] = date.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    // Criar data usando UTC para evitar conversão de timezone
    const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    return format(d, fmt);
  }
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, fmt);
}

export function formatDateShort(date: string | Date): string {
  return formatDate(date, "dd/MM");
}

export function getDateRange(preset: FilterPreset): DateRange {
  const now = nowSP();
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "yesterday": {
      const y = subDays(now, 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case "7d":
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case "14d":
      return { from: startOfDay(subDays(now, 13)), to: endOfDay(now) };
    case "30d":
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    default:
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
  }
}

export function calcROI(revenue: number, investment: number): number {
  const r = Number.isFinite(revenue) ? revenue : 0;
  const i = Number.isFinite(investment) ? investment : 0;
  if (i === 0) return 0;
  const result = ((r - i) / i) * 100;
  return Number.isFinite(result) ? result : 0;
}

export function calcCAC(investment: number, sales: number): number {
  const i = Number.isFinite(investment) ? investment : 0;
  const s = Number.isFinite(sales) ? sales : 0;
  if (s === 0) return 0;
  const result = i / s;
  return Number.isFinite(result) ? result : 0;
}

export function calcLucro(revenue: number, investment: number): number {
  const r = Number.isFinite(revenue) ? revenue : 0;
  const i = Number.isFinite(investment) ? investment : 0;
  return r - i;
}

export function getCampaignScore(
  campaign: Pick<CampaignData, "roi" | "conversions">
): CampaignData["score"] {
  if (campaign.roi >= 100 && campaign.conversions >= 5) return "Escalar";
  if (campaign.roi >= 0) return "Testar";
  return "Pausar";
}

export function parseBraipValue(centavos: number | string): number {
  const val = typeof centavos === "string" ? parseFloat(centavos) : centavos;
  return val / 100;
}

/**
 * Safely convert any value to a finite number. Returns 0 for null, undefined, NaN, Infinity.
 */
export function safeNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

// Re-export constants from types for convenience
export { STATUS_MAP, PAYMENT_MAP, CATEGORY_OPTIONS } from "@/types";
