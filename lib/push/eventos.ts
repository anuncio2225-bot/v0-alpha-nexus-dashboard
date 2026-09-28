/**
 * Catálogo dos avisos que o celular pode receber. Usado pela tela de
 * Configurações (liga/desliga por aparelho) e pelo envio no webhook.
 */

export type EventoPush =
  | "pagamento_aprovado"
  | "pix_gerado"
  | "boleto_gerado"
  | "venda_agendada"
  | "pedido_enviado"
  | "saiu_para_entrega"
  | "aguardando_retirada"
  | "pedido_entregue"
  | "cobranca_aberta"
  | "falha_entrega"
  | "venda_frustrada"
  | "reembolso"
  | "estoque_baixo";

export interface EventoInfo {
  id: EventoPush;
  grupo: "Pagamento" | "Entrega" | "Problemas" | "Estoque";
  emoji: string;
  titulo: string;
  descricao: string;
  padrao: boolean;
}

export const EVENTOS_PUSH: EventoInfo[] = [
  { id: "pagamento_aprovado", grupo: "Pagamento", emoji: "💰", titulo: "Pagamento aprovado", descricao: "Pix, cartão, boleto ou AfterPay pago", padrao: true },
  { id: "pix_gerado", grupo: "Pagamento", emoji: "🟢", titulo: "Pix gerado", descricao: "Cliente gerou o Pix e ainda não pagou", padrao: true },
  { id: "boleto_gerado", grupo: "Pagamento", emoji: "🧾", titulo: "Boleto gerado", descricao: "Cliente gerou o boleto e ainda não pagou", padrao: true },
  { id: "venda_agendada", grupo: "Pagamento", emoji: "📅", titulo: "Venda agendada", descricao: "Novo pedido AfterPay (paga na entrega)", padrao: true },
  { id: "cobranca_aberta", grupo: "Pagamento", emoji: "💳", titulo: "Cobrança aberta", descricao: "AfterPay entregue, esperando o cliente pagar", padrao: true },
  { id: "pedido_enviado", grupo: "Entrega", emoji: "📬", titulo: "Pedido postado / a caminho", descricao: "Código de rastreio e saída para a transportadora", padrao: true },
  { id: "saiu_para_entrega", grupo: "Entrega", emoji: "🚚", titulo: "Saiu para entrega", descricao: "A encomenda chega hoje", padrao: true },
  { id: "aguardando_retirada", grupo: "Entrega", emoji: "🏪", titulo: "Aguardando retirada", descricao: "Encomenda esperando o cliente buscar", padrao: true },
  { id: "pedido_entregue", grupo: "Entrega", emoji: "✅", titulo: "Pedido entregue", descricao: "Transportadora confirmou a entrega", padrao: true },
  { id: "falha_entrega", grupo: "Problemas", emoji: "⚠️", titulo: "Falha na entrega", descricao: "A transportadora não conseguiu entregar", padrao: true },
  { id: "venda_frustrada", grupo: "Problemas", emoji: "❌", titulo: "Venda frustrada ou cancelada", descricao: "Pagamento falhou, pedido cancelado ou devolvido", padrao: true },
  { id: "reembolso", grupo: "Problemas", emoji: "💸", titulo: "Reembolso", descricao: "Venda estornada ou reembolsada", padrao: true },
  { id: "estoque_baixo", grupo: "Estoque", emoji: "📦", titulo: "Estoque baixo", descricao: "Saldo abaixo do nível de alerta ou zerado (hora de parar de agendar ou repor)", padrao: true },
];

export type PreferenciasPush = Partial<Record<EventoPush, boolean>>;

/** Preferência efetiva (o que não foi escolhido segue o padrão). */
export function querReceber(prefs: PreferenciasPush | null | undefined, ev: EventoPush): boolean {
  const escolhido = prefs?.[ev];
  if (typeof escolhido === "boolean") return escolhido;
  return EVENTOS_PUSH.find((e) => e.id === ev)?.padrao ?? true;
}
