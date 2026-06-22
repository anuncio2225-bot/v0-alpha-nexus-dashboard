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
    // Usuarios conectados. token_expires_at IS NULL = nunca expira (valido!),
    // por isso NAO filtramos por expiracao aqui (null seria excluido).
    const { data: configs, error: configError } = await supabase
      .from("meta_config")
      .select("user_id, access_token, token_expires_at")
      .eq("is_connected", true);

    if (configError) {
      console.error("[v0] Error fetching configs:", configError.message);
      return NextResponse.json({ error: "Config fetch failed" }, { status: 500 });
    }

    if (!configs || configs.length === 0) {
      return NextResponse.json({ message: "No users to sync", synced: 0 });
    }

    const now = Date.now();
    let usersProcessed = 0;
    let usersSkipped = 0;
    let totalRows = 0;

    for (const config of configs) {
      // Pula tokens comprovadamente expirados (mas null = nunca expira = ok)
      if (
        config.token_expires_at &&
        new Date(config.token_expires_at).getTime() < now
      ) {
        usersSkipped++;
        await supabase
          .from("meta_config")
          .update({ validation_status: "expired", is_connected: false })
          .eq("user_id", config.user_id);
        continue;
      }

      if (!config.access_token) {
        usersSkipped++;
        continue;
      }

      const result = await syncUser(supabase, {
        userId: config.user_id,
        token: config.access_token,
        level: "account",
        lookbackDays: 3,
      });

      totalRows += result.rowsUpserted;
      usersProcessed++;
    }

    return NextResponse.json({
      success: true,
      usersProcessed,
      usersSkipped,
      totalRows,
    });
  } catch (error) {
    console.error("[v0] Cron sync error:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
