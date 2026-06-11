"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import {
  Plus,
  ArrowUpCircle,
  ArrowDownCircle,
  Trash2,
  Receipt,
  Percent,
  Pencil,
} from "lucide-react";
import {
  CASHFLOW_PAYMENT_METHODS,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
} from "@/types";
import type { CashflowEntry } from "@/types";
import { SensitiveValue } from "@/components/ui/sensitive-value";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const MONTHS = [
  "Todos",
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

export default function CashflowPage() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entryType, setEntryType] = useState<"income" | "expense">("income");
  const [filterMonth, setFilterMonth] = useState("Todos");
  const [filterYear, setFilterYear] = useState(
    new Date().getFullYear().toString()
  );
  
  // Estado para edição
  const [editingEntry, setEditingEntry] = useState<CashflowEntry | null>(null);
  const [editForm, setEditForm] = useState({
    type: "income" as "income" | "expense",
    category: "",
    description: "",
    amount: "",
    date: "",
    payment_method: "pix",
    notes: "",
  });

  // Tax percentage from settings
  const { data: settingsData, mutate: mutateSettings } = useSWR<{
    settings: { tax_percentage?: number } | null;
  }>("/api/settings", fetcher);

  const taxPercent = settingsData?.settings?.tax_percentage ?? 0;
  const [localTax, setLocalTax] = useState<string | null>(null);

  const displayTax = localTax !== null ? localTax : String(taxPercent);

  const categoryOptions =
    entryType === "income"
      ? DEFAULT_INCOME_CATEGORIES
      : DEFAULT_EXPENSE_CATEGORIES;

  const { data, mutate, isLoading } = useSWR<{ entries: CashflowEntry[] }>(
    "/api/cashflow",
    fetcher
  );

  const entries = data?.entries || [];

  // Filter entries by month/year - usando parsing direto da string para evitar timezone
  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      // Extrair ano e mês diretamente da string YYYY-MM-DD
      const dateStr = typeof e.date === "string" ? e.date : String(e.date);
      const [datePart] = dateStr.split("T");
      const [year, month] = datePart.split("-").map(Number);
      
      if (String(year) !== filterYear) return false;
      if (filterMonth !== "Todos") {
        const monthIdx = MONTHS.indexOf(filterMonth) - 1;
        if (month - 1 !== monthIdx) return false;
      }
      return true;
    });
  }, [entries, filterMonth, filterYear]);

  // Calculations - SEMPRE calcula imposto dinamicamente como (entradas × percentual)
  const { income, expense, calculatedTax, netBalance } = useMemo(() => {
    const inc = filteredEntries
      .filter((e) => e.type === "income")
      .reduce((sum, e) => sum + e.amount, 0);
    
    const exp = filteredEntries
      .filter((e) => e.type === "expense")
      .reduce((sum, e) => sum + e.amount, 0);

    // Imposto SEMPRE calculado dinamicamente: entradas × percentual configurado
    const calcTax = inc * (parseFloat(displayTax) / 100);

    const net = inc - exp - calcTax;

    return {
      income: inc,
      expense: exp,
      calculatedTax: calcTax,
      netBalance: net,
    };
  }, [filteredEntries, displayTax]);

  async function saveTax() {
    if (localTax === null) return;
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tax_percentage: parseFloat(localTax) || 0 }),
      });
      mutateSettings();
      toast.success("Imposto atualizado");
    } catch {
      toast.error("Erro ao salvar imposto");
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const payload = {
      type: formData.get("type"),
      category: formData.get("category"),
      description: formData.get("description") || null,
      amount: parseFloat(formData.get("amount") as string) || 0,
      date: formData.get("date") || new Date().toISOString(),
      payment_method: formData.get("payment_method") || "pix",
      notes: formData.get("notes") || null,
    };
    try {
      const res = await fetch("/api/cashflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      toast.success("Lançamento criado");
      setOpen(false);
      mutate();
    } catch {
      toast.error("Erro ao criar lançamento");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este lançamento?")) return;
    try {
      await fetch(`/api/cashflow?id=${id}`, { method: "DELETE" });
      toast.success("Lançamento excluído");
      mutate();
    } catch {
      toast.error("Erro ao excluir");
    }
  }

  function openEditModal(entry: CashflowEntry) {
    // Extrair apenas a parte da data (YYYY-MM-DD) sem conversão de timezone
    const dateStr = typeof entry.date === "string" 
      ? entry.date.split("T")[0] 
      : entry.date;
    
    setEditForm({
      type: entry.type,
      category: entry.category,
      description: entry.description || "",
      amount: String(entry.amount),
      date: dateStr,
      payment_method: (entry as CashflowEntry & { payment_method?: string }).payment_method || "pix",
      notes: (entry as CashflowEntry & { notes?: string }).notes || "",
    });
    setEditingEntry(entry);
  }

  async function handleEditSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingEntry) return;
    setLoading(true);

    try {
      const res = await fetch("/api/cashflow", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingEntry.id,
          type: editForm.type,
          category: editForm.category,
          description: editForm.description || null,
          amount: parseFloat(editForm.amount) || 0,
          date: editForm.date, // Salvar como string YYYY-MM-DD
          payment_method: editForm.payment_method,
          notes: editForm.notes || null,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Lançamento atualizado");
      setEditingEntry(null);
      mutate();
    } catch {
      toast.error("Erro ao atualizar lançamento");
    } finally {
      setLoading(false);
    }
  }

  const years = Array.from(
    { length: 5 },
    (_, i) => (new Date().getFullYear() - 1 + i).toString()
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-heading">
            Fluxo de Caixa
          </h1>
          <p className="text-sm text-muted-foreground">
            Controle financeiro manual - independente dos webhooks
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Date filters */}
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="w-[130px] bg-card-elevated border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="w-[90px] bg-card-elevated border-border">
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
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-brand hover:bg-brand/90">
                <Plus className="mr-2 h-4 w-4" />
                Novo
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>Novo Lançamento</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select
                      name="type"
                      defaultValue="income"
                      onValueChange={(v) =>
                        setEntryType(v as "income" | "expense")
                      }
                    >
                      <SelectTrigger className="bg-card-elevated border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="income">
                          <span className="flex items-center gap-2">
                            <ArrowUpCircle className="h-4 w-4 text-success" />
                            Entrada
                          </span>
                        </SelectItem>
                        <SelectItem value="expense">
                          <span className="flex items-center gap-2">
                            <ArrowDownCircle className="h-4 w-4 text-danger" />
                            Saída
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Select
                      name="category"
                      defaultValue={categoryOptions[0]}
                    >
                      <SelectTrigger className="bg-card-elevated border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categoryOptions.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Input
                    name="description"
                    placeholder="Descrição do lançamento"
                    className="bg-card-elevated border-border"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Valor (R$)</Label>
                    <Input
                      name="amount"
                      type="number"
                      step="0.01"
                      required
                      className="bg-card-elevated border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Pagamento</Label>
                    <Select name="payment_method" defaultValue="pix">
                      <SelectTrigger className="bg-card-elevated border-border">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CASHFLOW_PAYMENT_METHODS.map((pm) => (
                          <SelectItem key={pm.value} value={pm.value}>
                            {pm.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Input
                    name="date"
                    type="date"
                    defaultValue={new Date().toISOString().split("T")[0]}
                    className="bg-card-elevated border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Observações (opcional)</Label>
                  <Textarea
                    name="notes"
                    placeholder="Observações adicionais..."
                    rows={2}
                    className="bg-card-elevated border-border resize-none"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setOpen(false)}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="bg-brand hover:bg-brand/90"
                  >
                    {loading ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tax Configuration */}
      <Card className="bg-card border-border">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/20">
            <Percent className="h-5 w-5 text-warning" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Imposto sobre entradas</p>
            <p className="text-xs text-muted-foreground">
              Define a % de imposto aplicada automaticamente sobre as entradas
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={displayTax}
              onChange={(e) => setLocalTax(e.target.value)}
              className="w-20 bg-card-elevated border-border text-center"
            />
            <span className="text-sm text-muted-foreground">%</span>
            {localTax !== null && localTax !== String(taxPercent) && (
              <Button
                size="sm"
                onClick={saveTax}
                className="bg-brand hover:bg-brand/90"
              >
                Salvar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="bg-card border-border">
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/20">
              <ArrowUpCircle className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Entradas</p>
              <p className="metric-sm text-success">
                <SensitiveValue>{formatCurrency(income)}</SensitiveValue>
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
              <p className="text-sm text-muted-foreground">Saídas</p>
              <p className="metric-sm text-danger">
                <SensitiveValue>{formatCurrency(expense)}</SensitiveValue>
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
              <p className="text-sm text-muted-foreground">Imposto</p>
              <p className="metric-sm text-warning">
                <SensitiveValue>{formatCurrency(calculatedTax)}</SensitiveValue>
              </p>
              <p className="text-xs text-muted-foreground">
                {displayTax}% sobre entradas
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="flex items-center gap-4 p-4">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg",
                netBalance >= 0 ? "bg-brand/20" : "bg-danger/20"
              )}
            >
              <span
                className={cn(
                  "text-lg font-bold",
                  netBalance >= 0 ? "text-brand" : "text-danger"
                )}
              >
                =
              </span>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Saldo Líquido</p>
              <p
                className={cn(
                  "metric-sm",
                  netBalance >= 0 ? "text-brand" : "text-danger"
                )}
              >
                <SensitiveValue>{formatCurrency(netBalance)}</SensitiveValue>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Entries Table */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Lançamentos</CardTitle>
            <Badge variant="outline" className="text-muted-foreground">
              {filteredEntries.length} registro(s)
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredEntries.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum lançamento no período selecionado
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.map((entry) => {
                  const pmLabel =
                    CASHFLOW_PAYMENT_METHODS.find(
                      (p) =>
                        p.value ===
                        (entry as CashflowEntry & { payment_method?: string })
                          .payment_method
                    )?.label || "-";
                  return (
                    <TableRow key={entry.id} className="border-border">
                      <TableCell className="text-muted-foreground">
                        {formatDate(entry.date, "dd/MM/yyyy")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            entry.type === "income"
                              ? "border-success/30 text-success"
                              : "border-danger/30 text-danger"
                          )}
                        >
                          {entry.type === "income" ? "Entrada" : "Saída"}
                        </Badge>
                      </TableCell>
                      <TableCell className="capitalize">
                        {entry.category}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate">
                        {entry.description || "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {pmLabel}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium",
                          entry.type === "income"
                            ? "text-success"
                            : "text-danger"
                        )}
                      >
                        <SensitiveValue>
                          {entry.type === "income" ? "+" : "-"}
                          {formatCurrency(entry.amount)}
                        </SensitiveValue>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-brand"
                            onClick={() => openEditModal(entry)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDelete(entry.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal de Edição */}
      <Dialog open={!!editingEntry} onOpenChange={(v) => !v && setEditingEntry(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Editar Lançamento</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={editForm.type}
                  onValueChange={(v) => setEditForm({ ...editForm, type: v as "income" | "expense" })}
                >
                  <SelectTrigger className="bg-card-elevated border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">
                      <span className="flex items-center gap-2">
                        <ArrowUpCircle className="h-4 w-4 text-success" />
                        Entrada
                      </span>
                    </SelectItem>
                    <SelectItem value="expense">
                      <span className="flex items-center gap-2">
                        <ArrowDownCircle className="h-4 w-4 text-danger" />
                        Saída
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select
                  value={editForm.category}
                  onValueChange={(v) => setEditForm({ ...editForm, category: v })}
                >
                  <SelectTrigger className="bg-card-elevated border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(editForm.type === "income" ? DEFAULT_INCOME_CATEGORIES : DEFAULT_EXPENSE_CATEGORIES).map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="Descrição do lançamento"
                className="bg-card-elevated border-border"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={editForm.amount}
                  onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                  className="bg-card-elevated border-border"
                />
              </div>
              <div className="space-y-2">
                <Label>Pagamento</Label>
                <Select
                  value={editForm.payment_method}
                  onValueChange={(v) => setEditForm({ ...editForm, payment_method: v })}
                >
                  <SelectTrigger className="bg-card-elevated border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CASHFLOW_PAYMENT_METHODS.map((pm) => (
                      <SelectItem key={pm.value} value={pm.value}>
                        {pm.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Data</Label>
              <Input
                type="date"
                required
                value={editForm.date}
                onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                className="bg-card-elevated border-border"
              />
            </div>
            <div className="space-y-2">
              <Label>Observações (opcional)</Label>
              <Textarea
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                placeholder="Observações adicionais..."
                rows={2}
                className="bg-card-elevated border-border resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditingEntry(null)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-brand hover:bg-brand/90"
              >
                {loading ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
