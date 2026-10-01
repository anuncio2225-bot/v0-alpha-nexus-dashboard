import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { trackingStage } from "@/lib/tracking/stages";
import { EVENTOS_PUSH, querReceber, type EventoPush } from "./eventos";

/**
 * Envio de notificação para o celular (Web Push).
 *
 * As chaves VAPID entram na hora do envio, não na importação: se faltarem na
 * Vercel, só o push desliga (e o log diz isso) — o webhook continua gravando a
 * venda normalmente.
 */
let vapidPronto: boolean | null = null;

function prepararVapid(): boolean {
  if (vapidPronto !== null) return vapidPronto;
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  if (!publica || !privada) {
    console.error("PUSH DESLIGADO: falta NEXT_PUBLIC_VAPID_PUBLIC_KEY e/ou VAPID_PRIVATE_KEY.");
    vapidPronto = false;
    return false;
  }
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:anuncio2225@gmail.com",
      publica,
      privada
    );
    vapidPronto = true;
  } catch (e) {
    console.error("PUSH DESLIGADO: chaves VAPID inválidas.", (e as Error).message);
    vapidPronto = false;
  }
  return vapidPronto;
}

export interface Aviso {
  evento: EventoPush | "teste" | "relatorio";
  titulo: string;
  corpo: string;
  url?: string;
  tag?: string;
  /** Membro da equipe limitado a um atendente só recebe as vendas dele. */
  src?: string | null;
  /** Mesmo texto sem o nome do produto (para quem escolheu esconder). */
  corpoSemProduto?: string;
  /** Identificador para o registro de envios (ex.: código da venda). */
  referencia?: string;
}

export interface ResultadoEnvio {
  enviados: number;
  removidos: number;
  tentados: number;
  ignorado?: string;
}

/**
 * Manda o aviso para todos os aparelhos da conta que querem esse evento.
 * `somenteEndpoint` restringe a um aparelho (botão de teste);
 * `somenteMembros` restringe a algumas pessoas (relatório diário).
 */
export async function enviarAviso(
  ownerId: string,
  aviso: Aviso,
  somenteEndpoint?: string,
  somenteMembros?: string[]
): Promise<ResultadoEnvio> {
  if (!prepararVapid()) {
    return { enviados: 0, removidos: 0, tentados: 0, ignorado: "servidor sem chaves de push" };
  }
  const admin = createAdminClient();

  let q = admin
    .from("push_subscriptions")
    .select("id, member_id, endpoint, p256dh, auth")
    .eq("owner_id", ownerId);
  if (somenteEndpoint) q = q.eq("endpoint", somenteEndpoint);
  if (somenteMembros) q = q.in("member_id", somenteMembros);
  const { data: inscricoes } = await q;
  if (!inscricoes?.length)
    return registrar(ownerId, aviso, { enviados: 0, removidos: 0, tentados: 0, ignorado: "nenhum aparelho" });

  // Membros limitados a um atendente (SRC) só recebem o que é deles.
  const membros = [...new Set(inscricoes.map((i) => i.member_id).filter((m) => m !== ownerId))];
  const srcDoMembro = new Map<string, string>();
  if (membros.length) {
    const { data } = await admin
      .from("team_members")
      .select("member_user_id, scope_mode, attendant_src")
      .in("member_user_id", membros)
      .eq("status", "active");
    for (const m of data || []) {
      if (m.scope_mode === "attendant" && m.attendant_src)
        srcDoMembro.set(m.member_user_id, String(m.attendant_src).trim().toLowerCase());
    }
  }

  // Escolhas de cada pessoa + se o dono libera notificações para ela.
  const { data: prefsRaw } = await admin
    .from("push_preferencias")
    .select("member_id, preferencias, permitido, mostrar_produto")
    .eq("owner_id", ownerId);
  const prefsDe = new Map((prefsRaw || []).map((p) => [p.member_id as string, p]));

  const ehEvento = aviso.evento !== "teste" && aviso.evento !== "relatorio";
  const alvos = inscricoes.filter((i) => {
    const p = prefsDe.get(i.member_id);
    // O dono sempre recebe; membro só se o dono permitir.
    if (i.member_id !== ownerId && p && p.permitido === false && aviso.evento !== "teste")
      return false;
    if (ehEvento && !querReceber(p?.preferencias, aviso.evento as EventoPush)) return false;
    const src = srcDoMembro.get(i.member_id);
    if (src && ehEvento) {
      return (aviso.src || "").trim().toLowerCase() === src;
    }
    return true;
  });
  if (!alvos.length)
    return registrar(ownerId, aviso, { enviados: 0, removidos: 0, tentados: 0, ignorado: "ninguém quer este aviso" });

  const hora = new Date().toISOString();
  const cargaDe = (semProduto: boolean) =>
    JSON.stringify({
      tipo: aviso.evento,
      titulo: aviso.titulo,
      corpo: semProduto && aviso.corpoSemProduto !== undefined ? aviso.corpoSemProduto : aviso.corpo,
      url: aviso.url || "/dashboard",
      tag: aviso.tag,
      hora,
    });

  let enviados = 0;
  const mortas: string[] = [];
  const aceitas: string[] = [];
  await Promise.all(
    alvos.map(async (i) => {
      try {
        const semProduto = prefsDe.get(i.member_id)?.mostrar_produto === false;
        await webpush.sendNotification(
          { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
          cargaDe(semProduto),
          { TTL: 3600, urgency: aviso.evento === "pagamento_aprovado" ? "high" : "normal" }
        );
        enviados++;
        aceitas.push(i.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // 404/410 = inscrição morreu (app desinstalado, permissão tirada).
        if (status === 404 || status === 410) mortas.push(i.id);
        else console.error("push falhou", status, (e as Error).message);
      }
    })
  );

  if (mortas.length) await admin.from("push_subscriptions").delete().in("id", mortas);
  if (aceitas.length)
    await admin
      .from("push_subscriptions")
      .update({ ultimo_sucesso_em: new Date().toISOString() })
      .in("id", aceitas);

  return registrar(ownerId, aviso, {
    enviados,
    removidos: mortas.length,
    tentados: alvos.length,
    ignorado: enviados === 0 ? "serviço de push recusou" : undefined,
  });
}

/** Guarda o resultado do envio (push_envios). Nunca atrapalha o envio. */
async function registrar(ownerId: string, aviso: Aviso, r: ResultadoEnvio): Promise<ResultadoEnvio> {
  try {
    await createAdminClient().from("push_envios").insert({
      owner_id: ownerId,
      evento: aviso.evento,
      titulo: aviso.titulo,
      referencia: aviso.referencia || null,
      enviados: r.enviados,
      tentados: r.tentados,
      ignorado: r.ignorado || null,
    });
  } catch {
    // registro é só diagnóstico
  }
  return r;
}

// ---------------------------------------------------------------------------
// Venda → aviso
// ---------------------------------------------------------------------------

export interface EstadoVenda {
  status: string | null;
  shipping_status: string | null;
  tracking_code?: string | null;
}

export interface VendaParaAviso {
  id?: string;
  external_id?: string | null;
  status: string;
  sale_type?: string | null;
  payment_method?: string | null;
  shipping_status?: string | null;
  tracking_code?: string | null;
  customer_name?: string | null;
  product_name?: string | null;
  plan_name?: string | null;
  total_value?: number | null;
  src?: string | null;
  origin_type?: string | null;
  affiliate_name?: string | null;
}

const brl = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

const FRUSTRADOS = new Set(["frustrado", "cancelado"]);

/**
 * Decide qual aviso a MUDANÇA de estado gera. Só a transição dispara: o mesmo
 * evento reenviado pelo gateway (retry) não gera aviso repetido.
 */
export function eventoDaMudanca(
  antes: EstadoVenda | null,
  depois: VendaParaAviso
): EventoPush | null {
  const s0 = antes?.status || null;
  const s1 = depois.status;

  if (s1 !== s0) {
    if (s1 === "pago") return "pagamento_aprovado";
    if (s1 === "devolvido") return "reembolso";
    if (FRUSTRADOS.has(s1) && !FRUSTRADOS.has(s0 || "")) return "venda_frustrada";
    if (s1 === "agendado" && !s0) return "venda_agendada";
    if (s1 === "aguardando") {
      if (depois.sale_type === "afterpay") return "cobranca_aberta";
      const m = (depois.payment_method || "").toLowerCase();
      if (m.includes("pix")) return "pix_gerado";
      if (m.includes("boleto") || m === "billet") return "boleto_gerado";
      return null;
    }
  }

  // Entrega: venda viva (AfterPay a caminho/em cobrança) ou já paga
  // (antecipado também precisa acompanhar a entrega).
  if (s1 === "agendado" || s1 === "aguardando" || s1 === "pago") {
    const e0 = trackingStage(antes?.shipping_status);
    const e1 = trackingStage(depois.shipping_status);
    // Código de rastreio novo. O Pag2Pay manda o evento "codigoRastreio" com
    // o código e SEM status de entrega — antes disso não virava aviso.
    if (!e1 && depois.tracking_code && !antes?.tracking_code) return "pedido_enviado";
    if (e1 && e1 !== e0) {
      switch (e1) {
        case "postado":
        case "em_transito":
          // um aviso só para "saiu da loja": postado e em trânsito seguidos não repetem
          return e0 === "postado" || e0 === "em_transito" ? null : "pedido_enviado";
        case "saiu_para_entrega":
          return "saiu_para_entrega";
        case "aguardando_retirada":
          return "aguardando_retirada";
        case "entregue":
          return "pedido_entregue";
        case "falha_entrega":
          return "falha_entrega";
      }
    }
  }
  return null;
}

/** Texto do aviso. Na tela de bloqueio aparece só o primeiro nome do cliente. */
export function avisoDaVenda(ev: EventoPush, v: VendaParaAviso): Aviso {
  const info = EVENTOS_PUSH.find((e) => e.id === ev)!;
  const cliente = (v.customer_name || "Cliente").trim().split(/\s+/)[0];
  const produto = v.plan_name || v.product_name || "";
  const valor = brl(v.total_value);
  const afterpay = v.sale_type === "afterpay";
  const afiliado =
    v.origin_type === "affiliate_incoming" ? ` · afiliado ${v.affiliate_name || ""}`.trimEnd() : "";

  const titulos: Record<EventoPush, string> = {
    pagamento_aprovado: `${info.emoji} ${afterpay ? "AfterPay pago" : "Venda aprovada"} · ${valor}`,
    pix_gerado: `${info.emoji} Pix gerado · ${valor}`,
    boleto_gerado: `${info.emoji} Boleto gerado · ${valor}`,
    venda_agendada: `${info.emoji} Venda agendada · ${valor}`,
    cobranca_aberta: `${info.emoji} Entregue — cobrar ${valor}`,
    pedido_enviado: trackingStage(v.shipping_status)
      ? `${info.emoji} Pedido a caminho`
      : `${info.emoji} Código de rastreio gerado`,
    saiu_para_entrega: `${info.emoji} Saiu para entrega`,
    aguardando_retirada: `${info.emoji} Aguardando retirada`,
    pedido_entregue: `${info.emoji} Pedido entregue`,
    falha_entrega: `${info.emoji} Falha na entrega`,
    venda_frustrada: `${info.emoji} Venda ${v.status === "cancelado" ? "cancelada" : "frustrada"} · ${valor}`,
    reembolso: `${info.emoji} Reembolso · ${valor}`,
    estoque_baixo: `${info.emoji} Estoque baixo`, // montado em lib/stock/alerta.ts
  };

  const partes = [cliente, produto].filter(Boolean).join(" — ");
  const rastreio = v.tracking_code ? ` · ${v.tracking_code}` : "";
  const entrega = ["pedido_enviado", "saiu_para_entrega", "aguardando_retirada", "pedido_entregue", "falha_entrega"].includes(ev);
  const final = entrega ? rastreio : afiliado;

  return {
    evento: ev,
    titulo: titulos[ev],
    corpo: `${partes}${final}`,
    corpoSemProduto: `${cliente}${final}`,
    referencia: v.external_id || v.id,
    url: ev === "cobranca_aberta" || entrega || ev === "falha_entrega" ? "/dashboard/collections" : "/dashboard",
    // Uma tag por venda E por tipo de aviso: cada etapa fica na tela. Com a
    // tag só da venda, o "código de rastreio" apagava o "venda agendada" do
    // mesmo pedido e parecia que o aviso nunca tinha chegado.
    tag: v.id ? `venda-${v.id}-${ev}` : undefined,
    src: v.src,
  };
}
