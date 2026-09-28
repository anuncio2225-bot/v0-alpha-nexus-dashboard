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
  const { endpoint } = (await request.json().catch(() => ({}))) as { endpoint?: string };
  if (!endpoint) return NextResponse.json({ error: "endpoint faltando" }, { status: 400 });
  await createAdminClient()
    .from("push_subscriptions")
    .update({ ultimo_recebido_em: new Date().toISOString() })
    .eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
