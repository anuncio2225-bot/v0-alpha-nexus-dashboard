import type { CollectionClient } from "@/types";

// Formata BRL simples (sem depender de Intl no client em massa)
function brl(v: number | null | undefined): string {
  const n = Number(v) || 0;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Telefone limpo com DDI 55 (Brasil)
export function normalizePhoneBR(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
}

// Formata telefone para exibicao: (XX) XXXXX-XXXX
export function formatPhoneDisplay(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

// Formata CPF/CNPJ
export function formatDocument(doc: string | null | undefined): string | null {
  if (!doc) return null;
  const d = doc.replace(/\D/g, "");
  if (d.length === 11)
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14)
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return doc;
}

// Link de rastreio dos Correios
export function correiosTrackingUrl(code: string | null | undefined): string | null {
  if (!code) return null;
  return `https://www.linkcorreios.com.br/?id=${encodeURIComponent(code.trim())}`;
}

// Categoriza o status (manual ou Braip) em um "tom" de mensagem
type MsgKind =
  | "frustrado"
  | "negociacao"
  | "parcial"
  | "nao_responde"
  | "devolucao"
  | "padrao";

function classifyStatus(name: string | null | undefined): MsgKind {
  const s = (name || "").toLowerCase();
  if (s.includes("frustrad")) return "frustrado";
  if (s.includes("parcial")) return "parcial";
  if (s.includes("nao responde") || s.includes("não responde") || s.includes("sem resposta"))
    return "nao_responde";
  if (s.includes("negocia") || s.includes("prometeu")) return "negociacao";
  if (s.includes("devolu") || s.includes("correios") || s.includes("base"))
    return "devolucao";
  return "padrao";
}

/**
 * Monta a mensagem de WhatsApp adaptada ao status do cliente.
 * O link de pagamento e omitido quando ausente.
 */
export function buildWhatsappMessage(client: CollectionClient): string {
  const nome = client.name || "";
  const produto = [client.product_name, client.plan_name]
    .filter(Boolean)
    .join(" - ");
  const pendente = brl(client.remaining_value);
  const pago = brl(client.paid_value);
  const link = client.payment_link?.trim() || "";
  const rastreio = client.tracking_code?.trim() || "";
  const kind = classifyStatus(client.status_name || client.braip_status);

  const linkLine = link ? `\n🔗 Pague aqui: ${link}\n` : "\n";
  const prodLine = produto ? `📦 Produto: ${produto}\n` : "";

  switch (kind) {
    case "frustrado":
      return (
        `Olá ${nome}! 👋\n\n` +
        `Identificamos que houve um problema com o pagamento do seu pedido:\n\n` +
        prodLine +
        `💰 Valor: ${pendente}\n` +
        (link ? `\nGeramos um novo link de pagamento para você:\n🔗 ${link}\n` : "\n") +
        `\nSe precisar de ajuda, estamos aqui! 🙏`
      );
    case "negociacao":
      return (
        `Olá ${nome}! 👋\n\n` +
        `Passando para lembrar do combinado sobre o pagamento:\n\n` +
        prodLine +
        `💰 Valor pendente: ${pendente}\n` +
        linkLine +
        `\nEstamos à disposição! 🙏`
      );
    case "parcial":
      return (
        `Olá ${nome}! 👋\n\n` +
        `Recebemos parte do pagamento, obrigado! Falta pouco:\n\n` +
        prodLine +
        `💰 Valor já pago: ${pago}\n` +
        `💰 Saldo restante: ${pendente}\n` +
        (link ? `\n🔗 Pague o restante aqui: ${link}\n` : "\n") +
        `\nQualquer dúvida, estamos aqui! 🙏`
      );
    case "nao_responde":
      return (
        `Olá ${nome}! 👋\n\n` +
        `Tentamos entrar em contato sobre o seu pedido e não obtivemos retorno.\n\n` +
        prodLine +
        `💰 Valor pendente: ${pendente}\n` +
        linkLine +
        `\nPor favor, nos retorne quando possível! 🙏`
      );
    case "devolucao":
      return (
        `Olá ${nome}! 👋\n\n` +
        `Precisamos tratar sobre o seu pedido:\n\n` +
        prodLine +
        (rastreio ? `📦 Rastreio: ${rastreio}\n` : "") +
        `\nPor favor, entre em contato conosco para resolvermos juntos. 🙏`
      );
    default:
      return (
        `Olá ${nome}! 👋\n\n` +
        `Notamos que o pagamento do seu pedido ainda está pendente:\n\n` +
        prodLine +
        `💰 Valor: ${pendente}\n` +
        linkLine +
        `\nQualquer dúvida, estamos à disposição! 🙏`
      );
  }
}

/**
 * URL completa do WhatsApp (wa.me) com mensagem adaptada. Retorna null sem telefone.
 */
export function buildWhatsappUrl(client: CollectionClient): string | null {
  const phone = normalizePhoneBR(client.phone);
  if (!phone) return null;
  const text = encodeURIComponent(buildWhatsappMessage(client));
  return `https://wa.me/${phone}?text=${text}`;
}

// Mapa de status de entrega -> rotulo + emoji para exibicao
export function deliveryStatusLabel(status: string | null | undefined): string | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s.includes("entregue") || s.includes("delivered")) return "✅ Entregue";
  if (s.includes("saiu") || s.includes("out for delivery")) return "🏠 Saiu para entrega";
  if (s.includes("caminho") || s.includes("transito") || s.includes("transit"))
    return "🚚 A caminho";
  if (s.includes("postado") || s.includes("posted")) return "📬 Postado";
  if (s.includes("retirada") || s.includes("collection")) return "⏳ Aguardando retirada";
  if (s.includes("atraso") || s.includes("arrears")) return "⚠️ Em atraso";
  if (s.includes("frustrad") || s.includes("incorret")) return "⚠️ Entrega frustrada";
  if (s.includes("enviar") || s.includes("a enviar")) return "📤 A enviar";
  return status;
}
