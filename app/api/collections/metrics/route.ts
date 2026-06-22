import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

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
  const attendant = searchParams.get("attendant")?.trim();
  const product = searchParams.get("product")?.trim();

  const today = todaySaoPaulo();

  let clientsQuery = supabase
    .from("collection_clients")
    .select(
      "id, status_name, attendant_name, product_name, total_value, paid_value, remaining_value, next_collection_date, last_contact_at, days_without_response"
    )
    .eq("user_id", user.id);

  if (statusId) clientsQuery = clientsQuery.eq("status_id", statusId);
  if (attendant) {
    clientsQuery = clientsQuery.or(
      `attendant_name.eq.${attendant},src.eq.${attendant}`
    );
  }
  if (product) clientsQuery = clientsQuery.eq("product_name", product);
  if (search) {
    clientsQuery = clientsQuery.or(
      `name.ilike.%${search}%,phone.ilike.%${search}%,product_name.ilike.%${search}%`
    );
  }

  const { data: clients } = await clientsQuery;

  // Pagamentos registrados hoje — restritos aos clientes filtrados
  const clientIds = (clients || []).map((c) => c.id);
  let paymentsToday: { payment_amount: number | null }[] | null = [];
  if (clientIds.length > 0) {
    const { data } = await supabase
      .from("collection_history")
      .select("payment_amount, created_at, client_id")
      .eq("user_id", user.id)
      .eq("type", "payment")
      .in("client_id", clientIds)
      .gte("created_at", `${today}T00:00:00`)
      .lte("created_at", `${today}T23:59:59.999`);
    paymentsToday = data;
  }

  const list = clients || [];
  const isPaid = (c: { status_name: string | null }) =>
    (c.status_name || "").toLowerCase() === "pago";

  const now = Date.now();
  const daysSince = (iso: string | null) =>
    iso ? Math.floor((now - new Date(iso).getTime()) / 86400000) : Infinity;

  const dueToday = list.filter((c) => c.next_collection_date === today);
  const totalDueToday = dueToday.reduce(
    (s, c) => s + (Number(c.remaining_value) || 0),
    0
  );
  const receivedToday = (paymentsToday || []).reduce(
    (s, p) => s + (Number(p.payment_amount) || 0),
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
      scheduled_today: dueToday.length,
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
    },
  });
}
