"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SensitiveValue } from "@/components/ui/sensitive-value";
import { toast } from "sonner";
import { formatCurrency, cn } from "@/lib/utils";
import { DollarSign, Plus, Trash2 } from "lucide-react";

const FORMAS = ["PIX", "Link de pagamento", "Boleto", "Cartão", "Dinheiro"];

/** Hoje em Brasília (YYYY-MM-DD). */
const hojeSP = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const num = (v: string) => Number(String(v).replace(",", ".")) || 0;

interface Parte {
  valor: string;
  forma: string;
}

/**
 * Lançar pagamento feito por fora do gateway (ex.: AfterPay que o cliente
 * adiantou), inclusive em mais de uma parte — "R$ 200 no link + R$ 190 no Pix".
 * Mostra quanto o pedido vale, quanto já entrou e quanto falta.
 */
export function RegistrarPagamento({
  clientId,
  valorPedido,
  recebido,
  quitado,
  dataPedido,
  dataPagamento,
  onFeito,
}: {
  clientId: string;
  /** Valor cheio do pedido (o que o cliente paga). */
  valorPedido: number;
  /** Soma dos pagamentos já lançados. */
  recebido: number;
  quitado: boolean;
  /** Data do pedido (YYYY-MM-DD): pagamento não pode ser antes dela. */
  dataPedido?: string | null;
  /** Data em que foi quitado (YYYY-MM-DD), para poder corrigir. */
  dataPagamento?: string | null;
  onFeito: () => void;
}) {
  const falta = Math.max(0, valorPedido - recebido);
  const [partes, setPartes] = useState<Parte[]>([{ valor: "", forma: "PIX" }]);
  const [data, setData] = useState(hojeSP());
  const [quitar, setQuitar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [corrigindo, setCorrigindo] = useState(false);
  const [novaData, setNovaData] = useState(dataPagamento || hojeSP());

  const somaAgora = partes.reduce((s, p) => s + num(p.valor), 0);
  // Data fora do intervalo pedido→hoje joga o pagamento em outro mês (some do
  // Dashboard, do lucro e da comissão do período).
  const dataInvalida = (!!dataPedido && data < dataPedido) || data > hojeSP();
  const vaiQuitar = quitar || recebido + somaAgora >= valorPedido - 0.01;
  const mudar = (i: number, campo: keyof Parte, v: string) =>
    setPartes((ps) => ps.map((p, j) => (j === i ? { ...p, [campo]: v } : p)));

  async function corrigirData() {
    setOcupado(true);
    try {
      const r = await fetch(`/api/collections/${clientId}/payment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_date: novaData }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error);
      toast.success(`Data do pagamento: ${novaData.split("-").reverse().join("/")}`);
      setCorrigindo(false);
      onFeito();
    } catch (e) {
      toast.error((e as Error).message || "Erro ao corrigir a data");
    } finally {
      setOcupado(false);
    }
  }

  async function registrar() {
    const validas = partes.filter((p) => num(p.valor) > 0);
    if (!validas.length && !quitar) return;
    setOcupado(true);
    try {
      const r = await fetch(`/api/collections/${clientId}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partes: validas.map((p) => ({ amount: num(p.valor), payment_method: p.forma })),
          payment_date: data,
          quitar,
        }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error);
      toast.success(vaiQuitar ? "Pagamento registrado — pedido quitado" : "Pagamento parcial registrado");
      setPartes([{ valor: "", forma: "PIX" }]);
      setQuitar(false);
      onFeito();
    } catch (e) {
      toast.error((e as Error).message || "Erro ao registrar pagamento");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-1.5">
        <DollarSign className="size-4" /> Registrar pagamento
      </Label>

      {/* Quanto vale, quanto entrou, quanto falta */}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { t: "Pedido", v: valorPedido, c: "text-foreground" },
          { t: "Recebido", v: recebido, c: "text-success" },
          { t: "Falta", v: quitado ? 0 : falta, c: falta > 0 && !quitado ? "text-warning" : "text-muted-foreground" },
        ].map((x) => (
          <div key={x.t} className="rounded-lg border border-border px-2 py-2">
            <p className="text-[11px] text-muted-foreground">{x.t}</p>
            <p className={cn("text-sm font-semibold", x.c)}>
              <SensitiveValue>{formatCurrency(x.v)}</SensitiveValue>
            </p>
          </div>
        ))}
      </div>

      {quitado ? (
        <div className="space-y-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-success">
              Pedido quitado
              {dataPagamento && ` em ${dataPagamento.split("-").reverse().join("/")}`} — conta como pago nessa data.
            </span>
            {!corrigindo && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  setNovaData(dataPagamento || hojeSP());
                  setCorrigindo(true);
                }}
              >
                Corrigir data
              </Button>
            )}
          </div>
          {corrigindo && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={novaData}
                min={dataPedido || undefined}
                max={hojeSP()}
                onChange={(e) => setNovaData(e.target.value)}
              />
              <Button
                size="sm"
                onClick={corrigirData}
                disabled={ocupado || !novaData || (!!dataPedido && novaData < dataPedido) || novaData > hojeSP()}
              >
                Salvar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setCorrigindo(false)} disabled={ocupado}>
                Cancelar
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Uma linha por parte paga */}
          <div className="space-y-2">
            {partes.map((p, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  inputMode="decimal"
                  placeholder="Valor"
                  value={p.valor}
                  onChange={(e) => mudar(i, "valor", e.target.value)}
                />
                <Select value={p.forma} onValueChange={(v) => mudar(i, "forma", v)}>
                  <SelectTrigger className="w-40 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMAS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {partes.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remover parte"
                    onClick={() => setPartes((ps) => ps.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPartes((ps) => [...ps, { valor: "", forma: "PIX" }])}
            >
              <Plus className="mr-1 size-4" /> Outra parte
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPartes([{ valor: falta ? falta.toFixed(2) : "", forma: partes[0]?.forma || "PIX" }])}
            >
              Pagou o que falta ({formatCurrency(falta)})
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs text-muted-foreground">Pago em</span>
            <Input
              type="date"
              value={data}
              min={dataPedido || undefined}
              max={hojeSP()}
              onChange={(e) => setData(e.target.value || hojeSP())}
            />
          </div>
          {dataInvalida && (
            <p className="text-xs text-destructive">
              A data do pagamento não pode ser antes do pedido ({dataPedido!.split("-").reverse().join("/")}) nem
              depois de hoje.
            </p>
          )}

          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <Checkbox checked={quitar} onCheckedChange={(c) => setQuitar(c === true)} className="mt-0.5" />
            <span>
              Quitar o pedido mesmo com valor menor
              <span className="block text-xs text-muted-foreground">Desconto ou valor combinado com o cliente.</span>
            </span>
          </label>

          <Button
            size="sm"
            onClick={registrar}
            disabled={ocupado || dataInvalida || (somaAgora <= 0 && !quitar)}
            className="w-full"
          >
            {ocupado
              ? "Registrando…"
              : vaiQuitar
                ? `Registrar ${formatCurrency(somaAgora)} e quitar`
                : `Registrar ${formatCurrency(somaAgora)} (parcial)`}
          </Button>
          <p className="text-xs text-muted-foreground">
            Quitado, o pedido vai para Pago e conta como pago no Dashboard na data acima — inclusive AfterPay
            pago por fora. O Pag2Pay não desfaz.
          </p>
        </>
      )}
    </div>
  );
}
