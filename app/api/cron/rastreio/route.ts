import { NextResponse, type NextRequest } from "next/server";
import { atualizarRastreiosPag2Pay } from "@/lib/tracking/consulta-pag2pay";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Consulta o rastreio das vendas Pag2Pay em andamento e faz o card andar no
 * CRM (Postado → Em Trânsito → Saiu para Entrega → Entregue).
 *
 * Chamado a cada 20 minutos pelo pg_cron do Supabase, com o mesmo segredo do
 * relatório diário (RELATORIO_CRON_SECRET no cabeçalho x-cron-secret).
 */
export async function GET(request: NextRequest) {
  const segredo = process.env.RELATORIO_CRON_SECRET;
  if (!segredo || request.headers.get("x-cron-secret") !== segredo) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const r = await atualizarRastreiosPag2Pay();
  return NextResponse.json(r);
}
