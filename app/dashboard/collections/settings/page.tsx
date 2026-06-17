"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { CollectionsTabs } from "@/components/collections/collections-tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Trash2, Mail } from "lucide-react";
import type {
  CollectionStatus,
  CollectionPlatform,
  CollectionCalendarEmail,
} from "@/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function CollectionsSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Cobrança</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure status, plataformas, mensagens e notificações.
        </p>
      </div>

      <CollectionsTabs />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <StatusesCard />
        <PlatformsCard />
        <MessageTemplateCard />
        <CalendarEmailsCard />
      </div>
    </div>
  );
}

function StatusesCard() {
  const { data, mutate } = useSWR<{ statuses: CollectionStatus[] }>(
    "/api/collections/statuses",
    fetcher
  );
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [busy, setBusy] = useState(false);
  const statuses = data?.statuses || [];

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/collections/statuses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), color }),
      });
      if (!res.ok) throw new Error();
      setName("");
      mutate();
      toast.success("Status criado");
    } catch {
      toast.error("Erro ao criar status");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      const res = await fetch(`/api/collections/statuses/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j?.error);
      }
      mutate();
      toast.success("Status removido");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Status de cobrança</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {statuses.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5"
            >
              <div className="flex items-center gap-2">
                <span
                  className="size-3 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-sm text-foreground">{s.name}</span>
                {s.is_system && (
                  <span className="text-xs text-muted-foreground">(sistema)</span>
                )}
              </div>
              {!s.is_system && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => remove(s.id)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Novo status</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do status"
            />
          </div>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent"
            aria-label="Cor do status"
          />
          <Button onClick={add} disabled={busy || !name.trim()} size="icon">
            <Plus className="size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PlatformsCard() {
  const { data, mutate } = useSWR<{ platforms: CollectionPlatform[] }>(
    "/api/collections/platforms",
    fetcher
  );
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const platforms = data?.platforms || [];

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/collections/platforms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error();
      setName("");
      mutate();
      toast.success("Plataforma criada");
    } catch {
      toast.error("Erro ao criar plataforma");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      const res = await fetch(`/api/collections/platforms/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j?.error);
      }
      mutate();
      toast.success("Plataforma removida");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Plataformas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {platforms.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground">{p.name}</span>
                {p.is_system && (
                  <span className="text-xs text-muted-foreground">(sistema)</span>
                )}
              </div>
              {!p.is_system && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => remove(p.id)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Nova plataforma</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome da plataforma"
            />
          </div>
          <Button onClick={add} disabled={busy || !name.trim()} size="icon">
            <Plus className="size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function MessageTemplateCard() {
  const { data, mutate } = useSWR<{
    settings: { message_template: string | null };
  }>("/api/collections/settings", fetcher);
  const [template, setTemplate] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data?.settings?.message_template != null) {
      setTemplate(data.settings.message_template);
    }
  }, [data]);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/collections/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message_template: template }),
      });
      if (!res.ok) throw new Error();
      mutate();
      toast.success("Template salvo");
    } catch {
      toast.error("Erro ao salvar template");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Template de mensagem</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Use {"{nome}"}, {"{produto}"} e {"{valor}"} como variáveis.
        </p>
        <Textarea
          rows={5}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          placeholder="Olá {nome}, identificamos um valor em aberto referente ao {produto}..."
        />
        <Button onClick={save} disabled={busy} size="sm">
          Salvar template
        </Button>
      </CardContent>
    </Card>
  );
}

function CalendarEmailsCard() {
  const { data, mutate } = useSWR<{ emails: CollectionCalendarEmail[] }>(
    "/api/collections/calendar-emails",
    fetcher
  );
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const emails = data?.emails || [];

  async function add() {
    if (!email.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/collections/calendar-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) throw new Error();
      setEmail("");
      mutate();
      toast.success("Email adicionado");
    } catch {
      toast.error("Erro ao adicionar email");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    try {
      const res = await fetch(`/api/collections/calendar-emails/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      mutate();
      toast.success("Email removido");
    } catch {
      toast.error("Erro ao remover email");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="size-4" /> Emails para notificações da agenda
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {emails.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum email cadastrado.
            </p>
          ) : (
            emails.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-2.5"
              >
                <span className="truncate text-sm text-foreground">
                  {e.email}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => remove(e.id)}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            ))
          )}
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Adicionar email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
            />
          </div>
          <Button onClick={add} disabled={busy || !email.trim()} size="icon">
            <Plus className="size-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
