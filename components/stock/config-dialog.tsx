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

export function ConfigDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [unitCost, setUnitCost] = useState("");
  const [lowStock, setLowStock] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/stock/config")
      .then((r) => r.json())
      .then((d) => {
        setUnitCost(String(d.config?.default_unit_cost ?? 0));
        setLowStock(String(d.config?.low_stock_alert ?? 50));
      })
      .finally(() => setLoading(false));
  }, [open]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/stock/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          default_unit_cost: Number(unitCost) || 0,
          low_stock_alert: Number(lowStock) || 0,
        }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "Configurações salvas" });
      onOpenChange(false);
      onSaved();
    } catch {
      toast({ title: "Erro ao salvar configurações", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configurações de estoque</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="cfg-cost">Custo padrão por pote (R$)</Label>
            <Input
              id="cfg-cost"
              type="number"
              min={0}
              step="0.01"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Pré-preenche o custo unitário ao registrar novas entradas.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cfg-low">Alerta de estoque baixo (potes)</Label>
            <Input
              id="cfg-low"
              type="number"
              min={0}
              value={lowStock}
              onChange={(e) => setLowStock(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-muted-foreground">
              Exibe um aviso quando o saldo ficar abaixo desse valor.
            </p>
          </div>
          <div className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              A quantidade de potes por kit (3 meses = 3, 6 meses = 6, etc.) é
              compartilhada com a Análise de Lucro. Ajuste os kits na aba
              Análise de Lucro › Configurações.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
