import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * O aparelho confirmando que MOSTROU o aviso (chamado pelo service worker).
 *
 * O serviço de push responde 201 até para app desinstalado — só esta
 * confirmação prova entrega. Sem sessão de propósito: o service worker roda
 * sem cookie garantido, e o endpoint (único, gerado pelo navegador) já é o
 * segredo. Só grava uma data; nada é lido nem devolvido.
 */
export async function POST(request: NextRequest) {
  const { endpoint, envio } = (await request.json().catch(() => ({}))) as {
    endpoint?: string;
    envio?: string;
  };
  if (!endpoint) return NextResponse.json({ error: "endpoint faltando" }, { status: 400 });
  const admin = createAdminClient();
  const agora = new Date().toISOString();
  const { data: inscricoes } = await admin
    .from("push_subscriptions")
    .update({ ultimo_recebido_em: agora })
    .eq("endpoint", endpoint)
    .select("owner_id");
  // Confirmação desta notificação (só conta se o aparelho é da conta do envio).
  if (envio && /^[0-9a-f-]{36}$/i.test(envio) && inscricoes?.length) {
    const { data: e } = await admin
      .from("push_envios")
      .select("id, owner_id, recebidos")
      .eq("id", envio)
      .maybeSingle();
    if (e && inscricoes.some((i) => i.owner_id === e.owner_id)) {
      await admin
        .from("push_envios")
        .update({ recebidos: (e.recebidos || 0) + 1, recebido_em: agora })
        .eq("id", e.id);
    }
  }
  return NextResponse.json({ ok: true });
}
