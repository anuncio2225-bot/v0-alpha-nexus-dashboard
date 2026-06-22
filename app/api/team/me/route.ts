import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getTeamContext } from "@/lib/team/server";

// Retorna o contexto de equipe do usuario logado (para o hook useTeamPermissions)
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const ctx = await getTeamContext(supabase, user.id);

  // Atualiza last_access_at do membro (best-effort, nao bloqueia resposta)
  if (ctx.isMember) {
    supabase
      .from("team_members")
      .update({ last_access_at: new Date().toISOString() })
      .eq("member_user_id", user.id)
      .eq("status", "active")
      .then(() => {});
  }

  return NextResponse.json({ context: ctx });
}
