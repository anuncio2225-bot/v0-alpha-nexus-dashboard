import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

// POST /api/collections/[id]/schedule — agenda cobranca e devolve link do Google Calendar
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const date: string | undefined = body.date;
  if (!date) {
    return NextResponse.json({ error: "Data obrigatoria" }, { status: 400 });
  }

  const { data: client } = await supabase
    .from("collection_clients")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!client) {
    return NextResponse.json({ error: "Cliente nao encontrado" }, { status: 404 });
  }

  // Atualiza proxima data de cobranca
  await supabase
    .from("collection_clients")
    .update({
      next_collection_date: date,
      negotiation_date: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id);

  // Registra no historico
  await supabase.from("collection_history").insert({
    user_id: user.id,
    client_id: id,
    type: "schedule",
    description: body.notes
      ? `Cobranca agendada para ${date}: ${body.notes}`
      : `Cobranca agendada para ${date}`,
    scheduled_date: date,
  });

  // Emails da equipe para convidar
  const { data: emails } = await supabase
    .from("collection_calendar_emails")
    .select("email")
    .eq("user_id", user.id)
    .eq("is_active", true);

  // Monta link do Google Calendar (all-day no dia agendado)
  const start = date.replace(/-/g, "");
  const endDate = new Date(date + "T00:00:00");
  endDate.setDate(endDate.getDate() + 1);
  const end = endDate.toISOString().slice(0, 10).replace(/-/g, "");

  const remaining = Number(client.remaining_value) || 0;
  const title = `Cobranca: ${client.name}`;
  const details = [
    `Cliente: ${client.name}`,
    client.phone ? `Telefone: ${client.phone}` : "",
    client.product_name ? `Produto: ${client.product_name}` : "",
    `Valor pendente: R$ ${remaining.toFixed(2)}`,
    client.payment_link ? `Link de pagamento: ${client.payment_link}` : "",
    body.notes ? `Obs: ${body.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const calParams = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${start}/${end}`,
    details,
  });
  for (const e of emails || []) {
    if (e.email) calParams.append("add", e.email);
  }

  const calendarUrl = `https://calendar.google.com/calendar/render?${calParams.toString()}`;

  return NextResponse.json({ calendar_url: calendarUrl });
}
