import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";

// ============================================================================
// /api/meta/insights — agregados de performance para o dashboard.
//
// Considera apenas dados das contas ATIVAS do usuario. Suporta filtro
// opcional por conta especifica (?account=) e por nivel.
// ============================================================================

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const account = searchParams.get("account"); // opcional: filtra 1 conta

  if (!from || !to) {
    return NextResponse.json({ error: "Periodo nao informado" }, { status: 400 });
  }

  try {
    // Contas ativas do usuario (so consideramos essas nos calculos)
    const { data: activeAccounts } = await supabase
      .from("meta_ad_accounts")
      .select("account_id, account_name")
      .eq("user_id", await getEffectiveUserId(supabase, user.id))
      .eq("is_active", true);

    const activeIds = (activeAccounts || []).map((a) => a.account_id);
    // Mapa id -> nome amigavel da conta (para exibir no historico)
    const accountNames = new Map<string, string>(
      (activeAccounts || []).map((a) => [
        a.account_id,
        a.account_name || `act_${a.account_id}`,
      ])
    );

    if (activeIds.length === 0) {
      return NextResponse.json({
        spend: 0,
        impressions: 0,
        clicks: 0,
        reach: 0,
        conversions: 0,
        conversionValue: 0,
        ctr: 0,
        cpc: 0,
        cpm: 0,
        costPerConversion: 0,
        byDay: [],
        byAccount: [],
        history: [],
      });
    }

    const accountFilter =
      account && activeIds.includes(account) ? [account] : activeIds;

    const { data, error } = await supabase
      .from("meta_ads_performance")
      .select(
        "ad_account_id, date, spend, impressions, clicks, reach, conversions, conversion_value"
      )
      .eq("user_id", await getEffectiveUserId(supabase, user.id))
      .in("ad_account_id", accountFilter)
      .gte("date", from)
      .lte("date", to);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = data || [];

    // Totais
    const totals = rows.reduce(
      (acc, row) => ({
        spend: acc.spend + (Number(row.spend) || 0),
        impressions: acc.impressions + (Number(row.impressions) || 0),
        clicks: acc.clicks + (Number(row.clicks) || 0),
        reach: acc.reach + (Number(row.reach) || 0),
        conversions: acc.conversions + (Number(row.conversions) || 0),
        conversionValue:
          acc.conversionValue + (Number(row.conversion_value) || 0),
      }),
      {
        spend: 0,
        impressions: 0,
        clicks: 0,
        reach: 0,
        conversions: 0,
        conversionValue: 0,
      }
    );

    const ctr =
      totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
    const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0;
    const cpm =
      totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0;
    const costPerConversion =
      totals.conversions > 0 ? totals.spend / totals.conversions : 0;

    // Serie por dia (para graficos)
    const byDayMap = new Map<string, number>();
    for (const row of rows) {
      const prev = byDayMap.get(row.date) || 0;
      byDayMap.set(row.date, prev + (Number(row.spend) || 0));
    }
    const byDay = Array.from(byDayMap.entries())
      .map(([date, spend]) => ({ date, spend }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Spend por conta
    const byAccountMap = new Map<string, number>();
    for (const row of rows) {
      const prev = byAccountMap.get(row.ad_account_id) || 0;
      byAccountMap.set(row.ad_account_id, prev + (Number(row.spend) || 0));
    }
    const byAccount = Array.from(byAccountMap.entries()).map(
      ([accountId, spend]) => ({
        accountId,
        accountName: accountNames.get(accountId) || `act_${accountId}`,
        spend,
      })
    );

    // Historico: uma linha por (dia, conta) com gasto, para listar na tela.
    // Agrega ad/campaign/adset do mesmo dia+conta num unico item diario.
    const historyMap = new Map<
      string,
      { date: string; accountId: string; accountName: string; spend: number }
    >();
    for (const row of rows) {
      const key = `${row.date}__${row.ad_account_id}`;
      const existing = historyMap.get(key);
      const spend = Number(row.spend) || 0;
      if (existing) {
        existing.spend += spend;
      } else {
        historyMap.set(key, {
          date: row.date,
          accountId: row.ad_account_id,
          accountName:
            accountNames.get(row.ad_account_id) || `act_${row.ad_account_id}`,
          spend,
        });
      }
    }
    const history = Array.from(historyMap.values())
      .filter((h) => h.spend > 0)
      .sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json({
      ...totals,
      ctr,
      cpc,
      cpm,
      costPerConversion,
      byDay,
      byAccount,
      history,
    });
  } catch (error) {
    console.error("[v0] Error fetching insights:", error);
    return NextResponse.json({ error: "Falha ao buscar dados." }, { status: 500 });
  }
}
