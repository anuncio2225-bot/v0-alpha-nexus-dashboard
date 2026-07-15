"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function EntryDialog({
  open,
  onOpenChange,
  defaultUnitCost,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultUnitCost: number;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(ymd(new Date()));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setQuantity("");
      setUnitCost(defaultUnitCost ? String(defaultUnitCost) : "");
      setDescription("");
      setDate(ymd(new Date()));
    }
  }, [open, defaultUnitCost]);

  const qty = Number(quantity) || 0;
  const cost = Number(unitCost) || 0;
  const total = qty * cost;

  async function handleSave() {
    if (qty <= 0) {
      toast({ title: "Informe a quantidade de potes", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/stock/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity: qty,
          unit_cost: cost,
          description,
          date,
        }),
      });
      if (!res.ok) throw new Error("Falha ao salvar");
      toast({ title: "Entrada registrada com sucesso" });
      onOpenChange(false);
      onSaved();
    } catch {
      toast({ title: "Erro ao registrar entrada", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar entrada de estoque</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="qty">Quantidade de potes</Label>
            <Input
              id="qty"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Ex: 500"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cost">Custo unitário (R$)</Label>
            <Input
              id="cost"
              type="number"
              min={0}
              step="0.01"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              placeholder="Ex: 15.00"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-lg font-semibold text-foreground">
              {formatCurrency(total)}
            </span>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="desc">Descrição</Label>
            <Input
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Lote 50 - Fornecedor ABC"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="date">Data da entrada</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
