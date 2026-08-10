// lib/meta/fx.ts
// ============================================================================
// Câmbio USD->BRL para converter o gasto de contas de anúncio em dólar.
//
// Estratégia: "travar a cotação do dia". Para cada dia importado buscamos a
// cotação de fechamento daquele dia (endpoint daily da AwesomeAPI, gratuito e
// sem chave) e gravamos a taxa usada em meta_ads_performance.exchange_rate.
// Assim o histórico não muda quando o dólar oscila depois.
//
// Fonte: https://economia.awesomeapi.com.br  (USD-BRL)
//  - /json/daily/USD-BRL/<n>  -> últimas n cotações diárias
// Cache em memória por processo para não repetir requisições no mesmo sync.
// ============================================================================

const AWESOME_BASE = "https://economia.awesomeapi.com.br/json";

// cache: "YYYY-MM-DD" -> taxa (BRL por 1 USD)
const rateCache = new Map<string, number>();

interface AwesomeQuote {
  bid: string; // preço de compra
  ask?: string;
  timestamp: string; // unix seconds (string)
}

function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Busca as cotações diárias USD->BRL cobrindo o intervalo [since, until] e
 * preenche o cache por dia. Uma chamada só, para o range inteiro.
 */
export async function preloadUsdBrlRange(
  since: string,
  until: string
): Promise<void> {
  const start = new Date(`${since}T00:00:00Z`);
  const end = new Date(`${until}T00:00:00Z`);
  const days =
    Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  // margem extra para cair em fins de semana/feriados sem cotação
  const n = Math.min(Math.max(days + 5, 1), 360);

  try {
    const res = await fetch(`${AWESOME_BASE}/daily/USD-BRL/${n}`, {
      // cache do fetch do Next por algumas horas
      next: { revalidate: 60 * 60 * 6 },
    });
    if (!res.ok) return;
    const quotes = (await res.json()) as AwesomeQuote[];
    for (const q of quotes) {
      const ts = Number(q.timestamp);
      if (!Number.isFinite(ts)) continue;
      const ymd = toYmd(new Date(ts * 1000));
      const bid = Number(q.bid);
      if (Number.isFinite(bid) && bid > 0 && !rateCache.has(ymd)) {
        rateCache.set(ymd, bid);
      }
    }
  } catch {
    // silencioso: se falhar, getUsdBrlRate cai no fallback
  }
}

/**
 * Retorna a taxa USD->BRL para um dia. Usa o cache carregado por
 * preloadUsdBrlRange; se o dia exato não existir (fim de semana), usa o dia
 * anterior mais próximo disponível. Fallback final: cotação spot atual.
 */
export async function getUsdBrlRate(date: string): Promise<number> {
  if (rateCache.has(date)) return rateCache.get(date)!;

  // procura o dia anterior mais próximo dentro do cache (até 7 dias atrás)
  const d = new Date(`${date}T00:00:00Z`);
  for (let i = 1; i <= 7; i++) {
    d.setUTCDate(d.getUTCDate() - 1);
    const ymd = toYmd(d);
    if (rateCache.has(ymd)) {
      const r = rateCache.get(ymd)!;
      rateCache.set(date, r);
      return r;
    }
  }

  // fallback: cotação atual (spot)
  const spot = await getSpotUsdBrl();
  rateCache.set(date, spot);
  return spot;
}

let spotCache: { value: number; at: number } | null = null;

/** Cotação spot atual USD->BRL, com cache de 1h. Fallback conservador. */
export async function getSpotUsdBrl(): Promise<number> {
  if (spotCache && Date.now() - spotCache.at < 60 * 60 * 1000) {
    return spotCache.value;
  }
  try {
    const res = await fetch(`${AWESOME_BASE}/last/USD-BRL`, {
      next: { revalidate: 60 * 60 },
    });
    if (res.ok) {
      const json = (await res.json()) as { USDBRL?: AwesomeQuote };
      const bid = Number(json.USDBRL?.bid);
      if (Number.isFinite(bid) && bid > 0) {
        spotCache = { value: bid, at: Date.now() };
        return bid;
      }
    }
  } catch {
    // ignore
  }
  // último recurso: valor plausível para não zerar o gasto
  return 5.5;
}

/** Normaliza o código de moeda (Meta usa ISO: USD, BRL, EUR...). */
export function isBRL(currency: string | null | undefined): boolean {
  return (currency || "BRL").toUpperCase() === "BRL";
}
