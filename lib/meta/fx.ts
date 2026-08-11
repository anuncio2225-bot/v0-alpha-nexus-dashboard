// lib/meta/fx.ts
// ============================================================================
// Câmbio USD->BRL para converter o gasto de contas de anúncio em dólar.
//
// Estratégia: "travar a cotação do dia". Para cada dia importado buscamos a
// cotação daquele dia e gravamos a taxa usada em
// meta_ads_performance.exchange_rate. Assim o histórico não muda quando o
// dólar oscila depois.
//
// Fonte primária: Frankfurter (https://frankfurter.dev) — dados do BCE,
// gratuito, sem chave e SEM quota, com histórico por data e séries por período.
//   - /v1/<start>..<end>?base=USD&symbols=BRL  -> série do período
//   - /v1/<date>?base=USD&symbols=BRL          -> cotação de um dia
//   - /v1/latest?base=USD&symbols=BRL          -> cotação mais recente
// Fonte de fallback: AwesomeAPI (pode ter quota excedida / 429).
//
// Observação: o BCE só publica em dias úteis; fins de semana/feriados usam o
// pregão anterior mais próximo (getUsdBrlRate faz esse walk-back no cache).
// Cache em memória por processo para não repetir requisições no mesmo sync.
// ============================================================================

const FRANKFURTER_BASE = "https://api.frankfurter.dev/v1";
const AWESOME_BASE = "https://economia.awesomeapi.com.br/json";

// cache: "YYYY-MM-DD" -> taxa (BRL por 1 USD)
const rateCache = new Map<string, number>();

interface AwesomeQuote {
  bid: string; // preço de compra
  ask?: string;
  timestamp: string; // unix seconds (string)
}

interface FrankfurterRange {
  rates?: Record<string, { BRL?: number }>;
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
  // 1) Frankfurter (primária): série do período completo em uma requisição.
  try {
    const res = await fetch(
      `${FRANKFURTER_BASE}/${since}..${until}?base=USD&symbols=BRL`,
      { next: { revalidate: 60 * 60 * 6 } }
    );
    if (res.ok) {
      const json = (await res.json()) as FrankfurterRange;
      const rates = json.rates || {};
      let filled = 0;
      for (const [ymd, obj] of Object.entries(rates)) {
        const brl = Number(obj?.BRL);
        if (Number.isFinite(brl) && brl > 0) {
          rateCache.set(ymd, brl);
          filled++;
        }
      }
      if (filled > 0) return;
    }
  } catch {
    // cai para a AwesomeAPI
  }

  // 2) AwesomeAPI (fallback): últimas N cotações diárias.
  try {
    const start = new Date(`${since}T00:00:00Z`);
    const end = new Date(`${until}T00:00:00Z`);
    const days =
      Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    const extra =
      Math.floor((Date.now() - end.getTime()) / (24 * 60 * 60 * 1000)) + 5;
    const n = Math.min(Math.max(days + extra, 1), 360);

    const res = await fetch(`${AWESOME_BASE}/daily/USD-BRL/${n}`, {
      next: { revalidate: 60 * 60 * 6 },
    });
    if (!res.ok) return;
    const quotes = (await res.json()) as AwesomeQuote[];
    if (!Array.isArray(quotes)) return;
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
    // silencioso: se falhar, getUsdBrlRate cai no fallback spot
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

  // busca pontual na Frankfurter para o dia exato
  try {
    const res = await fetch(
      `${FRANKFURTER_BASE}/${date}?base=USD&symbols=BRL`,
      { next: { revalidate: 60 * 60 * 6 } }
    );
    if (res.ok) {
      const json = (await res.json()) as { rates?: { BRL?: number } };
      const brl = Number(json.rates?.BRL);
      if (Number.isFinite(brl) && brl > 0) {
        rateCache.set(date, brl);
        return brl;
      }
    }
  } catch {
    // cai no spot
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
  // 1) Frankfurter latest
  try {
    const res = await fetch(`${FRANKFURTER_BASE}/latest?base=USD&symbols=BRL`, {
      next: { revalidate: 60 * 60 },
    });
    if (res.ok) {
      const json = (await res.json()) as { rates?: { BRL?: number } };
      const brl = Number(json.rates?.BRL);
      if (Number.isFinite(brl) && brl > 0) {
        spotCache = { value: brl, at: Date.now() };
        return brl;
      }
    }
  } catch {
    // tenta AwesomeAPI
  }
  // 2) AwesomeAPI last
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
