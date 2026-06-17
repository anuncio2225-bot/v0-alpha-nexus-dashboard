"use client";

import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AttendantBadge } from "./attendant-badge";
import { Users } from "lucide-react";
import type { CollectionMetrics, CollectionStatus } from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Props {
  metrics: CollectionMetrics;
}

// Tabela resumo Atendente x Status (igual a planilha do Google Sheets)
export function AttendantStatusReport({ metrics }: Props) {
  const { data: statusData } = useSWR<{ statuses: CollectionStatus[] }>(
    "/api/collections/statuses",
    fetcher
  );
  const statuses = statusData?.statuses || [];

  // Ordena os status pela posicao configurada; usa apenas os que aparecem nos dados
  const statusNames = [...metrics.status_names].sort((a, b) => {
    const pa = statuses.find((s) => s.name === a)?.position ?? 999;
    const pb = statuses.find((s) => s.name === b)?.position ?? 999;
    return pa - pb;
  });

  const colorOf = (name: string) =>
    statuses.find((s) => s.name === name)?.color || "#6b7280";

  const attendants = Object.keys(metrics.attendant_status).sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );

  // Totais por status (rodape)
  const totals: Record<string, number> = {};
  for (const at of attendants) {
    for (const st of statusNames) {
      totals[st] = (totals[st] || 0) + (metrics.attendant_status[at][st] || 0);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4" /> Resumo por atendente
        </CardTitle>
      </CardHeader>
      <CardContent>
        {attendants.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem dados.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead>Atendente</TableHead>
                  {statusNames.map((st) => (
                    <TableHead key={st} className="text-center">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: colorOf(st) }}
                        />
                        {st}
                      </span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendants.map((at) => (
                  <TableRow key={at} className="border-border">
                    <TableCell>
                      <AttendantBadge name={at} />
                    </TableCell>
                    {statusNames.map((st) => {
                      const v = metrics.attendant_status[at][st] || 0;
                      return (
                        <TableCell
                          key={st}
                          className="text-center font-medium"
                          style={v > 0 ? { color: colorOf(st) } : undefined}
                        >
                          {v || "—"}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
                <TableRow className="border-border bg-muted/40 font-semibold hover:bg-muted/40">
                  <TableCell>TOTAL</TableCell>
                  {statusNames.map((st) => (
                    <TableCell
                      key={st}
                      className="text-center"
                      style={totals[st] > 0 ? { color: colorOf(st) } : undefined}
                    >
                      {totals[st] || "—"}
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
