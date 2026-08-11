"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { cn, formatDate } from "@/lib/utils";
import {
  Check,
  X,
  RefreshCw,
  Webhook,
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Building2,
  Trash2,
  Plus,
} from "lucide-react";
import {
  MetaDateRangePicker,
  type DateRangeValue,
} from "@/components/meta-date-range-picker";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

interface AdAccount {
  id: string;
  name: string;
  currency: string;
  status: string;
  timezoneName: string | null;
  businessId: string | null;
  businessName: string | null;
  connectionId: string;
  connectionLabel: string;
  isSelected: boolean;
  isActive: boolean;
  iofPercent: number;
}

interface MetaConnection {
  id: string;
  label: string | null;
  business_name: string | null;
  status: string;
  last_error: string | null;
  last_synced_at: string | null;
  created_at: string;
}

export default function ConnectPage() {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  // Range da importacao de historico (YYYY-MM-DD). Padrao: mes atual (dia 1 ate hoje).
  const [importRange, setImportRange] = useState<DateRangeValue>(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const first = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
    return { since: first, until: today };
  });
  const [selectedAccounts, setSelectedAccounts] = useState<Set<string>>(
    new Set()
  );
  // IOF (%) editável por conta (account_id -> valor string do input)
  const [iofByAccount, setIofByAccount] = useState<Record<string, string>>({});

  // Formulario de nova conexao (System User Token)
  const [token, setToken] = useState("");
  const [label, setLabel] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Status/conexões. Enquanto sincroniza, sondamos rápido (5s); ocioso, 60s.
  const { data: metaStatus, mutate: mutateStatus } = useSWR(
    "/api/meta/connect",
    fetcher,
    {
      refreshInterval: (latest) =>
        latest?.syncStatus === "syncing" ? 5000 : 60000,
    }
  );
  const { data: accountsData, mutate: mutateAccounts } = useSWR(
    metaStatus?.connected ? "/api/meta/accounts" : null,
    fetcher
  );
  const { data: webhooksData } = useSWR<{
    webhooks: Array<{ id: string; is_active: boolean }>;
  }>("/api/webhooks", fetcher);

  const connections: MetaConnection[] = metaStatus?.connections || [];
  const accounts: AdAccount[] = accountsData?.accounts || [];
  const connErrors: { connectionId: string; message: string }[] =
    accountsData?.errors || [];
  const webhooksCount = webhooksData?.webhooks?.length || 0;
  const activeWebhooks =
    webhooksData?.webhooks?.filter((w) => w.is_active).length || 0;

  const isConnected = !!metaStatus?.connected;

  useEffect(() => {
    if (accounts.length > 0) {
      const selected = accounts.filter((a) => a.isSelected).map((a) => a.id);
      setSelectedAccounts(new Set(selected));
      // inicializa os IOFs com os valores salvos
      setIofByAccount((prev) => {
        const next = { ...prev };
        for (const a of accounts) {
          if (next[a.id] === undefined) {
            next[a.id] = String(a.iofPercent ?? 0);
          }
        }
        return next;
      });
    }
  }, [accounts]);

  // Agrupa contas por Business Manager para exibicao
  const groupedAccounts = useMemo(() => {
    const groups = new Map<string, { name: string; items: AdAccount[] }>();
    for (const acc of accounts) {
      const key = acc.businessId || acc.connectionId || "__no_bm__";
      const name =
        acc.businessName || acc.connectionLabel || "Sem Business Manager";
      if (!groups.has(key)) groups.set(key, { name, items: [] });
      groups.get(key)!.items.push(acc);
    }
    return Array.from(groups.values());
  }, [accounts]);

  async function handleConnect() {
    if (!token.trim()) {
      toast.error("Cole o Access Token (System User Token).");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/meta/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: token.trim(),
          label: label.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("Business Manager conectado com sucesso.");
        setToken("");
        setLabel("");
        setShowForm(false);
        mutateStatus();
        mutateAccounts();
      } else {
        toast.error(data.error || "Falha ao conectar.");
      }
    } catch {
      toast.error("Erro ao conectar.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRemoveConnection(id: string, name: string) {
    if (
      !confirm(
        `Remover a conexão "${name}"? As contas dessa BM deixam de sincronizar. O histórico já importado é mantido.`
      )
    )
      return;
    setLoading(true);
    try {
      await fetch(`/api/meta/connect?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      toast.success("Conexão removida.");
      mutateStatus();
      mutateAccounts();
    } catch {
      toast.error("Erro ao remover conexão.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveAccounts() {
    setLoading(true);
    try {
      const selected = accounts
        .filter((a) => selectedAccounts.has(a.id))
        .map((a) => {
          const raw = iofByAccount[a.id];
          const parsed = raw !== undefined ? Number(raw.replace(",", ".")) : 0;
          return {
            ...a,
            iofPercent: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0,
          };
        });
      await fetch("/api/meta/accounts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accounts: selected }),
      });
      toast.success("Seleção de contas salva.");
      mutateAccounts();
    } catch {
      toast.error("Erro ao salvar contas.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await fetch("/api/meta/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lookbackDays: 3 }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(
          `Sincronizado: ${data.rowsUpserted} registros (${data.accountsOk}/${data.accountsTotal} contas).`
        );
      } else if (res.status === 409) {
        toast.info("Já existe uma sincronização em andamento.");
      } else {
        toast.error(data.error || "Erro na sincronização.");
      }
      mutateStatus();
    } catch {
      toast.error("Erro ao sincronizar.");
    } finally {
      setSyncing(false);
    }
  }

  // Importa o historico do intervalo selecionado para as contas ativas.
  async function handleImportHistory() {
    setImporting(true);
    try {
      const { since, until } = importRange;

      const res = await fetch("/api/meta/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ since, until }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const fmtDate = (s: string) => s.split("-").reverse().join("/");
        const rangeLabel =
          since === until
            ? fmtDate(since)
            : `${fmtDate(since)} a ${fmtDate(until)}`;
        toast.success(
          `${data.rowsUpserted} dias importados de ${rangeLabel} (${data.accountsOk}/${data.accountsTotal} contas).`
        );
      } else if (res.status === 409) {
        toast.info("Já existe uma sincronização em andamento.");
      } else {
        toast.error(data.error || "Erro ao importar histórico.");
      }
      mutateStatus();
    } catch {
      toast.error("Erro ao importar histórico.");
    } finally {
      setImporting(false);
    }
  }

  function toggleAccount(id: string) {
    const newSet = new Set(selectedAccounts);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedAccounts(newSet);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-foreground">
          Integrações
        </h1>
        <p className="text-sm text-muted-foreground">
          Conecte suas contas de anúncio e plataformas de venda
        </p>
      </div>

      {/* Meta Ads Section */}
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20">
                <svg
                  className="h-5 w-5 text-blue-500"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
              </div>
              <div>
                <CardTitle className="text-lg">Meta Ads</CardTitle>
                <CardDescription>
                  Conecte uma ou mais Business Managers via System User Token
                </CardDescription>
              </div>
            </div>
            <Badge
              variant="outline"
              className={cn(
                "font-medium",
                isConnected
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-muted text-muted-foreground"
              )}
            >
              {isConnected ? (
                <>
                  <Check className="mr-1 h-3 w-3" /> {connections.length}{" "}
                  {connections.length === 1 ? "conexão" : "conexões"}
                </>
              ) : (
                <>
                  <X className="mr-1 h-3 w-3" /> Desconectado
                </>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Lista de conexões (Business Managers) */}
          {isConnected && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-foreground">
                  Business Managers conectadas
                </h4>
                <div className="flex flex-wrap items-center gap-2">
                  <MetaDateRangePicker
                    value={importRange}
                    onChange={setImportRange}
                    disabled={importing || metaStatus?.syncStatus === "syncing"}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleImportHistory}
                    disabled={
                      importing ||
                      syncing ||
                      metaStatus?.syncStatus === "syncing"
                    }
                  >
                    <RefreshCw
                      className={cn("mr-2 h-4 w-4", importing && "animate-spin")}
                    />
                    {importing ? "Importando..." : "Importar histórico"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSync}
                    disabled={syncing || metaStatus?.syncStatus === "syncing"}
                  >
                    <RefreshCw
                      className={cn(
                        "mr-2 h-4 w-4",
                        (syncing || metaStatus?.syncStatus === "syncing") &&
                          "animate-spin"
                      )}
                    />
                    {syncing || metaStatus?.syncStatus === "syncing"
                      ? "Sincronizando..."
                      : "Sincronizar"}
                  </Button>
                </div>
              </div>

              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-card-elevated p-3"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-500/15">
                    <Building2 className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {conn.label || conn.business_name || "Conexão Meta"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Conectado em{" "}
                      {conn.created_at
                        ? formatDate(conn.created_at, "dd/MM/yyyy HH:mm")
                        : "-"}
                    </p>
                    {conn.status === "expired" && (
                      <p className="text-xs text-destructive">
                        Token expirado — gere um novo e reconecte esta BM.
                      </p>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs",
                      conn.status === "expired"
                        ? "border-destructive/30 text-destructive"
                        : "border-success/30 text-success"
                    )}
                  >
                    {conn.status === "expired" ? "Expirada" : "Ativa"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      handleRemoveConnection(
                        conn.id,
                        conn.label || conn.business_name || "Conexão Meta"
                      )
                    }
                    disabled={loading}
                    className="text-destructive hover:text-destructive"
                    aria-label="Remover conexão"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                <span>
                  Última sincronização:{" "}
                  {metaStatus?.lastSyncAt
                    ? formatDate(metaStatus.lastSyncAt, "dd/MM/yyyy HH:mm")
                    : "Ainda não sincronizado"}
                </span>
              </div>

              {metaStatus?.syncError && (
                <p className="text-xs text-destructive">
                  Último erro: {metaStatus.syncError}
                </p>
              )}
            </div>
          )}

          {/* Botão / formulário para adicionar nova conexão */}
          {!showForm ? (
            <Button
              variant="outline"
              onClick={() => setShowForm(true)}
              className="bg-card-elevated"
            >
              <Plus className="mr-2 h-4 w-4" />
              {isConnected
                ? "Adicionar outra Business Manager"
                : "Conectar Meta Ads"}
            </Button>
          ) : (
            <div className="space-y-4 rounded-lg border border-border p-4">
              <Alert>
                <KeyRound className="h-4 w-4" />
                <AlertTitle>Conexão via System User Token</AlertTitle>
                <AlertDescription>
                  Gere um System User Token no Business Manager do Meta (com as
                  permissões <strong>ads_read</strong> e{" "}
                  <strong>ads_management</strong>) e cole abaixo.{" "}
                  <strong>Use um token por Business Manager.</strong>
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="meta-label">Nome da conexão (opcional)</Label>
                <Input
                  id="meta-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Ex: BM Loja Principal"
                  className="text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="meta-token">Access Token (obrigatório)</Label>
                <div className="relative">
                  <Textarea
                    id="meta-token"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Cole aqui o System User Token..."
                    rows={3}
                    className={cn(
                      "pr-10 font-mono text-xs",
                      !showToken && token && "[-webkit-text-security:disc]"
                    )}
                    style={
                      !showToken && token
                        ? ({
                            WebkitTextSecurity: "disc",
                          } as React.CSSProperties)
                        : undefined
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((s) => !s)}
                    className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                    aria-label={showToken ? "Ocultar token" : "Mostrar token"}
                  >
                    {showToken ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={handleConnect}
                  disabled={loading || !token.trim()}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  {loading ? "Validando..." : "Conectar"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowForm(false);
                    setToken("");
                    setLabel("");
                  }}
                  disabled={loading}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}

          {/* Seleção de contas + IOF por conta */}
          {isConnected && (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-foreground">
                Contas de Anúncio
              </h4>

              {connErrors.length > 0 &&
                connErrors.map((e) => (
                  <p key={e.connectionId} className="text-xs text-destructive">
                    {e.message}
                  </p>
                ))}

              {!accountsData ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : accountsData?.error ? (
                <p className="text-sm text-destructive">{accountsData.error}</p>
              ) : accounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma conta encontrada para os tokens conectados.
                </p>
              ) : (
                <>
                  <div className="space-y-4">
                    {groupedAccounts.map((group) => (
                      <div key={group.name} className="space-y-2">
                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <Building2 className="h-3.5 w-3.5" />
                          {group.name}
                        </div>
                        {group.items.map((account) => {
                          const isForeign =
                            (account.currency || "BRL").toUpperCase() !== "BRL";
                          const checked = selectedAccounts.has(account.id);
                          return (
                            <div
                              key={account.id}
                              className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card-elevated p-3"
                            >
                              <label
                                htmlFor={`acc-${account.id}`}
                                className="flex flex-1 cursor-pointer items-center gap-3"
                              >
                                <Checkbox
                                  id={`acc-${account.id}`}
                                  checked={checked}
                                  onCheckedChange={() =>
                                    toggleAccount(account.id)
                                  }
                                />
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-foreground">
                                    {account.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    act_{account.id}
                                  </p>
                                </div>
                              </label>

                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-xs",
                                  isForeign
                                    ? "border-amber-500/40 text-amber-500"
                                    : "border-muted text-muted-foreground"
                                )}
                              >
                                {account.currency}
                                {isForeign ? " → R$" : ""}
                              </Badge>

                              {/* IOF por conta (só faz sentido para contas em moeda estrangeira,
                                  mas deixamos editável sempre) */}
                              <div className="flex items-center gap-1">
                                <Label
                                  htmlFor={`iof-${account.id}`}
                                  className="text-xs text-muted-foreground"
                                >
                                  IOF %
                                </Label>
                                <Input
                                  id={`iof-${account.id}`}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  inputMode="decimal"
                                  value={iofByAccount[account.id] ?? "0"}
                                  onChange={(e) =>
                                    setIofByAccount((prev) => ({
                                      ...prev,
                                      [account.id]: e.target.value,
                                    }))
                                  }
                                  disabled={!checked}
                                  className="h-8 w-20 text-xs"
                                />
                              </div>

                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-xs",
                                  account.status === "active"
                                    ? "border-success/30 text-success"
                                    : "border-muted text-muted-foreground"
                                )}
                              >
                                {account.status === "active"
                                  ? "Ativa"
                                  : "Inativa"}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Contas em dólar são convertidas para R$ com a cotação travada
                    do dia + o IOF configurado por conta.
                  </p>
                  <Button
                    onClick={handleSaveAccounts}
                    disabled={loading}
                    className="bg-brand hover:bg-brand/90"
                  >
                    Salvar Seleção
                  </Button>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Webhooks shortcut */}
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/20">
                <Webhook className="h-5 w-5 text-brand" />
              </div>
              <div>
                <CardTitle className="text-lg">Webhooks de Vendas</CardTitle>
                <CardDescription>
                  Receba vendas de Braip, Kiwify e outras plataformas
                </CardDescription>
              </div>
            </div>
            <Badge
              variant="outline"
              className="border-brand/30 bg-brand/10 text-brand"
            >
              {activeWebhooks} de {webhooksCount} ativos
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Crie um webhook diferente para cada produto ou plataforma. Cada um
            tem um token único e pode ser ativado/desativado independentemente.
          </p>
          <Link href="/dashboard/webhooks">
            <Button variant="outline" className="bg-card-elevated">
              Gerenciar Webhooks
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
