"use client";

import { useState, useCallback, useEffect } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { cn, formatCurrency } from "@/lib/utils";
import {
  Plus,
  Edit,
  Trash2,
  Wallet,
  Building2,
  GripVertical,
  TrendingUp,
  CreditCard,
  Landmark,
  ShieldCheck,
  PiggyBank,
  MoreHorizontal,
  Filter,
  Calendar,
  Clock,
  AlertTriangle,
  Eye,
  Save,
} from "lucide-react";
import type { BankAccount } from "@/types";
import { SensitiveValue } from "@/components/ui/sensitive-value";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Real account categories
const ACCOUNT_CATS = [
  { value: "bank", label: "Banco", icon: Landmark },
  { value: "investment", label: "Investimento", icon: TrendingUp },
  { value: "wallet", label: "Carteira", icon: Wallet },
  { value: "emergency_reserve", label: "Reserva de Emergencia", icon: ShieldCheck },
  { value: "payment_platform", label: "Plataforma de Pagamento", icon: CreditCard },
  { value: "investment_reserve", label: "Reserva de Investimento", icon: PiggyBank },
  { value: "other", label: "Outros", icon: MoreHorizontal },
] as const;

// Order status for manual input (NOT from webhook)
const ORDER_CATS = [
  { value: "scheduled", label: "Pedidos Agendados", icon: Calendar, color: "brand" },
  { value: "waiting_payment", label: "Aguardando Pagamento", icon: Clock, color: "warning" },
  { value: "late_payment", label: "Pagamento Atrasado", icon: AlertTriangle, color: "danger" },
] as const;

const ALL_FILTER_CATS = [...ACCOUNT_CATS, ...ORDER_CATS];

interface Settings {
  manual_scheduled_value?: number;
  manual_scheduled_count?: number;
  manual_waiting_value?: number;
  manual_waiting_count?: number;
  manual_late_value?: number;
  manual_late_count?: number;
}

export default function FinancialPage() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedCats, setSelectedCats] = useState<string[]>(
    ACCOUNT_CATS.map((c) => c.value)
  );
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [savingOrders, setSavingOrders] = useState(false);

  // Manual order inputs (values user fills from Braip report)
  const [orderInputs, setOrderInputs] = useState({
    scheduled_value: "",
    scheduled_count: "",
    waiting_value: "",
    waiting_count: "",
    late_value: "",
    late_count: "",
  });

  const { data, mutate, isLoading } = useSWR<{ accounts: BankAccount[] }>(
    "/api/bank-accounts",
    fetcher
  );

  // Fetch settings to load saved manual order values
  const { data: settingsData, mutate: mutateSettings } = useSWR<{ settings: Settings }>(
    "/api/settings",
    fetcher
  );

  const accounts = data?.accounts || [];
  const settings = settingsData?.settings;

  // Load saved order values into inputs when settings load
  useEffect(() => {
    if (settings) {
      setOrderInputs({
        scheduled_value: settings.manual_scheduled_value ? String(settings.manual_scheduled_value) : "",
        scheduled_count: settings.manual_scheduled_count ? String(settings.manual_scheduled_count) : "",
        waiting_value: settings.manual_waiting_value ? String(settings.manual_waiting_value) : "",
        waiting_count: settings.manual_waiting_count ? String(settings.manual_waiting_count) : "",
        late_value: settings.manual_late_value ? String(settings.manual_late_value) : "",
        late_count: settings.manual_late_count ? String(settings.manual_late_count) : "",
      });
    }
  }, [settings]);

  // Filter real accounts by selected categories
  const realCatsSelected = selectedCats.filter((c) =>
    ACCOUNT_CATS.some((ac) => ac.value === c)
  );
  const orderCatsSelected = selectedCats.filter((c) =>
    ORDER_CATS.some((oc) => oc.value === c)
  );

  const filteredAccounts =
    realCatsSelected.length === ACCOUNT_CATS.length
      ? accounts
      : accounts.filter((a) => realCatsSelected.includes(a.category));

  // Totals
  const totalRealBalance = filteredAccounts.reduce((s, a) => s + a.balance, 0);

  // Manual order values (from inputs, not webhook)
  const scheduledVal = parseFloat(orderInputs.scheduled_value) || 0;
  const waitingVal = parseFloat(orderInputs.waiting_value) || 0;
  const lateVal = parseFloat(orderInputs.late_value) || 0;

  const totalOrderValue =
    (orderCatsSelected.includes("scheduled") ? scheduledVal : 0) +
    (orderCatsSelected.includes("waiting_payment") ? waitingVal : 0) +
    (orderCatsSelected.includes("late_payment") ? lateVal : 0);

  const showExpectedCash = orderCatsSelected.length > 0;
  const expectedCash = totalRealBalance + totalOrderValue;

  // Toggle category
  const toggleCat = (value: string) => {
    setSelectedCats((prev) =>
      prev.includes(value)
        ? prev.filter((c) => c !== value)
        : [...prev, value]
    );
  };

  const selectAll = () => setSelectedCats(ALL_FILTER_CATS.map((c) => c.value));
  const selectNone = () => setSelectedCats([]);

  // Save manual order values to settings
  const handleSaveOrders = async () => {
    setSavingOrders(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manual_scheduled_value: parseFloat(orderInputs.scheduled_value) || 0,
          manual_scheduled_count: parseInt(orderInputs.scheduled_count) || 0,
          manual_waiting_value: parseFloat(orderInputs.waiting_value) || 0,
          manual_waiting_count: parseInt(orderInputs.waiting_count) || 0,
          manual_late_value: parseFloat(orderInputs.late_value) || 0,
          manual_late_count: parseInt(orderInputs.late_count) || 0,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Valores salvos!");
      mutateSettings();
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSavingOrders(false);
    }
  };

  // Drag & drop
  const handleDragStart = useCallback((id: string) => setDraggedId(id), []);
  const handleDragOver = useCallback((e: React.DragEvent) => e.preventDefault(), []);
  const handleDrop = useCallback(
    async (targetId: string) => {
      if (!draggedId || draggedId === targetId) {
        setDraggedId(null);
        return;
      }
      const oldIndex = accounts.findIndex((a) => a.id === draggedId);
      const newIndex = accounts.findIndex((a) => a.id === targetId);
      if (oldIndex === -1 || newIndex === -1) {
        setDraggedId(null);
        return;
      }
      const reordered = [...accounts];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);
      mutate({ accounts: reordered }, false);
      setDraggedId(null);
      try {
        const res = await fetch("/api/bank-accounts/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: reordered.map((a) => a.id) }),
        });
        if (!res.ok) throw new Error();
        mutate();
      } catch {
        toast.error("Erro ao reordenar");
        mutate();
      }
    },
    [draggedId, accounts, mutate]
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const payload = {
      name: formData.get("name"),
      bank_name: formData.get("bank_name") || null,
      account_type: formData.get("account_type") || "checking",
      balance: parseFloat(formData.get("balance") as string) || 0,
      color: formData.get("color") || "#10b981",
      category: formData.get("category") || "bank",
    };
    try {
      const res = await fetch("/api/bank-accounts", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { id: editing.id, ...payload } : payload),
      });
      if (!res.ok) throw new Error();
      toast.success(editing ? "Conta atualizada" : "Conta criada");
      setOpen(false);
      setEditing(null);
      mutate();
    } catch {
      toast.error("Erro ao salvar conta");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta conta?")) return;
    try {
      await fetch(`/api/bank-accounts?id=${id}`, { method: "DELETE" });
      toast.success("Conta excluida");
      mutate();
    } catch {
      toast.error("Erro ao excluir");
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-heading">Financeiro</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie suas contas - arraste para reordenar
          </p>
        </div>
        <div className="flex gap-2">
          {/* Multi-select filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="border-border">
                <Filter className="mr-2 h-4 w-4" />
                Filtros ({selectedCats.length})
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 bg-card border-border" align="end">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Categorias</p>
                  <div className="flex gap-2">
                    <button
                      onClick={selectAll}
                      className="text-xs text-brand hover:underline"
                    >
                      Todas
                    </button>
                    <button
                      onClick={selectNone}
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      Nenhuma
                    </button>
                  </div>
                </div>

                <div className="border-b border-border pb-2">
                  <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">
                    Contas Reais
                  </p>
                  {ACCOUNT_CATS.map((cat) => (
                    <label
                      key={cat.value}
                      className="flex items-center gap-2 py-1.5 px-1 rounded hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedCats.includes(cat.value)}
                        onCheckedChange={() => toggleCat(cat.value)}
                      />
                      <cat.icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{cat.label}</span>
                    </label>
                  ))}
                </div>

                <div>
                  <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">
                    Pedidos (Manual)
                  </p>
                  {ORDER_CATS.map((cat) => (
                    <label
                      key={cat.value}
                      className="flex items-center gap-2 py-1.5 px-1 rounded hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedCats.includes(cat.value)}
                        onCheckedChange={() => toggleCat(cat.value)}
                      />
                      <cat.icon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{cat.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button className="bg-brand hover:bg-brand/90">
                <Plus className="mr-2 h-4 w-4" />
                Nova Conta
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>{editing ? "Editar Conta" : "Nova Conta"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome da Conta</Label>
                  <Input
                    id="name"
                    name="name"
                    defaultValue={editing?.name || ""}
                    required
                    placeholder="Ex: Conta Principal"
                    className="bg-card-elevated border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bank_name">Banco</Label>
                  <Input
                    id="bank_name"
                    name="bank_name"
                    defaultValue={editing?.bank_name || ""}
                    placeholder="Ex: Nubank, Itau, etc"
                    className="bg-card-elevated border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Categoria</Label>
                  <Select name="category" defaultValue={editing?.category || "bank"}>
                    <SelectTrigger className="bg-card-elevated border-border">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_CATS.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          <span className="flex items-center gap-2">
                            <cat.icon className="h-4 w-4" />
                            {cat.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="balance">Saldo Atual (R$)</Label>
                    <Input
                      id="balance"
                      name="balance"
                      type="number"
                      step="0.01"
                      defaultValue={editing?.balance || 0}
                      className="bg-card-elevated border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="color">Cor</Label>
                    <Input
                      id="color"
                      name="color"
                      type="color"
                      defaultValue={editing?.color || "#10b981"}
                      className="h-10 p-1 bg-card-elevated border-border"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => { setOpen(false); setEditing(null); }}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={loading} className="bg-brand hover:bg-brand/90">
                    {loading ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className={cn("grid gap-4", showExpectedCash ? "sm:grid-cols-2" : "sm:grid-cols-1")}>
        {/* Saldo Real */}
        <Card className="bg-card border-border">
          <CardContent className="flex items-center justify-between p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand/20">
                <Wallet className="h-6 w-6 text-brand" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Saldo Real</p>
                <p className="metric text-brand"><SensitiveValue>{formatCurrency(totalRealBalance)}</SensitiveValue></p>
              </div>
            </div>
            <Badge variant="outline" className="text-muted-foreground">
              {filteredAccounts.length} {filteredAccounts.length === 1 ? "conta" : "contas"}
            </Badge>
          </CardContent>
        </Card>

        {/* Caixa Esperado - Only when order filters are active */}
        {showExpectedCash && (
          <Card className="bg-card border-border border-dashed">
            <CardContent className="flex items-center justify-between p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning/20">
                  <Eye className="h-6 w-6 text-warning" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Caixa Esperado</p>
                  <p className="metric text-warning"><SensitiveValue>{formatCurrency(expectedCash)}</SensitiveValue></p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Saldo real + pedidos pendentes
                  </p>
                </div>
              </div>
              <div className="text-right space-y-1">
                {orderCatsSelected.includes("scheduled") && scheduledVal > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Agendados: <span className="text-foreground"><SensitiveValue>{formatCurrency(scheduledVal)}</SensitiveValue></span>
                  </p>
                )}
                {orderCatsSelected.includes("waiting_payment") && waitingVal > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Aguardando: <span className="text-foreground"><SensitiveValue>{formatCurrency(waitingVal)}</SensitiveValue></span>
                  </p>
                )}
                {orderCatsSelected.includes("late_payment") && lateVal > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Atrasados: <span className="text-foreground"><SensitiveValue>{formatCurrency(lateVal)}</SensitiveValue></span>
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Manual Orders Section - Always visible when order filters selected */}
      {orderCatsSelected.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Pedidos (Valores Manuais)</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Preencha com os valores do relatorio da Braip
                </p>
              </div>
              <Button
                size="sm"
                onClick={handleSaveOrders}
                disabled={savingOrders}
                className="bg-brand hover:bg-brand/90"
              >
                <Save className="mr-2 h-4 w-4" />
                {savingOrders ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              {/* Agendados */}
              {orderCatsSelected.includes("scheduled") && (
                <div className="p-4 rounded-lg bg-brand/5 border border-brand/20">
                  <div className="flex items-center gap-2 mb-3">
                    <Calendar className="h-5 w-5 text-brand" />
                    <span className="font-medium text-sm">Agendados</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Valor (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0,00"
                        value={orderInputs.scheduled_value}
                        onChange={(e) => setOrderInputs(p => ({ ...p, scheduled_value: e.target.value }))}
                        className="bg-card border-border h-9 text-sm mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Qtd</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={orderInputs.scheduled_count}
                        onChange={(e) => setOrderInputs(p => ({ ...p, scheduled_count: e.target.value }))}
                        className="bg-card border-border h-9 text-sm mt-1"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Aguardando */}
              {orderCatsSelected.includes("waiting_payment") && (
                <div className="p-4 rounded-lg bg-warning/5 border border-warning/20">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="h-5 w-5 text-warning" />
                    <span className="font-medium text-sm">Aguardando Pgto</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Valor (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0,00"
                        value={orderInputs.waiting_value}
                        onChange={(e) => setOrderInputs(p => ({ ...p, waiting_value: e.target.value }))}
                        className="bg-card border-border h-9 text-sm mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Qtd</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={orderInputs.waiting_count}
                        onChange={(e) => setOrderInputs(p => ({ ...p, waiting_count: e.target.value }))}
                        className="bg-card border-border h-9 text-sm mt-1"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Atrasados */}
              {orderCatsSelected.includes("late_payment") && (
                <div className="p-4 rounded-lg bg-danger/5 border border-danger/20">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="h-5 w-5 text-danger" />
                    <span className="font-medium text-sm">Pgto Atrasado</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-muted-foreground">Valor (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0,00"
                        value={orderInputs.late_value}
                        onChange={(e) => setOrderInputs(p => ({ ...p, late_value: e.target.value }))}
                        className="bg-card border-border h-9 text-sm mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Qtd</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={orderInputs.late_count}
                        onChange={(e) => setOrderInputs(p => ({ ...p, late_count: e.target.value }))}
                        className="bg-card border-border h-9 text-sm mt-1"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Accounts Grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : filteredAccounts.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center">
            <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {realCatsSelected.length === 0
                ? "Selecione pelo menos uma categoria de conta"
                : "Nenhuma conta cadastrada"}
            </p>
            {realCatsSelected.length > 0 && (
              <Button
                className="mt-4 bg-brand hover:bg-brand/90"
                onClick={() => { setEditing(null); setOpen(true); }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Criar Conta
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredAccounts.map((account) => {
            const CatIcon = ACCOUNT_CATS.find((c) => c.value === account.category)?.icon || Building2;
            return (
              <Card
                key={account.id}
                className={cn(
                  "bg-card border-border cursor-grab active:cursor-grabbing transition-all",
                  draggedId === account.id && "opacity-50 scale-95"
                )}
                draggable
                onDragStart={() => handleDragStart(account.id)}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(account.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                      <div
                        className="flex h-10 w-10 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${account.color}20` }}
                      >
                        <CatIcon className="h-5 w-5" style={{ color: account.color }} />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{account.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {account.bank_name || ACCOUNT_CATS.find(c => c.value === account.category)?.label}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => { setEditing(account); setOpen(true); }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-danger hover:text-danger"
                        onClick={() => handleDelete(account.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="pl-7">
                    <p className={cn(
                      "metric-sm",
                      account.balance >= 0 ? "text-foreground" : "text-danger"
                    )}>
                      <SensitiveValue>{formatCurrency(account.balance)}</SensitiveValue>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {(() => {
                        const ts = account.last_balance_update || account.updated_at;
                        if (!ts) return "Sem data de atualização";
                        const d = new Date(ts);
                        return `Atualizado em ${d.toLocaleDateString("pt-BR")} as ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
                      })()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
