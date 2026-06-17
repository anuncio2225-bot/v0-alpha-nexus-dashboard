"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import { formatCurrency } from "@/lib/utils";
import type { CollectionMetrics } from "@/types";
import { Wallet, CheckCircle2, CalendarClock, PhoneOff, TrendingUp } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function CollectionsKpis() {
  const { data, isLoading } = useSWR<{ metrics: CollectionMetrics }>(
    "/api/collections/metrics",
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
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
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
