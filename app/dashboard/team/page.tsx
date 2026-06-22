import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTeamContext } from "@/lib/team/server";
import { TeamClient } from "@/components/team/team-client";

export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Apenas o dono acessa a pagina de equipe; membros sao redirecionados.
  const ctx = await getTeamContext(supabase, user.id);
  if (!ctx.isOwner) {
    redirect("/dashboard");
  }

  return <TeamClient />;
}
