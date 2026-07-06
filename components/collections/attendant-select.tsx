"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { AttendantBadge } from "./attendant-badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface AttendantOption {
  id: string | null;
  name: string;
}

interface AttendantSelectProps {
  clientId: string;
  currentName: string | null | undefined;
  attendants: AttendantOption[];
  onChanged?: () => void;
  className?: string;
}

// Campo de atendente editável usado na Cobrança (tabela CRM e drawer).
// Mostra o atendente atual como badge; ao clicar abre um dropdown com todas as
// atendentes CADASTRADAS (que possuem id) para (re)atribuição.
export function AttendantSelect({
  clientId,
  currentName,
  attendants,
  onChanged,
  className,
}: AttendantSelectProps) {
  const [saving, setSaving] = useState(false);
  // Só atendentes cadastradas (com id) podem ser atribuídas — a atribuição
  // precisa vincular attendant_id para refletir no cálculo de comissão.
  const options = attendants.filter((a) => a.id);

  async function assign(attendantId: string) {
    const att = options.find((a) => a.id === attendantId);
    if (!att || !att.id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/collections/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendant_id: att.id,
          attendant_name: att.name,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Atendente atribuído: ${att.name}`);
      onChanged?.();
    } catch {
      toast.error("Erro ao atribuir atendente");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Select value="" onValueChange={assign} disabled={saving}>
      <SelectTrigger
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "h-auto w-auto gap-1.5 border-0 bg-transparent p-0 shadow-none focus:ring-0 focus:ring-offset-0 [&>svg]:hidden hover:opacity-80",
          className
        )}
        aria-label="Atribuir atendente"
      >
        {currentName ? (
          <AttendantBadge name={currentName} />
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-brand hover:text-brand">
            — Atribuir
          </span>
        )}
      </SelectTrigger>
      <SelectContent onClick={(e) => e.stopPropagation()}>
        {options.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            Nenhuma atendente cadastrada
          </div>
        ) : (
          options.map((a) => (
            <SelectItem key={a.id as string} value={a.id as string}>
              {a.name}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
