import { createClient } from "@/lib/supabase/server";
import { getEffectiveUserId, scopedSrc } from "@/lib/team/scope";
import { NextResponse } from "next/server";

/** POST /api/attendants/ordem — { ids: [...] } na ordem em que os cartões devem aparecer. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await scopedSrc(supabase, user.id, "atendentes")) {
    return NextResponse.json({ error: "Acesso restrito ao seu atendente" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  if (!ids.length) return NextResponse.json({ error: "Informe a ordem" }, { status: 400 });

  const userId = await getEffectiveUserId(supabase, user.id);
  const resultados = await Promise.all(
    ids.map((id, i) =>
      supabase.from("attendants").update({ sort_order: i + 1 }).eq("id", id).eq("user_id", userId)
    )
  );
  const erro = resultados.find((r) => r.error)?.error;
  if (erro) return NextResponse.json({ error: erro.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
