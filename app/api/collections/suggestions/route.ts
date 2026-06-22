import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";
import { cleanSrc } from "@/lib/collections/sync";

// GET /api/collections/suggestions
// Retorna listas para preencher os dropdowns do cadastro manual e filtros:
// - products: nomes distintos de produtos das transacoes
// - attendants: atendentes cadastrados + SRCs unicos das transacoes (uniao)
// - payment_methods: formas de pagamento padrao
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [txRes, attRes] = await Promise.all([
    supabase
      .from("transactions")
      .select("product_name, src")
      .eq("user_id", await getEffectiveUserId(supabase, user.id)),
    supabase
      .from("attendants")
      .select("id, name")
      .eq("user_id", await getEffectiveUserId(supabase, user.id)),
  ]);

  const txs = txRes.data || [];
  const attendantsRows = attRes.data || [];

  // Produtos distintos
  const productSet = new Set<string>();
  for (const t of txs) {
    if (t.product_name) productSet.add(t.product_name);
  }

  // Atendentes: uniao de cadastrados (com id) + SRCs unicos (sem id)
  const attByName = new Map<string, { id: string | null; name: string }>();
  for (const a of attendantsRows) {
    if (a.name) attByName.set(a.name.toLowerCase(), { id: a.id, name: a.name });
  }
  for (const t of txs) {
    const src = cleanSrc(t.src);
    if (src && !attByName.has(src.toLowerCase())) {
      attByName.set(src.toLowerCase(), { id: null, name: src });
    }
  }

  return NextResponse.json({
    products: Array.from(productSet).sort((a, b) => a.localeCompare(b, "pt-BR")),
    attendants: Array.from(attByName.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR")
    ),
    payment_methods: [
      "PIX",
      "Boleto",
      "Cartao de Credito",
      "Cartao de Debito",
      "Transferencia",
    ],
  });
}
