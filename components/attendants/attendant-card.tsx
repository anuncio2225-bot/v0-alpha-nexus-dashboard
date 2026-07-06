"use client";

import { useState } from "react";
import useSWR from "swr";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn, formatCurrency } from "@/lib/utils";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import { toast } from "sonner";
import {
  Settings,
  BarChart3,
  Wallet,
  User,
  Calendar,
  CheckCircle2,
  Square,
  AlertTriangle,
  Trophy,
  Trash2,
} from "lucide-react";
import type { Attendant, CommissionResult } from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Props {
  attendant: Attendant;
  /** Período fixo aplicado a todas as atendentes. null = período de fechamento próprio. */
  period?: { start: string; end: string } | null;
  onConfigure: (a: Attendant) => void;
  onDetails: (a: Attendant, commission: CommissionResult) => void;
  onChanged: () => void;
}

export function AttendantCard({ attendant, period, onConfigure, onDetails, onChanged }: Props) {
  const [registering, setRegistering] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isInactive = attendant.status === "inactive";

  async function handleToggleActive(next: boolean) {
    setTogglingActive(true);
    try {
      const res = await fetch("/api/attendants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: attendant.id,
          status: next ? "active" : "inactive",
        }),
      });
      if (!res.ok) throw new Error();
      toast.success(next ? "Atendente ativada" : "Atendente inativada");
      onChanged();
    } catch {
      toast.error("Erro ao atualizar status");
    } finally {
      setTogglingActive(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/attendants?id=${attendant.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success("Atendente removida");
      onChanged();
    } catch {
      toast.error("Erro ao remover atendente");
    } finally {
      setDeleting(false);
    }
  }

  const commissionUrl = period
    ? `/api/attendants/${attendant.id}/commission?period_start=${period.start}&period_end=${period.end}`
    : `/api/attendants/${attendant.id}/commission`;

  const { data, mutate } = useSWR<
    CommissionResult & { sales: unknown[]; has_commission_rule?: boolean }
  >(commissionUrl, fetcher);

  const roleLabels: Record<string, string> = {
    closer: "Closer",
    sdr: "SDR",
    cs: "CS",
    cobrador: "Cobrador",
    outro: "Outro",
  };

  // Só avisa "Configure as faixas" se NÃO houver nenhuma faixa de comissão
  // salva em attendant_rules e também não houver comissão fixa configurada.
  // (Antes usava commission_tier.percent, que fica 0 quando não há vendas no
  // período mesmo com faixas configuradas — causando o aviso indevido.)
  const needsConfig =
    !!data && !data.has_commission_rule && (attendant.commission_rate || 0) === 0;

  // Progresso rumo à próxima faixa
  const current = data?.total_sales || 0;
  const nextTarget = data?.next_tier
    ? current + data.next_tier.sales_needed
    : current;
  const progress =
    data?.next_tier && nextTarget > 0
      ? Math.min((current / nextTarget) * 100, 100)
      : 100;

  async function handleRegisterPayment() {
    if (!data) return;
    setRegistering(true);
    try {
      const res = await fetch(`/api/attendants/${attendant.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period_start: data.period.start,
          period_end: data.period.end,
          total_sales: data.total_sales,
          commission_percent: data.commission_tier.percent,
          commission_value: data.commission_value,
          bonus_total: data.bonus_total,
          fixed_per_sale_total: data.fixed_per_sale_total,
          platform_deductions: data.platform_deductions,
          total_to_pay: data.total_to_pay,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Pagamento registrado");
      mutate();
    } catch {
      toast.error("Erro ao registrar pagamento");
    } finally {
      setRegistering(false);
    }
  }

  return (
    <Card className={cn("bg-card border-border card-hover", isInactive && "opacity-60")}>
      <CardContent className="p-4 space-y-4">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="rounded-full bg-brand/10 p-1.5">
                <User className="h-4 w-4 text-brand" />
              </div>
              <h3 className="font-semibold text-foreground truncate">
                {attendant.name}
              </h3>
              {attendant.auto_detected && (
                <Badge variant="outline" className="text-[10px] border-brand/30 text-brand shrink-0">
                  auto
                </Badge>
              )}
              {isInactive && (
                <Badge variant="outline" className="text-[10px] border-border text-muted-foreground shrink-0">
                  inativa
                </Badge>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground truncate">
              {attendant.src ? `SRC: ${attendant.src}` : "sem SRC"}
              {" · "}
              {roleLabels[attendant.role] || attendant.role}
              {attendant.email ? ` · ${attendant.email}` : ""}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">
                {isInactive ? "Inativa" : "Ativa"}
              </span>
              <Switch
                checked={!isInactive}
                disabled={togglingActive}
                onCheckedChange={handleToggleActive}
                aria-label="Ativar ou inativar atendente"
              />
            </div>
            <Badge variant="outline" className="gap-1 text-xs border-border text-muted-foreground">
              <Calendar className="h-3 w-3" />
              Dia {attendant.payment_closing_day}
            </Badge>
          </div>
        </div>

        {needsConfig && (
          <div className="flex items-center gap-2 rounded-md bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Configure as faixas de comissão desta atendente
          </div>
        )}

        {!data ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            {/* Progresso de vendas */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  <span className="font-semibold text-foreground">{data.total_sales}</span>
                  {data.next_tier ? ` / ${nextTarget} vendas` : " vendas"}
                </span>
                <span className="font-medium text-brand">
                  Faixa atual: {data.commission_tier.percent}%
                </span>
              </div>
              <Progress value={progress} className="h-2" />
              {data.next_tier ? (
                <p className="text-xs text-muted-foreground">
                  Próxima faixa: {data.next_tier.percent}% (faltam {data.next_tier.sales_needed} vendas)
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Faixa máxima atingida</p>
              )}
            </div>

            <Separator />

            {/* Comissão + bônus */}
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Wallet className="h-3.5 w-3.5" /> Comissão
                </span>
                <span className="font-medium text-foreground">
                  <SensitiveValue>{formatCurrency(data.commission_value)}</SensitiveValue>
                  <span className="ml-1 text-xs text-muted-foreground">
                    ({data.commission_tier.percent}% de {formatCurrency(data.base_value_total)})
                  </span>
                </span>
              </div>

              {attendant.fixed_per_sale > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Fixo por venda</span>
                  <span className="font-medium text-foreground">
                    <SensitiveValue>{formatCurrency(data.fixed_per_sale_total)}</SensitiveValue>
                  </span>
                </div>
              )}

              {data.bonuses.map((b, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Trophy className="h-3.5 w-3.5" /> Bônus ({b.label})
                  </span>
                  <span className="flex items-center gap-1.5">
                    {b.achieved ? (
                      <>
                        <span className="font-medium text-success">
                          <SensitiveValue>{formatCurrency(b.value)}</SensitiveValue>
                        </span>
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      </>
                    ) : (
                      <>
                        <span className="text-muted-foreground/60">
                          faltam {b.remaining}
                        </span>
                        <Square className="h-3.5 w-3.5 text-muted-foreground/40" />
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>

            <Separator />

            {/* Total */}
            <div className="flex items-center justify-between rounded-md bg-success/10 px-3 py-2">
              <span className="text-sm font-medium text-foreground">Total a pagar</span>
              <span className="text-lg font-bold text-success">
                <SensitiveValue>{formatCurrency(data.total_to_pay)}</SensitiveValue>
              </span>
            </div>

            {/* Ações */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 min-w-[7rem]"
                onClick={() => onConfigure(attendant)}
              >
                <Settings className="mr-1.5 h-3.5 w-3.5" /> Configurar
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 min-w-[7rem]"
                onClick={() => onDetails(attendant, data)}
              >
                <BarChart3 className="mr-1.5 h-3.5 w-3.5" /> Detalhes
              </Button>
              <Button
                size="sm"
                className="flex-1 min-w-[7rem] bg-brand hover:bg-brand/90"
                disabled={registering || data.total_to_pay <= 0}
                onClick={handleRegisterPayment}
              >
                <Wallet className="mr-1.5 h-3.5 w-3.5" />
                {registering ? "..." : "Registrar"}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    aria-label="Remover atendente"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="bg-card border-border">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remover {attendant.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      As vendas dela continuarão no sistema mas não serão mais
                      vinculadas a esta atendente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={deleting}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={handleDelete}
                    >
                      {deleting ? "Removendo..." : "Remover"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
