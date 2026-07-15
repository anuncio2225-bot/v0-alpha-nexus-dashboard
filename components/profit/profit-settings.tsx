"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR, { mutate } from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { formatCurrency, cn } from "@/lib/utils";
import { Plus, Trash2, Save } from "lucide-react";
import type { ProfitConfig, Partner, ProductCost } from "./types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const CASHFLOW_EXCLUSION_OPTIONS = [
  "Investimento Ads",
  "Meta Ads",
  "Comissão Atendente",
  "Impostos",
  "Ferramentas",
  "Fornecedores",
];

export function ProfitSettings() {
  const { data: configData, isLoading: loadingConfig } = useSWR<{
    config: ProfitConfig;
  }>("/api/profit/config", fetcher);
  const { data: partnersData } = useSWR<{ partners: Partner[] }>(
    "/api/profit/partners",
    fetcher
  );
  const { data: costsData } = useSWR<{
    productCosts: ProductCost[];
    suggestions: string[];
  }>("/api/profit/product-costs", fetcher);

  if (loadingConfig || !configData) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CostsSection
        config={configData.config}
        productCosts={costsData?.productCosts || []}
        suggestions={costsData?.suggestions || []}
      />
      <SimulationSection config={configData.config} />
      <DistributionSection
        config={configData.config}
        partners={partnersData?.partners || []}
      />
      <ExclusionsSection config={configData.config} />
    </div>
  );
}

/* ---------------- Custos de fabricação + kits ---------------- */

function CostsSection({
  config,
  productCosts,
  suggestions,
}: {
  config: ProfitConfig;
  productCosts: ProductCost[];
  suggestions: string[];
}) {
  const [costPerUnit, setCostPerUnit] = useState(String(config.cost_per_unit));
  const [shipping, setShipping] = useState(String(config.shipping_cost));
  const [saving, setSaving] = useState(false);

  async function saveBaseCosts() {
    setSaving(true);
    try {
      const res = await fetch("/api/profit/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...config,
          cost_per_unit: Number(costPerUnit) || 0,
          shipping_cost: Number(shipping) || 0,
        }),
      });
      if (!res.ok) throw new Error();
      await mutate("/api/profit/config");
      toast.success("Custos de fabricação salvos");
    } catch {
      toast.error("Erro ao salvar custos");
    } finally {
      setSaving(false);
    }
  }

  const unit = Number(costPerUnit) || 0;
  const ship = Number(shipping) || 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Custos de Fabricação</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Custo por unidade (pote)</Label>
            <Input
              type="number"
              step="0.01"
              value={costPerUnit}
              onChange={(e) => setCostPerUnit(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Custo de envio padrão</Label>
            <Input
              type="number"
              step="0.01"
              value={shipping}
              onChange={(e) => setShipping(e.target.value)}
            />
          </div>
        </div>
        <Button onClick={saveBaseCosts} disabled={saving} size="sm">
          <Save className="mr-2 h-4 w-4" />
          Salvar custos base
        </Button>

        <KitsTable
          productCosts={productCosts}
          suggestions={suggestions}
          unitCost={unit}
          defaultShipping={ship}
        />
      </CardContent>
    </Card>
  );
}

function KitsTable({
  productCosts,
  suggestions,
  unitCost,
  defaultShipping,
}: {
  productCosts: ProductCost[];
  suggestions: string[];
  unitCost: number;
  defaultShipping: number;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    product_name: "",
    product_keyword: "",
    units_per_kit: "3",
    custom_shipping: "",
  });

  const kitCost = (units: number, customShipping: number | null) =>
    units * unitCost + (customShipping ?? defaultShipping);

  async function addKit() {
    if (!form.product_name.trim() || !form.product_keyword.trim()) {
      toast.error("Preencha nome e keyword");
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/profit/product-costs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_name: form.product_name,
          product_keyword: form.product_keyword,
          units_per_kit: Number(form.units_per_kit) || 1,
          custom_shipping:
            form.custom_shipping === "" ? null : Number(form.custom_shipping),
        }),
      });
      if (!res.ok) throw new Error();
      await mutate("/api/profit/product-costs");
      setForm({
        product_name: "",
        product_keyword: "",
        units_per_kit: "3",
        custom_shipping: "",
      });
      toast.success("Kit adicionado");
    } catch {
      toast.error("Erro ao adicionar kit");
    } finally {
      setAdding(false);
    }
  }

  async function removeKit(id: string) {
    try {
      const res = await fetch(`/api/profit/product-costs/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      await mutate("/api/profit/product-costs");
      toast.success("Kit removido");
    } catch {
      toast.error("Erro ao remover kit");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Kits (produtos com custo)</Label>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kit</TableHead>
              <TableHead>Keyword (match)</TableHead>
              <TableHead className="text-center">Unidades</TableHead>
              <TableHead className="text-right">Envio</TableHead>
              <TableHead className="text-right">Custo total</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {productCosts.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-sm text-muted-foreground"
                >
                  Nenhum kit cadastrado
                </TableCell>
              </TableRow>
            )}
            {productCosts.map((pc) => (
              <TableRow key={pc.id}>
                <TableCell className="font-medium">{pc.product_name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {pc.product_keyword}
                </TableCell>
                <TableCell className="text-center">{pc.units_per_kit}</TableCell>
                <TableCell className="text-right">
                  {pc.custom_shipping === null
                    ? "— (padrão)"
                    : formatCurrency(pc.custom_shipping)}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(kitCost(pc.units_per_kit, pc.custom_shipping))}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeKit(pc.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {/* Linha de adição */}
            <TableRow>
              <TableCell>
                <Input
                  list="kit-suggestions"
                  placeholder="GynoFlux 3 MESES"
                  value={form.product_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, product_name: e.target.value }))
                  }
                  className="h-8"
                />
                <datalist id="kit-suggestions">
                  {suggestions.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </TableCell>
              <TableCell>
                <Input
                  placeholder="3 MESES"
                  value={form.product_keyword}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, product_keyword: e.target.value }))
                  }
                  className="h-8"
                />
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  value={form.units_per_kit}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, units_per_kit: e.target.value }))
                  }
                  className="h-8 text-center"
                />
              </TableCell>
              <TableCell>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="padrão"
                  value={form.custom_shipping}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, custom_shipping: e.target.value }))
                  }
                  className="h-8 text-right"
                />
              </TableCell>
              <TableCell className="text-right text-sm text-muted-foreground">
                {formatCurrency(
                  kitCost(
                    Number(form.units_per_kit) || 0,
                    form.custom_shipping === ""
                      ? null
                      : Number(form.custom_shipping)
                  )
                )}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-brand"
                  onClick={addKit}
                  disabled={adding}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">
        Custo total = (unidades × custo por unidade) + envio. Se o envio ficar
        vazio, usa o custo de envio padrão.
      </p>
    </div>
  );
}

/* ---------------- Simulação como afiliado ---------------- */

function SimulationSection({ config }: { config: ProfitConfig }) {
  const [percent, setPercent] = useState(String(config.affiliate_percent));
  const [fee, setFee] = useState(String(config.affiliate_platform_fee));
  const [fixed, setFixed] = useState(String(config.affiliate_platform_fixed));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/profit/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...config,
          affiliate_percent: Number(percent) || 0,
          affiliate_platform_fee: Number(fee) || 0,
          affiliate_platform_fixed: Number(fixed) || 0,
        }),
      });
      if (!res.ok) throw new Error();
      await mutate("/api/profit/config");
      toast.success("Simulação salva");
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Simulação como Afiliado</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>% que receberia (afiliado)</Label>
            <Input
              type="number"
              step="0.01"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>% taxa da plataforma</Label>
            <Input
              type="number"
              step="0.01"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Fixo por venda (R$)</Label>
            <Input
              type="number"
              step="0.01"
              value={fixed}
              onChange={(e) => setFixed(e.target.value)}
            />
          </div>
        </div>
        <Button onClick={save} disabled={saving} size="sm">
          <Save className="mr-2 h-4 w-4" />
          Salvar simulação
        </Button>
      </CardContent>
    </Card>
  );
}

/* ---------------- Distribuição de lucro + sócios ---------------- */

function DistributionSection({
  config,
  partners,
}: {
  config: ProfitConfig;
  partners: Partner[];
}) {
  const [reserve, setReserve] = useState(String(config.company_reserve_percent));
  const [savingReserve, setSavingReserve] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPercent, setNewPercent] = useState("");
  const [addingPartner, setAddingPartner] = useState(false);

  const partnersSum = useMemo(
    () => partners.reduce((s, p) => s + (Number(p.percent) || 0), 0),
    [partners]
  );

  async function saveReserve() {
    setSavingReserve(true);
    try {
      const res = await fetch("/api/profit/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...config,
          company_reserve_percent: Number(reserve) || 0,
        }),
      });
      if (!res.ok) throw new Error();
      await mutate("/api/profit/config");
      toast.success("Percentual da empresa salvo");
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSavingReserve(false);
    }
  }

  async function addPartner() {
    if (!newName.trim()) {
      toast.error("Informe o nome do sócio");
      return;
    }
    setAddingPartner(true);
    try {
      const res = await fetch("/api/profit/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          percent: Number(newPercent) || 0,
        }),
      });
      if (!res.ok) throw new Error();
      await mutate("/api/profit/partners");
      setNewName("");
      setNewPercent("");
      toast.success("Sócio adicionado");
    } catch {
      toast.error("Erro ao adicionar sócio");
    } finally {
      setAddingPartner(false);
    }
  }

  async function updatePartner(id: string, percent: number) {
    try {
      await fetch(`/api/profit/partners/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ percent }),
      });
      await mutate("/api/profit/partners");
    } catch {
      toast.error("Erro ao atualizar sócio");
    }
  }

  async function removePartner(id: string) {
    try {
      await fetch(`/api/profit/partners/${id}`, { method: "DELETE" });
      await mutate("/api/profit/partners");
      toast.success("Sócio removido");
    } catch {
      toast.error("Erro ao remover sócio");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Distribuição de Lucro</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>% Caixa da empresa</Label>
            <Input
              type="number"
              step="0.01"
              value={reserve}
              onChange={(e) => setReserve(e.target.value)}
              className="w-40"
            />
          </div>
          <Button onClick={saveReserve} disabled={savingReserve} size="sm">
            <Save className="mr-2 h-4 w-4" />
            Salvar
          </Button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Sócios</Label>
            <span
              className={cn(
                "text-xs font-medium",
                partnersSum === 100
                  ? "text-emerald-500"
                  : "text-destructive"
              )}
            >
              Soma: {partnersSum}%{" "}
              {partnersSum !== 100 && "(deve somar 100%)"}
            </span>
          </div>

          <div className="space-y-2">
            {partners.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <span className="flex-1 text-sm font-medium text-foreground">
                  {p.name}
                </span>
                <Input
                  type="number"
                  step="0.01"
                  defaultValue={p.percent}
                  onBlur={(e) =>
                    updatePartner(p.id, Number(e.target.value) || 0)
                  }
                  className="h-8 w-24 text-right"
                />
                <span className="text-sm text-muted-foreground">%</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removePartner(p.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 border-t border-border pt-3">
            <Input
              placeholder="Nome do sócio"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8 flex-1"
            />
            <Input
              type="number"
              step="0.01"
              placeholder="%"
              value={newPercent}
              onChange={(e) => setNewPercent(e.target.value)}
              className="h-8 w-24 text-right"
            />
            <Button
              size="sm"
              onClick={addPartner}
              disabled={addingPartner}
              variant="outline"
            >
              <Plus className="mr-1 h-4 w-4" />
              Adicionar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- Exclusões do fluxo de caixa ---------------- */

function ExclusionsSection({ config }: { config: ProfitConfig }) {
  const [selected, setSelected] = useState<string[]>(
    config.excluded_cashflow_categories || []
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelected(config.excluded_cashflow_categories || []);
  }, [config.excluded_cashflow_categories]);

  function toggle(cat: string) {
    setSelected((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/profit/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...config,
          excluded_cashflow_categories: selected,
        }),
      });
      if (!res.ok) throw new Error();
      await mutate("/api/profit/config");
      toast.success("Exclusões salvas");
    } catch {
      toast.error("Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Exclusões do Fluxo de Caixa</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Categorias de saída que NÃO entram no Lucro Geral (para evitar
          contagem dupla). O investimento em ads já é descontado na Operação
          Interna, por isso deve ficar marcado.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {CASHFLOW_EXCLUSION_OPTIONS.map((cat) => (
            <label
              key={cat}
              className="flex cursor-pointer items-center gap-2 text-sm text-foreground"
            >
              <Checkbox
                checked={selected.includes(cat)}
                onCheckedChange={() => toggle(cat)}
              />
              {cat}
            </label>
          ))}
        </div>
        <Button onClick={save} disabled={saving} size="sm">
          <Save className="mr-2 h-4 w-4" />
          Salvar exclusões
        </Button>
      </CardContent>
    </Card>
  );
}
