"use client";

import useSWR from "swr";
import { CollectionsTabs } from "@/components/collections/collections-tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/collections/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import type { CollectionClient, CollectionStatus } from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function CollectionsAgendaPage() {
  const { data, isLoading } = useSWR<{ clients: CollectionClient[] }>(
    "/api/collections?has_schedule=1&page_size=200",
    fetcher
  );
  const { data: statusData } = useSWR<{ statuses: CollectionStatus[] }>(
    "/api/collections/statuses",
    fetcher
  );

  const clients = (data?.clients || []).filter((c) => c.next_collection_date);
  const statuses = statusData?.statuses || [];

  // Agrupa por data
  const grouped = clients.reduce<Record<string, CollectionClient[]>>(
    (acc, c) => {
      const key = c.next_collection_date as string;
      (acc[key] ||= []).push(c);
      return acc;
    },
    {}
  );
  const days = Object.keys(grouped).sort();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cobrança</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Agenda de cobranças programadas.
        </p>
      </div>

      <CollectionsTabs />

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : days.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <CalendarDays className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nenhuma cobrança agendada no momento.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {days.map((day) => {
            const dayDate = new Date(day + "T00:00:00");
            const items = grouped[day];
            const total = items.reduce(
              (s, c) => s + (c.remaining_value || 0),
              0
            );
            return (
              <Card key={day}>
                <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
                  <CardTitle className="text-base capitalize">
                    {format(dayDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                  </CardTitle>
                  <span className="text-sm text-muted-foreground">
                    {items.length} cliente(s) · {formatCurrency(total)}
                  </span>
                </CardHeader>
                <CardContent className="space-y-2">
                  {items.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {c.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.product_name || "Sem produto"}
                          {c.attendant_name ? ` · ${c.attendant_name}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-destructive">
                          {formatCurrency(c.remaining_value)}
                        </span>
                        <StatusBadge
                          name={c.status_name}
                          color={
                            statuses.find((s) => s.id === c.status_id)?.color
                          }
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
