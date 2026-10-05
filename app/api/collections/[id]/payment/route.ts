import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId, podeVerCliente } from "@/lib/team/scope";
import { marcarVendaPagaManual } from "@/lib/collections/pago-manual";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

interface Parte {
  amount: number;
  payment_method: string | null;
}

/**
 * POST /api/collections/[id]/payment — registra pagamento feito por fora do
 * gateway, em uma ou mais partes (ex.: R$ 200 no link + R$ 190 no Pix).
 *
 * Corpo: { partes: [{ amount, payment_method }], payment_date?: "YYYY-MM-DD",
 *          quitar?: boolean }  (aceita também o formato antigo { amount, payment_method })
 *
 * Quitado quando o recebido (todas as partes já lançadas + estas) cobre o
 * VALOR CHEIO do pedido, ou quando `quitar` vem marcado (desconto/combinado).
 * Quitado: Pago na Cobrança e a venda conta como paga no Dashboard na data.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dono = await getEffectiveUserId(supabase, user.id);
  if (!(await podeVerCliente(supabase, user.id, dono, id))) {
    return NextResponse.json({ error: "Acesso restrito aos seus clientes" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const partes: Parte[] = (
    Array.isArray(body.partes) ? body.partes : body.amount ? [{ amount: body.amount, payment_method: body.payment_method }] : []
  )
    .map((p: { amount?: unknown; payment_method?: unknown }) => ({
      amount: Math.round(Number(p.amount) * 100) / 100,
      payment_method: p.payment_method ? String(p.payment_method) : null,
    }))
    .filter((p: Parte) => Number.isFinite(p.amount) && p.amount > 0);
  const quitar = body.quitar === true;
  if (!partes.length && !quitar) {
    return NextResponse.json({ error: "Informe o valor pago" }, { status: 400 });
  }

  const { data: client } = await supabase
    .from("collection_clients")
    .select("*")
    .eq("id", id)
    .eq("user_id", dono)
    .single();
  if (!client) {
    return NextResponse.json({ error: "Cliente nao encontrado" }, { status: 404 });
  }

  // O que já foi lançado antes (histórico de pagamentos deste cliente).
  const { data: anteriores } = await supabase
    .from("collection_history")
    .select("payment_amount")
    .eq("user_id", dono)
    .eq("client_id", id)
    .eq("type", "payment");
  const recebidoAntes = (anteriores || []).reduce((s, h) => s + (Number(h.payment_amount) || 0), 0);
  const recebidoAgora = partes.reduce((s, p) => s + p.amount, 0);
  const recebido = recebidoAntes + recebidoAgora;

  // Valor cheio do pedido (o que o cliente paga). Os campos total/paid/remaining
  // do card ficam na base da comissão — convertidos pela proporção recebida.
  const valorPedido = Number(client.order_total_value) || Number(client.total_value) || 0;
  const totalCard = Number(client.total_value) || 0;
  const quitado = quitar || (valorPedido > 0 && recebido >= valorPedido - 0.01);
  const proporcao = valorPedido > 0 ? Math.min(1, recebido / valorPedido) : quitado ? 1 : 0;
  const pagoCard = quitado ? totalCard : Math.round(totalCard * proporcao * 100) / 100;

  const targetName = quitado ? "Pago" : "Pagamento Parcial";
  const { data: targetStatus } = await supabase
    .from("collection_statuses")
    .select("id, name")
    .eq("user_id", dono)
    .ilike("name", targetName)
    .limit(1)
    .maybeSingle();

  const dataPagamento = body.payment_date
    ? new Date(`${body.payment_date}T12:00:00-03:00`).toISOString()
    : new Date().toISOString();
  // Pagamento antes do pedido ou no futuro cai em outro período (some do
  // Dashboard, do lucro e da comissão) — recusa em vez de gravar errado.
  const diaPedido = client.order_date
    ? new Date(new Date(client.order_date).getTime() - 3 * 3600_000).toISOString().slice(0, 10)
    : null;
  const diaPagamento = new Date(new Date(dataPagamento).getTime() - 3 * 3600_000).toISOString().slice(0, 10);
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  if ((diaPedido && diaPagamento < diaPedido) || diaPagamento > hoje) {
    return NextResponse.json(
      { error: "Data do pagamento fora do intervalo: entre a data do pedido e hoje." },
      { status: 400 }
    );
  }

  const updates: Record<string, unknown> = {
    paid_value: pagoCard,
    remaining_value: Math.max(0, totalCard - pagoCard),
    payment_method: partes.map((p) => p.payment_method).filter(Boolean).join(" + ") || client.payment_method,
    last_contact_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (targetStatus) {
    updates.status_id = targetStatus.id;
    updates.status_name = targetStatus.name;
  }
  if (quitado) updates.payment_date = dataPagamento;

  const { data: updated, error } = await supabase
    .from("collection_clients")
    .update(updates)
    .eq("id", id)
    .eq("user_id", dono)
    .select()
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Uma linha de histórico por parte (valor, forma, data).
  const dataBR = (body.payment_date || dataPagamento.slice(0, 10)).split("-").reverse().join("/");
  const linhas = partes.map((p, i) => ({
    user_id: dono,
    client_id: id,
    type: "payment",
    description:
      `Pagamento de ${fmt(p.amount)}${p.payment_method ? ` (${p.payment_method})` : ""} em ${dataBR}` +
      (partes.length > 1 ? ` — parte ${i + 1} de ${partes.length}` : ""),
    payment_amount: p.amount,
    payment_method: p.payment_method,
  }));
  linhas.push({
    user_id: dono,
    client_id: id,
    type: "status_change",
    description: quitado
      ? `Quitado: recebido ${fmt(recebido)} de ${fmt(valorPedido)}${quitar && recebido < valorPedido ? " (quitado com desconto/combinado)" : ""}`
      : `Pagamento parcial: recebido ${fmt(recebido)} de ${fmt(valorPedido)} — falta ${fmt(valorPedido - recebido)}`,
    payment_amount: null as unknown as number,
    payment_method: null,
  });
  await supabase.from("collection_history").insert(linhas);

  // Quitado: a venda do gateway passa a contar como paga no Dashboard.
  if (quitado && client.transaction_id) {
    await marcarVendaPagaManual(supabase, dono, client.transaction_id, dataPagamento);
  }

  return NextResponse.json({ client: updated, recebido, valor_pedido: valorPedido, quitado });
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}
