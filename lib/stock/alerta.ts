import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { enviarAviso } from "@/lib/push/enviar";

/**
 * Depois de uma SAÍDA de estoque, confere se o saldo cruzou o nível de alerta
 * (Estoque → Configurações) ou zerou, e avisa no celular.
 *
 * Só avisa na passagem (antes acima, agora abaixo), para não mandar um aviso
 * a cada venda enquanto o estoque segue baixo. Nunca lança.
 */
export async function avisarSeEstoqueBaixo(userId: string, quantidadeSaiu: number): Promise<void> {
  try {
    const admin = createAdminClient();
    const [{ data: cfg }, { data: moves }] = await Promise.all([
      admin.from("stock_config").select("low_stock_alert").eq("user_id", userId).maybeSingle(),
      fetchAll(admin.from("stock_movements").select("type, quantity").eq("user_id", userId)),
    ]);
    // Sem nenhuma entrada cadastrada o estoque não é controlado: não avisa.
    if (!(moves || []).some((m) => m.type === "entry")) return;

    const saldo = (moves || []).reduce(
      (s, m) => s + (m.type === "entry" ? 1 : -1) * (Number(m.quantity) || 0),
      0
    );
    const antes = saldo + quantidadeSaiu;
    const limite = cfg?.low_stock_alert ?? 50;

    let titulo: string | null = null;
    if (saldo <= 0 && antes > 0) titulo = "📦 Estoque ZERADO";
    else if (saldo < limite && antes >= limite) titulo = "📦 Estoque baixo";
    if (!titulo) return;

    await enviarAviso(userId, {
      evento: "estoque_baixo",
      titulo,
      corpo:
        saldo <= 0
          ? `Saldo ${saldo} unidades. Pare de agendar até repor.`
          : `Restam ${saldo} unidades (alerta em ${limite}). Hora de repor ou segurar os agendamentos.`,
      url: "/dashboard/stock",
      tag: "estoque",
    });
  } catch (e) {
    console.error("[estoque] falha ao conferir estoque baixo (não bloqueia):", e);
  }
}
