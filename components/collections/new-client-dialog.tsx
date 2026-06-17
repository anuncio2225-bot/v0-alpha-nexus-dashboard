"use client";

import { useState } from "react";
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

interface NewClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statuses: CollectionStatus[];
  platforms: CollectionPlatform[];
  attendants: Attendant[];
  onCreated: () => void;
}

export function NewClientDialog({
  open,
  onOpenChange,
  statuses,
  platforms,
  attendants,
  onCreated,
}: NewClientDialogProps) {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: fd.get("name"),
      phone: fd.get("phone") || null,
      email: fd.get("email") || null,
      document: fd.get("document") || null,
      product_name: fd.get("product_name") || null,
      platform_id: fd.get("platform_id") || null,
      attendant_id: fd.get("attendant_id") || null,
      status_id: fd.get("status_id") || null,
      total_value: parseFloat(fd.get("total_value") as string) || 0,
      paid_value: parseFloat(fd.get("paid_value") as string) || 0,
      payment_method: fd.get("payment_method") || null,
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
            <Input id="product_name" name="product_name" className="bg-card-elevated border-border" />
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
                      {s.name}
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
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Atendente</Label>
              <Select name="attendant_id">
                <SelectTrigger className="bg-card-elevated border-border">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {attendants.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
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
              <Label htmlFor="payment_method">Forma de pagamento</Label>
              <Input id="payment_method" name="payment_method" placeholder="PIX, Boleto..." className="bg-card-elevated border-border" />
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
