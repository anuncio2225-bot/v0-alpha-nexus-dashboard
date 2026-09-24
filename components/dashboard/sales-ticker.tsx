"use client";

import useSWR from "swr";
import { formatCurrency, cn } from "@/lib/utils";
import { SensitiveValue } from "@/components/ui/sensitive-value";

interface TickerItem {
  id: string;
  product: string;
  value: number;
  status: string | null;
  gateway: string | null;
  at: string | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Cor e rótulo por status (mesmos status que o webhook grava).
const STATUS: Record<string, { label: string; dot: string; text: string }> = {
  pago: { label: "Pago", dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]", text: "text-emerald-400" },
  agendado: { label: "Agendado", dot: "bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.9)]", text: "text-sky-400" },
  aguardando: { label: "Aguardando", dot: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]", text: "text-amber-400" },
  cancelado: { label: "Cancelado", dot: "bg-zinc-500", text: "text-zinc-400" },
  frustrado: { label: "Frustrado", dot: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)]", text: "text-rose-400" },
  devolvido: { label: "Devolvido", dot: "bg-rose-500", text: "text-rose-400" },
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}

/**
 * Faixa de vendas recentes correndo no topo do painel — o equivalente, para a
 * operação, da faixa de cotações das referências. Pausa ao passar o mouse.
 */
export function SalesTicker() {
  const { data } = useSWR<{ items: TickerItem[] }>("/api/dashboard/ticker", fetcher, {
    refreshInterval: 60000,
  });
  const items = data?.items ?? [];
  if (items.length === 0) return null;

  // Duplica a lista para o laço ficar contínuo (a animação anda 50%).
  const loop = [...items, ...items];

  return (
    <div className="marquee surface overflow-hidden rounded-2xl border border-[var(--border-glass)] bg-card/60 py-2.5">
      <div className="marquee-track" style={{ ["--marquee-duration" as string]: `${Math.max(30, items.length * 5)}s` }}>
        {loop.map((it, i) => {
          const s = STATUS[it.status ?? ""] ?? { label: it.status ?? "—", dot: "bg-zinc-500", text: "text-zinc-400" };
          return (
            <div key={`${it.id}-${i}`} className="flex shrink-0 items-center gap-2.5 px-5 text-[13px]">
              <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
              <span className="max-w-[200px] truncate font-medium text-foreground/90">{it.product}</span>
              <span className="tabular-nums text-foreground">
                <SensitiveValue>{formatCurrency(it.value)}</SensitiveValue>
              </span>
              <span className={cn("text-xs", s.text)}>{s.label}</span>
              <span className="text-xs text-muted-foreground/60">{timeAgo(it.at)}</span>
              <span className="ml-3 h-3 w-px bg-white/10" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
