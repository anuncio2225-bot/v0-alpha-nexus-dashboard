"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import { formatCurrency, cn } from "@/lib/utils";
import { ArrowDownRight, ArrowUpRight, AlertTriangle } from "lucide-react";
import type { StockMovement } from "./types";

const PAGE_SIZE = 15;

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function StockTable({
  movements,
  isLoading,
}: {
  movements: StockMovement[];
  isLoading: boolean;
}) {
  const [page, setPage] = useState(0);

  if (isLoading) {
    return <Skeleton className="h-96 w-full rounded-xl" />;
  }

  const totalPages = Math.max(1, Math.ceil(movements.length / PAGE_SIZE));
  const current = Math.min(page, totalPages - 1);
  const slice = movements.slice(
    current * PAGE_SIZE,
    current * PAGE_SIZE + PAGE_SIZE
  );

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right">Qtd</TableHead>
              <TableHead className="text-right">Custo Unit.</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slice.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  Nenhuma movimentação no período.
                </TableCell>
              </TableRow>
            ) : (
              slice.map((m) => {
                const isEntry = m.type === "entry";
                return (
                  <TableRow key={m.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatDate(m.date)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "gap-1 font-medium",
                          isEntry
                            ? "border-emerald-500/30 text-emerald-500"
                            : "border-destructive/30 text-destructive"
                        )}
                      >
                        {isEntry ? (
                          <ArrowUpRight className="h-3 w-3" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3" />
                        )}
                        {isEntry ? "Entrada" : "Saída"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm text-foreground">
                          {m.description || "—"}
                        </span>
                        {!m.kit_matched && !isEntry && (
                          <span
                            className="inline-flex items-center gap-1 text-xs text-warning"
                            title="Kit não identificado — revise manualmente"
                          >
                            <AlertTriangle className="h-3 w-3" />
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right text-sm font-medium tabular-nums",
                        isEntry ? "text-emerald-500" : "text-destructive"
                      )}
                    >
                      {isEntry ? "+" : "−"}
                      {m.quantity}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {isEntry ? (
                        <SensitiveValue>
                          {formatCurrency(m.unit_cost)}
                        </SensitiveValue>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {isEntry ? (
                        <SensitiveValue>
                          {formatCurrency(m.total_cost)}
                        </SensitiveValue>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums text-foreground">
                      {m.balance_after}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {movements.length > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <span className="text-xs text-muted-foreground">
              Página {current + 1} de {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={current === 0}
                onClick={() => setPage(current - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={current >= totalPages - 1}
                onClick={() => setPage(current + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
