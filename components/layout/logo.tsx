import { cn } from "@/lib/utils";

/**
 * Logotipo oficial da AlphaNexus: "Alpha" no verde da marca + "Nexus" na cor do
 * texto, na fonte Syne. É identidade da empresa — não redesenhar.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("font-logo font-bold tracking-tight whitespace-nowrap", className)}>
      <span className="text-brand">Alpha</span>
      <span className="text-foreground">Nexus</span>
    </span>
  );
}
