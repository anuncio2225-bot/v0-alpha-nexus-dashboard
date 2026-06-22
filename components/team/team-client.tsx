"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  UserPlus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Users,
  Clock,
  Activity,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  PermissionsForm,
  type PermissionsFormValue,
  type AttendantOption,
} from "@/components/team/permissions-form";
import { ROLE_LABELS, resolveRolePreset } from "@/lib/team/roles";
import { ALL_PERMISSIONS_TRUE } from "@/types";
import type { TeamMember } from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function defaultFormValue(): PermissionsFormValue {
  const preset = resolveRolePreset("viewer");
  return {
    role: "viewer",
    permissions: preset.permissions,
    can_edit: preset.can_edit,
    can_delete: preset.can_delete,
    can_export: preset.can_export,
    scope_mode: "all",
    attendant_id: null,
    attendant_src: null,
    src_areas: { cobranca: true, financeiro: true },
  };
}

function statusBadge(status: string) {
  if (status === "active")
    return <Badge className="bg-success/20 text-success border-success/30">Ativo</Badge>;
  if (status === "pending")
    return <Badge className="bg-warning/20 text-warning border-warning/30">Pendente</Badge>;
  return <Badge className="bg-danger/20 text-danger border-danger/30">Revogado</Badge>;
}

export function TeamClient() {
  const { data, isLoading, mutate } = useSWR<{ members: TeamMember[] }>(
    "/api/team",
    fetcher
  );
  const members = useMemo(() => data?.members || [], [data]);

  // Atendentes / SRC disponiveis para vincular
  const { data: attData } = useSWR<{
    attendants: { id: string | null; name: string; src: string | null }[];
    detectedSrcs: string[];
  }>("/api/team/attendants", fetcher);

  const attendantOptions: AttendantOption[] = useMemo(() => {
    const map = new Map<string, AttendantOption>();
    for (const a of attData?.attendants || []) {
      if (a.src && a.src.trim()) {
        map.set(a.src, { id: a.id, name: a.name, src: a.src });
      }
    }
    for (const src of attData?.detectedSrcs || []) {
      if (!map.has(src)) map.set(src, { id: null, name: src, src });
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [attData]);

  // Convite
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState<PermissionsFormValue>(defaultFormValue());
  const [submitting, setSubmitting] = useState(false);

  // Edicao
  const [editTarget, setEditTarget] = useState<TeamMember | null>(null);
  const [editForm, setEditForm] = useState<PermissionsFormValue>(defaultFormValue());
  const [editPassword, setEditPassword] = useState("");

  // Revogar
  const [revokeTarget, setRevokeTarget] = useState<TeamMember | null>(null);

  const kpis = useMemo(() => {
    const active = members.filter((m) => m.status === "active").length;
    const pending = members.filter((m) => m.status === "pending").length;
    const lastAccess = members
      .map((m) => m.last_access_at)
      .filter(Boolean)
      .sort()
      .pop();
    return { active, pending, lastAccess };
  }, [members]);

  async function handleInvite() {
    if (!email.includes("@")) {
      toast.error("Informe um email válido");
      return;
    }
    if (password.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres");
      return;
    }
    if (form.scope_mode === "attendant" && !form.attendant_src) {
      toast.error("Selecione o atendente (SRC) para a visão restrita");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          password,
          role: form.role,
          permissions: form.permissions,
          can_edit: form.can_edit,
          can_delete: form.can_delete,
          can_export: form.can_export,
          scope_mode: form.scope_mode,
          attendant_id: form.attendant_id,
          attendant_src: form.attendant_src,
          src_areas: form.src_areas,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Erro ao criar acesso");
        return;
      }
      toast.success("Acesso criado! A pessoa já pode entrar com email e senha.");
      setInviteOpen(false);
      setEmail("");
      setName("");
      setPassword("");
      setForm(defaultFormValue());
      mutate();
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(member: TeamMember) {
    setEditTarget(member);
    setEditPassword("");
    setEditForm({
      role: member.role,
      permissions: { ...ALL_PERMISSIONS_TRUE, ...member.permissions },
      can_edit: member.can_edit,
      can_delete: member.can_delete,
      can_export: member.can_export,
      scope_mode: member.scope_mode || "all",
      attendant_id: member.attendant_id ?? null,
      attendant_src: member.attendant_src ?? null,
      src_areas: member.src_areas || { cobranca: true, financeiro: true },
    });
  }

  async function handleSaveEdit() {
    if (!editTarget) return;
    if (editForm.scope_mode === "attendant" && !editForm.attendant_src) {
      toast.error("Selecione o atendente (SRC) para a visão restrita");
      return;
    }
    if (editPassword && editPassword.length < 6) {
      toast.error("A nova senha deve ter no mínimo 6 caracteres");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/team/${editTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: editForm.role,
          permissions: editForm.permissions,
          can_edit: editForm.can_edit,
          can_delete: editForm.can_delete,
          can_export: editForm.can_export,
          scope_mode: editForm.scope_mode,
          attendant_id: editForm.attendant_id,
          attendant_src: editForm.attendant_src,
          src_areas: editForm.src_areas,
          ...(editPassword ? { password: editPassword } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || "Erro ao salvar");
        return;
      }
      toast.success("Acesso atualizado");
      setEditTarget(null);
      mutate();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke() {
    if (!revokeTarget) return;
    const res = await fetch(`/api/team/${revokeTarget.id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      toast.error(json.error || "Erro ao remover");
      return;
    }
    toast.success("Membro removido. O email foi liberado para uso próprio.");
    setRevokeTarget(null);
    mutate();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-heading">Equipe</h1>
          <p className="text-sm text-muted-foreground">
            Convide membros e controle o acesso de cada um
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="gap-2">
          <UserPlus className="h-4 w-4" />
          Convidar Membro
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-card border-border">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/15">
              <Users className="h-5 w-5 text-brand" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{kpis.active}</p>
              <p className="text-xs text-muted-foreground">Membros ativos</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/15">
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{kpis.pending}</p>
              <p className="text-xs text-muted-foreground">Convites pendentes</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Activity className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                {kpis.lastAccess
                  ? format(new Date(kpis.lastAccess), "dd/MM/yyyy HH:mm", {
                      locale: ptBR,
                    })
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground">Último acesso</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">
                Nenhum membro ainda
              </h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Convide pessoas da sua equipe e defina exatamente o que cada uma
                pode ver e fazer.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Último Acesso</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium text-foreground">
                      {m.invited_name || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.invited_email}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {ROLE_LABELS[m.role] || m.role}
                    </TableCell>
                    <TableCell>{statusBadge(m.status)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.last_access_at
                        ? format(new Date(m.last_access_at), "dd/MM HH:mm", {
                            locale: ptBR,
                          })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(m)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar acesso
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setRevokeTarget(m)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Apagar membro
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog Convidar */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar membro</DialogTitle>
            <DialogDescription>
              Você define o email e a senha. A pessoa entra direto pela tela de
              login e vê os dados da sua conta, conforme as permissões abaixo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="pessoa@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-name">Nome (opcional)</Label>
              <Input
                id="invite-name"
                placeholder="Nome do membro"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-password">Senha de acesso</Label>
              <div className="relative">
                <Input
                  id="invite-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Informe essa senha à pessoa. Ela poderá alterá-la depois.
              </p>
            </div>
            <PermissionsForm
              value={form}
              onChange={setForm}
              attendantOptions={attendantOptions}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleInvite} disabled={submitting}>
              {submitting ? "Criando..." : "Criar acesso"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Editar */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar acesso</DialogTitle>
            <DialogDescription>
              {editTarget?.invited_email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <PermissionsForm
              value={editForm}
              onChange={setEditForm}
              attendantOptions={attendantOptions}
            />
            <div className="space-y-2 border-t border-border pt-4">
              <Label htmlFor="edit-password">Redefinir senha (opcional)</Label>
              <div className="relative">
                <Input
                  id="edit-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Deixe em branco para manter a atual"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={submitting}>
              {submitting ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revogar */}
      <AlertDialog
        open={!!revokeTarget}
        onOpenChange={(o) => !o && setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover membro?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeTarget?.invited_name || revokeTarget?.invited_email} perderá
              o acesso imediatamente e o email será liberado para criar uma conta
              própria. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevoke}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
