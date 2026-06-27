"use client";

import { Check, ChevronsUpDown, ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { OperationalMode } from "@/types";

const ALL_MODES: { value: OperationalMode; label: string }[] = [
  { value: "afterpay", label: "Afterpay (Pós-Pago)" },
  { value: "antecipado", label: "Antecipado" },
  { value: "recuperacao", label: "Recuperação" },
];

interface ModeMultiSelectProps {
  selected: OperationalMode[];
  onChange: (modes: OperationalMode[]) => void;
}

export function ModeMultiSelect({ selected, onChange }: ModeMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const isAll = selected.length === 0;

  const triggerLabel = isAll
    ? "Todas as modalidades"
    : selected.length === ALL_MODES.length
      ? "Todas as modalidades"
      : selected.length === 1
        ? ALL_MODES.find((m) => m.value === selected[0])?.label ?? "1 modalidade"
        : `${selected.length} modalidades`;

  function toggle(mode: OperationalMode) {
    if (selected.includes(mode)) {
      onChange(selected.filter((m) => m !== mode));
    } else {
      onChange([...selected, mode]);
    }
  }

  function toggleAll() {
    onChange([]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full sm:w-[220px] justify-between bg-card border-border"
        >
          <span className="flex items-center gap-2 min-w-0">
            <ArrowRightLeft className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="truncate text-sm">{triggerLabel}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[260px] p-0 bg-card border-border"
        align="end"
      >
        {/* Todas as modalidades */}
        <button
          type="button"
          onClick={toggleAll}
          className="flex items-center gap-3 w-full px-3 py-2.5 border-b border-border hover:bg-muted/40 transition-colors text-left"
        >
          <Checkbox
            checked={isAll}
            onCheckedChange={toggleAll}
            className="pointer-events-none"
          />
          <span className="text-sm font-medium text-foreground flex-1">
            Todas as modalidades
          </span>
          {isAll && <Check className="h-4 w-4 text-brand" />}
        </button>

        {/* Lista de modos */}
        <div className="py-1">
          {ALL_MODES.map((m) => {
            const isSelected = selected.includes(m.value);
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => toggle(m.value)}
                className={cn(
                  "flex items-center gap-3 w-full px-3 py-2.5 hover:bg-muted/40 transition-colors text-left",
                  isSelected && "bg-brand/5"
                )}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggle(m.value)}
                  className="pointer-events-none"
                />
                <span className="text-sm text-foreground flex-1">{m.label}</span>
                {isSelected && <Check className="h-4 w-4 text-brand" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
