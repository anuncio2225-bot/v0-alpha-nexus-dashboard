"use client";

import React, { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type GlowColor = "brand" | "success" | "warning" | "danger" | "neutral";

interface GlowCardProps {
  children: ReactNode;
  className?: string;
  glowColor?: GlowColor;
}

/**
 * Hue/saturation/lightness presets mapped to the dashboard's semantic colors.
 * Kept in HSL so the spotlight gradient can interpolate smoothly. We avoid
 * purple/violet per design guidelines.
 */
const glowColorMap: Record<
  GlowColor,
  { hue: number; saturation: number; lightness: number }
> = {
  brand: { hue: 199, saturation: 89, lightness: 55 }, // teal/blue brand
  success: { hue: 142, saturation: 71, lightness: 45 },
  warning: { hue: 38, saturation: 92, lightness: 50 },
  danger: { hue: 0, saturation: 84, lightness: 60 },
  neutral: { hue: 199, saturation: 20, lightness: 60 },
};

/**
 * A single shared pointer listener updates CSS variables on <html>. Because the
 * spotlight gradients use `background-attachment: fixed`, every card can read
 * the same viewport-relative coordinates. This keeps the effect coherent across
 * the whole grid while registering only ONE listener regardless of how many
 * cards are mounted (important: the dashboard renders 15+ of them).
 */
let activeCards = 0;
let pointerListener: ((e: PointerEvent) => void) | null = null;

function ensureGlobalPointerListener() {
  activeCards += 1;
  if (pointerListener) return;

  pointerListener = (e: PointerEvent) => {
    const root = document.documentElement;
    root.style.setProperty("--glow-x", `${e.clientX.toFixed(1)}`);
    root.style.setProperty("--glow-y", `${e.clientY.toFixed(1)}`);
  };
  document.addEventListener("pointermove", pointerListener, { passive: true });
}

function releaseGlobalPointerListener() {
  activeCards -= 1;
  if (activeCards <= 0 && pointerListener) {
    document.removeEventListener("pointermove", pointerListener);
    pointerListener = null;
    activeCards = 0;
  }
}

const spotlightStyles = `
  [data-glow-card] {
    --glow-spot: 280px;
    --glow-border: 1.5px;
    position: relative;
    isolation: isolate;
  }
  [data-glow-card]::before,
  [data-glow-card]::after {
    pointer-events: none;
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background-attachment: fixed;
    background-repeat: no-repeat;
    background-position: 50% 50%;
    transition: opacity 0.3s ease;
  }
  /* Soft inner spotlight fill */
  [data-glow-card]::before {
    background-image: radial-gradient(
      var(--glow-spot) var(--glow-spot) at
      calc(var(--glow-x, -9999) * 1px)
      calc(var(--glow-y, -9999) * 1px),
      hsl(var(--glow-hue) calc(var(--glow-sat) * 1%) calc(var(--glow-light) * 1%) / 0.10),
      transparent 70%
    );
    z-index: -1;
  }
  /* Bright following border */
  [data-glow-card]::after {
    padding: var(--glow-border);
    background-image: radial-gradient(
      calc(var(--glow-spot) * 0.8) calc(var(--glow-spot) * 0.8) at
      calc(var(--glow-x, -9999) * 1px)
      calc(var(--glow-y, -9999) * 1px),
      hsl(var(--glow-hue) calc(var(--glow-sat) * 1%) calc(var(--glow-light) * 1%) / 0.9),
      transparent 60%
    );
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    mask-composite: exclude;
    z-index: 1;
  }
  @media (prefers-reduced-motion: reduce) {
    [data-glow-card]::before,
    [data-glow-card]::after { display: none; }
  }
`;

let stylesInjected = false;

export function GlowCard({
  children,
  className,
  glowColor = "brand",
}: GlowCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Inject shared keyframe/pseudo styles once.
    if (!stylesInjected) {
      const styleTag = document.createElement("style");
      styleTag.setAttribute("data-glow-styles", "");
      styleTag.innerHTML = spotlightStyles;
      document.head.appendChild(styleTag);
      stylesInjected = true;
    }

    ensureGlobalPointerListener();
    return () => releaseGlobalPointerListener();
  }, []);

  const { hue, saturation, lightness } = glowColorMap[glowColor];

  return (
    <div
      ref={ref}
      data-glow-card
      style={
        {
          "--glow-hue": hue,
          "--glow-sat": saturation,
          "--glow-light": lightness,
        } as React.CSSProperties
      }
      className={cn("rounded-xl", className)}
    >
      {children}
    </div>
  );
}
