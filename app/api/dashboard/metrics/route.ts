import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId, scopedSrc } from "@/lib/team/scope";
import { NextResponse } from "next/server";
import { calcularMetricas } from "@/lib/dashboard/metrics";

export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const fromRaw = searchParams.get("from");
  const toRaw = searchParams.get("to");
  const attendantId = searchParams.get("src");
  // Multi product filter: comma-separated list of product ids/names. Empty = all products.
  const productsParam = searchParams.get("products");
  const productFilters = productsParam
    ? productsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  // Suporta múltiplos modos separados por vírgula (ex.: "antecipado,recuperacao").
  // Quando vazio ou não enviado, equivale a "todos".
  const modeParam = searchParams.get("mode") || "";
  const modes = modeParam
    ? modeParam.split(",").map((m) => m.trim()).filter(Boolean) as Array<"afterpay" | "antecipado" | "recuperacao">
    : [];

  if (!fromRaw || !toRaw) {
    return NextResponse.json(
      { error: "Missing from/to params" },
      { status: 400 }
    );
  }

  try {
    const metrics = await calcularMetricas(
      supabase,
      await getEffectiveUserId(supabase, user.id),
      {
        fromRaw,
        toRaw,
        attendantId,
        productFilters,
        modes,
        // Membro vinculado a um atendente vê só as vendas dele.
        srcFilter: await scopedSrc(supabase, user.id, "dashboard"),
      }
    );
    return NextResponse.json(metrics);
  } catch (error) {
    console.error("[v0] Error calculating metrics:", error);
    const message =
      error instanceof Error ? error.message : "Failed to calculate metrics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
