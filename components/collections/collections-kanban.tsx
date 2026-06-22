"use client";

import { useState } from "react";
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
        <div className="flex gap-3 overflow-x-auto pb-4">
          {ordered.map((status) => {
            const colClients = clients.filter((c) => c.status_id === status.id);
            const colTotal = colClients.reduce(
              (s, c) => s + (Number(c.remaining_value) || 0),
              0
            );
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
                    className="cursor-pointer border-border bg-card p-3 transition-colors hover:border-brand/50"
                  >
                    <p className="truncate text-sm font-medium text-foreground">
                      {c.name}
                    </p>
                    {c.product_name && (
                      <p className="truncate text-xs text-muted-foreground">
                        {c.product_name}
                      </p>
                    )}
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm font-semibold text-brand">
                        <SensitiveValue>
                          {formatCurrency(Number(c.remaining_value) || 0)}
                        </SensitiveValue>
                      </span>
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
        "flex w-72 shrink-0 flex-col rounded-lg border bg-card/50 transition-colors",
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
