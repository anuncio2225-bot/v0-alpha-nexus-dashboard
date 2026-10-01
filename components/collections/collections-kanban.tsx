"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Card } from "@/components/ui/card";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import { formatCurrency, cn } from "@/lib/utils";
import { deliveryStatusLabel } from "@/lib/collections/whatsapp";
import type { CollectionClient, CollectionStatus } from "@/types";
import { CalendarClock, GripVertical } from "lucide-react";

interface KanbanProps {
  clients: CollectionClient[];
  statuses: CollectionStatus[];
  onCardClick: (client: CollectionClient) => void;
  onMove: (clientId: string, statusId: string) => void;
  onReorder?: (orderedIds: string[]) => void;
}

export function CollectionsKanban({
  clients,
  statuses,
  onCardClick,
  onMove,
  onReorder,
}: KanbanProps) {
  // Drag de CARD (mover entre colunas) — DnD nativo do HTML5
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  const ordered = [...statuses].sort((a, b) => a.position - b.position);

  // Barra de rolagem lateral também no TOPO (fixa ao descer a página): com
  // muitos clientes, a barra nativa fica lá no fim da coluna mais comprida.
  const quadroRef = useRef<HTMLDivElement>(null);
  const barraRef = useRef<HTMLDivElement>(null);
  const [larguraTotal, setLarguraTotal] = useState(0);
  useEffect(() => {
    const quadro = quadroRef.current;
    if (!quadro) return;
    const medir = () => setLarguraTotal(quadro.scrollWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(quadro);
    for (const filho of Array.from(quadro.children)) ro.observe(filho);
    return () => ro.disconnect();
  }, [statuses.length, clients.length]);
  const sincronizando = useRef(false);
  function espelhar(origem: HTMLDivElement | null, destino: HTMLDivElement | null) {
    if (!origem || !destino || sincronizando.current) return;
    sincronizando.current = true;
    destino.scrollLeft = origem.scrollLeft;
    requestAnimationFrame(() => (sincronizando.current = false));
  }

  // Sensor da reordenacao de COLUNAS (dnd-kit). A alca tem um pequeno limiar
  // para nao conflitar com cliques.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleColumnDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorder) return;
    const ids = ordered.map((s) => s.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onReorder(arrayMove(ids, from, to));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleColumnDragEnd}
    >
      <SortableContext
        items={ordered.map((s) => s.id)}
        strategy={horizontalListSortingStrategy}
      >
        <div
          ref={barraRef}
          onScroll={() => espelhar(barraRef.current, quadroRef.current)}
          className="sticky top-0 z-20 mb-2 overflow-x-auto rounded-md bg-background/90 backdrop-blur"
          aria-hidden
        >
          <div style={{ width: larguraTotal, height: 12 }} />
        </div>
        <div
          ref={quadroRef}
          onScroll={() => espelhar(quadroRef.current, barraRef.current)}
          className="flex gap-3 overflow-x-auto pb-4"
        >
          {ordered.map((status) => {
            const colClients = clients.filter((c) => c.status_id === status.id);
            // Em aberto soma o que falta receber; quitado soma o que entrou
            // (antes a coluna "Pago" aparecia sempre zerada).
            const colTotal = colClients.reduce((s, c) => s + valorDoCard(c).valor, 0);
            return (
              <SortableColumn
                key={status.id}
                status={status}
                count={colClients.length}
                total={colTotal}
                isCardOver={overCol === status.id}
                reorderable={!!onReorder}
                onCardDragOver={() => setOverCol(status.id)}
                onCardDragLeave={() =>
                  setOverCol((c) => (c === status.id ? null : c))
                }
                onCardDrop={() => {
                  if (dragId) onMove(dragId, status.id);
                  setDragId(null);
                  setOverCol(null);
                }}
              >
                {colClients.map((c) => (
                  <Card
                    key={c.id}
                    draggable
                    onDragStart={() => setDragId(c.id)}
                    onClick={() => onCardClick(c)}
                    className="cursor-pointer border-border bg-card p-2.5 transition-colors hover:border-brand/50"
                  >
                    <p className="truncate text-sm font-medium text-foreground">
                      {c.name}
                    </p>
                    {c.product_name && (
                      <p className="truncate text-xs text-muted-foreground">
                        {c.product_name}
                      </p>
                    )}
                    <EtiquetasCard saleType={c.sale_type} entrega={c.delivery_status} />
                    <div className="mt-2 flex items-center justify-between">
                      {(() => {
                        const v = valorDoCard(c);
                        return (
                          <span className={cn("text-sm font-semibold", v.pago ? "text-success" : "text-brand")}>
                            <SensitiveValue>{formatCurrency(v.valor)}</SensitiveValue>
                            {v.pago && <span className="ml-1 text-[10px] font-normal">recebido</span>}
                          </span>
                        );
                      })()}
                      {c.next_collection_date && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <CalendarClock className="h-3 w-3" />
                          {new Date(
                            c.next_collection_date + "T00:00:00"
                          ).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                          })}
                        </span>
                      )}
                    </div>
                  </Card>
                ))}
                {colClients.length === 0 && (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground/60">
                    Nenhum cliente
                  </p>
                )}
              </SortableColumn>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}

interface SortableColumnProps {
  status: CollectionStatus;
  count: number;
  total: number;
  isCardOver: boolean;
  reorderable: boolean;
  onCardDragOver: () => void;
  onCardDragLeave: () => void;
  onCardDrop: () => void;
  children: React.ReactNode;
}

function SortableColumn({
  status,
  count,
  total,
  isCardOver,
  reorderable,
  onCardDragOver,
  onCardDragLeave,
  onCardDrop,
  children,
}: SortableColumnProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: status.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex w-64 shrink-0 flex-col rounded-lg border bg-card/50 transition-colors",
        isCardOver ? "border-brand" : "border-border",
        isDragging && "z-10 opacity-60"
      )}
      onDragOver={(e) => {
        e.preventDefault();
        onCardDragOver();
      }}
      onDragLeave={onCardDragLeave}
      onDrop={onCardDrop}
    >
      <div className="flex items-center justify-between border-b border-border p-3">
        <div className="flex min-w-0 items-center gap-2">
          {reorderable && (
            <button
              type="button"
              aria-label="Arrastar coluna"
              className="cursor-grab touch-none text-muted-foreground/50 hover:text-foreground active:cursor-grabbing"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="size-3.5" />
            </button>
          )}
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: status.color }}
          />
          <span className="truncate text-sm font-medium text-foreground">
            {status.name}
            {status.is_system && (
              <span className="ml-1 font-normal text-muted-foreground">
                (sistema)
              </span>
            )}
          </span>
          <span className="text-xs text-muted-foreground">{count}</span>
        </div>
        <span className="shrink-0 text-xs font-medium text-muted-foreground">
          <SensitiveValue>{formatCurrency(total)}</SensitiveValue>
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-2">{children}</div>
    </div>
  );
}

/**
 * AfterPay e antecipado rodam no mesmo quadro: a etiqueta diz a modalidade, e
 * a entrega aparece em todo card que tem rastreio — inclusive nos já pagos.
 */
const MODALIDADE: Record<string, { texto: string; classe: string }> = {
  afterpay: { texto: "AfterPay", classe: "border-sky-500/40 bg-sky-500/10 text-sky-500" },
  antecipado: { texto: "Antecipado", classe: "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" },
  recuperacao: { texto: "Recuperação", classe: "border-amber-500/40 bg-amber-500/10 text-amber-500" },
};

function EtiquetasCard({ saleType, entrega }: { saleType?: string | null; entrega?: string | null }) {
  const m = saleType ? MODALIDADE[saleType] : null;
  const e = deliveryStatusLabel(entrega);
  if (!m && !e) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {m && (
        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", m.classe)}>
          {m.texto}
        </span>
      )}
      {e && (
        <span className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
          {e}
        </span>
      )}
    </div>
  );
}

/** Valor do card: o que falta receber; se já foi quitado, o que foi recebido. */
function valorDoCard(c: CollectionClient): { valor: number; pago: boolean } {
  const falta = Number(c.remaining_value) || 0;
  const recebido = Number(c.paid_value) || 0;
  if (falta <= 0 && recebido > 0) return { valor: recebido, pago: true };
  return { valor: falta, pago: false };
}
