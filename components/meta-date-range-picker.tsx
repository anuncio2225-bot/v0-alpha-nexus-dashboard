"use client";

import { useState, useMemo } from "react";
import { DateRange } from "react-day-picker";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface DateRangeValue {
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
}

interface Props {
  value: DateRangeValue;
  onChange: (range: DateRangeValue) => void;
  disabled?: boolean;
  /** Exibe o intervalo como label no trigger */
  className?: string;
}

// Formata YYYY-MM-DD para dd/MM/yyyy (exibicao)
function fmtDisplay(date: string) {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

// Date -> YYYY-MM-DD no fuso local (America/Sao_Paulo)
function toLocalYMD(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

const SHORTCUTS = [
  { label: "Hoje", resolve: () => { const t = new Date(); return { since: toLocalYMD(t), until: toLocalYMD(t) }; } },
  { label: "Ontem", resolve: () => { const t = subDays(new Date(), 1); return { since: toLocalYMD(t), until: toLocalYMD(t) }; } },
  { label: "Ultimos 7 dias", resolve: () => ({ since: toLocalYMD(subDays(new Date(), 6)), until: toLocalYMD(new Date()) }) },
  { label: "Ultimos 14 dias", resolve: () => ({ since: toLocalYMD(subDays(new Date(), 13)), until: toLocalYMD(new Date()) }) },
  { label: "Ultimos 30 dias", resolve: () => ({ since: toLocalYMD(subDays(new Date(), 29)), until: toLocalYMD(new Date()) }) },
  { label: "Ultimos 60 dias", resolve: () => ({ since: toLocalYMD(subDays(new Date(), 59)), until: toLocalYMD(new Date()) }) },
  { label: "Ultimos 90 dias", resolve: () => ({ since: toLocalYMD(subDays(new Date(), 89)), until: toLocalYMD(new Date()) }) },
  { label: "Esta semana", resolve: () => ({ since: toLocalYMD(startOfWeek(new Date(), { weekStartsOn: 1 })), until: toLocalYMD(endOfWeek(new Date(), { weekStartsOn: 1 })) }) },
  { label: "Semana passada", resolve: () => { const last = subDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 1); return { since: toLocalYMD(startOfWeek(last, { weekStartsOn: 1 })), until: toLocalYMD(endOfWeek(last, { weekStartsOn: 1 })) }; } },
  { label: "Este mes", resolve: () => ({ since: toLocalYMD(startOfMonth(new Date())), until: toLocalYMD(new Date()) }) },
  { label: "Mes passado", resolve: () => { const last = subMonths(new Date(), 1); return { since: toLocalYMD(startOfMonth(last)), until: toLocalYMD(endOfMonth(last)) }; } },
];

export function MetaDateRangePicker({ value, onChange, disabled, className }: Props) {
  const [open, setOpen] = useState(false);
  // range interno do calendario (pode estar incompleto enquanto usuario seleciona)
  const [calRange, setCalRange] = useState<DateRange | undefined>({
    from: new Date(`${value.since}T12:00:00`),
    to: new Date(`${value.until}T12:00:00`),
  });
  // qual atalho esta selecionado (para highlight visual)
  const [activeShortcut, setActiveShortcut] = useState<string | null>("Este mes");

  // Meses dos ultimos 12 para atalhos adicionais
  const pastMonths = useMemo(() => {
    const now = new Date();
    const result: { label: string; since: string; until: string }[] = [];
    for (let i = 2; i <= 12; i++) {
      const d = subMonths(now, i);
      result.push({
        label: format(d, "MMMM 'de' yyyy", { locale: ptBR }),
        since: toLocalYMD(startOfMonth(d)),
        until: toLocalYMD(endOfMonth(d)),
      });
    }
    return result;
  }, []);

  function applyRange(since: string, until: string, shortcutLabel?: string) {
    onChange({ since, until });
    setCalRange({
      from: new Date(`${since}T12:00:00`),
      to: new Date(`${until}T12:00:00`),
    });
    setActiveShortcut(shortcutLabel ?? null);
  }

  function handleCalendarSelect(range: DateRange | undefined) {
    setCalRange(range);
    setActiveShortcut(null);
    // Fecha e aplica somente quando ambas as datas estao definidas
    if (range?.from && range?.to) {
      const since = toLocalYMD(range.from);
      const until = toLocalYMD(range.to);
      // Garante since <= until
      if (since <= until) {
        onChange({ since, until });
      } else {
        onChange({ since: until, until: since });
      }
    }
  }

  const label = `${fmtDisplay(value.since)} – ${fmtDisplay(value.until)}`;
  const isSameDay = value.since === value.until;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(
            "h-9 justify-start gap-2 bg-card border-border font-normal",
            className
          )}
        >
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm">
            {isSameDay ? fmtDisplay(value.since) : label}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 bg-card border-border"
        align="end"
        sideOffset={8}
      >
        <div className="flex">
          {/* Coluna de atalhos */}
          <div className="flex flex-col gap-0.5 border-r border-border p-3 min-w-[160px]">
            <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Atalhos
            </p>
            {SHORTCUTS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => {
                  const range = s.resolve();
                  applyRange(range.since, range.until, s.label);
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                  activeShortcut === s.label
                    ? "bg-brand/10 text-brand font-medium"
                    : "text-foreground"
                )}
              >
                {activeShortcut === s.label && (
                  <ChevronRight className="h-3 w-3 shrink-0" />
                )}
                {s.label}
              </button>
            ))}
            <div className="my-1 border-t border-border" />
            <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Meses anteriores
            </p>
            {pastMonths.map((m) => (
              <button
                key={m.since}
                type="button"
                onClick={() => {
                  applyRange(m.since, m.until, m.label);
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted capitalize",
                  activeShortcut === m.label
                    ? "bg-brand/10 text-brand font-medium"
                    : "text-foreground"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Calendario de intervalo */}
          <div className="p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Intervalo personalizado
            </p>
            <Calendar
              mode="range"
              selected={calRange}
              onSelect={handleCalendarSelect}
              numberOfMonths={2}
              disabled={{ after: new Date() }}
              locale={ptBR}
              captionLayout="label"
              className="p-0"
            />
            {/* Label do intervalo selecionado */}
            <div className="mt-3 flex items-center justify-between gap-4 border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">
                {calRange?.from && calRange?.to
                  ? `${format(calRange.from, "dd/MM/yyyy")} – ${format(calRange.to, "dd/MM/yyyy")}`
                  : calRange?.from
                  ? `${format(calRange.from, "dd/MM/yyyy")} → escolha a data final`
                  : "Clique para selecionar o inicio"}
              </span>
              <Button
                size="sm"
                disabled={!calRange?.from || !calRange?.to}
                onClick={() => setOpen(false)}
                className="bg-brand hover:bg-brand/90 h-7 px-3 text-xs"
              >
                Aplicar
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
