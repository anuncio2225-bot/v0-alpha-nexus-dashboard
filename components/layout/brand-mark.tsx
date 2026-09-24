"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Símbolo da AlphaNexus: losango de cantos suaves em verde metálico com um "A"
 * geométrico (duas hastes e a travessa) em branco. Reflexo no topo e brilho
 * embaixo, no mesmo idioma visual do painel.
 */
export function BrandMark({ className }: { className?: string }) {
  // ids únicos: se dois símbolos estão na tela e um está oculto (barra do
  // celular), o degradê do oculto não pinta o visível.
  const u = useId().replace(/:/g, "");
  return (
    <svg
      viewBox="0 0 40 40"
      className={cn("h-9 w-9 drop-shadow-[0_6px_16px_rgba(16,185,129,0.5)]", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`bm-fill-${u}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6ee7b7" />
          <stop offset="50%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#065f46" />
        </linearGradient>
        <linearGradient id={`bm-shine-${u}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`bm-letter-${u}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#d1fae5" />
        </linearGradient>
      </defs>
      {/* losango */}
      <rect x="7" y="7" width="26" height="26" rx="7" transform="rotate(45 20 20)" fill={`url(#bm-fill-${u})`} />
      {/* reflexo na metade de cima */}
      <path d="M20 3.5 L32.5 16 Q20 13.5 7.5 16 Z" fill={`url(#bm-shine-${u})`} />
      {/* "A" geométrico */}
      <path d="M13.5 26 L20 12 L26.5 26" fill="none" stroke={`url(#bm-letter-${u})`} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16.6 21.6 H23.4" stroke={`url(#bm-letter-${u})`} strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
