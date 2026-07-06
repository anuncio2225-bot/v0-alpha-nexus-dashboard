import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";
import { cleanSrc } from "../auto-detect/route";

/** Pontuação de "sujeira" do texto: quanto mais caracteres especiais, maior. */
function junkScore(v: string): number {
  return (v || "").replace(/[a-zA-Z0-9\u00C0-\u017F\s]/g, "").length;
}

/**
 * Mescla atendentes duplicados cujo SRC higienizado é igual
 * (ex.: "Gabriela" e "Gabriela]"). Mantém o registro com o nome mais limpo,
 * transfere as referências de vendas (transactions.src e collection_clients)
 * para o original e deleta os duplicados (cascade remove as regras).
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = await getEffectiveUserId(supabase, user.id);

  const { data: attendants, error } = await supabase
    .from("attendants")
    .select("id, name, src, auto_detected, created_at")
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Agrupa por SRC higienizado (fallback: nome higienizado)
  const groups = new Map<string, typeof attendants>();
  for (const a of attendants || []) {
    const key = (cleanSrc(a.src || "") || cleanSrc(a.name || "")).toLowerCase();
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }

  let mergedCount = 0;

  for (const [, group] of groups) {
    if (group.length < 2) continue;

    // Escolhe o "principal": menor sujeira no nome; desempate por ter config
    // manual (auto_detected=false) e depois pelo mais antigo.
    const sorted = [...group].sort((a, b) => {
      const js = junkScore(a.name) - junkScore(b.name);
      if (js !== 0) return js;
      if (a.auto_detected !== b.auto_detected) return a.auto_detected ? 1 : -1;
      return (a.created_at || "").localeCompare(b.created_at || "");
    });

    const keeper = sorted[0];
    const dupes = sorted.slice(1);
    const cleanKeeperSrc = cleanSrc(keeper.src || "") || keeper.src || keeper.name;

    // Normaliza o SRC do principal
    await supabase
      .from("attendants")
      .update({ src: cleanKeeperSrc })
      .eq("id", keeper.id)
      .eq("user_id", userId);

    for (const dupe of dupes) {
      const dupeSrc = dupe.src || "";

      // Transfere referências das vendas (transações) para o SRC do principal
      if (dupeSrc) {
        await supabase
          .from("transactions")
          .update({ src: cleanKeeperSrc })
          .eq("user_id", userId)
          .eq("src", dupeSrc);
      }

      // Transfere clientes de cobrança vinculados ao duplicado
      await supabase
        .from("collection_clients")
        .update({ attendant_id: keeper.id, attendant_name: keeper.name, src: cleanKeeperSrc })
        .eq("user_id", userId)
        .eq("attendant_id", dupe.id);

      // Deleta o duplicado (cascade remove attendant_rules)
      await supabase
        .from("attendants")
        .delete()
        .eq("id", dupe.id)
        .eq("user_id", userId);

      mergedCount++;
    }
  }

  return NextResponse.json({ merged: mergedCount });
}
