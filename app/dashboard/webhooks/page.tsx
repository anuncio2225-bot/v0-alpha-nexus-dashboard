"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn, formatDate } from "@/lib/utils";
import {
  Webhook,
  Plus,
  Copy,
  RefreshCw,
  Trash2,
  Pencil,
  Power,
  PowerOff,
  AlertCircle,
  Wrench,
} from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface WebhookItem {
  id: string;
  name: string;
  product_name: string | null;
  source: string;
  token: string;
  is_active: boolean;
  operational_type: "afterpay" | "antecipado" | "recuperacao";
  created_at: string;
  updated_at: string;
}

const SOURCE_OPTIONS = [
  { value: "universal", label: "Universal (auto-detectar)" },
  { value: "braip", label: "Braip" },
  { value: "kiwify", label: "Kiwify" },
  { value: "payt", label: "Payt" },
  { value: "pag2pay", label: "Pag2Pay" },
  { value: "hotmart", label: "Hotmart (em breve)" },
  { value: "monetizze", label: "Monetizze (em breve)" },
];

const SOURCE_BADGE: Record<string, { label: string; className: string }> = {
  universal: {
    label: "Universal",
    className: "border-brand/30 bg-brand/10 text-brand",
  },
  braip: {
    label: "Braip",
    className: "border-blue-500/30 bg-blue-500/10 text-blue-400",
  },
  kiwify: {
    label: "Kiwify",
    className: "border-orange-500/30 bg-orange-500/10 text-orange-400",
  },
  payt: {
    label: "Payt",
    className: "border-teal-500/30 bg-teal-500/10 text-teal-400",
  },
  pag2pay: {
    label: "Pag2Pay",
    className: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
  },
  hotmart: {
    label: "Hotmart",
    className: "border-rose-500/30 bg-rose-500/10 text-rose-400",
  },
  monetizze: {
    label: "Monetizze",
    className: "border-purple-500/30 bg-purple-500/10 text-purple-400",
  },
};

export default function WebhooksPage() {
  const [origin, setOrigin] = useState("");
  const { data, isLoading, mutate } = useSWR<{ webhooks: WebhookItem[] }>(
    "/api/webhooks",
    fetcher
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<WebhookItem | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<WebhookItem | null>(null);
  const [confirmRegen, setConfirmRegen] = useState<WebhookItem | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formProduct, setFormProduct] = useState("");
  const [formSource, setFormSource] = useState("universal");
  const [formOperationalType, setFormOperationalType] = useState<"afterpay" | "antecipado" | "recuperacao">("afterpay");
  const [submitting, setSubmitting] = useState(false);
  const [reconciling, setReconciling] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const webhooks = data?.webhooks || [];

  function openCreate() {
    setFormName("");
    setFormProduct("");
    setFormSource("universal");
    setFormOperationalType("afterpay");
    setEditing(null);
    setCreateOpen(true);
  }

  function openEdit(w: WebhookItem) {
    setFormName(w.name);
    setFormProduct(w.product_name || "");
    setFormSource(w.source);
    setFormOperationalType(w.operational_type || "afterpay");
    setEditing(w);
    setCreateOpen(true);
  }

  async function handleSubmit() {
    if (!formName.trim()) {
      toast.error("Informe um nome para o webhook");
      return;
    }
    setSubmitting(true);
    try {
      const url = editing ? `/api/webhooks/${editing.id}` : "/api/webhooks";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          product_name: formProduct || null,
          source: formSource,
          operational_type: formOperationalType,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      toast.success(editing ? "Webhook atualizado" : "Webhook criado");
      setCreateOpen(false);
      mutate();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Erro ao salvar webhook";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(w: WebhookItem) {
    try {
      await fetch(`/api/webhooks/${w.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !w.is_active }),
      });
      toast.success(w.is_active ? "Webhook desativado" : "Webhook ativado");
      mutate();
    } catch {
      toast.error("Erro ao atualizar status");
    }
  }

  async function regenerateToken(w: WebhookItem) {
    try {
      const res = await fetch(`/api/webhooks/${w.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate_token: true }),
      });
      if (!res.ok) throw new Error();
      toast.success("Novo token gerado");
      mutate();
      setConfirmRegen(null);
    } catch {
      toast.error("Erro ao gerar novo token");
    }
  }

  async function deleteWebhook(w: WebhookItem) {
    try {
      const res = await fetch(`/api/webhooks/${w.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Webhook removido");
      mutate();
      setConfirmDelete(null);
    } catch {
      toast.error("Erro ao remover webhook");
    }
  }

  async function reconcilePlatforms() {
    setReconciling(true);
    try {
      const res = await fetch("/api/webhooks/reconcile", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      // Detalhes da correção no console para depuração
      console.log("[v0] Fix results:", json?.results);
      const txFixed = json?.transactionsFixed ?? 0;
      const logsFixed = json?.logsFixed ?? 0;
      if (txFixed > 0 || logsFixed > 0) {
        toast.success(
          `Corrigido: ${txFixed} transações e ${logsFixed} logs`
        );
      } else {
        toast.info("Nenhuma correção necessária — tudo já está correto");
      }
      mutate();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Erro ao corrigir plataformas";
      toast.error(message);
    } finally {
      setReconciling(false);
    }
  }

  function buildUrl(w: WebhookItem) {
    if (!origin) return "";
    return `${origin}/api/webhook/${w.token}`;
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    toast.success("URL copiada");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-foreground">
            Webhooks
          </h1>
          <p className="text-sm text-muted-foreground">
            Crie um webhook diferente para cada produto ou plataforma
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={reconcilePlatforms}
            disabled={reconciling || webhooks.length === 0}
            title="Corrige retroativamente o gateway e o tipo operacional das transações conforme a configuração de cada webhook"
          >
            <Wrench
              className={cn("mr-2 h-4 w-4", reconciling && "animate-spin")}
            />
            {reconciling ? "Corrigindo..." : "Corrigir plataforma"}
          </Button>
          <Button onClick={openCreate} className="bg-brand hover:bg-brand/90">
            <Plus className="mr-2 h-4 w-4" />
            Novo Webhook
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : webhooks.length === 0 ? (
        <Card className="border-dashed border-border bg-card/50">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand/10">
              <Webhook className="h-6 w-6 text-brand" />
            </div>
            <div>
              <h3 className="font-medium text-foreground">
                Nenhum webhook ainda
              </h3>
              <p className="text-sm text-muted-foreground">
                Crie seu primeiro webhook para comecar a receber vendas
              </p>
            </div>
            <Button onClick={openCreate} className="bg-brand hover:bg-brand/90">
              <Plus className="mr-2 h-4 w-4" />
              Criar Webhook
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {webhooks.map((w) => {
            const url = buildUrl(w);
            const badge = SOURCE_BADGE[w.source] || SOURCE_BADGE.universal;
            return (
              <Card
                key={w.id}
                className={cn(
                  "border-border bg-card transition-opacity",
                  !w.is_active && "opacity-60"
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10">
                        <Webhook className="h-5 w-5 text-brand" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base">{w.name}</CardTitle>
                          <Badge
                            variant="outline"
                            className={cn("text-xs", badge.className)}
                          >
                            {badge.label}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-xs",
                              w.operational_type === "antecipado"
                                ? "border-violet-500/30 bg-violet-500/10 text-violet-400"
                                : w.operational_type === "recuperacao"
                                  ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            )}
                          >
                            {w.operational_type === "antecipado"
                              ? "Antecipado"
                              : w.operational_type === "recuperacao"
                                ? "Recuperação"
                                : "Afterpay"}
                          </Badge>
                          {!w.is_active && (
                            <Badge
                              variant="outline"
                              className="border-muted bg-muted/30 text-xs text-muted-foreground"
                            >
                              Inativo
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="mt-0.5">
                          {w.product_name ? (
                            <>Produto: {w.product_name}</>
                          ) : (
                            <>Sem produto especifico</>
                          )}
                          <span className="mx-2 text-muted-foreground/40">
                            |
                          </span>
                          Criado em {formatDate(w.created_at)}
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Switch
                        checked={w.is_active}
                        onCheckedChange={() => toggleActive(w)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(w)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setConfirmDelete(w)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div>
                    <Label className="mb-1.5 block text-xs text-muted-foreground">
                      URL do Webhook
                    </Label>
                    <div className="flex gap-2">
                      <code className="flex-1 truncate rounded-lg border border-border bg-card-elevated px-3 py-2 text-xs text-muted-foreground">
                        {url || "Carregando..."}
                      </code>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyUrl(url)}
                        disabled={!url}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setConfirmRegen(w)}
                        title="Gerar novo token"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => toggleActive(w)}
                        title={w.is_active ? "Desativar" : "Ativar"}
                      >
                        {w.is_active ? (
                          <PowerOff className="h-4 w-4" />
                        ) : (
                          <Power className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar Webhook" : "Novo Webhook"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Atualize os dados do webhook. O token não será alterado."
                : "Cada webhook recebe um token único. Use um por produto ou plataforma."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Nome *</Label>
              <Input
                id="name"
                placeholder="Ex: Curso de Trafego"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="product">Produto</Label>
              <Input
                id="product"
                placeholder="Ex: Curso Alpha 2.0 (opcional)"
                value={formProduct}
                onChange={(e) => setFormProduct(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="source">Plataforma</Label>
              <Select value={formSource} onValueChange={setFormSource}>
                <SelectTrigger id="source">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCE_OPTIONS.map((opt) => (
                    <SelectItem
                      key={opt.value}
                      value={opt.value}
                      disabled={
                        opt.value === "hotmart" || opt.value === "monetizze"
                      }
                    >
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Universal detecta a plataforma automaticamente. Escolha uma
                especifica se quiser forcar.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="operational_type">Modo Operacional</Label>
              <Select value={formOperationalType} onValueChange={(v) => setFormOperationalType(v as "afterpay" | "antecipado" | "recuperacao")}>
                <SelectTrigger id="operational_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="afterpay">Afterpay (Pos-Pago)</SelectItem>
                  <SelectItem value="antecipado">Antecipado</SelectItem>
                  <SelectItem value="recuperacao">Recuperação</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Define se este produto opera no modelo pos-pago ou antecipado. Usado para filtrar no Dashboard.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-brand hover:bg-brand/90"
            >
              {submitting
                ? "Salvando..."
                : editing
                  ? "Salvar"
                  : "Criar Webhook"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Remover webhook?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A URL atual deixará de funcionar
              imediatamente. As vendas já recebidas serão mantidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && deleteWebhook(confirmDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Regenerate confirmation */}
      <AlertDialog
        open={!!confirmRegen}
        onOpenChange={(o) => !o && setConfirmRegen(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-amber-500" />
              Gerar novo token?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A URL atual deixará de funcionar imediatamente. Você precisará
              atualizar a configuração na plataforma de origem com a nova URL.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmRegen && regenerateToken(confirmRegen)}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              Gerar Novo Token
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
