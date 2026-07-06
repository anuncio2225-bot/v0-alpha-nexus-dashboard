import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";

/**
 * Copia a configuração de comissionamento de uma atendente (origem) para
 * outras atendentes (destino). Copia apenas dados de comissão — NUNCA dados
 * pessoais (nome, email, telefone, src). As regras (faixas e bônus) das
 * atendentes de destino são SUBSTITUÍDAS pelas da origem.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = await getEffectiveUserId(supabase, user.id);
  const { source_id, target_ids } = await request.json();

  if (!source_id || !Array.isArray(target_ids) || target_ids.length === 0) {
    return NextResponse.json({ error: "source_id e target_ids são obrigatórios" }, { status: 400 });
  }

  // Carrega a config da origem
  const { data: source, error: srcErr } = await supabase
    .from("attendants")
    .select(
      "calc_mode, producer_affiliate_percent, platform_fee_percent, platform_fee_fixed, fixed_per_sale, payment_closing_day"
    )
    .eq("id", source_id)
    .eq("user_id", userId)
    .single();

  if (srcErr || !source) {
    return NextResponse.json({ error: "Atendente de origem não encontrada" }, { status: 404 });
  }

  // Carrega as regras da origem
  const { data: sourceRules } = await supabase
    .from("attendant_rules")
    .select("rule_type, label, min_sales, max_sales, commission_value, bonus_value")
    .eq("attendant_id", source_id)
    .eq("user_id", userId);

  // Alvos válidos (do próprio usuário, excluindo a origem)
  const validTargets = target_ids.filter((t: string) => t && t !== source_id);
  if (validTargets.length === 0) {
    return NextResponse.json({ error: "Nenhuma atendente de destino válida" }, { status: 400 });
  }

  // 1. Atualiza os campos de configuração dos alvos (sem tocar em dados pessoais)
  const { error: updErr } = await supabase
    .from("attendants")
    .update({
      calc_mode: source.calc_mode,
      producer_affiliate_percent: source.producer_affiliate_percent,
      platform_fee_percent: source.platform_fee_percent,
      platform_fee_fixed: source.platform_fee_fixed,
      fixed_per_sale: source.fixed_per_sale,
      payment_closing_day: source.payment_closing_day,
      updated_at: new Date().toISOString(),
    })
    .in("id", validTargets)
    .eq("user_id", userId);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // 2. Substitui as regras: apaga as antigas e insere cópias das da origem
  await supabase
    .from("attendant_rules")
    .delete()
    .in("attendant_id", validTargets)
    .eq("user_id", userId);

  if (sourceRules && sourceRules.length > 0) {
    const rows = validTargets.flatMap((targetId: string) =>
      sourceRules.map((r) => ({
        user_id: userId,
        attendant_id: targetId,
        rule_type: r.rule_type,
        label: r.label,
        min_sales: r.min_sales,
        max_sales: r.max_sales,
        commission_value: r.commission_value,
        bonus_value: r.bonus_value,
      }))
    );

    const { error: insErr } = await supabase.from("attendant_rules").insert(rows);
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ applied: validTargets.length });
}
