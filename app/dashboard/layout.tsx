import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
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
        <main className="flex-1 min-h-screen p-6 transition-all duration-300">
          {children}
        </main>
      </div>
    </HideValuesProvider>
  );
}
