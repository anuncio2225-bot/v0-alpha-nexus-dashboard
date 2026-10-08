import { createClient } from "@/lib/supabase/server";
import { getTeamDataScope } from "@/lib/team/scope";
import { NextResponse } from "next/server";
import { fetchAll } from "@/lib/supabase/fetch-all";

// Data de "hoje" no fuso de Sao Paulo (YYYY-MM-DD)
function todaySaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// GET /api/collections/metrics — aceita os MESMOS filtros da tabela/kanban
// (search, status_id, attendant, product), garantindo que os KPIs do topo
// reflitam exatamente a lista filtrada que o usuario esta vendo (Melhoria 3).
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();
  const statusId = searchParams.get("status_id");
  const statusIds = (searchParams.get("status_ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const attendant = searchParams.get("attendant")?.trim();
  const attendants = (searchParams.get("attendants") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const product = searchParams.get("product")?.trim();
  const products = (searchParams.get("products") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const platforms = (searchParams.get("platforms") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const saleTypes = (searchParams.get("sale_types") || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => ["afterpay", "antecipado", "recuperacao"].includes(s));

  const today = todaySaoPaulo();
  const scope = await getTeamDataScope(supabase, user.id);

  let clientsQuery = supabase
    .from("collection_clients")
    .select(
      "id, status_name, braip_status, attendant_name, product_name, total_value, order_total_value, sale_type, paid_value, remaining_value, payment_date, next_collection_date, last_contact_at, days_without_response"
    )
    .eq("user_id", scope.ownerId);

  // Membro restrito a um atendente: KPIs refletem so o SRC dele.
  if (scope.srcFilter && scope.srcAreas.cobranca) {
    clientsQuery = clientsQuery.ilike("src", scope.srcFilter);
  }

  if (statusIds.length > 0) clientsQuery = clientsQuery.in("status_id", statusIds);
  else if (statusId) clientsQuery = clientsQuery.eq("status_id", statusId);
  const attNames = attendants.length > 0 ? attendants : attendant ? [attendant] : [];
  if (attNames.length > 0) {
    clientsQuery = clientsQuery.or(
      attNames
        .flatMap((n) => [`attendant_name.eq.${n}`, `src.eq.${n}`])
        .join(",")
    );
  }
  if (products.length > 0) clientsQuery = clientsQuery.in("product_name", products);
  else if (product) clientsQuery = clientsQuery.eq("product_name", product);
  if (platforms.length > 0)
    clientsQuery = clientsQuery.in("platform_name", platforms);
  if (saleTypes.length > 0) clientsQuery = clientsQuery.in("sale_type", saleTypes);
  if (search) {
    clientsQuery = clientsQuery.or(
      `name.ilike.%${search}%,phone.ilike.%${search}%,product_name.ilike.%${search}%`
    );
  }

  const { data: clients } = await fetchAll(clientsQuery);

  const list = clients || [];
  const isPaid = (c: { status_name: string | null }) =>
    (c.status_name || "").toLowerCase() === "pago";

  const now = Date.now();
  const daysSince = (iso: string | null) =>
    iso ? Math.floor((now - new Date(iso).getTime()) / 86400000) : Infinity;

  const dueToday = list.filter((c) => c.next_collection_date === today);

  // RECEBIDO HOJE (dia de Brasília) — o que entrou hoje, pela plataforma ou
  // lançado à mão:
  //  - pedido quitado hoje (payment_date de hoje — o webhook e o "registrar
  //    pagamento" gravam): o que foi pago, menos parcelas de dias anteriores;
  //  - pagamento parcial lançado hoje em quem ainda não quitou.
  // Antes só contava o lançado à mão: venda paga pela plataforma dava R$ 0.
  const diaSP = (iso: string | null) =>
    iso ? new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10) : "";
  const inicioHoje = `${today}T00:00:00-03:00`;
  const fimHoje = `${today}T23:59:59.999-03:00`;
  const quitadosHoje = list.filter((c) => isPaid(c) && diaSP(c.payment_date) === today);
  const idsQuitados = new Set(quitadosHoje.map((c) => c.id));
  const historico = async (ids: string[], antesDeHoje: boolean) => {
    const out: { payment_amount: number | null; client_id: string }[] = [];
    // Em lotes: centenas de ids numa URL só passam do limite do PostgREST.
    for (let i = 0; i < ids.length; i += 150) {
      let q = supabase
        .from("collection_history")
        .select("payment_amount, client_id")
        .eq("user_id", scope.ownerId)
        .eq("type", "payment")
        .in("client_id", ids.slice(i, i + 150));
      q = antesDeHoje ? q.lt("created_at", inicioHoje) : q.gte("created_at", inicioHoje).lte("created_at", fimHoje);
      const { data } = await fetchAll(q);
      out.push(...((data || []) as { payment_amount: number | null; client_id: string }[]));
    }
    return out;
  };
  const [parciaisHoje, parcelasAntigas] = await Promise.all([
    historico(list.filter((c) => !idsQuitados.has(c.id)).map((c) => c.id), false),
    historico([...idsQuitados], true),
  ]);
  const antigoPor = new Map<string, number>();
  for (const p of parcelasAntigas) antigoPor.set(p.client_id, (antigoPor.get(p.client_id) || 0) + (Number(p.payment_amount) || 0));
  const valorPedido = (c: (typeof list)[number]) => Number(c.order_total_value) || Number(c.total_value) || 0;
  const receivedToday =
    quitadosHoje.reduce(
      (s, c) => s + Math.max((Number(c.paid_value) || valorPedido(c)) - (antigoPor.get(c.id) || 0), 0),
      0
    ) + parciaisHoje.reduce((s, p) => s + (Number(p.payment_amount) || 0), 0);
  const clientesRecebidosHoje = new Set([...idsQuitados, ...parciaisHoje.map((p) => p.client_id)]).size;

  // A RECEBER = AfterPay já entregue e ainda não pago (o dinheiro que está
  // na mão do cliente agora), pelo que falta de cada pedido.
  const ENTREGUE = new Set(["entregue", "cobrar (afterpay)", "aguardando pagamento", "pagamento pendente"]);
  const entreguesNaoPagos = list.filter(
    (c) => c.sale_type === "afterpay" && ENTREGUE.has((c.status_name || "").toLowerCase())
  );
  const totalDueToday = entreguesNaoPagos.reduce(
    (s, c) => s + (Number(c.remaining_value) || valorPedido(c)),
    0
  );
  const noResponse = list.filter(
    (c) => !isPaid(c) && daysSince(c.last_contact_at) > 3
  );

  const totalReceived = list.reduce((s, c) => s + (Number(c.paid_value) || 0), 0);
  const totalPending = list.reduce(
    (s, c) => s + (isPaid(c) ? 0 : Number(c.remaining_value) || 0),
    0
  );
  const totalValue = list.reduce((s, c) => s + (Number(c.total_value) || 0), 0);
  const recoveryRate = totalValue > 0 ? (totalReceived / totalValue) * 100 : 0;

  // Pedidos agendados = os que estão na coluna "Agendado" do quadro, de
  // qualquer plataforma. (O status da plataforma não serve: o Pag2Pay segue
  // dizendo "Agendado" depois de postado, e o número não batia com o funil.)
  const ehAgendado = (c: { status_name: string | null }) =>
    (c.status_name || "").toLowerCase() === "agendado";
  const pedidosAgendados = list.filter(ehAgendado);
  const pedidosAgendadosValue = pedidosAgendados.reduce(
    (s, c) => s + (Number(c.order_total_value) || Number(c.total_value) || 0),
    0
  );

  // Funil da entrega (igual ao quadro do Pag2Pay): quantos pedidos e quanto
  // vale cada etapa, pelo valor cheio do pedido.
  const ETAPA: Record<string, string> = {
    agendado: "agendado",
    postado: "transito",
    "em trânsito": "transito",
    "saiu para entrega": "transito",
    "aguardando retirada": "agencia",
    entregue: "cobranca",
    "cobrar (afterpay)": "cobranca",
    "aguardando pagamento": "cobranca",
    "pagamento pendente": "cobranca",
    pago: "pago",
    frustrado: "frustrado",
    cancelado: "frustrado",
    devolucao: "frustrado",
    "falha na entrega": "frustrado",
  };
  const funil: Record<string, { count: number; value: number }> = {
    agendado: { count: 0, value: 0 },
    transito: { count: 0, value: 0 },
    agencia: { count: 0, value: 0 },
    cobranca: { count: 0, value: 0 },
    pix_boleto: { count: 0, value: 0 },
    pago: { count: 0, value: 0 },
    frustrado: { count: 0, value: 0 },
    nao_pago: { count: 0, value: 0 },
  };
  for (const c of list) {
    let etapa = ETAPA[(c.status_name || "").toLowerCase()];
    if (!etapa) continue;
    // AfterPay x antecipado: aguardando e perdido querem dizer coisas diferentes.
    const afterpay = c.sale_type === "afterpay";
    if (etapa === "cobranca" && !afterpay) etapa = "pix_boleto";
    if (etapa === "frustrado" && !afterpay) etapa = "nao_pago";
    funil[etapa].count += 1;
    funil[etapa].value += Number(c.order_total_value) || Number(c.total_value) || 0;
  }

  // Por modalidade: o que entrou, o que está em aberto e o que se perdeu.
  // Quantidade e % pelo número de pedidos; "recebido" é o dinheiro que entrou
  // de fato (paid_value, inclui pagamento parcial); aberto e perdido pelo
  // valor cheio do pedido. Antecipado inclui recuperação (pago no ato).
  const PERDIDO = new Set(["frustrado", "cancelado", "devolucao", "devolução", "falha na entrega"]);
  const resumo = (lista: typeof list) => {
    const pagos = lista.filter(isPaid);
    const perdidos = lista.filter((c) => PERDIDO.has((c.status_name || "").toLowerCase()));
    const abertos = lista.filter((c) => !isPaid(c) && !PERDIDO.has((c.status_name || "").toLowerCase()));
    const recebidoAbertos = abertos.reduce((s, c) => s + (Number(c.paid_value) || 0), 0);
    return {
      pedidos: lista.length,
      valor: lista.reduce((s, c) => s + valorPedido(c), 0),
      pagos: pagos.length,
      recebido: lista.reduce((s, c) => s + (Number(c.paid_value) || 0), 0),
      recebido_parcial: recebidoAbertos,
      abertos: abertos.length,
      abertos_valor: abertos.reduce((s, c) => s + (Number(c.remaining_value) || valorPedido(c)), 0),
      perdidos: perdidos.length,
      perdidos_valor: perdidos.reduce((s, c) => s + valorPedido(c), 0),
    };
  };
  const modalidades = {
    afterpay: resumo(list.filter((c) => c.sale_type === "afterpay")),
    antecipado: resumo(list.filter((c) => c.sale_type === "antecipado" || c.sale_type === "recuperacao")),
  };

  // Agrupamentos
  const byStatus: Record<string, { count: number; value: number }> = {};
  const byAttendant: Record<string, { count: number; pending: number; received: number }> =
    {};
  const byProduct: Record<string, { count: number; pending: number }> = {};
  // Crosstab atendente x status (igual planilha): { atendente: { status: count } }
  const attendantStatus: Record<string, Record<string, number>> = {};
  const statusNames = new Set<string>();

  for (const c of list) {
    const st = c.status_name || "Sem status";
    byStatus[st] = byStatus[st] || { count: 0, value: 0 };
    byStatus[st].count += 1;
    byStatus[st].value += Number(c.remaining_value) || 0;

    const at = c.attendant_name || "Sem atendente";
    byAttendant[at] = byAttendant[at] || { count: 0, pending: 0, received: 0 };
    byAttendant[at].count += 1;
    byAttendant[at].pending += isPaid(c) ? 0 : Number(c.remaining_value) || 0;
    byAttendant[at].received += Number(c.paid_value) || 0;

    statusNames.add(st);
    attendantStatus[at] = attendantStatus[at] || {};
    attendantStatus[at][st] = (attendantStatus[at][st] || 0) + 1;

    const pr = c.product_name || "Sem produto";
    byProduct[pr] = byProduct[pr] || { count: 0, pending: 0 };
    byProduct[pr].count += 1;
    byProduct[pr].pending += isPaid(c) ? 0 : Number(c.remaining_value) || 0;
  }

  return NextResponse.json({
    metrics: {
      total_due_today: totalDueToday,
      received_today: receivedToday,
      received_today_count: clientesRecebidosHoje,
      due_count: entreguesNaoPagos.length,
      scheduled_today: dueToday.length,
      pedidos_agendados_count: pedidosAgendados.length,
      pedidos_agendados_value: pedidosAgendadosValue,
      modalidades,
      no_response_count: noResponse.length,
      recovery_rate: recoveryRate,
      total_clients: list.length,
      total_received: totalReceived,
      total_pending: totalPending,
      by_status: byStatus,
      by_attendant: byAttendant,
      by_product: byProduct,
      attendant_status: attendantStatus,
      status_names: Array.from(statusNames),
      funil,
    },
  });
}
