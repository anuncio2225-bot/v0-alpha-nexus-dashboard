"use client";

import { useState } from "react";
import useSWR from "swr";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { formatPeriodRange } from "@/lib/format-period";
import { cn, formatCurrency } from "@/lib/utils";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import { toast } from "sonner";
import {
  Settings,
  BarChart3,
  Wallet,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Trophy,
  Trash2,
  Clock,
  ChevronDown,
  GripVertical,
} from "lucide-react";
import type { Attendant, CommissionResult } from "@/types";

/** Linha de venda paga que a rota de comissão devolve. */
interface VendaCliente {
  date: string;
  customer_name: string | null;
  commission: number;
  ganho?: number;
  afterpay?: boolean;
}

// 1º ouro, 2º prata, 3º bronze; do 4º em diante, sem medalha.
export const MEDALHAS = [
  "bg-amber-400 text-amber-950",
  "bg-slate-300 text-slate-900",
  "bg-orange-600 text-orange-50",
];
export const CORES_ATENDENTE = [
  "bg-brand/15 text-brand",
  "bg-violet-500/15 text-violet-400",
  "bg-sky-500/15 text-sky-400",
  "bg-pink-500/15 text-pink-400",
  "bg-amber-500/15 text-amber-400",
  "bg-teal-500/15 text-teal-400",
];
export function corDoNome(nome: string) {
  let h = 0;
  for (const ch of nome) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CORES_ATENDENTE[h % CORES_ATENDENTE.length];
}
export function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] || "") + (p.length > 1 ? p[p.length - 1][0] : p[0]?.[1] || "")).toUpperCase();
}
const dataCurta = (ymd: string) => (ymd ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}` : "—");

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Props {
  attendant: Attendant;
  /** Período fixo aplicado a todas as atendentes. null = período de fechamento próprio. */
  period?: { start: string; end: string } | null;
  onConfigure: (a: Attendant) => void;
  onDetails: (a: Attendant, commission: CommissionResult) => void;
  onChanged: () => void;
  /** Atendente vendo o próprio cartão: sem configurar, registrar, ativar ou remover. */
  somenteLeitura?: boolean;
  /** Posição no ranking do período (1 = mais vendas). */
  posicao?: number;
  /** Alça de arrastar (dnd-kit): presente = o cartão pode mudar de lugar. */
  alca?: React.ButtonHTMLAttributes<HTMLButtonElement> & { ref?: (el: HTMLElement | null) => void };
  arrastando?: boolean;
}

export function AttendantCard({
  attendant,
  period,
  onConfigure,
  onDetails,
  onChanged,
  somenteLeitura,
  posicao,
  alca,
  arrastando,
}: Props) {
  const [aba, setAba] = useState<"pagos" | "abertos" | null>(null);
  const [registering, setRegistering] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [note, setNote] = useState("");
  const [registerCashflow, setRegisterCashflow] = useState(true);

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

  // Histórico de pagamentos: usado para saber se o período atual já foi pago.
  const { data: paymentsData, mutate: mutatePayments } = useSWR<{
    payments: { period_start: string; period_end: string; status: string }[];
  }>(`/api/attendants/${attendant.id}/payments`, fetcher);

  const periodPaid = !!(
    data &&
    paymentsData?.payments?.some(
      (p) =>
        p.period_start === data.period.start &&
        p.period_end === data.period.end
    )
  );

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
          register_cashflow: registerCashflow,
          note,
          attendant_name: attendant.name,
        }),
      });
      if (res.status === 409) {
        toast.error("Este período já foi registrado");
        setShowRegister(false);
        mutatePayments();
        return;
      }
      if (!res.ok) throw new Error();
      const json = await res.json();
      toast.success(
        `Pagamento de ${formatCurrency(data.total_to_pay)} registrado para ${attendant.name}.` +
          (json.cashflow_registered ? " Lançado no Fluxo de Caixa." : "")
      );
      setShowRegister(false);
      setNote("");
      mutate();
      mutatePayments();
    } catch {
      toast.error("Erro ao registrar pagamento");
    } finally {
      setRegistering(false);
    }
  }

  const pagos = (data?.sales || []) as VendaCliente[];
  const abertos = data?.afterpay_pendente?.clientes || [];
  const aLiberar = data?.afterpay_pendente?.comissao || 0;
  const medalha = posicao ? MEDALHAS[posicao - 1] : undefined;

  return (
    <Card
      className={cn(
        // gap-0/py-0: o Card base tem py-6 gap-6, que deixava um vão em cima e embaixo.
        "group/cartao flex h-full flex-col gap-0 overflow-hidden border-border bg-card py-0 transition-shadow hover:shadow-lg",
        isInactive && "opacity-60",
        arrastando && "shadow-2xl ring-1 ring-brand/50"
      )}
    >
      <CardContent className="flex flex-1 flex-col gap-3.5 p-4">
        {/* Cabeçalho */}
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <div
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold",
                corDoNome(attendant.name)
              )}
            >
              {iniciais(attendant.name)}
            </div>
            {medalha && (
              <span
                className={cn(
                  "absolute -bottom-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-card px-1 text-[10px] font-bold",
                  medalha
                )}
              >
                {posicao}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="truncate font-semibold text-foreground">{attendant.name}</h3>
              {isInactive && (
                <Badge variant="outline" className="shrink-0 border-border text-[10px] text-muted-foreground">
                  inativa
                </Badge>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {roleLabels[attendant.role] || attendant.role}
              {attendant.src ? ` · SRC ${attendant.src}` : " · sem SRC"}
            </p>
            {data?.period && (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {formatPeriodRange(data.period.start, data.period.end)} · fecha dia {attendant.payment_closing_day}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Switch
              checked={!isInactive}
              disabled={togglingActive || somenteLeitura}
              onCheckedChange={handleToggleActive}
              aria-label={isInactive ? "Ativar atendente" : "Inativar atendente"}
            />
            {alca && (
              <button
                type="button"
                {...alca}
                aria-label="Arrastar para mudar a ordem"
                title="Arraste para mudar a ordem"
                className="-mr-1.5 flex h-8 w-6 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
              >
                <GripVertical className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {needsConfig && (
          <div className="flex items-center gap-2 rounded-md bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Configure as faixas de comissão desta atendente
          </div>
        )}

        {!data ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <>
            {/* Quanto tem a receber: liberado (pago) e AfterPay que ainda vai entrar */}
            <div className="grid grid-cols-2 gap-2">
              <div
                className={cn(
                  "rounded-lg border p-3",
                  data.total_to_pay > 0 ? "border-success/25 bg-success/10" : "border-border bg-muted/20"
                )}
              >
                <p
                  className={cn(
                    "flex items-center gap-1 text-[11px] font-medium",
                    data.total_to_pay > 0 ? "text-success" : "text-muted-foreground"
                  )}
                >
                  <Wallet className="h-3.5 w-3.5" /> A receber
                </p>
                <p
                  className={cn(
                    "mt-1 text-xl font-bold leading-none tabular-nums",
                    data.total_to_pay > 0 ? "text-success" : "text-muted-foreground/70"
                  )}
                >
                  <SensitiveValue>{formatCurrency(data.total_to_pay)}</SensitiveValue>
                </p>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {periodPaid ? (
                    <span className="flex items-center gap-1 font-medium text-success">
                      <CheckCircle2 className="h-3 w-3" /> Já recebeu
                    </span>
                  ) : (
                    `${data.total_sales} paga${data.total_sales !== 1 ? "s" : ""} · liberado`
                  )}
                </p>
              </div>
              <div
                className={cn(
                  "rounded-lg border p-3",
                  aLiberar > 0 ? "border-warning/25 bg-warning/10" : "border-border bg-muted/20"
                )}
              >
                <p
                  className={cn(
                    "flex items-center gap-1 text-[11px] font-medium",
                    aLiberar > 0 ? "text-warning" : "text-muted-foreground"
                  )}
                >
                  <Clock className="h-3.5 w-3.5" /> AfterPay a liberar
                </p>
                <p
                  className={cn(
                    "mt-1 text-xl font-bold leading-none tabular-nums",
                    aLiberar > 0 ? "text-warning" : "text-muted-foreground/70"
                  )}
                >
                  <SensitiveValue>{formatCurrency(aLiberar)}</SensitiveValue>
                </p>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {abertos.length} cliente{abertos.length !== 1 ? "s" : ""} vão pagar
                </p>
              </div>
            </div>

            {/* Faixa e progresso */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">
                  Faixa <span className="font-semibold text-brand">{data.commission_tier.percent}%</span>
                  {" · "}
                  <SensitiveValue>{formatCurrency(data.commission_value)}</SensitiveValue> de comissão
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {data.next_tier
                    ? `${data.next_tier.percent}% em ${data.next_tier.sales_needed} venda${data.next_tier.sales_needed !== 1 ? "s" : ""}`
                    : "faixa máxima"}
                </span>
              </div>
              <Progress value={progress} className="h-1.5" />
            </div>

            {/* Bônus e fixo em etiquetas, sem ocupar uma linha cada */}
            {(data.bonuses.length > 0 || attendant.fixed_per_sale > 0) && (
              <div className="flex flex-wrap gap-1.5">
                {attendant.fixed_per_sale > 0 && (
                  <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                    Fixo <SensitiveValue>{formatCurrency(data.fixed_per_sale_total)}</SensitiveValue>
                  </span>
                )}
                {data.bonuses.map((b, i) => (
                  <span
                    key={i}
                    className={cn(
                      "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                      b.achieved
                        ? "border-success/30 bg-success/10 text-success"
                        : "border-border text-muted-foreground"
                    )}
                  >
                    <Trophy className="h-3 w-3" />
                    {b.label}
                    {b.achieved ? (
                      <>
                        {" · "}
                        <SensitiveValue>{formatCurrency(b.value)}</SensitiveValue>
                      </>
                    ) : (
                      ` · faltam ${b.remaining}`
                    )}
                  </span>
                ))}
              </div>
            )}

            {/* Clientes: quem pagou (comissão liberada) e quem ainda vai pagar */}
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="grid grid-cols-2 text-xs">
                {(
                  [
                    { k: "pagos", t: `Pagaram (${pagos.length})` },
                    { k: "abertos", t: `Vão pagar (${abertos.length})` },
                  ] as const
                ).map((x) => (
                  <button
                    key={x.k}
                    type="button"
                    onClick={() => setAba(aba === x.k ? null : x.k)}
                    className={cn(
                      "flex items-center justify-center gap-1 py-2 font-medium transition-colors",
                      aba === x.k ? "bg-brand/10 text-brand" : "text-muted-foreground hover:bg-muted/40"
                    )}
                  >
                    {x.t}
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", aba === x.k && "rotate-180")} />
                  </button>
                ))}
              </div>
              {aba && (
                <ul className="max-h-56 divide-y divide-border overflow-y-auto border-t border-border">
                  {(aba === "pagos" ? pagos.length : abertos.length) === 0 ? (
                    <li className="px-3 py-3 text-center text-xs text-muted-foreground">
                      {aba === "pagos" ? "Nenhum cliente pagou no período" : "Nenhum AfterPay em aberto"}
                    </li>
                  ) : aba === "pagos" ? (
                    pagos.map((v, i) => (
                      <LinhaCliente
                        key={i}
                        nome={v.customer_name}
                        detalhe={`pagou ${dataCurta(v.date)}`}
                        etiqueta={v.afterpay ? "AfterPay liberado" : undefined}
                        valor={v.ganho ?? v.commission}
                        cor="text-success"
                      />
                    ))
                  ) : (
                    abertos.map((c, i) => (
                      <LinhaCliente
                        key={i}
                        nome={c.nome}
                        detalhe={`vendeu ${dataCurta(c.data)}`}
                        etiqueta={c.status === "aguardando" ? "Em cobrança" : "A caminho"}
                        valor={c.comissao}
                        cor="text-warning"
                      />
                    ))
                  )}
                </ul>
              )}
            </div>

            {/* Ações */}
            <div className="mt-auto flex gap-2 pt-1">
              {!somenteLeitura && (
                <Button variant="outline" size="sm" className="min-w-0 flex-1 px-2 text-xs" onClick={() => onConfigure(attendant)}>
                  <Settings className="mr-1.5 h-3.5 w-3.5" /> Configurar
                </Button>
              )}
              <Button variant="outline" size="sm" className="min-w-0 flex-1 px-2 text-xs" onClick={() => onDetails(attendant, data)}>
                <BarChart3 className="mr-1.5 h-3.5 w-3.5" /> Detalhes
              </Button>
              {!somenteLeitura && (
                <>
                  <Button
                    size="sm"
                    className="min-w-0 flex-1 bg-brand px-2 text-xs hover:bg-brand/90"
                    disabled={data.total_to_pay <= 0 || periodPaid}
                    onClick={() => setShowRegister(true)}
                  >
                    {periodPaid ? (
                      <>
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Pago
                      </>
                    ) : (
                      <>
                        <Wallet className="mr-1.5 h-3.5 w-3.5" /> Pagar
                      </>
                    )}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
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
                </>
              )}
            </div>

            {/* Modal de confirmação do registro de pagamento */}
            <Dialog open={showRegister} onOpenChange={setShowRegister}>
              <DialogContent className="bg-card border-border">
                <DialogHeader>
                  <DialogTitle>Registrar pagamento</DialogTitle>
                  <DialogDescription>
                    Confirme os dados do pagamento de {attendant.name}.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-2 rounded-lg border border-border bg-card-elevated p-3 text-sm">
                  <RegisterLine label="Atendente" value={attendant.name} />
                  <RegisterLine
                    label="Período"
                    value={formatPeriodRange(data.period.start, data.period.end)}
                  />
                  <RegisterLine label="Vendas pagas" value={String(data.total_sales)} />
                  <RegisterLine
                    label="Comissão"
                    value={formatCurrency(data.commission_value)}
                  />
                  <RegisterLine
                    label="Bônus"
                    value={formatCurrency(data.bonus_total)}
                  />
                  {data.fixed_per_sale_total > 0 && (
                    <RegisterLine
                      label="Fixo por venda"
                      value={formatCurrency(data.fixed_per_sale_total)}
                    />
                  )}
                  <div className="flex items-center justify-between border-t border-border pt-2 font-semibold">
                    <span className="text-foreground">Total a pagar</span>
                    <span className="text-success">
                      {formatCurrency(data.total_to_pay)}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pay-note" className="text-xs">
                    Observação (opcional)
                  </Label>
                  <Textarea
                    id="pay-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ex.: pago via PIX"
                    className="bg-card-elevated border-border"
                    rows={2}
                  />
                </div>

                <label className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    checked={registerCashflow}
                    onCheckedChange={(v) => setRegisterCashflow(v === true)}
                  />
                  Registrar no Fluxo de Caixa
                </label>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setShowRegister(false)}
                    disabled={registering}
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="bg-brand hover:bg-brand/90"
                    onClick={handleRegisterPayment}
                    disabled={registering}
                  >
                    {registering ? "Registrando..." : "Confirmar"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Cliente na lista do cartão: nome, quando, etiqueta e quanto ela ganha. */
function LinhaCliente({
  nome,
  detalhe,
  etiqueta,
  valor,
  cor,
}: {
  nome: string | null;
  detalhe: string;
  etiqueta?: string;
  valor: number;
  cor: string;
}) {
  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-foreground">{nome || "Cliente sem nome"}</p>
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {detalhe}
          {etiqueta && <span className="rounded bg-muted px-1 py-px text-[10px]">{etiqueta}</span>}
        </p>
      </div>
      <span className={cn("shrink-0 text-xs font-semibold", cor)}>
        +<SensitiveValue>{formatCurrency(valor)}</SensitiveValue>
      </span>
    </li>
  );
}

/** Linha "rótulo ..... valor" do resumo de confirmação. */
function RegisterLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
