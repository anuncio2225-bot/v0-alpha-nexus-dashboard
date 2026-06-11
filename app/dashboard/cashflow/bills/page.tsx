"use client";

import { useState } from "react";
import useSWR from "swr";
import { format, parseISO, isBefore, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Plus,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Edit,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatCurrency } from "@/lib/utils";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import type { Bill } from "@/types";
import { BILL_CATEGORIES } from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function getBillStatus(bill: Bill): "pago" | "vencido" | "pendente" {
  if (bill.status === "pago") return "pago";
  const hoje = startOfDay(new Date());
  const venc = startOfDay(parseISO(bill.vencimento));
  return isBefore(venc, hoje) ? "vencido" : "pendente";
}

const statusConfig = {
  pago: { label: "Pago", icon: CheckCircle2, color: "text-success" },
  vencido: { label: "Vencido", icon: AlertCircle, color: "text-danger" },
  pendente: { label: "Pendente", icon: Clock, color: "text-warning" },
};

export default function BillsPage() {
  const { data: bills = [], isLoading, mutate } = useSWR<Bill[]>("/api/bills", fetcher);
  
  const [openDialog, setOpenDialog] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"todas" | "pendente" | "vencido" | "pago">("todas");
  
  const [form, setForm] = useState({
    titulo: "",
    categoria: "Outros",
    valor: "",
    vencimento: format(new Date(), "yyyy-MM-dd"),
    observacao: "",
    status: "pendente" as "pendente" | "pago",
  });

  const billsWithStatus = bills.map((b) => ({
    ...b,
    computedStatus: getBillStatus(b),
  }));

  const filtered = filterStatus === "todas" 
    ? billsWithStatus 
    : billsWithStatus.filter((b) => b.computedStatus === filterStatus);

  const sorted = [...filtered].sort((a, b) => {
    const order = { vencido: 0, pendente: 1, pago: 2 };
    return order[a.computedStatus] - order[b.computedStatus] || 
           a.vencimento.localeCompare(b.vencimento);
  });

  // KPIs
  const totals = {
    pendente: billsWithStatus
      .filter((b) => b.computedStatus === "pendente")
      .reduce((s, b) => s + Number(b.valor), 0),
    vencido: billsWithStatus
      .filter((b) => b.computedStatus === "vencido")
      .reduce((s, b) => s + Number(b.valor), 0),
    pago: billsWithStatus
      .filter((b) => b.computedStatus === "pago")
      .reduce((s, b) => s + Number(b.valor), 0),
  };

  function openCreate() {
    setEditingId(null);
    setForm({
      titulo: "",
      categoria: "Outros",
      valor: "",
      vencimento: format(new Date(), "yyyy-MM-dd"),
      observacao: "",
      status: "pendente",
    });
    setOpenDialog(true);
  }

  function openEdit(bill: Bill) {
    setEditingId(bill.id);
    setForm({
      titulo: bill.titulo,
      categoria: bill.categoria,
      valor: String(bill.valor),
      vencimento: bill.vencimento,
      observacao: bill.observacao || "",
      status: bill.status === "pago" ? "pago" : "pendente",
    });
    setOpenDialog(true);
  }

  async function handleSave() {
    if (!form.titulo || !form.vencimento) return;
    setSaving(true);
    try {
      const url = editingId ? `/api/bills/${editingId}` : "/api/bills";
      const method = editingId ? "PATCH" : "POST";
      
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: form.titulo,
          categoria: form.categoria,
          valor: parseFloat(form.valor) || 0,
          vencimento: form.vencimento,
          observacao: form.observacao,
          status: form.status,
        }),
      });
      
      if (response.ok) {
        await mutate();
        setOpenDialog(false);
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleTogglePago(bill: Bill) {
    const newStatus = bill.status === "pago" ? "pendente" : "pago";
    await fetch(`/api/bills/${bill.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    await mutate();
  }

  async function handleDelete(id: string) {
    if (!confirm("Deletar esta conta?")) return;
    await fetch(`/api/bills/${id}`, { method: "DELETE" });
    await mutate();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Contas a Pagar</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Controle suas despesas fixas</p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Conta
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-border bg-card hover:shadow-md transition-shadow cursor-pointer" 
              onClick={() => setFilterStatus(filterStatus === "pendente" ? "todas" : "pendente")}>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">A Pagar</p>
            <p className="text-lg font-bold text-warning mt-1">
              <SensitiveValue>{formatCurrency(totals.pendente)}</SensitiveValue>
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setFilterStatus(filterStatus === "vencido" ? "todas" : "vencido")}>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Vencidas</p>
            <p className="text-lg font-bold text-danger mt-1">
              <SensitiveValue>{formatCurrency(totals.vencido)}</SensitiveValue>
            </p>
          </CardContent>
        </Card>
        <Card className="border-border bg-card hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => setFilterStatus(filterStatus === "pago" ? "todas" : "pago")}>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Pagas</p>
            <p className="text-lg font-bold text-success mt-1">
              <SensitiveValue>{formatCurrency(totals.pago)}</SensitiveValue>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(["todas", "pendente", "vencido", "pago"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={cn(
              "px-3 py-1.5 text-sm rounded-md font-medium transition-all border",
              filterStatus === s
                ? "bg-brand/15 text-brand border-brand/30"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {s === "todas" ? "Todas" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Bills List */}
      <Card className="border-border bg-card">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <p className="text-sm text-muted-foreground">Nenhuma conta encontrada</p>
              <Button variant="outline" size="sm" onClick={openCreate}>
                Adicionar
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {sorted.map((bill) => {
                const config = statusConfig[bill.computedStatus];
                const Icon = config.icon;
                return (
                  <div
                    key={bill.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 group hover:bg-muted/40 transition-colors",
                      bill.computedStatus === "pago" && "opacity-60"
                    )}
                  >
                    {/* Status Toggle */}
                    <button
                      onClick={() => handleTogglePago(bill)}
                      className="shrink-0 hover:scale-110 transition-transform"
                      title="Marcar como pago/pendente"
                    >
                      <Icon className={cn("h-5 w-5", config.color)} />
                    </button>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-sm font-medium",
                        bill.computedStatus === "pago" && "line-through text-muted-foreground"
                      )}>
                        {bill.titulo}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {bill.categoria} • {format(parseISO(bill.vencimento), "dd/MM", { locale: ptBR })}
                      </p>
                      {bill.observacao && (
                        <p className="text-xs text-muted-foreground/60 mt-0.5">{bill.observacao}</p>
                      )}
                    </div>

                    {/* Value + Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-xs">
                        {config.label}
                      </Badge>
                      <span className="text-sm font-semibold">
                        <SensitiveValue>{formatCurrency(Number(bill.valor))}</SensitiveValue>
                      </span>
                      <button
                        onClick={() => openEdit(bill)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-muted rounded"
                      >
                        <Edit className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => handleDelete(bill.id)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-muted rounded"
                      >
                        <Trash2 className="h-4 w-4 text-danger" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar" : "Nova"} Conta a Pagar</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label htmlFor="titulo" className="text-sm">Título</Label>
              <Input
                id="titulo"
                placeholder="Ex: Bruna"
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="categoria" className="text-sm">Categoria</Label>
                <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v })}>
                  <SelectTrigger id="categoria" className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BILL_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="valor" className="text-sm">Valor</Label>
                <Input
                  id="valor"
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={form.valor}
                  onChange={(e) => setForm({ ...form, valor: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="vencimento" className="text-sm">Vencimento</Label>
                <Input
                  id="vencimento"
                  type="date"
                  value={form.vencimento}
                  onChange={(e) => setForm({ ...form, vencimento: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="status" className="text-sm">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "pendente" | "pago" })}>
                  <SelectTrigger id="status" className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="observacao" className="text-sm">Observação (opcional)</Label>
              <Textarea
                id="observacao"
                placeholder="Observações..."
                rows={2}
                value={form.observacao}
                onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || !form.titulo || !form.vencimento}>
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


