"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { Plus, Users, Wallet, ShoppingCart, Trophy, RefreshCw, GitMerge } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { Attendant, CommissionResult } from "@/types";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import { AttendantCard } from "@/components/attendants/attendant-card";
import { ConfigModal } from "@/components/attendants/config-modal";
import { DetailsModal } from "@/components/attendants/details-modal";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface Summary {
  total_attendants: number;
  total_to_pay: number;
  total_paid_sales: number;
  top_seller: { name: string; sales: number } | null;
}

export default function AttendantsPage() {
  const [newOpen, setNewOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [merging, setMerging] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [autoRan, setAutoRan] = useState(false);

  const [configTarget, setConfigTarget] = useState<Attendant | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<Attendant | null>(null);
  const [detailsPeriod, setDetailsPeriod] = useState<{ start: string; end: string } | null>(null);

  const { data, mutate, isLoading } = useSWR<{ attendants: Attendant[] }>(
    "/api/attendants",
    fetcher
  );
  const { data: summary, mutate: mutateSummary } = useSWR<Summary>(
    "/api/attendants/summary",
    fetcher
  );

  const attendants = data?.attendants || [];
  const visibleAttendants = showInactive
    ? attendants
    : attendants.filter((a) => a.status !== "inactive");
  const inactiveCount = attendants.filter((a) => a.status === "inactive").length;

  const runMerge = async () => {
    setMerging(true);
    try {
      const res = await fetch("/api/attendants/merge", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error();
      toast.success(
        json.merged > 0
          ? `${json.merged} atendente(s) mesclado(s)`
          : "Nenhum duplicado encontrado"
      );
      if (json.merged > 0) {
        mutate();
        mutateSummary();
      }
    } catch {
      toast.error("Erro ao mesclar duplicados");
    } finally {
      setMerging(false);
    }
  };

  const runAutoDetect = async (silent = false) => {
    setDetecting(true);
    try {
      const res = await fetch("/api/attendants/auto-detect", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error();
      if (!silent) {
        toast.success(
          json.created > 0
            ? `${json.created} atendente(s) detectado(s)`
            : "Nenhum novo atendente encontrado"
        );
      }
      if (json.created > 0) {
        mutate();
        mutateSummary();
      }
    } catch {
      if (!silent) toast.error("Erro ao detectar atendentes");
    } finally {
      setDetecting(false);
    }
  };

  // Auto-detecta ao abrir a página se não houver atendentes
  useEffect(() => {
    if (!isLoading && !autoRan && attendants.length === 0) {
      setAutoRan(true);
      runAutoDetect(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, attendants.length, autoRan]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/attendants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          src: fd.get("src") || null,
          email: fd.get("email") || null,
          phone: fd.get("phone") || null,
          role: fd.get("role") || "closer",
          payment_closing_day: parseInt(fd.get("closing_day") as string) || 1,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Atendente criado");
      setNewOpen(false);
      mutate();
      mutateSummary();
    } catch {
      toast.error("Erro ao criar atendente");
    } finally {
      setCreating(false);
    }
  }

  const kpis = [
    {
      label: "Atendentes ativas",
      value: summary ? String(summary.total_attendants) : "—",
      icon: Users,
      sensitive: false,
    },
    {
      label: "Total a pagar (período)",
      value: summary ? formatCurrency(summary.total_to_pay) : "—",
      icon: Wallet,
      sensitive: true,
    },
    {
      label: "Vendas pagas",
      value: summary ? String(summary.total_paid_sales) : "—",
      icon: ShoppingCart,
      sensitive: false,
    },
    {
      label: "Maior vendedora",
      value: summary?.top_seller
        ? `${summary.top_seller.name} (${summary.top_seller.sales})`
        : "—",
      icon: Trophy,
      sensitive: false,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-heading">Atendentes</h1>
          <p className="text-sm text-muted-foreground">
            Comissionamento progressivo com cálculo automático pelas vendas
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => runAutoDetect(false)} disabled={detecting}>
            <RefreshCw className={detecting ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
            Detectar
          </Button>
          <Button variant="outline" onClick={runMerge} disabled={merging}>
            <GitMerge className={merging ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
            Mesclar Duplicados
          </Button>
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <Button className="bg-brand hover:bg-brand/90">
                <Plus className="mr-2 h-4 w-4" />
                Novo Atendente
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>Novo Atendente</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input id="name" name="name" required className="bg-card-elevated border-border" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="src">SRC Key</Label>
                  <Input id="src" name="src" placeholder="Identificador nas vendas" className="bg-card-elevated border-border" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" name="email" type="email" className="bg-card-elevated border-border" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Telefone</Label>
                    <Input id="phone" name="phone" className="bg-card-elevated border-border" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="role">Função</Label>
                    <Select name="role" defaultValue="closer">
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
                    <Label htmlFor="closing_day">Dia de fechamento</Label>
                    <Select name="closing_day" defaultValue="1">
                      <SelectTrigger className="bg-card-elevated border-border"><SelectValue /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                          <SelectItem key={d} value={String(d)}>Dia {d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setNewOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={creating} className="bg-brand hover:bg-brand/90">
                    {creating ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-card border-border">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-brand/10 p-2">
                <k.icon className="h-5 w-5 text-brand" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground truncate">{k.label}</p>
                <p className="text-lg font-bold text-foreground truncate">
                  {k.sensitive ? <SensitiveValue>{k.value}</SensitiveValue> : k.value}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-80" />
          ))}
        </div>
      ) : attendants.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Nenhum atendente encontrado</p>
            <p className="text-sm text-muted-foreground/70">
              Clique em &quot;Detectar&quot; para buscar pelos SRC das vendas ou crie manualmente
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {inactiveCount > 0 && (
            <div className="flex items-center justify-end gap-2">
              <Label htmlFor="show-inactive" className="text-xs text-muted-foreground cursor-pointer">
                Mostrar inativas ({inactiveCount})
              </Label>
              <Switch
                id="show-inactive"
                checked={showInactive}
                onCheckedChange={setShowInactive}
              />
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleAttendants.map((att) => (
              <AttendantCard
                key={att.id}
                attendant={att}
                onConfigure={(a) => setConfigTarget(a)}
                onDetails={(a, commission: CommissionResult) => {
                  setDetailsTarget(a);
                  setDetailsPeriod(commission.period);
                }}
                onChanged={() => {
                  mutate();
                  mutateSummary();
                }}
              />
            ))}
          </div>
        </>
      )}

      <ConfigModal
        attendant={configTarget}
        open={!!configTarget}
        onOpenChange={(v) => !v && setConfigTarget(null)}
        onSaved={() => {
          mutate();
          mutateSummary();
        }}
      />
      <DetailsModal
        attendant={detailsTarget}
        initialPeriod={detailsPeriod}
        open={!!detailsTarget}
        onOpenChange={(v) => !v && setDetailsTarget(null)}
      />
    </div>
  );
}
