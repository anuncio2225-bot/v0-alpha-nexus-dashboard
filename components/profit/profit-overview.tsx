"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import { formatCurrency, cn } from "@/lib/utils";
import { Building2, User, Handshake, Store, Sparkles } from "lucide-react";
import type { ProfitAnalysis } from "./types";

function Money({ value, className }: { value: number; className?: string }) {
  return (
    <SensitiveValue>
      <span className={className}>{formatCurrency(value)}</span>
    </SensitiveValue>
  );
}

export function ProfitOverview({
  data,
  isLoading,
}: {
  data?: ProfitAnalysis;
  isLoading: boolean;
}) {
  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  const {
    simulation_affiliate: sim,
    affiliate_external: aff,
    internal_operation: op,
    producer_total: prod,
    general: gen,
    distribution: dist,
  } = data;

  return (
    <div className="space-y-6">
      {/* Bloco 1 — Simulação como afiliado (discreto) */}
      <div className="rounded-xl border border-dashed border-border bg-muted/40 px-5 py-4">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Sparkles className="h-4 w-4" />
          Se fosse afiliado...
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-8 gap-y-2">
          <SimStat label="Receita" value={<Money value={sim.revenue} />} />
          <SimStat
            label="Lucro"
            value={
              <Money
                value={sim.profit}
                className={sim.profit >= 0 ? "text-emerald-500" : "text-destructive"}
              />
            }
          />
          <SimStat label="ROI" value={<span>{sim.roi.toFixed(2)}x</span>} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Simulação de referência com base nas suas vendas próprias (comissão de{" "}
          afiliado − custo dos kits − investimento em ads).
        </p>
      </div>

      {/* Bloco 2 — Três cards de lucro */}
      <div className="grid gap-4 md:grid-cols-3">
        <ProfitCard
          icon={<Handshake className="h-4 w-4" />}
          title="Lucro Afiliados"
          subtitle="Vendas de afiliados externos"
          total={aff.profit}
          footer={`${aff.sales_count} vendas`}
          rows={[
            { label: "Comissão produtor", value: aff.commission_total },
            { label: "Custo dos kits", value: -aff.kit_costs },
          ]}
        />
        <ProfitCard
          icon={<Store className="h-4 w-4" />}
          title="Lucro Operação Interna"
          subtitle="Suas vendas próprias"
          total={op.profit}
          footer={`${op.sales_count} vendas`}
          rows={[
            { label: "Vendas (líquido)", value: op.revenue },
            { label: "Custo dos kits", value: -op.kit_costs },
            { label: "Investimento ads", value: -op.ads_investment },
          ]}
        />
        <ProfitCard
          icon={<User className="h-4 w-4" />}
          title="Lucro Produtor Total"
          subtitle="Interno + afiliados"
          total={prod.total}
          footer={`${aff.sales_count + op.sales_count} vendas no total`}
          highlight
          rows={[
            { label: "Operação interna", value: prod.internal_profit },
            { label: "Afiliados", value: prod.affiliate_profit },
          ]}
        />
      </div>

      {/* Bloco 3 — Lucro Geral */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Lucro Geral
          </h3>
          <div className="mt-4 space-y-2">
            <LineRow label="Lucro Produtor Total" value={gen.producer_total} />
            <LineRow
              label="(−) Saídas do Fluxo de Caixa"
              value={-gen.cashflow_exits}
              hint="comissões, impostos, ferramentas, etc. (ads já descontado acima)"
            />
          </div>
          <Separator className="my-4" />
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-foreground">
              LUCRO GERAL
            </span>
            <Money
              value={gen.profit}
              className={cn(
                "text-2xl font-bold",
                gen.profit >= 0 ? "text-emerald-500" : "text-destructive"
              )}
            />
          </div>
        </CardContent>
      </Card>

      {/* Bloco 4 — Distribuição */}
      <Card>
        <CardContent className="p-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Distribuição de Lucro
          </h3>
          <div className="mt-4 flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Caixa Empresa ({dist.company_reserve.percent}%)
            </span>
            <Money
              value={dist.company_reserve.value}
              className="font-semibold text-foreground"
            />
          </div>
          <div className="mt-3 flex items-center justify-between px-4">
            <span className="text-sm text-muted-foreground">
              Restante para sócios
            </span>
            <Money value={dist.remaining} className="font-medium text-foreground" />
          </div>

          {dist.partners.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {dist.partners.map((p) => (
                <div
                  key={p.id}
                  className="rounded-lg border border-border p-4"
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <User className="h-4 w-4 text-brand" />
                    {p.name} ({p.percent}%)
                  </div>
                  <Money
                    value={p.value}
                    className="mt-1 block text-xl font-bold text-foreground"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Nenhum sócio cadastrado. Adicione sócios na aba Configurações.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SimStat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}

function ProfitCard({
  icon,
  title,
  subtitle,
  total,
  rows,
  footer,
  highlight,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  total: number;
  rows: { label: string; value: number }[];
  footer: string;
  highlight?: boolean;
}) {
  return (
    <Card className={cn(highlight && "border-brand/40 bg-brand/5")}>
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md",
              highlight ? "bg-brand/20 text-brand" : "bg-muted text-muted-foreground"
            )}
          >
            {icon}
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight text-foreground">
              {title}
            </p>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        <div className="mt-4 space-y-1.5">
          {rows.map((r) => (
            <div
              key={r.label}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-muted-foreground">{r.label}</span>
              <SensitiveValue>
                <span
                  className={cn(
                    r.value < 0 ? "text-destructive" : "text-foreground"
                  )}
                >
                  {r.value < 0 ? "− " : ""}
                  {formatCurrency(Math.abs(r.value))}
                </span>
              </SensitiveValue>
            </div>
          ))}
        </div>

        <Separator className="my-3" />

        <div className="mt-auto">
          <SensitiveValue>
            <span
              className={cn(
                "text-2xl font-bold",
                total >= 0 ? "text-emerald-500" : "text-destructive"
              )}
            >
              {formatCurrency(total)}
            </span>
          </SensitiveValue>
          <p className="mt-1 text-xs text-muted-foreground">{footer}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function LineRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <span className="text-sm text-foreground">{label}</span>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <SensitiveValue>
        <span
          className={cn(
            "text-sm font-medium",
            value < 0 ? "text-destructive" : "text-foreground"
          )}
        >
          {value < 0 ? "− " : ""}
          {formatCurrency(Math.abs(value))}
        </span>
      </SensitiveValue>
    </div>
  );
}
