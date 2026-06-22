"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import type { CollectionStatus, CollectionPlatform } from "@/types";

interface Attendant {
  id: string;
  name: string;
}

interface SuggestionsResponse {
  products: string[];
  attendants: { id: string | null; name: string }[];
  payment_methods: string[];
}

interface NewClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statuses: CollectionStatus[];
  platforms: CollectionPlatform[];
  attendants: Attendant[];
  onCreated: () => void;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function NewClientDialog({
  open,
  onOpenChange,
  statuses,
  platforms,
  onCreated,
}: NewClientDialogProps) {
  const [loading, setLoading] = useState(false);
  // valor do atendente selecionado: "id:<uuid>" para cadastrado ou "src:<nome>"
  const [attendantValue, setAttendantValue] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("");

  const { data: suggestions } = useSWR<SuggestionsResponse>(
    open ? "/api/collections/suggestions" : null,
    fetcher
  );

  const products = suggestions?.products || [];
  const attendantOptions = suggestions?.attendants || [];
  const paymentMethods = suggestions?.payment_methods || [];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);

    // Resolve atendente: id cadastrado OU nome (src)
    let attendant_id: string | null = null;
    let attendant_name: string | null = null;
    if (attendantValue.startsWith("id:")) {
      const id = attendantValue.slice(3);
      attendant_id = id;
      attendant_name =
        attendantOptions.find((a) => a.id === id)?.name || null;
    } else if (attendantValue.startsWith("src:")) {
      attendant_name = attendantValue.slice(4);
    }

    const payload = {
      name: fd.get("name"),
      phone: fd.get("phone") || null,
      email: fd.get("email") || null,
      document: fd.get("document") || null,
      product_name: fd.get("product_name") || null,
      platform_id: fd.get("platform_id") || null,
      attendant_id,
      attendant_name,
      status_id: fd.get("status_id") || null,
      total_value: parseFloat(fd.get("total_value") as string) || 0,
      paid_value: parseFloat(fd.get("paid_value") as string) || 0,
      payment_method: paymentMethod || null,
      payment_link: fd.get("payment_link") || null,
      next_collection_date: fd.get("next_collection_date") || null,
      notes: fd.get("notes") || null,
    };
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      toast.success("Cliente adicionado");
      setAttendantValue("");
      setPaymentMethod("");
      onOpenChange(false);
      onCreated();
    } catch {
      toast.error("Erro ao salvar cliente");
    } finally {
      setLoading(false);
    }
  }

  const defaultStatus = statuses.find((s) => s.is_default) || statuses[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo Cliente de Cobrança</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome *</Label>
            <Input id="name" name="name" required className="bg-card-elevated border-border" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="phone">WhatsApp</Label>
              <Input id="phone" name="phone" placeholder="5511999999999" className="bg-card-elevated border-border" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="document">CPF/CNPJ</Label>
              <Input id="document" name="document" className="bg-card-elevated border-border" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" className="bg-card-elevated border-border" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="product_name">Produto</Label>
            <Input
              id="product_name"
              name="product_name"
              list="product-suggestions"
              placeholder="Selecione ou digite um novo"
              className="bg-card-elevated border-border"
            />
            <datalist id="product-suggestions">
              {products.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="total_value">Valor total (R$)</Label>
              <Input id="total_value" name="total_value" type="number" step="0.01" defaultValue={0} className="bg-card-elevated border-border" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="paid_value">Já pago (R$)</Label>
              <Input id="paid_value" name="paid_value" type="number" step="0.01" defaultValue={0} className="bg-card-elevated border-border" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select name="status_id" defaultValue={defaultStatus?.id}>
                <SelectTrigger className="bg-card-elevated border-border">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: s.color || "#6b7280" }}
                        />
                        {s.name}
                        {s.is_system && (
                          <span className="text-muted-foreground">
                            (sistema)
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Plataforma</Label>
              <Select name="platform_id">
                <SelectTrigger className="bg-card-elevated border-border">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {platforms.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.is_system && (
                        <span className="ml-1 text-muted-foreground">
                          (sistema)
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Atendente</Label>
              <Select value={attendantValue} onValueChange={setAttendantValue}>
                <SelectTrigger className="bg-card-elevated border-border">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {attendantOptions.map((a) => (
                    <SelectItem
                      key={a.id ? `id:${a.id}` : `src:${a.name}`}
                      value={a.id ? `id:${a.id}` : `src:${a.name}`}
                    >
                      {a.name}
                      {!a.id && (
                        <span className="ml-1 text-xs text-muted-foreground">(SRC)</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="next_collection_date">Próxima cobrança</Label>
              <Input id="next_collection_date" name="next_collection_date" type="date" className="bg-card-elevated border-border" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="bg-card-elevated border-border">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((pm) => (
                    <SelectItem key={pm} value={pm}>
                      {pm}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment_link">Link de pagamento</Label>
              <Input id="payment_link" name="payment_link" className="bg-card-elevated border-border" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea id="notes" name="notes" rows={2} className="bg-card-elevated border-border" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading} className="bg-brand hover:bg-brand/90">
              {loading ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
