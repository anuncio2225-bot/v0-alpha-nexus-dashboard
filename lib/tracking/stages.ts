/**
 * Estágios de entrega — vocabulário único usado pelo webhook e pelo CRM
 * (Cobrança). Cada gateway manda o status de rastreio num texto próprio; aqui
 * ele vira um estágio fixo, e cada estágio tem a sua coluna no quadro.
 *
 * Base: vocabulário do Pag2Pay (doc. de integração, seção 9), que já traduz as
 * transportadoras para 17 valores. Os textos da Braip caem nas mesmas palavras.
 *
 * Regra da doc: SOMENTE "Entregue" é entrega. Descrições como "Encomenda
 * Finalizada" nunca contam — por isso o casamento é pelo status, e não pela
 * descrição do evento.
 */

export type TrackingStage =
  | "preparando" // Em análise, Em produção, Pronto para envio, Etiqueta emitida, Aguardando coleta
  | "postado" // Coletado, Postado, Enviado
  | "em_transito"
  | "saiu_para_entrega"
  | "aguardando_retirada"
  | "entregue"
  | "falha_entrega"
  | "devolvido"
  | "frustrado"
  | "cancelado";

/** Nome da coluna do CRM para cada estágio (null = o estágio não tem coluna própria). */
export const STAGE_COLUMN: Record<TrackingStage, string | null> = {
  preparando: null, // continua em "Agendado"
  postado: "Postado",
  em_transito: "Em Trânsito",
  saiu_para_entrega: "Saiu para Entrega",
  aguardando_retirada: "Aguardando Retirada",
  entregue: "Entregue",
  falha_entrega: "Falha na Entrega",
  devolvido: null, // vira venda frustrada
  frustrado: null, // idem
  cancelado: null, // vira venda cancelada
};

/** Colunas de rastreio criadas pelo sistema, na ordem do quadro. */
export const TRACKING_COLUMNS = [
  "Postado",
  "Em Trânsito",
  "Saiu para Entrega",
  "Aguardando Retirada",
  "Entregue",
  "Falha na Entrega",
] as const;

function plain(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// Casamento exato com o vocabulário do Pag2Pay (sem acento, minúsculo).
const EXACT: Record<string, TrackingStage> = {
  "em analise": "preparando",
  "aguardando codigo": "preparando",
  "aguardando envio": "preparando",
  "em producao": "preparando",
  "pronto para envio": "preparando",
  "etiqueta emitida": "preparando",
  "aguardando coleta": "preparando",
  coletado: "postado",
  postado: "postado",
  enviado: "postado",
  "em transito": "em_transito",
  "saiu para entrega": "saiu_para_entrega",
  "aguardando retirada": "aguardando_retirada",
  entregue: "entregue",
  "falha na entrega": "falha_entrega",
  devolvido: "devolvido",
  cancelado: "cancelado",
  frustrado: "frustrado",
};

/**
 * Converte o texto de status de rastreio em estágio. Retorna null para
 * "Atualização" (valor de reserva do Pag2Pay: o status não avança) e para
 * textos desconhecidos — quem chama mantém o estágio anterior.
 */
export function trackingStage(raw: string | null | undefined): TrackingStage | null {
  if (!raw) return null;
  const s = plain(raw);
  if (!s || s === "atualizacao") return null;
  if (EXACT[s]) return EXACT[s];

  // Textos de outras plataformas (Braip, Correios). Ordem importa:
  // "não entregue" / "tentativa de entrega" precisam vir antes de "entregue".
  if (/nao entregue|falha|tentativa de entrega|ausente|endereco incorreto|incorret/.test(s))
    return "falha_entrega";
  if (/devolvid|devolucao ao remetente|retorn/.test(s)) return "devolvido";
  if (/frustrad/.test(s)) return "frustrado";
  if (/saiu para entrega|out for delivery/.test(s)) return "saiu_para_entrega";
  if (/retirada|aguardando retirada|disponivel para retirada/.test(s)) return "aguardando_retirada";
  if (/^entregue|objeto entregue|entregue ao destinat|delivered/.test(s)) return "entregue";
  if (/transito|transit|a caminho|encaminhad/.test(s)) return "em_transito";
  if (/postad|coletad|enviad|posted/.test(s)) return "postado";
  if (/etiqueta|preparando|a enviar|separa/.test(s)) return "preparando";
  if (/cancelad/.test(s)) return "cancelado";
  return null;
}

/** Link público de rastreio conforme a plataforma. */
export function trackingUrlFor(
  code: string | null | undefined,
  platform?: string | null
): string | null {
  if (!code) return null;
  const c = encodeURIComponent(code.trim());
  if ((platform || "").toLowerCase().replace(/\s+/g, "") === "pag2pay") {
    return `https://pag2pay.com/rastreio/${c}`;
  }
  return `https://www.linkcorreios.com.br/?id=${c}`;
}
