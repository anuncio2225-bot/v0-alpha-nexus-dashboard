"use client";

import { useEffect, useState, type ReactNode } from "react";
import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import { cn, formatCurrency } from "@/lib/utils";
import type { CollectionMetrics, ResumoModalidade } from "@/types";
import { CalendarClock, ChevronDown } from "lucide-react";
import type { CollectionFilters } from "@/app/dashboard/collections/page";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const qtd = (v: number) => new Intl.NumberFormat("pt-BR").format(v);
const pct = (parte: number, total: number) =>
  total > 0 ? `${((parte / total) * 100).toFixed(1).replace(".", ",")}%` : "0%";

// Nome curto no cartão; o completo aparece ao passar o mouse.
const ETAPAS = [
  { k: "agendado", label: "Agendado", titulo: "Total agendado (ainda não saiu)", cor: "#6366f1" },
  { k: "transito", label: "Em trânsito", titulo: "Postado, em trânsito ou saiu para entrega", cor: "#3b82f6" },
  { k: "agencia", label: "Na agência", titulo: "Aguardando retirada na agência", cor: "#f59e0b" },
  { k: "cobranca", label: "Entregue", titulo: "Entregue · aguardando pagamento", cor: "#f97316" },
  { k: "pix_boleto", label: "Pix gerado", titulo: "Pix/boleto gerado, aguardando pagamento", cor: "#0ea5e9" },
  { k: "pago", label: "Pagos", titulo: "Pagos", cor: "#22c55e" },
  { k: "frustrado", label: "Frustrados", titulo: "Frustrados (AfterPay)", cor: "#ef4444" },
  { k: "nao_pago", label: "Pix não pago", titulo: "Pix/boleto não pago", cor: "#64748b" },
] as const;

/** Métricas do CRM com os filtros da tela (o SWR divide a mesma busca entre os blocos). */
function useMetricas(filters: CollectionFilters) {
  const query = new URLSearchParams();
  if (filters.search) query.set("search", filters.search);
  if (filters.statusIds.length > 0) query.set("status_ids", filters.statusIds.join(","));
  if (filters.attendants.length > 0) query.set("attendants", filters.attendants.join(","));
  if (filters.products.length > 0) query.set("products", filters.products.join(","));
  if (filters.platforms.length > 0) query.set("platforms", filters.platforms.join(","));
  if (filters.saleTypes.length > 0) query.set("sale_types", filters.saleTypes.join(","));
  const qs = query.toString();

  const { data, isLoading } = useSWR<{ metrics: CollectionMetrics }>(
    `/api/collections/metrics${qs ? `?${qs}` : ""}`,
    fetcher,
    { refreshInterval: 60000 }
  );
  return { m: data?.metrics, isLoading };
}

const plural = (n: number, um: string, varios: string) => `${qtd(n)} ${n === 1 ? um : varios}`;

/** Números do dia, na linha do título. */
export function CobrancaHoje({ filters }: { filters: CollectionFilters }) {
  const { m, isLoading } = useMetricas(filters);
  return (
    <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto">
      <Indicador
        rotulo="Recebido hoje"
        curto="Recebido hoje"
        carregando={isLoading}
        tom="text-success"
        sub={m ? plural(m.received_today_count ?? 0, "pagamento", "pagamentos") : undefined}
      >
        <SensitiveValue>{formatCurrency(m?.received_today ?? 0)}</SensitiveValue>
      </Indicador>
      <Indicador
        rotulo="A receber · entregues"
        curto="A receber"
        carregando={isLoading}
        tom="text-brand"
        sub={m ? plural(m.due_count ?? 0, "entregue sem pagar", "entregues sem pagar") : undefined}
      >
        <SensitiveValue>{formatCurrency(m?.total_due_today ?? 0)}</SensitiveValue>
      </Indicador>
      <Indicador
        rotulo="Cobranças p/ hoje"
        curto="Cobrar hoje"
        carregando={isLoading}
        tom="text-warning"
        icone={<CalendarClock className="h-3.5 w-3.5" />}
        sub="marcadas na agenda"
      >
        {qtd(m?.scheduled_today ?? 0)}
      </Indicador>
    </div>
  );
}

export function CollectionsKpis({ filters }: { filters: CollectionFilters }) {
  const { m, isLoading } = useMetricas(filters);

  // Recolher os números para o quadro subir — lembrado neste navegador.
  const [aberto, setAberto] = useState(true);
  useEffect(() => {
    try {
      const salvo = localStorage.getItem("cobranca:resumo");
      // No celular começa recolhido (o quadro fica longe); depois vale a escolha.
      if (salvo === "fechado" || (!salvo && window.matchMedia("(max-width: 639px)").matches)) setAberto(false);
    } catch {
      // sem armazenamento: fica aberto
    }
  }, []);
  const alternar = () => {
    setAberto((v) => {
      try {
        localStorage.setItem("cobranca:resumo", v ? "fechado" : "aberto");
      } catch {
        // ignora
      }
      return !v;
    });
  };

  // Com filtro de modalidade, só aparece o painel escolhido.
  const tipos = filters.saleTypes;
  const verAfterpay = tipos.length === 0 || tipos.includes("afterpay");
  const verAntecipado = tipos.length === 0 || tipos.includes("antecipado") || tipos.includes("recuperacao");
  const ap = m?.modalidades?.afterpay;
  const an = m?.modalidades?.antecipado;

  return (
    <section className="space-y-2.5">
      <button
        type="button"
        onClick={alternar}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={aberto}
      >
        <span className="text-[15px] font-medium text-foreground/80">
          Resultado da cobrança
          {!aberto && m && (
            <span className="ml-2 text-xs text-muted-foreground/70">
              {verAfterpay && ap && (
                <>
                  AfterPay: recebido <SensitiveValue>{formatCurrency(ap.recebido)}</SensitiveValue> · frustrado{" "}
                  {pct(ap.perdidos, ap.pedidos)}
                </>
              )}
              {verAfterpay && verAntecipado && " · "}
              {verAntecipado && an && (
                <>
                  Antecipado: recebido <SensitiveValue>{formatCurrency(an.recebido)}</SensitiveValue>
                </>
              )}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          {aberto ? "Recolher" : "Mostrar números"}
          <ChevronDown className={cn("h-4 w-4 transition-transform", aberto && "rotate-180")} />
        </span>
      </button>

      {aberto && (
        <>
          {/* AfterPay × antecipado — separados, com R$, quantidade e % */}
          <div className={cn("grid gap-2.5", verAfterpay && verAntecipado && "lg:grid-cols-2")}>
            {verAfterpay && (
              <PainelModalidade
                titulo="AfterPay"
                sub="agendado — paga quando recebe"
                cor="#0ea5e9"
                r={ap}
                carregando={isLoading}
                rotuloAberto="Em aberto (a caminho / aguardando)"
                rotuloPerdido="Frustrado"
                rodape={(r) =>
                  r.pagos + r.perdidos > 0
                    ? `Entre os já decididos (${qtd(r.pagos + r.perdidos)}): ${pct(r.pagos, r.pagos + r.perdidos)} pagaram e ${pct(r.perdidos, r.pagos + r.perdidos)} frustraram.`
                    : "Ainda nenhum pedido pago ou frustrado."
                }
              />
            )}
            {verAntecipado && (
              <PainelModalidade
                titulo="Antecipado"
                sub="paga antes de sair · com recuperação"
                cor="#10b981"
                r={an}
                carregando={isLoading}
                rotuloAberto="Aguardando pagamento"
                rotuloPerdido="Não pago"
                rodape={(r) =>
                  r.pagos + r.perdidos > 0
                    ? `Dos Pix/boletos já resolvidos (${qtd(r.pagos + r.perdidos)}): ${pct(r.pagos, r.pagos + r.perdidos)} pagaram.`
                    : "Ainda nenhum Pix/boleto pago ou vencido."
                }
              />
            )}
          </div>

          {/* Etapas da entrega — uma faixa compacta */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            {ETAPAS.map((e) => {
              const f = m?.funil?.[e.k];
              return (
                <div
                  key={e.k}
                  className="min-w-0 rounded-xl border border-[var(--border-glass)] bg-card px-3 py-2.5"
                  style={{ borderLeft: `3px solid ${e.cor}` }}
                >
                  <p className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate" title={e.titulo}>{e.label}</span>
                    {!isLoading && <span className="shrink-0 tabular-nums">{f?.count || 0} ped.</span>}
                  </p>
                  {isLoading ? (
                    <Skeleton className="mt-1 h-5 w-20" />
                  ) : (
                    <p className="truncate text-base font-semibold tabular-nums text-foreground">
                      <SensitiveValue>{formatCurrency(f?.value || 0)}</SensitiveValue>
                    </p>
                  )}
                </div>
              );
            })}
          </div>

        </>
      )}
    </section>
  );
}

function PainelModalidade({
  titulo,
  sub,
  cor,
  r,
  carregando,
  rotuloAberto,
  rotuloPerdido,
  rodape,
}: {
  titulo: string;
  sub: string;
  cor: string;
  r?: ResumoModalidade;
  carregando: boolean;
  rotuloAberto: string;
  rotuloPerdido: string;
  rodape: (r: ResumoModalidade) => string;
}) {
  const total = r?.pedidos ?? 0;
  const barra = (n: number) => `${total > 0 ? (n / total) * 100 : 0}%`;
  return (
    <Card className="gap-0 rounded-[18px] border-[var(--border-glass)] px-4 py-3.5 sm:px-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="text-base font-semibold text-foreground">
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: cor, boxShadow: `0 0 8px ${cor}` }} />
          {titulo} <span className="text-sm font-normal text-muted-foreground">· {sub}</span>
        </p>
        {carregando || !r ? (
          <Skeleton className="h-4 w-32" />
        ) : (
          <p className="text-sm text-muted-foreground">
            {qtd(r.pedidos)} pedido{r.pedidos !== 1 ? "s" : ""} ·{" "}
            <SensitiveValue>{formatCurrency(r.valor)}</SensitiveValue>
          </p>
        )}
      </div>

      {/* Barra: pago | em aberto | perdido (pelo número de pedidos) */}
      <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-success" style={{ width: barra(r?.pagos ?? 0) }} />
        <div className="h-full bg-sky-500/70" style={{ width: barra(r?.abertos ?? 0) }} />
        <div className="h-full bg-danger" style={{ width: barra(r?.perdidos ?? 0) }} />
      </div>

      <div className="mt-2.5 grid gap-1.5 sm:grid-cols-3 sm:gap-2">
        <Bloco
          rotulo="Recebido"
          carregando={carregando || !r}
          valor={r?.recebido ?? 0}
          linha={r ? `${qtd(r.pagos)} pago${r.pagos !== 1 ? "s" : ""} · ${pct(r.pagos, total)}` : ""}
          extra={r && r.recebido_parcial > 0 ? `inclui ${formatCurrency(r.recebido_parcial)} parcial` : undefined}
          tom="text-success"
        />
        <Bloco
          rotulo={rotuloAberto}
          carregando={carregando || !r}
          valor={r?.abertos_valor ?? 0}
          linha={r ? `${qtd(r.abertos)} · ${pct(r.abertos, total)}` : ""}
          tom="text-sky-500"
        />
        <Bloco
          rotulo={rotuloPerdido}
          carregando={carregando || !r}
          valor={r?.perdidos_valor ?? 0}
          linha={r ? `${qtd(r.perdidos)} · ${pct(r.perdidos, total)}` : ""}
          tom="text-danger"
        />
      </div>
      {r && !carregando && <p className="mt-2.5 text-xs text-muted-foreground">{rodape(r)}</p>}
    </Card>
  );
}

function Bloco({
  rotulo,
  valor,
  linha,
  extra,
  tom,
  carregando,
}: {
  rotulo: string;
  valor: number;
  linha: string;
  extra?: string;
  tom: string;
  carregando: boolean;
}) {
  return (
    // Celular: uma linha (rótulo à esquerda, valor à direita). Maior: coluna.
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-[var(--glass-1)] px-3 py-2.5 sm:block">
      <div className="min-w-0">
        <p className="truncate text-xs text-muted-foreground" title={rotulo}>
          {rotulo}
        </p>
        <p className="truncate text-xs tabular-nums text-muted-foreground sm:hidden">{!carregando && linha}</p>
      </div>
      {carregando ? (
        <Skeleton className="mt-1 h-5 w-16" />
      ) : (
        <div className="shrink-0 text-right sm:text-left">
          <p className={cn("truncate text-base font-semibold tabular-nums sm:text-xl", tom)}>
            <SensitiveValue>{formatCurrency(valor)}</SensitiveValue>
          </p>
          <p className="hidden truncate text-xs tabular-nums text-muted-foreground sm:block">{linha}</p>
          {extra && (
            <p className="truncate text-[10px] text-muted-foreground/70">
              <SensitiveValue>{extra}</SensitiveValue>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Indicador({
  rotulo,
  children,
  carregando,
  tom,
  icone,
  sub,
  curto,
}: {
  rotulo: string;
  /** Rótulo do celular (três cartões de ~115 px). */
  curto?: string;
  children: ReactNode;
  carregando: boolean;
  tom: string;
  icone?: ReactNode;
  sub?: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-[var(--border-glass)] bg-card px-3 py-2 sm:min-w-[180px] sm:px-4 sm:py-2.5">
      <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground sm:text-xs">
        <span className="hidden sm:inline-flex">{icone}</span>
        <span className="truncate sm:hidden">{curto ?? rotulo}</span>
        <span className="hidden truncate sm:inline">{rotulo}</span>
      </p>
      {carregando ? (
        <Skeleton className="mt-1 h-6 w-20" />
      ) : (
        <>
          <p className={cn("truncate text-[15px] font-semibold tabular-nums sm:text-lg", tom)}>{children}</p>
          {sub && <p className="hidden truncate text-[11px] text-muted-foreground sm:block">{sub}</p>}
        </>
      )}
    </div>
  );
}
