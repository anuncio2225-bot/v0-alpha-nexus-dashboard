"use client";

import { useEffect, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import { cn, formatCurrency } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Formatação                                                                  */
/* -------------------------------------------------------------------------- */

const qtdFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
/** Quantidade: 85 · 85,5 (cenário com % gera fração de pedido). */
export const fmtQtd = (v: number) => qtdFmt.format(Number.isFinite(v) ? v : 0);
/** Percentual com até 2 casas: 15% · 5,99%. */
export const fmtPct = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? "—"
    : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(v)}%`;
export const fmtMoeda = (v: number) => formatCurrency(v);

/** "1.234,56" · "1234.56" · "12,5" → número. Vazio → null. */
export function lerNumero(texto: string): number | null {
  const t = texto.trim().replace(/[R$\s%]/g, "");
  if (!t) return null;
  // Com vírgula: ponto é milhar. Sem vírgula: ponto é decimal.
  const normal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

const editFmt = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? ""
    : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2, useGrouping: false }).format(v);

/* -------------------------------------------------------------------------- */
/* Campo de número                                                             */
/* -------------------------------------------------------------------------- */

interface CampoNumeroProps {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  prefixo?: string;
  sufixo?: string;
  dica?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Vazio vira 0 (padrão) ou fica null (campo opcional/herdado). */
  permiteVazio?: boolean;
  className?: string;
  min?: number;
  max?: number;
  ariaLabel?: string;
}

/**
 * Número em pt-BR: aceita vírgula, guarda o texto enquanto digita ("12,")
 * e só converte ao sair do campo ou a cada tecla válida.
 */
export function CampoNumero({
  label,
  value,
  onChange,
  prefixo,
  sufixo,
  dica,
  placeholder,
  disabled,
  permiteVazio,
  className,
  min,
  max,
  ariaLabel,
}: CampoNumeroProps) {
  const [texto, setTexto] = useState(editFmt(value));
  const [focado, setFocado] = useState(false);
  useEffect(() => {
    if (!focado) setTexto(editFmt(value));
  }, [value, focado]);

  const aplicar = (t: string) => {
    let n = lerNumero(t);
    if (n === null) {
      onChange(permiteVazio ? null : 0);
      return;
    }
    if (min !== undefined) n = Math.max(n, min);
    if (max !== undefined) n = Math.min(n, max);
    onChange(n);
  };

  return (
    <label className={cn("block min-w-0", className)}>
      {label && <span className="mb-1.5 block truncate text-xs text-muted-foreground">{label}</span>}
      <span
        className={cn(
          "flex h-10 items-center gap-1.5 rounded-xl border border-[var(--border-glass)] bg-[var(--input)] px-3 transition-colors focus-within:border-brand/60 focus-within:ring-2 focus-within:ring-brand/20",
          disabled && "opacity-50"
        )}
      >
        {prefixo && <span className="shrink-0 text-xs text-muted-foreground">{prefixo}</span>}
        <input
          inputMode="decimal"
          aria-label={ariaLabel ?? label}
          disabled={disabled}
          value={texto}
          placeholder={placeholder ?? "0"}
          onFocus={(e) => {
            setFocado(true);
            e.currentTarget.select();
          }}
          onBlur={() => {
            setFocado(false);
            aplicar(texto);
          }}
          onChange={(e) => {
            setTexto(e.target.value);
            if (lerNumero(e.target.value) !== null || e.target.value.trim() === "") aplicar(e.target.value);
          }}
          className="h-full w-full min-w-0 bg-transparent text-sm tabular-nums text-foreground outline-none placeholder:text-muted-foreground/50"
        />
        {sufixo && <span className="shrink-0 text-xs text-muted-foreground">{sufixo}</span>}
      </span>
      {dica && <span className="mt-1 block text-[11px] leading-snug text-muted-foreground/70">{dica}</span>}
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* Campo automático com troca manual                                           */
/* -------------------------------------------------------------------------- */

/**
 * Mostra o valor calculado; se a pessoa digitar, vira manual (marcado) e o
 * botão ↺ volta para o automático.
 */
export function CampoAuto({
  label,
  manual,
  auto,
  onChange,
  prefixo,
  sufixo,
  disabled,
  formatoAuto = (v: number) => editFmt(Math.round(v * 100) / 100),
}: {
  label: string;
  manual: number | null;
  auto: number;
  onChange: (v: number | null) => void;
  prefixo?: string;
  sufixo?: string;
  disabled?: boolean;
  formatoAuto?: (v: number) => string;
}) {
  const ehManual = manual !== null && manual !== undefined;
  return (
    <div className="min-w-0">
      <CampoNumero
        label={label}
        value={manual}
        onChange={onChange}
        permiteVazio
        prefixo={prefixo}
        sufixo={sufixo}
        disabled={disabled}
        placeholder={formatoAuto(auto)}
      />
      <div className="mt-1 flex items-center gap-2 text-[11px]">
        {ehManual ? (
          <>
            <span className="rounded-full bg-warning/15 px-1.5 py-px font-medium text-warning">manual</span>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" /> voltar ao automático ({formatoAuto(auto)})
            </button>
          </>
        ) : (
          <span className="text-muted-foreground/70">automático — digite para trocar</span>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Percentual com barra                                                        */
/* -------------------------------------------------------------------------- */

export function CampoPercentual({
  label,
  value,
  onChange,
  max = 100,
  passo = 1,
  disabled,
  dica,
  tom = "brand",
  rapidos,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  max?: number;
  passo?: number;
  disabled?: boolean;
  dica?: string;
  tom?: "brand" | "danger" | "warning" | "info";
  /** Atalhos (ex.: 10, 15, 20, 25, 30). */
  rapidos?: number[];
}) {
  const cor = { brand: "#10b981", danger: "#f43f5e", warning: "#f59e0b", info: "#60a5fa" }[tom];
  return (
    <div className={cn("min-w-0", disabled && "opacity-50")}>
      <span className="mb-1.5 block text-xs text-muted-foreground">{label}</span>
      <div className="flex items-end gap-3">
        <CampoNumero
          label=""
          ariaLabel={label}
          value={value}
          onChange={(v) => onChange(v ?? 0)}
          sufixo="%"
          min={0}
          max={100}
          disabled={disabled}
          className="w-28 shrink-0"
        />
        <div className="flex h-10 flex-1 items-center">
          <Slider
            value={[Math.min(value, max)]}
            min={0}
            max={max}
            step={passo}
            disabled={disabled}
            onValueChange={([v]) => onChange(v)}
            className="[&_[data-slot=slider-range]]:bg-[var(--cor)] [&_[data-slot=slider-thumb]]:border-[var(--cor)]"
            style={{ ["--cor" as string]: cor }}
            aria-label={label}
          />
        </div>
      </div>
      {rapidos && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {rapidos.map((r) => (
            <button
              key={r}
              type="button"
              disabled={disabled}
              onClick={() => onChange(r)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11px] tabular-nums transition-colors",
                value === r
                  ? "border-transparent text-white"
                  : "border-[var(--border-glass)] text-muted-foreground hover:text-foreground"
              )}
              style={value === r ? { background: cor } : undefined}
            >
              {r}%
            </button>
          ))}
        </div>
      )}
      {dica && <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground/70">{dica}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Seção (cartão) com liga/desliga e o custo que ela aplica                    */
/* -------------------------------------------------------------------------- */

export function Secao({
  titulo,
  descricao,
  icone,
  ativo,
  onAtivo,
  valor,
  valorRotulo,
  tomValor = "custo",
  children,
  className,
}: {
  titulo: string;
  descricao?: string;
  icone?: ReactNode;
  /** undefined = seção sem liga/desliga. */
  ativo?: boolean;
  onAtivo?: (v: boolean) => void;
  valor?: number;
  valorRotulo?: string;
  tomValor?: "custo" | "receita" | "neutro";
  children: ReactNode;
  className?: string;
}) {
  const desligado = ativo === false;
  return (
    <Card className={cn("gap-0 rounded-[18px] border-[var(--border-glass)] py-0", className)}>
      <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          {icone && (
            <span className="icon-tile mt-0.5 h-8 w-8 shrink-0" style={{ ["--tile" as string]: desligado ? "#6b7280" : "#10b981" }}>
              {icone}
            </span>
          )}
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold tracking-tight text-foreground">{titulo}</h3>
            {descricao && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{descricao}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {valor !== undefined && (
            <div className="text-right">
              {valorRotulo && <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{valorRotulo}</p>}
              <p
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  desligado
                    ? "text-muted-foreground line-through"
                    : tomValor === "custo"
                      ? valor > 0
                        ? "text-danger"
                        : "text-muted-foreground"
                      : tomValor === "receita"
                        ? "text-brand"
                        : "text-foreground"
                )}
              >
                <SensitiveValue>
                  {tomValor === "custo" && valor > 0 && !desligado ? "− " : ""}
                  {fmtMoeda(valor)}
                </SensitiveValue>
              </p>
            </div>
          )}
          {ativo !== undefined && onAtivo && (
            <Switch checked={ativo} onCheckedChange={onAtivo} aria-label={`Calcular ${titulo}`} />
          )}
        </div>
      </div>
      <div className={cn("px-4 pb-4 pt-3 sm:px-5", desligado && "pointer-events-none opacity-40")}>{children}</div>
    </Card>
  );
}

/** Linha com toggle dentro de uma seção (ex.: atendente % / fixo). */
export function LinhaToggle({
  titulo,
  ativo,
  onAtivo,
  children,
}: {
  titulo: string;
  ativo: boolean;
  onAtivo: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-glass)] bg-[var(--glass-1,transparent)] p-3">
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-foreground">{titulo}</span>
        <Switch checked={ativo} onCheckedChange={onAtivo} aria-label={titulo} />
      </label>
      <div className={cn("mt-3", !ativo && "pointer-events-none opacity-40")}>{children}</div>
    </div>
  );
}

/** Botões de escolha única no estilo pílula. */
export function Escolha<T extends string>({
  opcoes,
  valor,
  onChange,
  className,
}: {
  opcoes: { valor: T; rotulo: string }[];
  valor: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-xl border border-[var(--border-glass)] bg-[var(--input)] p-0.5", className)}>
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          onClick={() => onChange(o.valor)}
          className={cn(
            "rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors",
            valor === o.valor ? "bg-brand text-brand-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          )}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

/** Número de leitura dentro de uma seção (resultado intermediário). */
export function Leitura({
  rotulo,
  valor,
  destaque,
  tom,
}: {
  rotulo: string;
  valor: ReactNode;
  destaque?: boolean;
  tom?: "brand" | "danger" | "info" | "warning";
}) {
  const cor = tom ? { brand: "text-brand", danger: "text-danger", info: "text-info", warning: "text-warning" }[tom] : "text-foreground";
  return (
    <div className="min-w-0 rounded-xl bg-[var(--input)] px-3 py-2">
      <p className="truncate text-[11px] text-muted-foreground">{rotulo}</p>
      <p className={cn("truncate tabular-nums", destaque ? "text-base font-semibold" : "text-sm font-medium", cor)}>{valor}</p>
    </div>
  );
}
