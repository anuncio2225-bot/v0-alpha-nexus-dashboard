"use client";

import { useState } from "react";
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
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);
  // Drag de COLUNA (reordenacao) — separado do drag de card
  const [dragColId, setDragColId] = useState<string | null>(null);
  const [overColHeader, setOverColHeader] = useState<string | null>(null);

  const ordered = [...statuses].sort((a, b) => a.position - b.position);

  function reorderColumns(fromId: string, toId: string) {
    if (fromId === toId || !onReorder) return;
    const ids = ordered.map((s) => s.id);
    const fromIdx = ids.indexOf(fromId);
    const toIdx = ids.indexOf(toId);
    if (fromIdx === -1 || toIdx === -1) return;
    ids.splice(toIdx, 0, ids.splice(fromIdx, 1)[0]);
    onReorder(ids);
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {ordered.map((status) => {
        const colClients = clients.filter((c) => c.status_id === status.id);
        const colTotal = colClients.reduce(
          (s, c) => s + (Number(c.remaining_value) || 0),
          0
        );
        return (
          <div
            key={status.id}
            className={cn(
              "flex w-72 shrink-0 flex-col rounded-lg border bg-card/50 transition-colors",
              overCol === status.id && "border-brand",
              overColHeader === status.id && "border-brand border-dashed",
              !overCol && overColHeader !== status.id && "border-border"
            )}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragColId) setOverColHeader(status.id);
              else setOverCol(status.id);
            }}
            onDragLeave={() => {
              setOverCol((c) => (c === status.id ? null : c));
              setOverColHeader((c) => (c === status.id ? null : c));
            }}
            onDrop={() => {
              if (dragColId) {
                reorderColumns(dragColId, status.id);
              } else if (dragId) {
                onMove(dragId, status.id);
              }
              setDragId(null);
              setDragColId(null);
              setOverCol(null);
              setOverColHeader(null);
            }}
          >
            <div
              draggable={!!onReorder}
              onDragStart={(e) => {
                e.stopPropagation();
                setDragColId(status.id);
              }}
              onDragEnd={() => {
                setDragColId(null);
                setOverColHeader(null);
              }}
              className={cn(
                "flex items-center justify-between border-b border-border p-3",
                onReorder && "cursor-grab active:cursor-grabbing"
              )}
            >
              <div className="flex items-center gap-2">
                {onReorder && (
                  <GripVertical className="size-3.5 text-muted-foreground/50" />
                )}
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: status.color }}
                />
                <span className="text-sm font-medium text-foreground">{status.name}</span>
                <span className="text-xs text-muted-foreground">{colClients.length}</span>
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                <SensitiveValue>{formatCurrency(colTotal)}</SensitiveValue>
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-2 p-2">
              {colClients.map((c) => (
                <Card
                  key={c.id}
                  draggable
                  onDragStart={() => setDragId(c.id)}
                  onClick={() => onCardClick(c)}
                  className="cursor-pointer border-border bg-card p-3 transition-colors hover:border-brand/50"
                >
                  <p className="truncate text-sm font-medium text-foreground">{c.name}</p>
                  {c.product_name && (
                    <p className="truncate text-xs text-muted-foreground">{c.product_name}</p>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-brand">
                      <SensitiveValue>{formatCurrency(Number(c.remaining_value) || 0)}</SensitiveValue>
                    </span>
                    {c.next_collection_date && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarClock className="h-3 w-3" />
                        {new Date(c.next_collection_date + "T00:00:00").toLocaleDateString("pt-BR", {
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
            </div>
          </div>
        );
      })}
    </div>
  );
}
