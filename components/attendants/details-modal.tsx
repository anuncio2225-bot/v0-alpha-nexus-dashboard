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
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { SensitiveValue } from "@/components/ui/sensitive-value";
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
      </DialogContent>
    </Dialog>
  );
}
