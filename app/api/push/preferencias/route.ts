import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/team/scope";
import { EVENTOS_PUSH, type PreferenciasPush } from "@/lib/push/eventos";

/**
 * O que ESTA PESSOA recebe (vale em todos os aparelhos dela) + relatório
 * diário. Com `?endpoint=`, diz também se este aparelho está registrado.
 */
async function sessao() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const ownerId = await getEffectiveUserId(supabase, user.id);
  return { userId: user.id, ownerId };
}

export async function GET(request: NextRequest) {
  const s = await sessao();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const endpoint = new URL(request.url).searchParams.get("endpoint");

  const [{ data: pref }, { data: aparelho }] = await Promise.all([
    admin
      .from("push_preferencias")
      .select("preferencias, permitido, relatorio_ativo, relatorio_hora")
      .eq("owner_id", s.ownerId)
      .eq("member_id", s.userId)
      .maybeSingle(),
    endpoint
      ? admin
          .from("push_subscriptions")
          .select("ultimo_recebido_em")
          .eq("endpoint", endpoint)
          .eq("owner_id", s.ownerId)
          .eq("member_id", s.userId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const souDono = s.ownerId === s.userId;
  const { data: conta } = await admin
    .from("profiles")
    .select("email, full_name")
    .eq("id", s.ownerId)
    .maybeSingle();
  return NextResponse.json({
    souDono,
    conta: conta?.email || null,
    registrado: !!aparelho,
    ultimo_recebido_em: aparelho?.ultimo_recebido_em ?? null,
    preferencias: pref?.preferencias || {},
    // O dono sempre recebe; membro depende da liberação do dono.
    permitido: souDono ? true : pref?.permitido ?? true,
    relatorio: {
      ativo: pref?.relatorio_ativo ?? true,
      hora: pref?.relatorio_hora ?? 21,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const s = await sessao();
  if (!s) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as {
    preferencias?: PreferenciasPush;
    relatorio?: { ativo?: boolean; hora?: number };
  };
  const admin = createAdminClient();

  const { data: atual } = await admin
    .from("push_preferencias")
    .select("preferencias")
    .eq("owner_id", s.ownerId)
    .eq("member_id", s.userId)
    .maybeSingle();

  // Só chaves conhecidas, com valor booleano.
  const validas = new Set<string>(EVENTOS_PUSH.map((e) => e.id));
  const limpas: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(body.preferencias || {})) {
    if (validas.has(k) && typeof v === "boolean") limpas[k] = v;
  }

  const linha: Record<string, unknown> = {
    owner_id: s.ownerId,
    member_id: s.userId,
    preferencias: { ...((atual?.preferencias as object) || {}), ...limpas },
    updated_at: new Date().toISOString(),
  };
  if (typeof body.relatorio?.ativo === "boolean") linha.relatorio_ativo = body.relatorio.ativo;
  if (Number.isInteger(body.relatorio?.hora) && body.relatorio!.hora! >= 0 && body.relatorio!.hora! <= 23)
    linha.relatorio_hora = body.relatorio!.hora;

  const { error } = await admin
    .from("push_preferencias")
    .upsert(linha, { onConflict: "owner_id,member_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
