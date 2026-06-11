"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, getDateRange } from "@/lib/utils";
import type { FilterPreset, DateRange } from "@/types";

interface DateFilterProps {
  value: FilterPreset;
  onChange: (value: FilterPreset) => void;
  range: DateRange;
  onRangeChange: (range: DateRange) => void;
}

const presets: { value: FilterPreset; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "7d", label: "7 dias" },
  { value: "14d", label: "14 dias" },
  { value: "30d", label: "30 dias" },
];

export function DateFilter({
  value,
  onChange,
  range,
  onRangeChange,
}: DateFilterProps) {
  const [open, setOpen] = useState(false);
  const [tempRange, setTempRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({ from: range.from, to: range.to });

  const isCustom = value === "custom";
  const customLabel = isCustom
    ? `${format(range.from, "dd/MM", { locale: ptBR })} - ${format(
        range.to,
        "dd/MM",
        { locale: ptBR }
      )}`
    : "Personalizado";

  function selectPreset(preset: FilterPreset) {
    onChange(preset);
    if (preset !== "custom") {
      onRangeChange(getDateRange(preset));
    }
  }

  function applyCustomRange() {
    if (tempRange.from && tempRange.to) {
      onChange("custom");
      onRangeChange({
        from: tempRange.from,
        to: tempRange.to,
      });
      setOpen(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
      {presets.map((preset) => (
        <Button
          key={preset.value}
          variant="ghost"
          size="sm"
          onClick={() => selectPreset(preset.value)}
          className={cn(
            "h-8 px-3 text-sm font-medium transition-colors",
            value === preset.value
              ? "bg-brand/15 text-brand hover:bg-brand/20 hover:text-brand"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {preset.label}
        </Button>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 px-3 text-sm font-medium transition-colors gap-2",
              isCustom
                ? "bg-brand/15 text-brand hover:bg-brand/20 hover:text-brand"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {customLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0 bg-card border-border"
          align="end"
        >
          <div className="p-3 border-b border-border">
            <p className="text-xs font-medium text-muted-foreground mb-1">
              De
            </p>
            <p className="text-sm text-foreground">
              {tempRange.from
                ? format(tempRange.from, "dd 'de' MMMM, yyyy", { locale: ptBR })
                : "Selecione"}
            </p>
            <p className="text-xs font-medium text-muted-foreground mb-1 mt-2">
              Ate
            </p>
            <p className="text-sm text-foreground">
              {tempRange.to
                ? format(tempRange.to, "dd 'de' MMMM, yyyy", { locale: ptBR })
                : "Selecione"}
            </p>
          </div>
          <Calendar
            mode="range"
            selected={{
              from: tempRange.from,
              to: tempRange.to,
            }}
            onSelect={(r) => {
              setTempRange({
                from: r?.from,
                to: r?.to,
              });
            }}
            numberOfMonths={2}
            locale={ptBR}
            disabled={(date) => date > new Date()}
          />
          <div className="flex items-center justify-end gap-2 p-3 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={applyCustomRange}
              disabled={!tempRange.from || !tempRange.to}
            >
              Aplicar
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
