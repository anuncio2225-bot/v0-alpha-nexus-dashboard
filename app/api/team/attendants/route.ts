import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTeamContext } from "@/lib/team/server";

// GET /api/team/attendants — atendentes da conta + SRCs detectados nos dados.
// Usado no formulario de equipe para vincular um membro a um atendente (SRC).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const ctx = await getTeamContext(supabase, user.id);
  if (!ctx.isOwner) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // Atendentes cadastrados
  const { data: attendants } = await supabase
    .from("attendants")
    .select("id, name, src")
    .eq("user_id", user.id)
    .order("name");

  // SRCs que realmente aparecem nos dados de cobranca (postback)
  const { data: rows } = await supabase
    .from("collection_clients")
    .select("src")
    .eq("user_id", user.id)
    .not("src", "is", null);

  const srcSet = new Set<string>();
  for (const r of rows || []) {
    const s = (r as { src: string | null }).src;
    if (s && s.trim()) srcSet.add(s.trim());
  }

  return NextResponse.json({
    attendants: attendants || [],
    detectedSrcs: Array.from(srcSet).sort(),
  });
}
