"use client";

import { useState } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
import { cn, formatCurrency } from "@/lib/utils";
import { Plus, Edit, Trash2, Users } from "lucide-react";
import type { Attendant } from "@/types";
import { SensitiveValue } from "@/components/ui/sensitive-value";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function AttendantsPage() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Attendant | null>(null);
  const [loading, setLoading] = useState(false);

  const { data, mutate, isLoading } = useSWR<{ attendants: Attendant[] }>(
    "/api/attendants",
    fetcher
  );

  const attendants = data?.attendants || [];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);

    const payload = {
      name: formData.get("name"),
      email: formData.get("email") || null,
      phone: formData.get("phone") || null,
      role: formData.get("role") || "closer",
      monthly_goal: parseFloat(formData.get("monthly_goal") as string) || 0,
      commission_rate: parseFloat(formData.get("commission_rate") as string) || 0,
    };

    try {
      const res = await fetch("/api/attendants", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { id: editing.id, ...payload } : payload),
      });

      if (!res.ok) throw new Error();

      toast.success(editing ? "Atendente atualizado" : "Atendente criado");
      setOpen(false);
      setEditing(null);
      mutate();
    } catch {
      toast.error("Erro ao salvar atendente");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este atendente?")) return;

    try {
      await fetch(`/api/attendants?id=${id}`, { method: "DELETE" });
      toast.success("Atendente excluído");
      mutate();
    } catch {
      toast.error("Erro ao excluir");
    }
  }

  function openEdit(attendant: Attendant) {
    setEditing(attendant);
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    setEditing(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-heading">Atendentes</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie sua equipe de vendas
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="bg-brand hover:bg-brand/90">
              <Plus className="mr-2 h-4 w-4" />
              Novo Atendente
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle>
                {editing ? "Editar Atendente" : "Novo Atendente"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={editing?.name || ""}
                  required
                  className="bg-card-elevated border-border"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    defaultValue={editing?.email || ""}
                    className="bg-card-elevated border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    name="phone"
                    defaultValue={editing?.phone || ""}
                    className="bg-card-elevated border-border"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Função</Label>
                <Select name="role" defaultValue={editing?.role || "closer"}>
                  <SelectTrigger className="bg-card-elevated border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="closer">Closer</SelectItem>
                    <SelectItem value="sdr">SDR</SelectItem>
                    <SelectItem value="cs">CS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="monthly_goal">Meta Mensal (R$)</Label>
                  <Input
                    id="monthly_goal"
                    name="monthly_goal"
                    type="number"
                    step="0.01"
                    defaultValue={editing?.monthly_goal || 0}
                    className="bg-card-elevated border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="commission_rate">Comissão (%)</Label>
                  <Input
                    id="commission_rate"
                    name="commission_rate"
                    type="number"
                    step="0.1"
                    defaultValue={editing?.commission_rate || 0}
                    className="bg-card-elevated border-border"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={closeDialog}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading} className="bg-brand hover:bg-brand/90">
                  {loading ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : attendants.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Nenhum atendente cadastrado</p>
            <p className="text-sm text-muted-foreground/70">
              Clique em &quot;Novo Atendente&quot; para começar
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {attendants.map((att) => {
            const goalProgress =
              att.monthly_goal > 0
                ? (att.total_revenue / att.monthly_goal) * 100
                : 0;

            return (
              <Card key={att.id} className="bg-card border-border card-hover">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{att.name}</CardTitle>
                      <Badge
                        variant="outline"
                        className={cn(
                          "mt-1 text-xs",
                          att.status === "active"
                            ? "border-success/30 text-success"
                            : "border-muted text-muted-foreground"
                        )}
                      >
                        {att.role.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(att)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(att.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground">Vendas</p>
                      <p className="font-semibold text-foreground">
                        {att.total_sales}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Faturamento</p>
                      <p className="font-semibold text-brand">
                        <SensitiveValue>{formatCurrency(att.total_revenue)}</SensitiveValue>
                      </p>
                    </div>
                  </div>
                  {att.monthly_goal > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Meta: <SensitiveValue>{formatCurrency(att.monthly_goal)}</SensitiveValue></span>
                        <span>{goalProgress.toFixed(0)}%</span>
                      </div>
                      <Progress
                        value={Math.min(goalProgress, 100)}
                        className="h-1.5"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
