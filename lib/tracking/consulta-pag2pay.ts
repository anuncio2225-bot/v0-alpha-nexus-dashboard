import { createAdminClient } from "@/lib/supabase/admin";
import { buildAttendantMap, buildStatusMap, syncTransactionToCollection } from "@/lib/collections/sync";
import { fetchKits, syncStockForTransaction } from "@/lib/stock/sync";
import { avisoDaVenda, enviarAviso, eventoDaMudanca } from "@/lib/push/enviar";
import { trackingStage, trackingUrlFor } from "./stages";

/**
 * Consulta o rastreio público do Pag2Pay e atualiza as vendas em andamento.
 *
 * Por quê: o webhook do Pag2Pay só avisa código gerado, saiu para entrega,
 * aguardando retirada e entregue. "Postado" e "Em trânsito" nunca chegam —
 * sem esta consulta, o card ficava parado em "Agendado" no CRM.
 *
 * API: GET https://api.pag2pay.com/api/public/rastreio/{codigo}
 * Limite: 50 requisições por IP por minuto → uma consulta a cada 1,3 s.
 */

const API = "https://api.pag2pay.com/api/public/rastreio/";
const INTERVALO_MS = 1300;

interface RespostaRastreio {
  encontrado: boolean;
  transportadora?: string;
  statusAtual?: string;
  atualizadoEm?: string;
}

export interface ResultadoConsulta {
  consultadas: number;
  mudaram: number;
  detalhes: { pedido: string; antes: string | null; agora: string }[];
}

async function consultar(codigo: string): Promise<RespostaRastreio | null> {
  try {
    const r = await fetch(API + encodeURIComponent(codigo), {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return null;
    return (await r.json()) as RespostaRastreio;
  } catch {
    return null;
  }
}

/**
 * @param limite quantas vendas consultar nesta rodada (as consultadas há mais tempo primeiro)
 * @param prazoMs para de consultar quando o tempo da função está acabando
 */
export async function atualizarRastreiosPag2Pay(limite = 35, prazoMs = 50_000): Promise<ResultadoConsulta> {
  const inicio = Date.now();
  const admin = createAdminClient();
  const { data: fila } = await admin
    .from("transactions")
    .select("*")
    .eq("gateway", "pag2pay")
    .not("tracking_code", "is", null)
    .in("status", ["agendado", "aguardando"])
    .order("tracking_checked_at", { ascending: true, nullsFirst: true })
    .limit(limite);

  const res: ResultadoConsulta = { consultadas: 0, mudaram: 0, detalhes: [] };
  const mapasPorConta = new Map<string, Awaited<ReturnType<typeof mapas>>>();
  async function mapas(userId: string) {
    await admin.rpc("seed_collection_defaults", { p_user_id: userId });
    const [statusMap, attMap, kits] = await Promise.all([
      buildStatusMap(admin, userId),
      buildAttendantMap(admin, userId),
      fetchKits(admin, userId),
    ]);
    return { statusMap, attMap, kits };
  }

  for (const tx of fila || []) {
    // Já entregue: o próximo passo vem pelo webhook (cobrança/pagamento).
    if (trackingStage(tx.shipping_status) === "entregue") {
      await admin.from("transactions").update({ tracking_checked_at: new Date().toISOString() }).eq("id", tx.id);
      continue;
    }
    if (Date.now() - inicio > prazoMs) break;
    if (res.consultadas > 0) await new Promise((r) => setTimeout(r, INTERVALO_MS));

    const r = await consultar(tx.tracking_code);
    res.consultadas++;
    const agora = new Date().toISOString();
    const novo = r?.encontrado ? (r.statusAtual || "").trim() : "";
    const estagio = trackingStage(novo);

    // Sem novidade (ou "Atualização", que não avança): só marca a consulta.
    if (!estagio || novo === tx.shipping_status) {
      await admin.from("transactions").update({ tracking_checked_at: agora }).eq("id", tx.id);
      continue;
    }

    // Devolvido/frustrado/cancelado antes de pagar = venda perdida (mesma regra do webhook).
    let status = tx.status as string;
    if (estagio === "devolvido" || estagio === "frustrado") status = "frustrado";
    else if (estagio === "cancelado") status = "cancelado";

    const atualizado = {
      ...tx,
      status,
      shipping_status: novo,
      shipping_company: tx.shipping_company || r?.transportadora || null,
      tracking_url: tx.tracking_url || trackingUrlFor(tx.tracking_code, "pag2pay"),
    };
    const { error } = await admin
      .from("transactions")
      .update({
        status,
        shipping_status: novo,
        shipping_company: atualizado.shipping_company,
        tracking_url: atualizado.tracking_url,
        tracking_checked_at: agora,
        updated_at: agora,
      })
      .eq("id", tx.id);
    if (error) continue;

    res.mudaram++;
    res.detalhes.push({ pedido: tx.external_id, antes: tx.shipping_status, agora: novo });

    // CRM (card anda de coluna), estoque (se virou perda) e celular.
    try {
      if ((tx.origin_type || "own") !== "affiliate_incoming") {
        let m = mapasPorConta.get(tx.user_id);
        if (!m) {
          m = await mapas(tx.user_id);
          mapasPorConta.set(tx.user_id, m);
        }
        await syncTransactionToCollection(admin, tx.user_id, atualizado, m.statusMap, m.attMap);
        if (status !== tx.status) {
          await syncStockForTransaction(admin, tx.user_id, atualizado, m.kits);
        }
      }
    } catch (e) {
      console.error("[rastreio] CRM/estoque (não bloqueia):", e);
    }
    try {
      const ev = eventoDaMudanca(
        { status: tx.status, shipping_status: tx.shipping_status, tracking_code: tx.tracking_code },
        atualizado
      );
      if (ev && (tx.origin_type || "own") !== "affiliate_incoming") {
        await enviarAviso(tx.user_id, avisoDaVenda(ev, atualizado));
      }
    } catch (e) {
      console.error("[rastreio] aviso (não bloqueia):", e);
    }
  }
  return res;
}
