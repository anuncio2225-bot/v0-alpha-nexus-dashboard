import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EVENTOS_PUSH, type PreferenciasPush } from "@/lib/push/eventos";

/**
 * Preferências de UM aparelho (cada celular escolhe o que recebe).
 * O aparelho é identificado pelo endpoint da inscrição dele.
 */
async function aparelhoDoUsuario(endpoint: string | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { erro: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!endpoint)
    return { erro: NextResponse.json({ error: "endpoint faltando" }, { status: 400 }) };
  const admin = createAdminClient();
  const { data } = await admin
    .from("push_subscriptions")
    .select("id, preferencias, ultimo_sucesso_em, ultimo_recebido_em")
    .eq("endpoint", endpoint)
    .eq("member_id", user.id)
    .maybeSingle();
  return { admin, aparelho: data };
}

export async function GET(request: NextRequest) {
  const endpoint = new URL(request.url).searchParams.get("endpoint");
  const r = await aparelhoDoUsuario(endpoint);
  if (r.erro) return r.erro;
  if (!r.aparelho) return NextResponse.json({ registrado: false });
  return NextResponse.json({
    registrado: true,
    preferencias: r.aparelho.preferencias || {},
    ultimo_sucesso_em: r.aparelho.ultimo_sucesso_em,
    ultimo_recebido_em: r.aparelho.ultimo_recebido_em,
  });
}

export async function PATCH(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    endpoint?: string;
    preferencias?: PreferenciasPush;
  };
  const r = await aparelhoDoUsuario(body.endpoint || null);
  if (r.erro) return r.erro;
  if (!r.aparelho)
    return NextResponse.json({ error: "aparelho não registrado" }, { status: 404 });

  // Só aceita as chaves conhecidas, com valor booleano.
  const validas = new Set(EVENTOS_PUSH.map((e) => e.id));
  const limpas: PreferenciasPush = {};
  for (const [k, v] of Object.entries(body.preferencias || {})) {
    if (validas.has(k as never) && typeof v === "boolean") limpas[k as keyof PreferenciasPush] = v;
  }
  const { error } = await r.admin
    .from("push_subscriptions")
    .update({ preferencias: { ...(r.aparelho.preferencias || {}), ...limpas } })
    .eq("id", r.aparelho.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
