import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { RouteAccessGuard } from "@/components/team/route-access-guard";
import { HideValuesProvider } from "@/contexts/hide-values-context";
import type { Profile } from "@/types";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Fetch profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (
    <HideValuesProvider>
      <div className="flex min-h-screen bg-background">
        <Sidebar profile={profile as Profile | null} />
        {/* min-w-0: sem ele, uma tabela larga (Cobrança) empurra a página
            inteira para o lado em vez de rolar dentro do próprio card.
            pt-20 no celular: espaço da barra superior com o botão do menu. */}
        <main className="flex-1 min-w-0 min-h-screen px-4 pb-6 pt-20 sm:px-6 lg:p-6">
          <RouteAccessGuard>{children}</RouteAccessGuard>
        </main>
      </div>
    </HideValuesProvider>
  );
}
