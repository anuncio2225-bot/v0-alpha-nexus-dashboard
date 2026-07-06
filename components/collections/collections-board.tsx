"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { formatCurrency, cn } from "@/lib/utils";
import {
  Plus,
  Download,
  Search,
  LayoutGrid,
  TableIcon,
  PhoneCall,
  MessageCircle,
} from "lucide-react";
import type {
  CollectionClient,
  CollectionStatus,
  CollectionPlatform,
} from "@/types";
import { StatusBadge } from "./status-badge";
import { AttendantSelect } from "./attendant-select";
import { buildWhatsappUrl } from "@/lib/collections/whatsapp";
import type { CollectionFilters } from "@/app/dashboard/collections/page";
import { MultiSelectFilter } from "./multi-select-filter";
import { NewClientDialog } from "./new-client-dialog";
import { CollectionsKanban } from "./collections-kanban";
import { ClientDrawer } from "./client-drawer";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface SuggestionsResponse {
  products: string[];
  attendants: { id: string | null; name: string }[];
  payment_methods: string[];
}

interface CollectionsBoardProps {
  filters: CollectionFilters;
  onFiltersChange: (
    updater: (prev: CollectionFilters) => CollectionFilters
  ) => void;
}

export function CollectionsBoard({
  filters,
  onFiltersChange,
}: CollectionsBoardProps) {
  const [view, setView] = useState<"table" | "kanban">("table");
  const [newOpen, setNewOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const {
    search,
    statusIds,
    attendants: attendantFilters,
    products: productFilters,
  } = filters;
  const setSearch = (v: string) =>
    onFiltersChange((p) => ({ ...p, search: v }));
  const setStatusIds = (v: string[]) =>
    onFiltersChange((p) => ({ ...p, statusIds: v }));
  const setAttendantFilters = (v: string[]) =>
    onFiltersChange((p) => ({ ...p, attendants: v }));
  const setProductFilters = (v: string[]) =>
    onFiltersChange((p) => ({ ...p, products: v }));

  const query = new URLSearchParams();
  if (search) query.set("search", search);
  if (statusIds.length > 0) query.set("status_ids", statusIds.join(","));
  if (attendantFilters.length > 0)
    query.set("attendants", attendantFilters.join(","));
  if (productFilters.length > 0)
    query.set("products", productFilters.join(","));
  query.set("page_size", "200");

  const { data, isLoading, mutate } = useSWR<{
    clients: CollectionClient[];
    total: number;
  }>(`/api/collections?${query.toString()}`, fetcher);

  const { data: statusData, mutate: mutateStatuses } = useSWR<{
    statuses: CollectionStatus[];
  }>("/api/collections/statuses", fetcher);
  const { data: platformData } = useSWR<{ platforms: CollectionPlatform[] }>(
    "/api/collections/platforms",
    fetcher
  );
  const { data: suggestions } = useSWR<SuggestionsResponse>(
    "/api/collections/suggestions",
    fetcher
  );

  const clients = data?.clients || [];
  const statuses = statusData?.statuses || [];
  const platforms = platformData?.platforms || [];
  const attendants = suggestions?.attendants || [];
  const products = suggestions?.products || [];

  const statusColorMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of statuses) m[s.id] = s.color;
    return m;
  }, [statuses]);

  const statusSystemMap = useMemo(() => {
    const m: Record<string, boolean> = {};
    for (const s of statuses) m[s.id] = s.is_system;
    return m;
  }, [statuses]);

  async function handleImport() {
    setImporting(true);
    try {
      const res = await fetch("/api/collections/import", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const importedCount = json.imported || 0;
      const updatedCount = json.updated || 0;
      if (importedCount > 0 || updatedCount > 0) {
        const parts: string[] = [];
        if (importedCount > 0) parts.push(`${importedCount} novo(s)`);
        if (updatedCount > 0) parts.push(`${updatedCount} atualizado(s)`);
        toast.success(`Sincronizado: ${parts.join(" e ")}`);
        mutate();
      } else {
        toast.info("Nenhuma transação encontrada para importar");
      }
    } catch {
      toast.error("Erro ao importar do webhook");
    } finally {
      setImporting(false);
    }
  }

  async function handleMove(clientId: string, statusId: string) {
    const client = clients.find((c) => c.id === clientId);
    if (!client || client.status_id === statusId) return;
    // Atualizacao otimista
    mutate(
      (prev) =>
        prev
          ? {
              ...prev,
              clients: prev.clients.map((c) =>
                c.id === clientId ? { ...c, status_id: statusId } : c
              ),
            }
          : prev,
      false
    );
    try {
      const res = await fetch(`/api/collections/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status_id: statusId }),
      });
      if (!res.ok) throw new Error();
      mutate();
    } catch {
      toast.error("Erro ao mover cliente");
      mutate();
    }
  }

  async function handleReorder(orderedIds: string[]) {
    // Atualizacao otimista das posicoes das colunas
    mutateStatuses(
      (prev) =>
        prev
          ? {
              statuses: prev.statuses.map((s) => ({
                ...s,
                position: orderedIds.indexOf(s.id),
              })),
            }
          : prev,
      false
    );
    try {
      const res = await fetch("/api/collections/statuses/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: orderedIds }),
      });
      if (!res.ok) throw new Error();
      mutateStatuses();
    } catch {
      toast.error("Erro ao reordenar colunas");
      mutateStatuses();
    }
  }

  return (
    <div className="space-y-4">
      {/* Filtros e acoes */}
      <Card className="border-border bg-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar nome, telefone, CPF, cód. pedido"
                className="bg-card-elevated border-border pl-9"
              />
            </div>
            <MultiSelectFilter
              placeholder="Status"
              className="sm:w-44"
              selected={statusIds}
              onChange={setStatusIds}
              options={statuses.map((s) => ({
                value: s.id,
                label: s.is_system ? `${s.name} (sistema)` : s.name,
                color: s.color,
              }))}
            />
            <MultiSelectFilter
              placeholder="Atendente"
              className="sm:w-44"
              selected={attendantFilters}
              onChange={setAttendantFilters}
              options={attendants.map((a) => ({
                value: a.name,
                label: a.name,
              }))}
            />
            <MultiSelectFilter
              placeholder="Produto"
              className="sm:w-44"
              selected={productFilters}
              onChange={setProductFilters}
              options={products.map((p) => ({
                value: p,
                label: p,
              }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border p-0.5">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setView("table")}
                className={cn("h-8 w-8", view === "table" && "bg-brand/15 text-brand")}
              >
                <TableIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setView("kanban")}
                className={cn("h-8 w-8", view === "kanban" && "bg-brand/15 text-brand")}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
            <Button
              variant="outline"
              onClick={handleImport}
              disabled={importing}
              className="border-border"
            >
              <Download className="mr-2 h-4 w-4" />
              {importing ? "Importando..." : "Importar do Webhook"}
            </Button>
            <Button onClick={() => setNewOpen(true)} className="bg-brand hover:bg-brand/90">
              <Plus className="mr-2 h-4 w-4" />
              Novo Cliente
            </Button>
          </div>
        </div>
      </Card>

      {/* Corpo */}
      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : clients.length === 0 ? (
        <Card className="border-border bg-card">
          <div className="flex flex-col items-center justify-center py-16">
            <PhoneCall className="mb-4 h-12 w-12 text-muted-foreground/40" />
            <p className="text-muted-foreground">Nenhum cliente de cobrança</p>
            <p className="text-sm text-muted-foreground/70">
              Importe do webhook ou cadastre manualmente
            </p>
          </div>
        </Card>
      ) : view === "kanban" ? (
        <CollectionsKanban
          clients={clients}
          statuses={statuses}
          onCardClick={(c) => setSelectedId(c.id)}
          onMove={handleMove}
          onReorder={handleReorder}
        />
      ) : (
        <Card className="border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead>Atendente</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Pagamento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Pago</TableHead>
                  <TableHead className="text-right">Pendente</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Próx. Cobrança</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((c) => {
                  const statusColor = c.status_id ? statusColorMap[c.status_id] : null;
                  const remaining = Number(c.remaining_value) || 0;
                  return (
                  <TableRow
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className="cursor-pointer border-border"
                    style={
                      statusColor
                        ? { backgroundColor: `${statusColor}1a` }
                        : undefined
                    }
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <AttendantSelect
                        clientId={c.id}
                        currentName={c.attendant_name || c.src}
                        attendants={attendants}
                        onChanged={mutate}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-foreground">{c.name}</div>
                      {c.phone && (
                        <div className="text-xs text-muted-foreground">{c.phone}</div>
                      )}
                      {c.transaction_code && (
                        <div className="text-xs text-muted-foreground/60 font-mono mt-0.5">
                          #{c.transaction_code}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-muted-foreground">
                      {c.product_name || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {c.order_date
                        ? new Date(c.order_date).toLocaleDateString("pt-BR")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {c.payment_date
                        ? new Date(c.payment_date).toLocaleDateString("pt-BR")
                        : <span className="text-muted-foreground/50">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <SensitiveValue>{formatCurrency(Number(c.total_value) || 0)}</SensitiveValue>
                    </TableCell>
                    <TableCell className="text-right text-success">
                      <SensitiveValue>{formatCurrency(Number(c.paid_value) || 0)}</SensitiveValue>
                    </TableCell>
                    <TableCell className="text-right">
                      {remaining > 0 ? (
                        <span className="font-bold text-destructive">
                          <SensitiveValue>{formatCurrency(remaining)}</SensitiveValue>
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                          Quitado
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        name={c.status_name}
                        color={statusColor}
                        system={c.status_id ? statusSystemMap[c.status_id] : false}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.next_collection_date
                        ? new Date(c.next_collection_date + "T00:00:00").toLocaleDateString("pt-BR")
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.phone && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-success hover:text-success"
                          onClick={(e) => {
                            e.stopPropagation();
                            const url = buildWhatsappUrl(c);
                            if (url) window.open(url, "_blank");
                          }}
                          title="Enviar WhatsApp"
                        >
                          <MessageCircle className="size-4" />
                          <span className="sr-only">Enviar WhatsApp</span>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <NewClientDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        statuses={statuses}
        platforms={platforms}
        attendants={[]}
        onCreated={mutate}
      />

      <ClientDrawer
        clientId={selectedId}
        open={!!selectedId}
        onOpenChange={(o) => !o && setSelectedId(null)}
        statuses={statuses}
        onChanged={mutate}
        onDeleted={() => setSelectedId(null)}
      />
    </div>
  );
}
