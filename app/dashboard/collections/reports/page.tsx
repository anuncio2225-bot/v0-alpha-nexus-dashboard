"use client";

import useSWR from "swr";
import { CollectionsTabs } from "@/components/collections/collections-tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, Users, Package, DollarSign } from "lucide-react";
import { AttendantStatusReport } from "@/components/collections/attendant-status-report";
import type { CollectionMetrics } from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function CollectionsReportsPage() {
  const { data, isLoading } = useSWR<{ metrics: CollectionMetrics }>(
    "/api/collections/metrics",
    fetcher
  );
  const m = data?.metrics;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cobrança</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Relatórios e desempenho da recuperação.
        </p>
      </div>

      <CollectionsTabs />

      {isLoading || !m ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              icon={TrendingUp}
              label="Taxa de recuperação"
              value={`${m.recovery_rate.toFixed(1)}%`}
            />
            <SummaryCard
              icon={DollarSign}
              label="Total recuperado"
              value={<SensitiveValue>{formatCurrency(m.total_received)}</SensitiveValue>}
              accent="text-[var(--chart-2)]"
            />
            <SummaryCard
              icon={DollarSign}
              label="Total pendente"
              value={<SensitiveValue>{formatCurrency(m.total_pending)}</SensitiveValue>}
              accent="text-destructive"
            />
            <SummaryCard
              icon={Users}
              label="Total de clientes"
              value={String(m.total_clients)}
            />
          </div>

          <AttendantStatusReport metrics={m} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Por status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(m.by_status).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem dados.</p>
                ) : (
                  Object.entries(m.by_status).map(([name, v]) => {
                    const pct =
                      m.total_clients > 0
                        ? (v.count / m.total_clients) * 100
                        : 0;
                    return (
                      <div key={name} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-foreground">{name}</span>
                          <span className="text-muted-foreground">
                            {v.count} · {formatCurrency(v.value)}
                          </span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="size-4" /> Por atendente
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(m.by_attendant).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem dados.</p>
                ) : (
                  Object.entries(m.by_attendant).map(([name, v]) => (
                    <div
                      key={name}
                      className="flex items-center justify-between gap-4 text-sm"
                    >
                      <span className="truncate text-foreground">{name}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {v.count} · recuperado{" "}
                        <span className="text-[var(--chart-2)]">
                          {formatCurrency(v.received)}
                        </span>
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="size-4" /> Por produto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(m.by_product).length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem dados.</p>
              ) : (
                Object.entries(m.by_product).map(([name, v]) => (
                  <div
                    key={name}
                    className="flex items-center justify-between gap-4 text-sm"
                  >
                    <span className="truncate text-foreground">{name}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {v.count} · pendente {formatCurrency(v.pending)}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  accent = "text-foreground",
}: {
  icon: typeof Users;
  label: string;
  value: React.ReactNode;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
          <Icon className="size-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-lg font-bold ${accent}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
