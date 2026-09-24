"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

interface SparklineProps {
  data: number[];
  color: string;
  className?: string;
  /** Mostra o ponto brilhante no último valor. */
  endDot?: boolean;
}

/**
 * Mini-gráfico de área com linha luminosa (estilo dos cartões das referências).
 * SVG puro: leve o bastante para 17 cartões na mesma tela.
 */
export function Sparkline({ data, color, className, endDot = true }: SparklineProps) {
  const id = useId().replace(/:/g, "");
  const W = 240;
  const H = 72;
  const values = data.length >= 2 ? data : [0, 0];
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => ({
    // folga nas pontas para o ponto brilhante do fim não ser cortado
    x: 2 + (i / (values.length - 1)) * (W - 14),
    // margem de 8px em cima para o brilho não cortar
    y: H - 6 - ((v - min) / span) * (H - 16),
  }));

  // Curva suave (Catmull-Rom convertido em Bézier).
  let line = `M ${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    line += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  const area = `${line} L ${pts[pts.length - 1].x},${H} L ${pts[0].x},${H} Z`;
  const last = pts[pts.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={cn("h-full w-full overflow-visible", className)} aria-hidden="true">
      <defs>
        <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`stroke-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="60%" stopColor={color} stopOpacity="0.9" />
          <stop offset="100%" stopColor={color} stopOpacity="1" />
        </linearGradient>
        <filter id={`glow-${id}`} x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path d={area} fill={`url(#fill-${id})`} />
      <path
        d={line}
        fill="none"
        stroke={`url(#stroke-${id})`}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        filter={`url(#glow-${id})`}
        pathLength={1}
        className="sparkline-draw"
      />
      {endDot && (
        <g>
          <circle cx={last.x} cy={last.y} r="7" fill={color} opacity="0.18" className="animate-pulse" />
          <circle cx={last.x} cy={last.y} r="3.2" fill="#0b0c0f" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        </g>
      )}
    </svg>
  );
}
