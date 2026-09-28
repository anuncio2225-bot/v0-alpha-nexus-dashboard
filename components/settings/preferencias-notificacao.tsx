"use client";

import useSWR from "swr";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { EVENTOS_PUSH, querReceber, type EventoPush, type PreferenciasPush } from "@/lib/push/eventos";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Preferencias {
  souDono: boolean;
  permitido: boolean;
  preferencias: PreferenciasPush;
  relatorio: { ativo: boolean; hora: number };
}

interface Membro {
  member_id: string;
  nome: string;
  email: string;
  atendente: string | null;
  permitido: boolean;
  aparelhos: number;
}

const GRUPOS = ["Pagamento", "Entrega", "Problemas", "Estoque"] as const;
const HORAS = Array.from({ length: 24 }, (_, h) => h);

/**
 * O que a PESSOA recebe (vale em todos os aparelhos dela), o relatório do dia
 * e — só para o dono — quem da equipe recebe notificações.
 */
export function PreferenciasNotificacao() {
  const { data, mutate } = useSWR<Preferencias>("/api/push/preferencias", fetcher);
  const { data: equipe, mutate: mutateEquipe } = useSWR<{ membros: Membro[] }>(
    data?.souDono ? "/api/push/equipe" : null,
    fetcher
  );

  async function salvar(corpo: Partial<{ preferencias: PreferenciasPush; relatorio: Partial<Preferencias["relatorio"]> }>) {
    if (!data) return;
    const otimista: Preferencias = {
      ...data,
      preferencias: { ...data.preferencias, ...(corpo.preferencias || {}) },
      relatorio: { ...data.relatorio, ...(corpo.relatorio || {}) },
    };
    await mutate(
      async () => {
        const r = await fetch("/api/push/preferencias", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        });
        if (!r.ok) throw new Error();
        return otimista;
      },
      { optimisticData: otimista, rollbackOnError: true, revalidate: false }
    ).catch(() => toast.error("Não deu para salvar. Tente de novo."));
  }

  async function liberarMembro(m: Membro, permitido: boolean) {
    if (!equipe) return;
    const otimista = {
      membros: equipe.membros.map((x) => (x.member_id === m.member_id ? { ...x, permitido } : x)),
    };
    await mutateEquipe(
      async () => {
        const r = await fetch("/api/push/equipe", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ member_id: m.member_id, permitido }),
        });
        if (!r.ok) throw new Error();
        return otimista;
      },
      { optimisticData: otimista, rollbackOnError: true, revalidate: false }
    ).catch(() => toast.error("Não deu para salvar. Tente de novo."));
  }

  if (!data) return <p className="text-sm text-muted-foreground">Carregando preferências…</p>;

  return (
    <div className="space-y-6">
      {/* O que eu recebo */}
      <section>
        <p className="text-sm font-medium text-foreground">O que você recebe</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Ligue só o que quer ver no celular. Vale para todos os seus aparelhos.
        </p>
        {!data.permitido && (
          <p className="mb-3 rounded-lg border border-warning/35 bg-warning/8 px-3 py-2 text-sm text-warning">
            O dono da conta desligou as notificações para você. Suas escolhas ficam guardadas para quando ele liberar.
          </p>
        )}
        <div className="space-y-4">
          {GRUPOS.map((g) => (
            <div key={g}>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{g}</p>
              <div className="divide-y divide-border rounded-xl border border-border">
                {EVENTOS_PUSH.filter((e) => e.grupo === g).map((e) => (
                  <label key={e.id} className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
                    <span className="min-w-0">
                      <span className="block text-sm text-foreground">
                        {e.emoji} {e.titulo}
                      </span>
                      <span className="block text-xs text-muted-foreground">{e.descricao}</span>
                    </span>
                    <Switch
                      checked={querReceber(data.preferencias, e.id)}
                      onCheckedChange={(v) => salvar({ preferencias: { [e.id as EventoPush]: v } })}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Relatório do dia */}
      <section>
        <p className="text-sm font-medium text-foreground">📊 Relatório do dia</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Lucro, ROI, vendas, agendadas, pagas e quanto falta receber — no horário que você escolher (Brasília).
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3">
          <label className="flex cursor-pointer items-center gap-3">
            <Switch checked={data.relatorio.ativo} onCheckedChange={(v) => salvar({ relatorio: { ativo: v } })} />
            <span className="text-sm text-foreground">Receber o resumo todo dia</span>
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">às</span>
            <Select
              value={String(data.relatorio.hora)}
              onValueChange={(v) => salvar({ relatorio: { hora: Number(v) } })}
              disabled={!data.relatorio.ativo}
            >
              <SelectTrigger className="w-24 bg-card-elevated border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HORAS.map((h) => (
                  <SelectItem key={h} value={String(h)}>
                    {String(h).padStart(2, "0")}:00
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* Equipe — só o dono */}
      {data.souDono && (
        <section>
          <p className="text-sm font-medium text-foreground">Equipe</p>
          <p className="mb-3 text-xs text-muted-foreground">
            Escolha quem da equipe recebe notificações. Atendente limitada ao próprio SRC só recebe as vendas
            dela e não recebe o relatório da operação.
          </p>
          {!equipe ? (
            <p className="text-sm text-muted-foreground">Carregando equipe…</p>
          ) : equipe.membros.length === 0 ? (
            <p className="rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground">
              Nenhum membro ativo na equipe. Convide pela página Equipe.
            </p>
          ) : (
            <div className="divide-y divide-border rounded-xl border border-border">
              {equipe.membros.map((m) => (
                <label key={m.member_id} className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-foreground">{m.nome}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {m.atendente ? `Atendente: ${m.atendente} · ` : ""}
                      {m.aparelhos > 0
                        ? `${m.aparelhos} aparelho${m.aparelhos > 1 ? "s" : ""} ativado${m.aparelhos > 1 ? "s" : ""}`
                        : "ainda não ativou no celular"}
                    </span>
                  </span>
                  <Switch checked={m.permitido} onCheckedChange={(v) => liberarMembro(m, v)} />
                </label>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
