import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";

async function auth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, userId: null as string | null };
  return { supabase, userId: await getEffectiveUserId(supabase, user.id) };
}

// Listar regras da atendente
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("attendant_rules")
    .select("*")
    .eq("attendant_id", id)
    .eq("user_id", userId)
    .order("min_sales", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rules: data });
}

// Substitui todas as regras de um tipo (commission | bonus) de uma vez
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const ruleType: "commission" | "bonus" = body.rule_type;
  const rules: Array<Record<string, unknown>> = body.rules || [];

  if (ruleType !== "commission" && ruleType !== "bonus") {
    return NextResponse.json({ error: "Invalid rule_type" }, { status: 400 });
  }

  // Garante que a atendente pertence ao usuário
  const { data: att } = await supabase
    .from("attendants")
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  if (!att) return NextResponse.json({ error: "Attendant not found" }, { status: 404 });

  // Apaga as regras existentes do tipo e insere as novas
  await supabase
    .from("attendant_rules")
    .delete()
    .eq("attendant_id", id)
    .eq("user_id", userId)
    .eq("rule_type", ruleType);

  if (rules.length > 0) {
    const rows = rules.map((r, i) => ({
      user_id: userId,
      attendant_id: id,
      rule_type: ruleType,
      label:
        (r.label as string) ||
        (ruleType === "commission" ? `Faixa ${i + 1}` : `${r.min_sales} vendas`),
      min_sales: Number(r.min_sales) || 0,
      max_sales: r.max_sales == null || r.max_sales === "" ? null : Number(r.max_sales),
      commission_value: Number(r.commission_value) || 0,
      bonus_value: Number(r.bonus_value) || 0,
    }));

    const { error } = await supabase.from("attendant_rules").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data } = await supabase
    .from("attendant_rules")
    .select("*")
    .eq("attendant_id", id)
    .eq("user_id", userId)
    .order("min_sales", { ascending: true });

  return NextResponse.json({ rules: data });
}
