"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import { formatCurrency, cn } from "@/lib/utils";
import type { CollectionClient, CollectionStatus } from "@/types";
import { CalendarClock } from "lucide-react";

interface KanbanProps {
  clients: CollectionClient[];
  statuses: CollectionStatus[];
  onCardClick: (client: CollectionClient) => void;
  onMove: (clientId: string, statusId: string) => void;
}

export function CollectionsKanban({ clients, statuses, onCardClick, onMove }: KanbanProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  const ordered = [...statuses].sort((a, b) => a.position - b.position);

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
              overCol === status.id ? "border-brand" : "border-border"
            )}
            onDragOver={(e) => {
              e.preventDefault();
              setOverCol(status.id);
            }}
            onDragLeave={() => setOverCol((c) => (c === status.id ? null : c))}
            onDrop={() => {
              if (dragId) onMove(dragId, status.id);
              setDragId(null);
              setOverCol(null);
            }}
          >
            <div className="flex items-center justify-between border-b border-border p-3">
              <div className="flex items-center gap-2">
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
