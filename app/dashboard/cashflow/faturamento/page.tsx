"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatCurrency } from "@/lib/utils";
import {
  ArrowUpCircle,
  ArrowDownCircle,
  Receipt,
  TrendingUp,
  Check,
  Clock,
  Pencil,
} from "lucide-react";
import type { CashflowEntry } from "@/types";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import { toast } from "sonner";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const MONTH_SHORT = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
];

interface MonthlyConfig {
  id?: string;
  year: number;
  month: number;
  tax_percentage: number;
  status: "pending" | "paid";
}

interface MonthlyData {
  monthIndex: number;
  month: string;
  income: number;
  expense: number;
  taxPercent: number;
  tax: number;
  balance: number;
  status: "pending" | "paid";
}

export default function FaturamentoPage() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [editingMonth, setEditingMonth] = useState<number | null>(null);
  const [editTaxPercent, setEditTaxPercent] = useState("");

  const { data, isLoading } = useSWR<{ entries: CashflowEntry[] }>(
    "/api/cashflow",
    fetcher
  );

  const { data: settingsData } = useSWR<{
    settings: { tax_percentage?: number } | null;
  }>("/api/settings", fetcher);

  const { data: monthlyTaxData, mutate: mutateMonthlyTax } = useSWR<{ configs: MonthlyConfig[] }>(
    `/api/monthly-tax?year=${selectedYear}`,
    fetcher
  );

  const defaultTaxPercent = settingsData?.settings?.tax_percentage ?? 0;
  const monthlyConfigs = monthlyTaxData?.configs || [];
  const entries = data?.entries || [];

  // Filter by selected year - parsing direto da string para evitar timezone
  const yearEntries = useMemo(
    () =>
      entries.filter((e) => {
        const dateStr = typeof e.date === "string" ? e.date : String(e.date);
        const [datePart] = dateStr.split("T");
        const [entryYear] = datePart.split("-").map(Number);
        return String(entryYear) === selectedYear;
      }),
    [entries, selectedYear]
  );

  // Group by month with individual tax config
  const monthlyData: MonthlyData[] = useMemo(() => {
    return MONTH_NAMES.map((name, i) => {
      const monthEntries = yearEntries.filter((e) => {
        const dateStr = typeof e.date === "string" ? e.date : String(e.date);
        const [datePart] = dateStr.split("T");
        const [, entryMonth] = datePart.split("-").map(Number);
        return entryMonth - 1 === i;
      });

      const income = monthEntries
        .filter((e) => e.type === "income")
        .reduce((s, e) => s + e.amount, 0);

      const expense = monthEntries
        .filter((e) => e.type === "expense")
        .reduce((s, e) => s + e.amount, 0);

      // Get individual month config or use default
      const monthConfig = monthlyConfigs.find((c) => c.month === i + 1);
      const taxPercent = monthConfig?.tax_percentage ?? defaultTaxPercent;
      const status = monthConfig?.status ?? "pending";

      const tax = income * (taxPercent / 100);
      const balance = income - expense - tax;

      return {
        monthIndex: i,
        month: name,
        income,
        expense,
        taxPercent,
        tax,
        balance,
        status,
      };
    });
  }, [yearEntries, monthlyConfigs, defaultTaxPercent]);

  // Annual totals
  const totalIncome = monthlyData.reduce((s, m) => s + m.income, 0);
  const totalExpense = monthlyData.reduce((s, m) => s + m.expense, 0);
  const totalTax = monthlyData.reduce((s, m) => s + m.tax, 0);
  const totalProfit = monthlyData.reduce((s, m) => s + m.balance, 0);

  const years = Array.from(
    { length: 5 },
    (_, i) => (currentYear - 2 + i).toString()
  );

  async function handleSaveTaxPercent(monthIndex: number) {
    const percent = parseFloat(editTaxPercent);
    if (isNaN(percent) || percent < 0 || percent > 100) {
      toast.error("Percentual inválido (0-100)");
      return;
    }

    try {
      const res = await fetch("/api/monthly-tax", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: parseInt(selectedYear),
          month: monthIndex + 1,
          tax_percentage: percent,
        }),
      });

      if (!res.ok) throw new Error();
      toast.success(`Imposto de ${MONTH_SHORT[monthIndex]} atualizado`);
      setEditingMonth(null);
      mutateMonthlyTax();
    } catch {
      toast.error("Erro ao salvar");
    }
  }

  async function handleToggleStatus(monthIndex: number, currentStatus: "pending" | "paid") {
    const newStatus = currentStatus === "paid" ? "pending" : "paid";

    try {
      const res = await fetch("/api/monthly-tax", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: parseInt(selectedYear),
          month: monthIndex + 1,
          status: newStatus,
        }),
      });

      if (!res.ok) throw new Error();
      toast.success(
        newStatus === "paid"
          ? `${MONTH_SHORT[monthIndex]} marcado como pago`
          : `${MONTH_SHORT[monthIndex]} marcado como pendente`
      );
      mutateMonthlyTax();
    } catch {
      toast.error("Erro ao atualizar status");
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-heading">
            Faturamento Total
          </h1>
          <p className="text-sm text-muted-foreground">
            Resumo analítico baseado no fluxo de caixa
          </p>
        </div>
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-[100px] bg-card-elevated border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={y}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Annual Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="bg-card border-border">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/20">
              <ArrowUpCircle className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                Entrada total {selectedYear}
              </p>
              <p className="metric-sm text-success">
                <SensitiveValue>{formatCurrency(totalIncome)}</SensitiveValue>
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-danger/20">
              <ArrowDownCircle className="h-5 w-5 text-danger" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                Saída total {selectedYear}
              </p>
              <p className="metric-sm text-danger">
                <SensitiveValue>{formatCurrency(totalExpense)}</SensitiveValue>
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/20">
              <Receipt className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                Imposto total {selectedYear}
              </p>
              <p className="metric-sm text-warning">
                <SensitiveValue>{formatCurrency(totalTax)}</SensitiveValue>
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="flex items-center gap-4 p-4">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg",
                totalProfit >= 0 ? "bg-brand/20" : "bg-danger/20"
              )}
            >
              <TrendingUp
                className={cn(
                  "h-5 w-5",
                  totalProfit >= 0 ? "text-brand" : "text-danger"
                )}
              />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                Lucro líquido {selectedYear}
              </p>
              <p
                className={cn(
                  "metric-sm",
                  totalProfit >= 0 ? "text-brand" : "text-danger"
                )}
              >
                <SensitiveValue>{formatCurrency(totalProfit)}</SensitiveValue>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Table */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Detalhamento Mensal - {selectedYear}
            </CardTitle>
            <Badge variant="outline" className="text-muted-foreground">
              Padrão: {defaultTaxPercent}%
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Mês</TableHead>
                  <TableHead className="text-right">Entradas</TableHead>
                  <TableHead className="text-right">Saídas</TableHead>
                  <TableHead className="text-center">% Imposto</TableHead>
                  <TableHead className="text-right">Imposto</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyData.map((row) => {
                  const hasData = row.income > 0 || row.expense > 0;
                  const isEditing = editingMonth === row.monthIndex;
                  
                  return (
                    <TableRow
                      key={row.month}
                      className={cn(
                        "border-border",
                        !hasData && "opacity-40"
                      )}
                    >
                      <TableCell className="font-medium">
                        {MONTH_SHORT[row.monthIndex]}
                      </TableCell>
                      <TableCell className="text-right text-success">
                        {hasData ? (
                          <SensitiveValue>{formatCurrency(row.income)}</SensitiveValue>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-right text-danger">
                        {hasData ? (
                          <SensitiveValue>{formatCurrency(row.expense)}</SensitiveValue>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {isEditing ? (
                          <div className="flex items-center justify-center gap-1">
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              max="100"
                              className="w-16 h-7 text-center text-xs"
                              value={editTaxPercent}
                              onChange={(e) => setEditTaxPercent(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveTaxPercent(row.monthIndex);
                                if (e.key === "Escape") setEditingMonth(null);
                              }}
                              autoFocus
                            />
                            <span className="text-xs">%</span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              onClick={() => handleSaveTaxPercent(row.monthIndex)}
                            >
                              <Check className="h-3 w-3 text-success" />
                            </Button>
                          </div>
                        ) : (
                          <button
                            className="inline-flex items-center gap-1 text-xs hover:text-brand transition-colors"
                            onClick={() => {
                              setEditingMonth(row.monthIndex);
                              setEditTaxPercent(String(row.taxPercent));
                            }}
                          >
                            {row.taxPercent}%
                            <Pencil className="h-3 w-3 opacity-50" />
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-warning">
                        {hasData ? (
                          <SensitiveValue>{formatCurrency(row.tax)}</SensitiveValue>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium",
                          row.balance >= 0 ? "text-success" : "text-danger"
                        )}
                      >
                        {hasData ? (
                          <SensitiveValue>{formatCurrency(row.balance)}</SensitiveValue>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {hasData ? (
                          <button
                            onClick={() => handleToggleStatus(row.monthIndex, row.status)}
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors",
                              row.status === "paid"
                                ? "bg-success/20 text-success hover:bg-success/30"
                                : "bg-warning/20 text-warning hover:bg-warning/30"
                            )}
                          >
                            {row.status === "paid" ? (
                              <>
                                <Check className="h-3 w-3" />
                                Pago
                              </>
                            ) : (
                              <>
                                <Clock className="h-3 w-3" />
                                Pendente
                              </>
                            )}
                          </button>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {/* Total Row */}
                <TableRow className="border-border border-t-2 font-bold bg-muted/30">
                  <TableCell className="font-bold">TOTAL</TableCell>
                  <TableCell className="text-right text-success font-bold">
                    <SensitiveValue>{formatCurrency(totalIncome)}</SensitiveValue>
                  </TableCell>
                  <TableCell className="text-right text-danger font-bold">
                    <SensitiveValue>{formatCurrency(totalExpense)}</SensitiveValue>
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    -
                  </TableCell>
                  <TableCell className="text-right text-warning font-bold">
                    <SensitiveValue>{formatCurrency(totalTax)}</SensitiveValue>
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-bold",
                      totalProfit >= 0 ? "text-success" : "text-danger"
                    )}
                  >
                    <SensitiveValue>{formatCurrency(totalProfit)}</SensitiveValue>
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    -
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
