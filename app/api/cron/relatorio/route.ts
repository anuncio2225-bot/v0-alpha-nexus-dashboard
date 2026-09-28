import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { calcularMetricas } from "@/lib/dashboard/metrics";
import { enviarAviso } from "@/lib/push/enviar";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Relatório do dia no celular, no horário que cada pessoa escolheu.
 *
 * Chamado de hora em hora pelo pg_cron do Supabase (a Vercel Hobby só permite
 * cron diário). Protegido por RELATORIO_CRON_SECRET no cabeçalho.
 * Os números vêm de calcularMetricas — os mesmos do dashboard, dia de hoje.
 */

const HORA_PADRAO = 21;
const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

/** Data e hora de agora em Brasília (UTC-3, sem horário de verão). */
function agoraSP() {
  const d = new Date(Date.now() - 3 * 3600_000);
  return { dia: d.toISOString().slice(0, 10), hora: d.getUTCHours() };
}

export async function GET(request: NextRequest) {
  const segredo = process.env.RELATORIO_CRON_SECRET;
  if (!segredo || request.headers.get("x-cron-secret") !== segredo) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { dia, hora: horaAgora } = agoraSP();
  // ?hora= só para teste manual (mesmo segredo).
  const horaParam = new URL(request.url).searchParams.get("hora");
  const hora = horaParam !== null ? Number(horaParam) : horaAgora;
  const admin = createAdminClient();

  // Quem tem aparelho registrado (sem aparelho não há para onde mandar).
  const { data: aparelhos } = await admin.from("push_subscriptions").select("owner_id, member_id");
  const pessoas = new Map<string, { owner: string; member: string }>();
  for (const a of aparelhos || []) pessoas.set(`${a.owner_id}:${a.member_id}`, { owner: a.owner_id, member: a.member_id });
  if (!pessoas.size) return NextResponse.json({ enviados: 0, motivo: "nenhum aparelho" });

  const { data: prefs } = await admin
    .from("push_preferencias")
    .select("owner_id, member_id, permitido, relatorio_ativo, relatorio_hora, relatorio_enviado_em");
  const prefDe = new Map((prefs || []).map((p) => [`${p.owner_id}:${p.member_id}`, p]));

  // Membro limitado a um atendente não recebe o resumo da operação inteira.
  const membros = [...pessoas.values()].filter((p) => p.member !== p.owner).map((p) => p.member);
  const limitados = new Set<string>();
  if (membros.length) {
    const { data } = await admin
      .from("team_members")
      .select("member_user_id, scope_mode")
      .in("member_user_id", membros)
      .eq("status", "active");
    for (const m of data || []) if (m.scope_mode === "attendant") limitados.add(m.member_user_id);
  }

  const porDono = new Map<string, string[]>();
  for (const [k, p] of pessoas) {
    const pref = prefDe.get(k);
    const ativo = pref?.relatorio_ativo ?? true;
    const h = pref?.relatorio_hora ?? HORA_PADRAO;
    if (!ativo || h !== hora) continue;
    if (pref?.relatorio_enviado_em === dia && horaParam === null) continue; // já foi hoje
    if (p.member !== p.owner && (pref?.permitido === false || limitados.has(p.member))) continue;
    porDono.set(p.owner, [...(porDono.get(p.owner) || []), p.member]);
  }

  let enviados = 0;
  for (const [owner, quem] of porDono) {
    try {
      const m = await calcularMetricas(admin, owner, {
        fromRaw: `${dia}T00:00:00`,
        toRaw: `${dia}T23:59:59`,
      });
      const k = m.kpis;
      const soma = (campo: "agendadas" | "antecipadas" | "pagas" | "frustradas") =>
        m.dailyData.reduce((s, d) => s + d[campo], 0);
      const agendadas = soma("agendadas");
      const antecipadas = soma("antecipadas");
      const pagas = soma("pagas");
      const frustradas = soma("frustradas");
      const roi = k.investimento.value > 0 ? `${(1 + k.roi.value / 100).toFixed(2).replace(".", ",")}x` : "—";

      const r = await enviarAviso(
        owner,
        {
          evento: "relatorio",
          titulo: `📊 Resumo de hoje · Lucro ${brl(k.lucro.value)}`,
          corpo:
            `${agendadas + antecipadas} vendas (${agendadas} agendadas, ${antecipadas} antecipadas) · ${pagas} pagas` +
            (frustradas ? ` · ${frustradas} frustradas` : "") +
            `\nROI ${roi} · Investido ${brl(k.investimento.value)}` +
            `\nA receber ${brl(k.valorReceber.value)} · Pago hoje ${brl(k.entradasHoje.value)}`,
          url: "/dashboard",
          tag: `relatorio-${dia}`,
        },
        undefined,
        quem
      );
      enviados += r.enviados;
      await admin.from("push_preferencias").upsert(
        quem.map((member) => ({
          owner_id: owner,
          member_id: member,
          relatorio_enviado_em: dia,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "owner_id,member_id" }
      );
    } catch (e) {
      console.error("[relatorio] falha para a conta", owner, e);
    }
  }

  return NextResponse.json({ dia, hora, contas: porDono.size, enviados });
}
