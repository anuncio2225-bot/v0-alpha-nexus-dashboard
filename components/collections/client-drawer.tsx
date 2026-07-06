"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "./status-badge";
import { AttendantSelect } from "./attendant-select";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Phone,
  MessageCircle,
  DollarSign,
  CalendarClock,
  StickyNote,
  Mail,
  FileText,
  Package,
  User,
  ArrowRightLeft,
  CheckCircle2,
  Trash2,
  Truck,
  MapPin,
  CreditCard,
  CalendarDays,
  ExternalLink,
  Tag,
  Building2,
} from "lucide-react";
import {
  buildWhatsappUrl,
  correiosTrackingUrl,
  deliveryStatusLabel,
  formatDocument,
  formatPhoneDisplay,
} from "@/lib/collections/whatsapp";
import { Badge } from "@/components/ui/badge";
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
import type {
  CollectionClient,
  CollectionStatus,
  CollectionHistoryEvent,
} from "@/types";

interface ClientDrawerProps {
  clientId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statuses: CollectionStatus[];
  onChanged: () => void;
  onDeleted?: () => void;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const historyIcons: Record<string, typeof Phone> = {
  note: StickyNote,
  status_change: ArrowRightLeft,
  payment: DollarSign,
  call: Phone,
  message: MessageCircle,
  schedule: CalendarClock,
};

export function ClientDrawer({
  clientId,
  open,
  onOpenChange,
  statuses,
  onChanged,
  onDeleted,
}: ClientDrawerProps) {
  const { data, mutate: mutateClient } = useSWR<{
    client: CollectionClient;
    history: CollectionHistoryEvent[];
  }>(clientId ? `/api/collections/${clientId}` : null, fetcher);

  const { data: suggestions } = useSWR<{
    attendants: { id: string | null; name: string }[];
  }>(open ? "/api/collections/suggestions" : null, fetcher);

  const client = data?.client;
  const history = data?.history ?? [];

  const [note, setNote] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("PIX");
  const [scheduleDate, setScheduleDate] = useState("");
  const [busy, setBusy] = useState(false);

  function refresh() {
    mutateClient();
    onChanged();
  }

  async function handleDelete() {
    if (!clientId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/collections/${clientId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success("Removido da Cobrança");
      onChanged();
      onOpenChange(false);
      onDeleted?.();
    } catch {
      toast.error("Erro ao remover");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(statusId: string) {
    if (!clientId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/collections/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status_id: statusId }),
      });
      if (!res.ok) throw new Error();
      toast.success("Status atualizado");
      refresh();
    } catch {
      toast.error("Erro ao atualizar status");
    } finally {
      setBusy(false);
    }
  }

  async function addNote() {
    if (!clientId || !note.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/collections/${clientId}/history`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "note", description: note.trim() }),
      });
      if (!res.ok) throw new Error();
      setNote("");
      toast.success("Anotacao adicionada");
      refresh();
    } catch {
      toast.error("Erro ao adicionar anotacao");
    } finally {
      setBusy(false);
    }
  }

  async function registerPayment() {
    if (!clientId || !payAmount) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/collections/${clientId}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(payAmount),
          payment_method: payMethod,
        }),
      });
      if (!res.ok) throw new Error();
      setPayAmount("");
      toast.success("Pagamento registrado");
      refresh();
    } catch {
      toast.error("Erro ao registrar pagamento");
    } finally {
      setBusy(false);
    }
  }

  async function schedule() {
    if (!clientId || !scheduleDate) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/collections/${clientId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_date: scheduleDate }),
      });
      if (!res.ok) throw new Error();
      const json = await res.json().catch(() => null);
      setScheduleDate("");
      toast.success("Cobrança agendada");
      refresh();
      // Abre o Google Calendar para criar o lembrete (Melhoria 6)
      if (json?.calendar_url) {
        window.open(json.calendar_url, "_blank");
      }
    } catch {
      toast.error("Erro ao agendar");
    } finally {
      setBusy(false);
    }
  }

  function openWhatsApp() {
    if (!client) return;
    if (!client.phone) {
      toast.error("Cliente sem telefone cadastrado");
      return;
    }
    // Mensagem pre-preenchida de acordo com o status atual (Melhoria 5)
    const url = buildWhatsappUrl(client);
    if (url) window.open(url, "_blank");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        {!client ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Carregando...
          </div>
        ) : (
          <>
            <SheetHeader className="space-y-3 border-b border-border p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <SheetTitle className="truncate text-xl">
                    {client.name}
                  </SheetTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {client.platform_name || "Sem plataforma"}
                    {client.attendant_name ? ` · ${client.attendant_name}` : ""}
                  </p>
                </div>
                <StatusBadge
                  name={client.status_name}
                  color={
                    statuses.find((s) => s.id === client.status_id)?.color
                  }
                  system={
                    statuses.find((s) => s.id === client.status_id)?.is_system
                  }
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={openWhatsApp} className="gap-1.5">
                  <MessageCircle className="size-4" />
                  WhatsApp
                </Button>
                {client.payment_link && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(client.payment_link!, "_blank")}
                  >
                    Link de pagamento
                  </Button>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto gap-1.5 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                      Excluir
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir da Cobrança?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {client.name} será removido apenas do módulo de Cobrança.
                        A venda original na tabela de transacoes NAO sera afetada e
                        o cliente pode ser reimportado depois.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </SheetHeader>

            <Tabs defaultValue="info" className="flex min-h-0 flex-1 flex-col">
              <TabsList className="mx-6 mt-4 grid w-auto grid-cols-3">
                <TabsTrigger value="info">Informacoes</TabsTrigger>
                <TabsTrigger value="actions">Ações</TabsTrigger>
                <TabsTrigger value="timeline">Histórico</TabsTrigger>
              </TabsList>

              <ScrollArea className="min-h-0 flex-1">
                <TabsContent value="info" className="m-0 space-y-4 p-6">
                  <div className="grid grid-cols-3 gap-3">
                    <ValueCard
                      label="Comissão"
                      value={formatCurrency(client.total_value)}
                    />
                    <ValueCard
                      label="Pago"
                      value={formatCurrency(client.paid_value)}
                      accent="text-[var(--chart-2)]"
                    />
                    <ValueCard
                      label="Restante"
                      value={formatCurrency(client.remaining_value)}
                      accent="text-destructive"
                    />
                  </div>
                  {client.order_total_value ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                      <span className="text-xs text-muted-foreground">
                        Valor do kit (cobranca ao cliente)
                      </span>
                      <span className="font-semibold text-foreground">
                        {formatCurrency(Number(client.order_total_value))}
                      </span>
                    </div>
                  ) : null}
                  {client.braip_status && (
                    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                      <span className="text-xs text-muted-foreground">
                        Status na plataforma
                      </span>
                      <Badge variant="secondary" className="font-medium">
                        {client.braip_status}
                      </Badge>
                    </div>
                  )}
                  <Separator />
                  <dl className="space-y-3 text-sm">
                    <InfoRow
                      icon={Phone}
                      label="Telefone"
                      value={formatPhoneDisplay(client.phone)}
                    />
                    <InfoRow icon={Mail} label="Email" value={client.email} />
                    <InfoRow
                      icon={FileText}
                      label="Documento"
                      value={formatDocument(client.document)}
                    />
                    <InfoRow
                      icon={Package}
                      label="Produto"
                      value={client.product_name}
                    />
                    {client.plan_name && (
                      <InfoRow
                        icon={Tag}
                        label="Plano"
                        value={client.plan_name}
                      />
                    )}
                    <div className="flex items-center justify-between gap-4">
                      <dt className="flex items-center gap-2 text-muted-foreground">
                        <User className="size-4" />
                        Atendente
                      </dt>
                      <dd className="text-right">
                        <AttendantSelect
                          clientId={client.id}
                          currentName={client.attendant_name || client.src}
                          attendants={suggestions?.attendants || []}
                          onChanged={refresh}
                        />
                      </dd>
                    </div>
                    <InfoRow
                      icon={CreditCard}
                      label="Pagamento"
                      value={client.payment_method}
                    />
                    {client.transaction_code && (
                      <InfoRow
                        icon={Tag}
                        label="Cód. do pedido"
                        value={client.transaction_code}
                      />
                    )}
                    {client.document && (
                      <InfoRow
                        icon={FileText}
                        label="CPF / CNPJ"
                        value={client.document}
                      />
                    )}
                    <InfoRow
                      icon={CalendarDays}
                      label="Data do pedido"
                      value={
                        client.order_date
                          ? format(new Date(client.order_date), "dd/MM/yyyy")
                          : null
                      }
                    />
                    <InfoRow
                      icon={CalendarDays}
                      label="Data do pagamento"
                      value={
                        client.payment_date
                          ? format(new Date(client.payment_date), "dd/MM/yyyy")
                          : "Pendente"
                      }
                    />
                    <InfoRow
                      icon={CalendarClock}
                      label="Próxima cobrança"
                      value={
                        client.next_collection_date
                          ? format(
                              new Date(client.next_collection_date + "T00:00:00"),
                              "dd/MM/yyyy",
                            )
                          : null
                      }
                    />
                    {client.shipping_company && (
                      <InfoRow
                        icon={Building2}
                        label="Transportadora"
                        value={client.shipping_company}
                      />
                    )}
                    {client.delivery_status && (
                      <InfoRow
                        icon={Truck}
                        label="Entrega"
                        value={deliveryStatusLabel(client.delivery_status)}
                      />
                    )}
                    {client.tracking_code && (
                      <div className="flex items-center justify-between gap-4">
                        <dt className="flex items-center gap-2 text-muted-foreground">
                          <Package className="size-4" />
                          Rastreio
                        </dt>
                        <dd className="text-right">
                          <a
                            href={correiosTrackingUrl(client.tracking_code) ?? "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                          >
                            {client.tracking_code}
                            <ExternalLink className="size-3.5" />
                          </a>
                        </dd>
                      </div>
                    )}
                    {client.address_full && (
                      <div className="flex items-start justify-between gap-4">
                        <dt className="flex items-center gap-2 text-muted-foreground">
                          <MapPin className="size-4" />
                          Endereco
                        </dt>
                        <dd className="text-right text-foreground">
                          {client.address_full}
                        </dd>
                      </div>
                    )}
                    {client.payment_link && (
                      <div className="flex items-center justify-between gap-4">
                        <dt className="flex items-center gap-2 text-muted-foreground">
                          <CreditCard className="size-4" />
                          Link de pagamento
                        </dt>
                        <dd className="text-right">
                          <a
                            href={client.payment_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                          >
                            Abrir
                            <ExternalLink className="size-3.5" />
                          </a>
                        </dd>
                      </div>
                    )}
                  </dl>
                  {client.notes && (
                    <>
                      <Separator />
                      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                        {client.notes}
                      </p>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="actions" className="m-0 space-y-6 p-6">
                  <div className="space-y-2">
                    <Label>Mudar status</Label>
                    <Select
                      value={client.status_id ?? undefined}
                      onValueChange={changeStatus}
                      disabled={busy}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar status" />
                      </SelectTrigger>
                      <SelectContent>
                        {statuses.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                            {s.is_system && (
                              <span className="ml-1 text-muted-foreground">
                                (sistema)
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <DollarSign className="size-4" /> Registrar pagamento
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="Valor"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                      />
                      <Select value={payMethod} onValueChange={setPayMethod}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PIX">PIX</SelectItem>
                          <SelectItem value="Boleto">Boleto</SelectItem>
                          <SelectItem value="Cartao">Cartao</SelectItem>
                          <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      size="sm"
                      onClick={registerPayment}
                      disabled={busy || !payAmount}
                      className="w-full"
                    >
                      Registrar pagamento
                    </Button>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <CalendarClock className="size-4" /> Agendar cobranca
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        type="date"
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                      />
                      <Button
                        size="sm"
                        onClick={schedule}
                        disabled={busy || !scheduleDate}
                      >
                        Agendar
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <StickyNote className="size-4" /> Anotacao
                    </Label>
                    <Textarea
                      placeholder="Escreva uma anotacao..."
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={addNote}
                      disabled={busy || !note.trim()}
                      className="w-full"
                    >
                      Adicionar anotacao
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="timeline" className="m-0 p-6">
                  {history.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground">
                      Nenhum evento registrado ainda.
                    </p>
                  ) : (
                    <ol className="space-y-4">
                      {history.map((ev) => {
                        const Icon = historyIcons[ev.type] ?? CheckCircle2;
                        return (
                          <li key={ev.id} className="flex gap-3">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted">
                              <Icon className="size-4 text-muted-foreground" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-foreground">
                                {ev.description}
                              </p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {format(
                                  new Date(ev.created_at),
                                  "dd/MM/yyyy 'as' HH:mm",
                                  { locale: ptBR },
                                )}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ValueCard({
  label,
  value,
  accent = "text-foreground",
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${accent}`}>{value}</p>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Phone;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </dt>
      <dd className="truncate text-right text-foreground">{value || "—"}</dd>
    </div>
  );
}
