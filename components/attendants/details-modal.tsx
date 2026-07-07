"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import { Calculator, ChevronDown } from "lucide-react";
import type { Attendant, CommissionResult } from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface SaleRow {
  date: string;
  customer_name: string | null;
  product_name: string | null;
  sale_value: number;
  customer_paid: number;
  base_value: number;
  commission: number;
}

interface Props {
  attendant: Attendant | null;
  initialPeriod: { start: string; end: string } | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function DetailsModal({ attendant, initialPeriod, open, onOpenChange }: Props) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [showCalc, setShowCalc] = useState(false);

  const periodStart = start || initialPeriod?.start || "";
  const periodEnd = end || initialPeriod?.end || "";

  const { data, isLoading } = useSWR<CommissionResult & { sales: SaleRow[] }>(
    attendant && open && periodStart && periodEnd
      ? `/api/attendants/${attendant.id}/commission?period_start=${periodStart}&period_end=${periodEnd}`
      : null,
    fetcher
  );

  const sales = data?.sales || [];

  function fmtDate(d: string) {
    if (!d) return "-";
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vendas de {attendant?.name}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Início</Label>
            <Input
              type="date"
              value={periodStart}
              onChange={(e) => setStart(e.target.value)}
              className="bg-card-elevated border-border w-40"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Fim</Label>
            <Input
              type="date"
              value={periodEnd}
              onChange={(e) => setEnd(e.target.value)}
              className="bg-card-elevated border-border w-40"
            />
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : sales.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma venda paga neste período
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Venda</TableHead>
                  <TableHead className="text-right">Cliente pagou</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="whitespace-nowrap text-xs">{fmtDate(s.date)}</TableCell>
                    <TableCell className="max-w-[10rem] truncate">{s.customer_name || "-"}</TableCell>
                    <TableCell className="max-w-[10rem] truncate text-xs text-muted-foreground">{s.product_name || "-"}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <SensitiveValue>{formatCurrency(s.sale_value)}</SensitiveValue>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap text-xs text-muted-foreground">
                      <SensitiveValue>{formatCurrency(s.customer_paid)}</SensitiveValue>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                      <SensitiveValue>{formatCurrency(s.base_value)}</SensitiveValue>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap font-medium text-brand">
                      <SensitiveValue>{formatCurrency(s.commission)}</SensitiveValue>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {data && sales.length > 0 && (
          <div className="flex flex-wrap justify-end gap-6 border-t border-border pt-3 text-sm">
            <div>
              <span className="text-muted-foreground">Vendas: </span>
              <span className="font-semibold text-foreground">{data.total_sales}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Base total: </span>
              <span className="font-semibold text-foreground">
                <SensitiveValue>{formatCurrency(data.base_value_total)}</SensitiveValue>
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Comissão: </span>
              <span className="font-semibold text-brand">
                <SensitiveValue>{formatCurrency(data.commission_value)}</SensitiveValue>
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Total: </span>
              <span className="font-bold text-success">
                <SensitiveValue>{formatCurrency(data.total_to_pay)}</SensitiveValue>
              </span>
            </div>
          </div>
        )}

        {/* Explicação do cálculo */}
        {data && sales.length > 0 && attendant && (
          <div className="rounded-lg border border-border bg-card-elevated">
            <button
              type="button"
              onClick={() => setShowCalc((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium text-foreground"
              aria-expanded={showCalc}
            >
              <span className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-brand" />
                Como o cálculo é feito
              </span>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${
                  showCalc ? "rotate-180" : ""
                }`}
              />
            </button>

            {showCalc && (
              <div className="space-y-4 border-t border-border px-3 py-3 text-xs">
                {attendant.calc_mode === "producer" ? (
                  <CalcProducer attendant={attendant} data={data} sample={sales[0]} />
                ) : (
                  <CalcAffiliate data={data} />
                )}

                {/* Totais do período (comum aos dois modos) */}
                <div className="space-y-1.5">
                  <p className="font-semibold text-foreground">
                    3. Total do período
                  </p>
                  <CalcLine
                    label={`Base de ${data.total_sales} venda(s) somada`}
                    value={formatCurrency(data.base_value_total)}
                  />
                  <CalcLine
                    label={`Comissão = ${data.commission_tier.percent}% da base`}
                    value={formatCurrency(data.commission_value)}
                  />
                  {data.fixed_per_sale_total > 0 && (
                    <CalcLine
                      label={`Fixo por venda (${formatCurrency(
                        attendant.fixed_per_sale
                      )} × ${data.total_sales})`}
                      value={formatCurrency(data.fixed_per_sale_total)}
                    />
                  )}
                  {data.bonus_total > 0 && (
                    <CalcLine
                      label="Bônus atingidos"
                      value={formatCurrency(data.bonus_total)}
                    />
                  )}
                  <div className="mt-1 flex items-center justify-between border-t border-border pt-1.5 font-semibold text-success">
                    <span>Total a pagar</span>
                    <SensitiveValue>{formatCurrency(data.total_to_pay)}</SensitiveValue>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Linha "rótulo ........ valor" da explicação. */
function CalcLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="whitespace-nowrap font-medium text-foreground">
        <SensitiveValue>{value}</SensitiveValue>
      </span>
    </div>
  );
}

/** Explicação passo a passo do modo PRODUTOR, usando a 1ª venda como exemplo. */
function CalcProducer({
  attendant,
  data,
  sample,
}: {
  attendant: Attendant;
  data: CommissionResult;
  sample: SaleRow;
}) {
  const producerPct = attendant.producer_affiliate_percent || 0;
  const platformPct = attendant.platform_fee_percent || 0;
  const platformFixed = attendant.platform_fee_fixed || 0;
  const tierPct = data.commission_tier.percent;

  const kit = sample.sale_value;
  const asAffiliate = producerPct > 0 ? kit * (producerPct / 100) : kit;
  const afterFee = asAffiliate * (1 - platformPct / 100);
  const base = Math.max(afterFee - platformFixed, 0);
  const commission = base * (tierPct / 100);

  return (
    <>
      <div className="space-y-1.5">
        <p className="font-semibold text-foreground">
          Modo de cálculo: Produtor
        </p>
        <p className="leading-relaxed text-muted-foreground">
          Como você é o produtor, a base de comissão parte do preço do produto e
          descontam-se a sua parte de afiliado e as taxas da plataforma. Os juros
          de parcelamento que o cliente paga não entram na base.
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="font-semibold text-foreground">
          1. Base por venda (exemplo: 1ª venda da lista)
        </p>
        <CalcLine label="Preço do produto (Venda)" value={formatCurrency(kit)} />
        <CalcLine
          label={`× ${producerPct}% (sua parte de afiliado)`}
          value={formatCurrency(asAffiliate)}
        />
        <CalcLine
          label={`− ${platformPct}% (taxa % da plataforma)`}
          value={formatCurrency(afterFee)}
        />
        {platformFixed > 0 && (
          <CalcLine
            label={`− ${formatCurrency(platformFixed)} (taxa fixa da plataforma)`}
            value={formatCurrency(base)}
          />
        )}
        <div className="flex items-center justify-between gap-3 border-t border-border pt-1.5">
          <span className="font-medium text-foreground">= Base desta venda</span>
          <span className="whitespace-nowrap font-semibold text-foreground">
            <SensitiveValue>{formatCurrency(base)}</SensitiveValue>
          </span>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="font-semibold text-foreground">2. Comissão desta venda</p>
        <CalcLine
          label={`${tierPct}% (faixa atual) × base ${formatCurrency(base)}`}
          value={formatCurrency(commission)}
        />
        <p className="leading-relaxed text-muted-foreground">
          A faixa é definida pelo total de vendas do período e vale para todas as
          vendas (retroativa).
        </p>
      </div>
    </>
  );
}

/** Explicação do modo AFILIADO. */
function CalcAffiliate({ data }: { data: CommissionResult }) {
  const tierPct = data.commission_tier.percent;
  return (
    <>
      <div className="space-y-1.5">
        <p className="font-semibold text-foreground">
          Modo de cálculo: Afiliado
        </p>
        <p className="leading-relaxed text-muted-foreground">
          Aqui a base de cada venda é a comissão de afiliado que já chega
          descontada da plataforma (coluna &quot;Base&quot;). Não há desconto
          adicional de taxas.
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="font-semibold text-foreground">1 e 2. Base e comissão</p>
        <CalcLine
          label="Base = comissão de afiliado recebida por venda"
          value={formatCurrency(data.base_value_total)}
        />
        <CalcLine
          label={`Comissão = ${tierPct}% (faixa atual) da base`}
          value={formatCurrency(data.commission_value)}
        />
      </div>
    </>
  );
}
