import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { syncUser } from "@/lib/meta/sync";

// O cron percorre todos os usuarios; damos mais tempo para concluir.
export const maxDuration = 300;

// ============================================================================
// /api/cron/meta-sync — Vercel Cron que sincroniza o Meta de todos os usuarios.
//
// Sync incremental (ultimos 3 dias + hoje) em nivel `account` para trazer o
// spend diario por conta de forma confiavel. Usa service-role (admin client),
// pois roda sem sessao de usuario.
//
// Frequencia configurada em vercel.json (ver "crons"). O plano da Vercel pode
// limitar a frequencia minima de cron — ajuste o schedule conforme o plano.
// ============================================================================

export async function GET(request: Request) {
  // Protecao via CRON_SECRET
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  try {
    // Usuários com ao menos uma conexão (BM) cadastrada. O token de cada conta
    // é resolvido por conexão dentro do syncUser.
    const { data: conns, error: connError } = await supabase
      .from("meta_connections")
      .select("user_id");

    if (connError) {
      console.error("[v0] Error fetching connections:", connError.message);
      return NextResponse.json(
        { error: "Connections fetch failed" },
        { status: 500 }
      );
    }

    const userIds = Array.from(
      new Set((conns || []).map((c) => c.user_id as string))
    );

    if (userIds.length === 0) {
      return NextResponse.json({ message: "No users to sync", synced: 0 });
    }

    let usersProcessed = 0;
    let totalRows = 0;

    for (const userId of userIds) {
      const result = await syncUser(supabase, {
        userId,
        // token real vem de cada conexão dentro do syncUser
        token: "",
        level: "account",
        lookbackDays: 3,
      });

      totalRows += result.rowsUpserted;
      usersProcessed++;
    }

    return NextResponse.json({
      success: true,
      usersProcessed,
      totalRows,
    });
  } catch (error) {
    console.error("[v0] Cron sync error:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
