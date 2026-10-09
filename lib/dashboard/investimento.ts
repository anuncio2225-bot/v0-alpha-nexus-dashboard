import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { filtroJanelaDasContas } from "@/lib/meta/janela-conta";

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Investimento em anúncios do período com a MESMA regra do dashboard e da
 * Análise de Lucro: Meta automático (contas ativas) + lançamentos manuais
 * (o manual de meta_ads some nos dias que já têm Meta automático) + imposto da
 * Meta (`ads_tax_percentage`) só sobre a parte não isenta.
 * Datas em YYYY-MM-DD (Brasília).
 */
export async function investimentoDoPeriodo(
  supabase: SupabaseClient,
  ownerId: string,
  dateFrom: string,
  dateTo: string
): Promise<{ total: number; semImposto: number; impostoPercent: number }> {
  const [{ data: manuais }, { data: contas }, { data: settings }] = await Promise.all([
    fetchAll(
      supabase
        .from("ad_investments")
        .select("investment_value, date, platform")
        .eq("user_id", ownerId)
        .gte("date", dateFrom)
        .lte("date", dateTo)
    ),
    supabase
      .from("meta_ad_accounts")
      .select("account_id, apply_meta_tax, contar_desde, contar_ate")
      .eq("user_id", ownerId)
      .eq("is_active", true),
    supabase.from("settings").select("ads_tax_percentage").eq("user_id", ownerId).maybeSingle(),
  ]);

  const ids = (contas || []).map((a) => a.account_id);
  const isentas = new Set((contas || []).filter((a) => a.apply_meta_tax === false).map((a) => a.account_id));
  const diasMeta = new Set<string>();
  let meta = 0;
  let metaIsento = 0;
  if (ids.length > 0) {
    const { data: perf } = await fetchAll(
      supabase
        .from("meta_ads_performance")
        .select("ad_account_id, date, spend")
        .eq("user_id", ownerId)
        .in("ad_account_id", ids)
        .gte("date", dateFrom)
        .lte("date", dateTo)
    );
    const contaNoDia = filtroJanelaDasContas(contas);
    for (const row of perf || []) {
      if (!contaNoDia(row.ad_account_id, row.date as string)) continue;
      const spend = num(row.spend);
      meta += spend;
      if (isentas.has(row.ad_account_id)) metaIsento += spend;
      diasMeta.add(row.date as string);
    }
  }
  const manual = (manuais || []).reduce((s, a) => {
    if (a.platform === "meta_ads" && diasMeta.has(a.date as string)) return s;
    return s + num(a.investment_value);
  }, 0);

  const impostoPercent = num(settings?.ads_tax_percentage ?? 6);
  const bruto = manual + meta;
  const tributavel = bruto - metaIsento;
  return {
    total: tributavel * (1 + impostoPercent / 100) + metaIsento,
    semImposto: bruto,
    impostoPercent,
  };
}
