"use client";

import { useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn, formatDate } from "@/lib/utils";
import { FileJson, X, Trash2, RotateCcw, Wrench } from "lucide-react";
import { toast } from "sonner";

interface WebhookLog {
  id: string;
  gateway: string;
  event_type: string | null;
  payload: Record<string, unknown>;
  status: string;
  error_message: string | null;
  created_at: string;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const GATEWAY_LABELS: Record<string, { label: string; className: string }> = {
  braip: { label: "Braip", className: "border-blue-500/30 text-blue-400" },
  kiwify: { label: "Kiwify", className: "border-orange-500/30 text-orange-400" },
  payt: { label: "Payt", className: "border-teal-500/30 text-teal-400" },
  pag2pay: { label: "Pag2Pay", className: "border-cyan-500/30 text-cyan-400" },
  hotmart: { label: "Hotmart", className: "border-red-500/30 text-red-400" },
  monetizze: { label: "Monetizze", className: "border-purple-500/30 text-purple-400" },
  unknown: { label: "Desconhecido", className: "border-muted text-muted-foreground" },
};

export default function LogsPage() {
  const [selected, setSelected] = useState<WebhookLog | null>(null);
  const [gatewayFilter, setGatewayFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [resetting, setResetting] = useState(false);
  const [fixing, setFixing] = useState(false);

  const params = new URLSearchParams();
  if (gatewayFilter !== "all") params.set("gateway", gatewayFilter);
  if (statusFilter !== "all") params.set("status", statusFilter);
  const qs = params.toString();
  const url = `/api/logs${qs ? `?${qs}` : ""}`;

  const { data, isLoading, mutate } = useSWR<{ logs: WebhookLog[] }>(url, fetcher, {
    refreshInterval: 10000,
  });

  const logs = data?.logs || [];

  async function handleReset(scope: "logs_only" | "all") {
    setResetting(true);
    try {
      const res = await fetch("/api/admin/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Erro ao limpar");

      const counts = json.counts || {};
      const summary =
        scope === "all"
          ? `Tudo limpo: ${counts.transactions || 0} transações, ${counts.webhook_logs || 0} logs, ${counts.cashflow_from_webhooks || 0} lançamentos`
          : `${counts.webhook_logs || 0} logs e ${counts.webhook_errors || 0} erros removidos`;
      toast.success(summary);

      setSelected(null);
      mutate();
      // Also revalidate dashboard metrics
      globalMutate(
        (key) =>
          typeof key === "string" && key.startsWith("/api/dashboard/metrics"),
        undefined,
        { revalidate: true }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao limpar";
      toast.error(message);
    } finally {
      setResetting(false);
    }
  }

  async function handleFixPayt() {
    setFixing(true);
    try {
      const res = await fetch("/api/admin/fix-payt", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Erro ao corrigir");
      toast.success(json?.message || "Correção concluída");
      mutate();
      // Revalida as métricas do dashboard para refletir a nova plataforma
      globalMutate(
        (key) =>
          typeof key === "string" && key.startsWith("/api/dashboard/metrics"),
        undefined,
        { revalidate: true }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao corrigir";
      toast.error(message);
    } finally {
      setFixing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-heading">Logs</h1>
          <p className="text-sm text-muted-foreground">
            Histórico de webhooks recebidos de todas as plataformas
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Corrigir plataformas (Payt marcadas como Braip) */}
          <Button
            variant="outline"
            size="sm"
            disabled={fixing || logs.length === 0}
            onClick={handleFixPayt}
            className="gap-2 border-amber-500/40 text-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
          >
            <Wrench className={cn("h-4 w-4", fixing && "animate-spin")} />
            {fixing ? "Corrigindo..." : "Corrigir Plataformas"}
          </Button>

          {/* Limpar so os logs */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={resetting || logs.length === 0}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Limpar logs
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Limpar todos os logs?</AlertDialogTitle>
                <AlertDialogDescription>
                  Isso vai apagar TODOS os logs de webhooks recebidos e erros
                  registrados. As transações já salvas e o dashboard NÃO serão
                  afetados. Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={resetting}>
                  Cancelar
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={resetting}
                  onClick={() => handleReset("logs_only")}
                >
                  Limpar logs
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Reset completo (logs + transacoes + dashboard) */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                disabled={resetting}
                className="gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                Resetar tudo
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Resetar todo o dashboard?</AlertDialogTitle>
                <AlertDialogDescription className="space-y-2">
                  <span className="block">
                    Isso vai apagar permanentemente:
                  </span>
                  <span className="block">
                    - Todas as transações e vendas
                  </span>
                  <span className="block">
                    - Todos os logs e erros de webhook
                  </span>
                  <span className="block">
                    - Lançamentos de fluxo de caixa criados pelos webhooks
                  </span>
                  <span className="block pt-2 font-semibold text-foreground">
                    Será mantido: webhooks configurados (URLs), atendentes,
                    metas e lançamentos manuais de caixa.
                  </span>
                  <span className="block pt-2">
                    Útil para reenviar postbacks do zero. Esta ação não pode
                    ser desfeita.
                  </span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={resetting}>
                  Cancelar
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={resetting}
                  onClick={() => handleReset("all")}
                  className="bg-danger text-danger-foreground hover:bg-danger/90"
                >
                  Sim, resetar tudo
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={gatewayFilter} onValueChange={setGatewayFilter}>
          <SelectTrigger className="w-[180px] bg-card border-border">
            <SelectValue placeholder="Plataforma" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas plataformas</SelectItem>
            <SelectItem value="braip">Braip</SelectItem>
            <SelectItem value="kiwify">Kiwify</SelectItem>
            <SelectItem value="payt">Payt</SelectItem>
            <SelectItem value="pag2pay">Pag2Pay</SelectItem>
            <SelectItem value="hotmart">Hotmart</SelectItem>
            <SelectItem value="monetizze">Monetizze</SelectItem>
            <SelectItem value="unknown">Desconhecido</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px] bg-card border-border">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="received">Recebido</SelectItem>
            <SelectItem value="processed">Processado</SelectItem>
            <SelectItem value="error">Erro</SelectItem>
          </SelectContent>
        </Select>

        <span className="text-xs text-muted-foreground">
          {logs.length} {logs.length === 1 ? "registro" : "registros"}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Logs Table */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Webhooks Recebidos</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : logs.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">
                Nenhum webhook recebido ainda
              </p>
            ) : (
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border">
                      <TableHead>Data</TableHead>
                      <TableHead>Plataforma</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => {
                      const gw =
                        GATEWAY_LABELS[log.gateway] || GATEWAY_LABELS.unknown;
  async function handleFixPayt() {
    setFixing(true);
    try {
      const res = await fetch("/api/admin/fix-payt", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Erro ao corrigir");
      toast.success(json?.message || "Correção concluída");
      mutate();
      // Revalidate dashboard metrics so the new platform/sale_type reflects there
      globalMutate(
        (key) =>
          typeof key === "string" && key.startsWith("/api/dashboard/metrics"),
        undefined,
        { revalidate: true }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao corrigir";
      toast.error(message);
    } finally {
      setFixing(false);
    }
  }

  return (
                        <TableRow
                          key={log.id}
                          className={cn(
                            "cursor-pointer border-border transition-colors",
                            selected?.id === log.id
                              ? "bg-brand/10"
                              : "hover:bg-muted/50"
                          )}
                          onClick={() => setSelected(log)}
                        >
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDate(log.created_at, "dd/MM HH:mm")}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn("text-xs", gw.className)}
                            >
                              {gw.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate text-sm">
                            {log.event_type || "-"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs",
                                log.status === "processed"
                                  ? "border-success/30 text-success"
                                  : log.status === "error"
                                  ? "border-danger/30 text-danger"
                                  : "border-muted text-muted-foreground"
                              )}
                            >
                              {log.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* JSON Viewer */}
        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileJson className="h-4 w-4 text-brand" />
                Payload
              </CardTitle>
              {selected && (
                <button
                  onClick={() => setSelected(null)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Fechar"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {selected ? (
              <ScrollArea className="h-[500px]">
                {selected.error_message && (
                  <div className="mb-4 rounded-lg bg-danger/10 border border-danger/30 p-3">
                    <p className="text-sm font-medium text-danger">Erro:</p>
                    <p className="text-xs text-danger/80">{selected.error_message}</p>
                  </div>
                )}
                <pre className="overflow-x-auto rounded-lg bg-card-elevated p-4 text-xs text-muted-foreground">
                  {JSON.stringify(selected.payload, null, 2)}
                </pre>
              </ScrollArea>
            ) : (
              <div className="flex h-[500px] flex-col items-center justify-center text-muted-foreground">
                <FileJson className="mb-4 h-12 w-12 opacity-50" />
                <p>Selecione um log para ver o payload</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
