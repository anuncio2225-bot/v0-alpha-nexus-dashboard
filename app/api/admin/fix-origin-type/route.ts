import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/team/scope";

/**
 * Classifica (retroativamente) as transações do usuário em:
 *  - "own": venda própria (a equipe do dono vendeu, como produtor OU como
 *    afiliado configurado). Continua entrando em dashboard/atendentes/cobrança.
 *  - "affiliate_incoming": o dono é o PRODUTOR e um afiliado EXTERNO vendeu o
 *    produto dele. Sai dos cálculos internos e aparece só na aba Afiliação.
 *
 * A classificação usa o raw_payload já salvo em cada transação, aplicando a
 * MESMA regra dos normalizers:
 *  - Braip: postback_type = "Produtor" E existe comissão de "Afiliado" (terceiro).
 *  - Payt/genérico: existe comissão "producer" E comissão "affiliation" no payload.
 *
 * Idempotente e escopado ao usuário. Nunca altera valores — só a classificação.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const userId = await getEffectiveUserId(supabase, user.id);
  const admin = createAdminClient();

  const { data: txs, error } = await admin
    .from("transactions")
    .select("id, gateway, origin_type, affiliate_name, raw_payload")
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const classify = (
    gateway: string | null,
    payload: Record<string, unknown> | null
  ): { origin: "own" | "affiliate_incoming"; affiliateName: string | null } => {
    if (!payload) return { origin: "own", affiliateName: null };

    // Braip: comissões vêm num array [{ type, name, value }] e postback_type
    // indica o papel do dono nesta venda.
    if (gateway === "braip") {
      const postback = String(payload.postback_type ?? "").toLowerCase();
      const commissions = Array.isArray(payload.commissions)
        ? (payload.commissions as Array<Record<string, unknown>>)
        : [];
      const affiliate = commissions.find((c) =>
        String(c?.type ?? "").toLowerCase().includes("afiliado")
      );
      if (postback.includes("produtor") && affiliate) {
        return {
          origin: "affiliate_incoming",
          affiliateName: (String(affiliate.name ?? "").trim() || null) as
            | string
            | null,
        };
      }
      return { origin: "own", affiliateName: null };
    }

    // Payt e similares: chaves achatadas commission.N.type / commission.N.name.
    let hasProducer = false;
    let affiliationName: string | null = null;
    for (let i = 0; i < 10; i++) {
      const type = String(payload[`commission.${i}.type`] ?? "").toLowerCase();
      if (!type) continue;
      if (type.includes("produ") && !type.includes("copro")) hasProducer = true;
      if (type.includes("afili") || type.includes("affili")) {
        const name = payload[`commission.${i}.name`];
        affiliationName = name != null ? String(name).trim() || null : null;
      }
    }
    if (hasProducer && affiliationName !== null) {
      return { origin: "affiliate_incoming", affiliateName: affiliationName };
    }
    // Também trata o caso de affiliation presente sem name capturado.
    const hasAffiliation = Array.from({ length: 10 }).some((_, i) => {
      const type = String(payload[`commission.${i}.type`] ?? "").toLowerCase();
      return type.includes("afili") || type.includes("affili");
    });
    if (hasProducer && hasAffiliation) {
      return { origin: "affiliate_incoming", affiliateName: affiliationName };
    }

    return { origin: "own", affiliateName: null };
  };

  let reclassified = 0;
  let affiliateCount = 0;

  for (const tx of txs || []) {
    const { origin, affiliateName } = classify(
      tx.gateway as string | null,
      (tx.raw_payload || null) as Record<string, unknown> | null
    );
    if (origin === "affiliate_incoming") affiliateCount += 1;

    // Só grava quando muda algo (idempotente).
    const nextName = origin === "affiliate_incoming" ? affiliateName : null;
    if (tx.origin_type === origin && (tx.affiliate_name ?? null) === nextName) {
      continue;
    }

    const { error: upErr } = await admin
      .from("transactions")
      .update({ origin_type: origin, affiliate_name: nextName })
      .eq("id", tx.id)
      .eq("user_id", userId);
    if (!upErr) reclassified += 1;
  }

  return NextResponse.json({
    total: txs?.length || 0,
    reclassified,
    affiliate_incoming: affiliateCount,
    message: `Classificadas ${txs?.length || 0} vendas — ${affiliateCount} de afiliados externos (${reclassified} atualizadas)`,
  });
}
