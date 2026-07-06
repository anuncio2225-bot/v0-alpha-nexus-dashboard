"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import type { Attendant, AttendantRule } from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface TierRow {
  min_sales: number | string;
  max_sales: number | string | null;
  commission_value: number | string;
}
interface BonusRow {
  min_sales: number | string;
  bonus_value: number | string;
}

interface Props {
  attendant: Attendant | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}

export function ConfigModal({ attendant, open, onOpenChange, onSaved }: Props) {
  const [saving, setSaving] = useState(false);

  // Aba Geral / Comissão
  const [name, setName] = useState("");
  const [src, setSrc] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("closer");
  const [closingDay, setClosingDay] = useState("1");
  const [calcMode, setCalcMode] = useState<"affiliate" | "producer">("affiliate");
  const [producerPct, setProducerPct] = useState("0");
  const [platformPct, setPlatformPct] = useState("0");
  const [platformFixed, setPlatformFixed] = useState("0");
  const [fixedEnabled, setFixedEnabled] = useState(false);
  const [fixedPerSale, setFixedPerSale] = useState("0");

  // Faixas e bônus
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [bonuses, setBonuses] = useState<BonusRow[]>([]);

  const { data: rulesData } = useSWR<{ rules: AttendantRule[] }>(
    attendant && open ? `/api/attendants/${attendant.id}/rules` : null,
    fetcher
  );

  useEffect(() => {
    if (!attendant) return;
    setName(attendant.name || "");
    setSrc(attendant.src || "");
    setEmail(attendant.email || "");
    setPhone(attendant.phone || "");
    setRole(attendant.role || "closer");
    setClosingDay(String(attendant.payment_closing_day || 1));
    setCalcMode(attendant.calc_mode || "affiliate");
    setProducerPct(String(attendant.producer_affiliate_percent || 0));
    setPlatformPct(String(attendant.platform_fee_percent || 0));
    setPlatformFixed(String(attendant.platform_fee_fixed || 0));
    setFixedEnabled((attendant.fixed_per_sale || 0) > 0);
    setFixedPerSale(String(attendant.fixed_per_sale || 0));
  }, [attendant]);

  useEffect(() => {
    if (!rulesData?.rules) return;
    const c = rulesData.rules
      .filter((r) => r.rule_type === "commission")
      .sort((a, b) => a.min_sales - b.min_sales)
      .map((r) => ({
        min_sales: r.min_sales,
        max_sales: r.max_sales,
        commission_value: r.commission_value,
      }));
    const b = rulesData.rules
      .filter((r) => r.rule_type === "bonus")
      .sort((a, b) => a.min_sales - b.min_sales)
      .map((r) => ({ min_sales: r.min_sales, bonus_value: r.bonus_value }));
    setTiers(c);
    setBonuses(b);
  }, [rulesData]);

  if (!attendant) return null;

  async function handleSave() {
    if (!attendant) return;
    setSaving(true);
    try {
      // 1. Atualiza dados da atendente
      const attRes = await fetch("/api/attendants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: attendant.id,
          name,
          src: src || null,
          email: email || null,
          phone: phone || null,
          role,
          payment_closing_day: parseInt(closingDay) || 1,
          calc_mode: calcMode,
          producer_affiliate_percent: parseFloat(producerPct) || 0,
          platform_fee_percent: parseFloat(platformPct) || 0,
          platform_fee_fixed: parseFloat(platformFixed) || 0,
          fixed_per_sale: fixedEnabled ? parseFloat(fixedPerSale) || 0 : 0,
        }),
      });
      if (!attRes.ok) throw new Error();

      // 2. Salva faixas
      await fetch(`/api/attendants/${attendant.id}/rules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rule_type: "commission",
          rules: tiers.map((t, i) => ({
            label: `Faixa ${i + 1}`,
            min_sales: t.min_sales,
            max_sales: t.max_sales === "" ? null : t.max_sales,
            commission_value: t.commission_value,
          })),
        }),
      });

      // 3. Salva bonificações
      await fetch(`/api/attendants/${attendant.id}/rules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rule_type: "bonus",
          rules: bonuses.map((b) => ({
            label: `${b.min_sales} vendas`,
            min_sales: b.min_sales,
            bonus_value: b.bonus_value,
          })),
        }),
      });

      toast.success("Configuração salva");
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error("Erro ao salvar configuração");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar {attendant.name}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="geral" className="w-full">
          <TabsList className="grid w-full grid-cols-4 h-auto">
            <TabsTrigger value="geral" className="text-xs">Geral</TabsTrigger>
            <TabsTrigger value="comissao" className="text-xs">Comissão</TabsTrigger>
            <TabsTrigger value="faixas" className="text-xs">Faixas</TabsTrigger>
            <TabsTrigger value="bonus" className="text-xs">Bônus</TabsTrigger>
          </TabsList>

          {/* GERAL */}
          <TabsContent value="geral" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-card-elevated border-border" />
            </div>
            <div className="space-y-2">
              <Label>SRC Key</Label>
              <Input
                value={src}
                onChange={(e) => setSrc(e.target.value)}
                disabled={attendant.auto_detected}
                className="bg-card-elevated border-border"
              />
              {attendant.auto_detected && (
                <p className="text-xs text-muted-foreground">SRC detectado automaticamente (não editável)</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} className="bg-card-elevated border-border" />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-card-elevated border-border" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Função</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger className="bg-card-elevated border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="closer">Closer</SelectItem>
                    <SelectItem value="sdr">SDR</SelectItem>
                    <SelectItem value="cobrador">Cobrador</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Dia de fechamento</Label>
                <Select value={closingDay} onValueChange={setClosingDay}>
                  <SelectTrigger className="bg-card-elevated border-border"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-60">
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                      <SelectItem key={d} value={String(d)}>Dia {d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          {/* COMISSAO */}
          <TabsContent value="comissao" className="space-y-4 pt-4">
            <RadioGroup value={calcMode} onValueChange={(v) => setCalcMode(v as "affiliate" | "producer")}>
              <div className="flex items-start gap-2 rounded-md border border-border p-3">
                <RadioGroupItem value="affiliate" id="affiliate" className="mt-0.5" />
                <Label htmlFor="affiliate" className="font-normal cursor-pointer">
                  Como Afiliado
                  <span className="block text-xs text-muted-foreground">Valor já vem descontado, sem cálculos extras</span>
                </Label>
              </div>
              <div className="flex items-start gap-2 rounded-md border border-border p-3">
                <RadioGroupItem value="producer" id="producer" className="mt-0.5" />
                <Label htmlFor="producer" className="font-normal cursor-pointer">
                  Como Produtor
                  <span className="block text-xs text-muted-foreground">Precisa configurar os descontos abaixo</span>
                </Label>
              </div>
            </RadioGroup>

            {calcMode === "producer" && (
              <div className="space-y-3 rounded-md bg-card-elevated p-3">
                <div className="space-y-2">
                  <Label>% que recebe como afiliado</Label>
                  <Input type="number" step="0.1" value={producerPct} onChange={(e) => setProducerPct(e.target.value)} className="bg-card border-border" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>% da plataforma</Label>
                    <Input type="number" step="0.1" value={platformPct} onChange={(e) => setPlatformPct(e.target.value)} className="bg-card border-border" />
                  </div>
                  <div className="space-y-2">
                    <Label>Fixo plataforma (R$)</Label>
                    <Input type="number" step="0.01" value={platformFixed} onChange={(e) => setPlatformFixed(e.target.value)} className="bg-card border-border" />
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3 rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <Label className="cursor-pointer">Valor fixo por venda paga</Label>
                <Switch checked={fixedEnabled} onCheckedChange={setFixedEnabled} />
              </div>
              {fixedEnabled && (
                <div className="space-y-2">
                  <Label>Valor por venda (R$)</Label>
                  <Input type="number" step="0.01" value={fixedPerSale} onChange={(e) => setFixedPerSale(e.target.value)} className="bg-card-elevated border-border" />
                </div>
              )}
            </div>
          </TabsContent>

          {/* FAIXAS */}
          <TabsContent value="faixas" className="space-y-3 pt-4">
            <p className="text-xs text-muted-foreground">
              A porcentagem é retroativa: ao cair numa faixa, todas as vendas do período recebem aquela %.
            </p>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs text-muted-foreground">
                <span>De (vendas)</span>
                <span>Até (vendas)</span>
                <span>Comissão %</span>
                <span />
              </div>
              {tiers.map((t, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
                  <Input
                    type="number"
                    value={t.min_sales}
                    onChange={(e) => setTiers((p) => p.map((x, j) => j === i ? { ...x, min_sales: e.target.value } : x))}
                    className="bg-card-elevated border-border"
                  />
                  <Input
                    type="number"
                    placeholder="∞"
                    value={t.max_sales ?? ""}
                    onChange={(e) => setTiers((p) => p.map((x, j) => j === i ? { ...x, max_sales: e.target.value } : x))}
                    className="bg-card-elevated border-border"
                  />
                  <Input
                    type="number"
                    step="0.1"
                    value={t.commission_value}
                    onChange={(e) => setTiers((p) => p.map((x, j) => j === i ? { ...x, commission_value: e.target.value } : x))}
                    className="bg-card-elevated border-border"
                  />
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => setTiers((p) => p.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setTiers((p) => [...p, { min_sales: "", max_sales: "", commission_value: "" }])}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Adicionar faixa
            </Button>
          </TabsContent>

          {/* BONUS */}
          <TabsContent value="bonus" className="space-y-3 pt-4">
            <p className="text-xs text-muted-foreground">
              Cumulativo: ao bater 100 vendas, recebe a soma de todos os bônus alcançados.
            </p>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs text-muted-foreground">
                <span>Meta (vendas)</span>
                <span>Bônus (R$)</span>
                <span />
              </div>
              {bonuses.map((b, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Input
                    type="number"
                    value={b.min_sales}
                    onChange={(e) => setBonuses((p) => p.map((x, j) => j === i ? { ...x, min_sales: e.target.value } : x))}
                    className="bg-card-elevated border-border"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    value={b.bonus_value}
                    onChange={(e) => setBonuses((p) => p.map((x, j) => j === i ? { ...x, bonus_value: e.target.value } : x))}
                    className="bg-card-elevated border-border"
                  />
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => setBonuses((p) => p.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setBonuses((p) => [...p, { min_sales: "", bonus_value: "" }])}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Adicionar bonificação
            </Button>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={saving} className="bg-brand hover:bg-brand/90" onClick={handleSave}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
