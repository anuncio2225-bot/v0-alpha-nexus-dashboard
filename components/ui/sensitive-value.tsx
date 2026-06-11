"use client";

import { useHideValues } from "@/contexts/hide-values-context";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface SensitiveValueProps {
  children: ReactNode;
  className?: string;
  /** Force show even when global hidden is true (for editable inputs) */
  forceShow?: boolean;
}

/**
 * Wraps financial values with a visual blur layer when hidden.
 * IMPORTANT: Does NOT change the text/content - only applies CSS filter.
 * This preserves layout, width, alignment, and font sizing.
 */
export function SensitiveValue({
  children,
  className,
  forceShow = false,
}: SensitiveValueProps) {
  const { hidden } = useHideValues();
  const shouldBlur = hidden && !forceShow;

  return (
    <span
      className={cn(
        "inline-block transition-[filter] duration-200 ease-out",
        shouldBlur && "blur-[6px] select-none pointer-events-none",
        className
      )}
      aria-hidden={shouldBlur}
    >
      {children}
    </span>
  );
}
