import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Custos da Análise de Lucro por PERÍODO.
 *
 * Cada vez que custos, percentuais ou kits mudam, gravamos um retrato completo
 * com a data a partir da qual ele vale. O cálculo usa, para cada venda, o
 * retrato vigente no dia do pagamento — mudar o envio de 25 para 30 hoje não
 * mexe no lucro do mês passado, que já foi pago com 25.
 */

export interface ConfigCustos {
  cost_per_unit: number;
  shipping_cost: number;
  affiliate_percent: number;
  affiliate_platform_fee: number;
  affiliate_platform_fixed: number;
}

export interface KitVersao {
  product_keyword: string;
  units_per_kit: number;
  custom_shipping: number | null;
}

export interface VersaoCustos {
  vigente_desde: string; // YYYY-MM-DD (Brasília)
  config: ConfigCustos;
  kits: KitVersao[];
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Hoje em Brasília (YYYY-MM-DD). */
export function hojeSP(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
}

/** Dia (Brasília) de um ISO em UTC. */
export function diaSP(iso: string): string {
  return new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

/**
 * Tira o retrato atual (profit_config + product_costs) e grava como a versão
 * que vale a partir de `vigenteDesde` (padrão: hoje). Mesmo dia = atualiza.
 */
export async function gravarVersao(
  supabase: SupabaseClient,
  userId: string,
  vigenteDesde?: string | null
): Promise<void> {
  const dia = vigenteDesde && /^\d{4}-\d{2}-\d{2}$/.test(vigenteDesde) ? vigenteDesde : hojeSP();
  const [{ data: cfg }, { data: kits }] = await Promise.all([
    supabase.from("profit_config").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("product_costs")
      .select("product_keyword, units_per_kit, custom_shipping")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
  ]);
  const config: ConfigCustos = {
    cost_per_unit: num(cfg?.cost_per_unit),
    shipping_cost: num(cfg?.shipping_cost),
    affiliate_percent: cfg?.affiliate_percent == null ? 50 : num(cfg.affiliate_percent),
    affiliate_platform_fee: cfg?.affiliate_platform_fee == null ? 5.99 : num(cfg.affiliate_platform_fee),
    affiliate_platform_fixed: cfg?.affiliate_platform_fixed == null ? 1 : num(cfg.affiliate_platform_fixed),
  };
  // Escrita pelo backend (a tabela só tem policy de leitura).
  const { error } = await createAdminClient()
    .from("profit_config_versoes")
    .upsert(
      {
        user_id: userId,
        vigente_desde: dia,
        config,
        kits: (kits || []).map((k) => ({
          product_keyword: k.product_keyword,
          units_per_kit: num(k.units_per_kit),
          custom_shipping: k.custom_shipping == null ? null : num(k.custom_shipping),
        })),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,vigente_desde" }
    );
  if (error) throw new Error(error.message);
}

/** Todas as versões da conta, da mais antiga para a mais nova. */
export async function carregarVersoes(
  supabase: SupabaseClient,
  userId: string
): Promise<VersaoCustos[]> {
  const { data } = await supabase
    .from("profit_config_versoes")
    .select("vigente_desde, config, kits")
    .eq("user_id", userId)
    .order("vigente_desde", { ascending: true });
  return (data || []) as VersaoCustos[];
}

/** Versão vigente no dia `dia` (YYYY-MM-DD). Antes da primeira, usa a primeira. */
export function versaoDoDia(versoes: VersaoCustos[], dia: string): VersaoCustos | null {
  let atual: VersaoCustos | null = versoes[0] || null;
  for (const v of versoes) {
    if (v.vigente_desde <= dia) atual = v;
    else break;
  }
  return atual;
}
