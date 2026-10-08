import { createClient } from "@/lib/supabase/server";
import { getCanEdit, getEffectiveUserId } from "@/lib/team/scope";
import { NextResponse } from "next/server";
import { carregarVersoes } from "@/lib/profit/versoes";
import { entradasPadrao, normalizarEntradas, type Cenario, type Entradas } from "@/lib/previsibilidade/calculo";

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Cenários de partida (editáveis e apagáveis). */
const CENARIOS_INICIAIS: Cenario[] = [
  { id: "conservador", nome: "Conservador", frustracao: 30 },
  { id: "base", nome: "Base", frustracao: 20 },
  { id: "otimista", nome: "Otimista", frustracao: 15 },
];

/**
 * Simulador aberto da conta. Na primeira vez, nasce com os custos que a conta
 * já configurou (Análise de Lucro e Configurações), para não digitar de novo.
 */
async function padroesDaConta(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<Entradas> {
  const [{ data: cfgDono }, { data: settings }, versoes] = await Promise.all([
    supabase
      .from("profit_config")
      .select("cost_per_unit, shipping_cost, affiliate_platform_fee, affiliate_platform_fixed")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("settings").select("tax_percentage, ads_tax_percentage").eq("user_id", userId).maybeSingle(),
    carregarVersoes(supabase, userId),
  ]);
  // profit_config só o dono lê; para a equipe vale a última versão dos custos.
  const cfg = cfgDono ?? versoes[versoes.length - 1]?.config ?? null;
  const e = entradasPadrao();
  e.produto.custoPote = num(cfg?.cost_per_unit);
  e.logistica.custoPorPedido = num(cfg?.shipping_cost);
  if (cfg?.affiliate_platform_fee != null) {
    e.plataforma.ativo = num(cfg.affiliate_platform_fee) > 0;
    e.plataforma.percentual = num(cfg.affiliate_platform_fee);
    e.plataforma.fixoPorVenda = num(cfg.affiliate_platform_fixed);
  }
  const imposto = num(settings?.tax_percentage);
  e.imposto.ativo = imposto > 0;
  e.imposto.percentual = imposto;
  const impostoAnuncio = num(settings?.ads_tax_percentage ?? 6);
  e.investimento.impostoAnuncioAtivo = impostoAnuncio > 0;
  e.investimento.impostoAnuncio = impostoAnuncio;
  e.investimento.cpa = 120;
  return e;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = await getEffectiveUserId(supabase, user.id);

  const [{ data, error }, padroes, podeEditar] = await Promise.all([
    supabase.from("previsibilidade_config").select("entradas, cenarios, updated_at").eq("user_id", userId).maybeSingle(),
    padroesDaConta(supabase, userId),
    getCanEdit(supabase),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    entradas: data ? normalizarEntradas(data.entradas) : padroes,
    cenarios: data ? ((data.cenarios || []) as Cenario[]) : CENARIOS_INICIAIS,
    padroes,
    salvo_em: data?.updated_at ?? null,
    pode_editar: podeEditar,
  });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = await getEffectiveUserId(supabase, user.id);
  if (!(await getCanEdit(supabase))) {
    return NextResponse.json({ error: "Sem permissão para editar" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }
  const entradas = normalizarEntradas(body.entradas);
  const numOuNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : num(v));
  const cenarios: Cenario[] = (Array.isArray(body.cenarios) ? body.cenarios : [])
    .slice(0, 20)
    .map((c: Cenario) => ({
      id: String(c.id || crypto.randomUUID()).slice(0, 64),
      nome: String(c.nome || "Cenário").slice(0, 60),
      frustracao: numOuNull(c.frustracao),
      agendados: numOuNull(c.agendados),
      antecipados: numOuNull(c.antecipados),
      cpa: numOuNull(c.cpa),
      ticketMedio: numOuNull(c.ticketMedio),
    }));

  const updated_at = new Date().toISOString();
  const { error } = await supabase
    .from("previsibilidade_config")
    .upsert({ user_id: userId, entradas, cenarios, updated_at }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, salvo_em: updated_at });
}
