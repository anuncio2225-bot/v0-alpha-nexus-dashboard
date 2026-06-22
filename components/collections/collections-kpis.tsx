"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import { formatCurrency } from "@/lib/utils";
import type { CollectionMetrics } from "@/types";
import {
  Wallet,
  CheckCircle2,
  CalendarClock,
  CalendarCheck,
  PhoneOff,
  TrendingUp,
} from "lucide-react";
import type { CollectionFilters } from "@/app/dashboard/collections/page";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function CollectionsKpis({ filters }: { filters: CollectionFilters }) {
  const query = new URLSearchParams();
  if (filters.search) query.set("search", filters.search);
  if (filters.statusIds.length > 0)
    query.set("status_ids", filters.statusIds.join(","));
  if (filters.attendants.length > 0)
    query.set("attendants", filters.attendants.join(","));
  if (filters.products.length > 0)
    query.set("products", filters.products.join(","));
  const qs = query.toString();

  const { data, isLoading } = useSWR<{ metrics: CollectionMetrics }>(
    `/api/collections/metrics${qs ? `?${qs}` : ""}`,
    fetcher,
    { refreshInterval: 60000 }
  );
  const m = data?.metrics;

  const items = [
    {
      label: "A receber hoje",
      value: m ? formatCurrency(m.total_due_today) : "—",
      sensitive: true,
      icon: Wallet,
      color: "text-brand",
    },
    {
      label: "Recebido hoje",
      value: m ? formatCurrency(m.received_today) : "—",
      sensitive: true,
      icon: CheckCircle2,
      color: "text-success",
    },
    {
      label: "Agendados hoje",
      value: m ? String(m.scheduled_today) : "—",
      icon: CalendarClock,
      color: "text-warn",
    },
    {
      label: "Agendados (Braip)",
      value: m ? String(m.braip_scheduled_count ?? 0) : "—",
      icon: CalendarCheck,
      color: "text-brand",
    },
    {
      label: "Sem resposta +3d",
      value: m ? String(m.no_response_count) : "—",
      icon: PhoneOff,
      color: "text-destructive",
    },
    {
      label: "Taxa de recuperação",
      value: m ? `${m.recovery_rate.toFixed(1)}%` : "—",
      icon: TrendingUp,
      color: "text-success",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {items.map((it) => (
        <Card key={it.label} className="bg-card border-border p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{it.label}</p>
            <it.icon className={`h-4 w-4 ${it.color}`} />
          </div>
          {isLoading ? (
            <Skeleton className="mt-2 h-7 w-20" />
          ) : (
            <p className={`mt-1 text-xl font-bold font-heading ${it.color}`}>
              {it.sensitive ? <SensitiveValue>{it.value}</SensitiveValue> : it.value}
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}
