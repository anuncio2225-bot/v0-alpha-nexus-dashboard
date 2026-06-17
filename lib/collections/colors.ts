// Paleta para badges de atendente (atribuicao deterministica por nome/indice)
const ATTENDANT_PALETTE = [
  "#22c55e", // verde
  "#3b82f6", // azul
  "#a855f7", // roxo
  "#f97316", // laranja
  "#ec4899", // rosa
  "#14b8a6", // teal
  "#eab308", // amarelo
  "#ef4444", // vermelho
  "#8b5cf6", // violeta
  "#06b6d4", // ciano
];

// Hash simples e estavel para mapear um nome a uma cor da paleta
export function attendantColor(name: string | null | undefined): string {
  if (!name) return "#6b7280";
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return ATTENDANT_PALETTE[hash % ATTENDANT_PALETTE.length];
}
