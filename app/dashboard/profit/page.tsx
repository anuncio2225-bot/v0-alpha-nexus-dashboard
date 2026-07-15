"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProfitOverview } from "@/components/profit/profit-overview";
import { ProfitSettings } from "@/components/profit/profit-settings";
import type { ProfitAnalysis } from "@/components/profit/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

type Preset = "q1" | "q2" | "month" | "last_month" | "custom";

function computeRange(
  preset: Preset,
  customFrom: string,
  customTo: string
): { from: string; to: string } {
  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (preset) {
    case "q1":
      return { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m, 15)) };
    case "q2":
      return { from: ymd(new Date(y, m, 16)), to: ymd(new Date(y, m + 1, 0)) };
    case "month":
      return { from: ymd(new Date(y, m, 1)), to: ymd(new Date(y, m + 1, 0)) };
    case "last_month":
      return {
        from: ymd(new Date(y, m - 1, 1)),
        to: ymd(new Date(y, m, 0)),
      };
    case "custom":
      return { from: customFrom, to: customTo };
  }
}

// Quinzena atual como padrão (1-15 ou 16-fim)
function defaultPreset(): Preset {
  return new Date().getDate() <= 15 ? "q1" : "q2";
}

const PRESETS: { key: Preset; label: string }[] = [
  { key: "q1", label: "1ª Quinzena" },
  { key: "q2", label: "2ª Quinzena" },
  { key: "month", label: "Mês atual" },
  { key: "last_month", label: "Mês passado" },
  { key: "custom", label: "Personalizado" },
];

export default function ProfitPage() {
  const [preset, setPreset] = useState<Preset>(defaultPreset());
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const range = useMemo(
    () => computeRange(preset, customFrom, customTo),
    [preset, customFrom, customTo]
  );

  const canQuery = Boolean(range.from && range.to);
  const { data, isLoading } = useSWR<ProfitAnalysis>(
    canQuery
      ? `/api/profit/analysis?from=${range.from}&to=${range.to}`
      : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/15 text-brand">
          <TrendingUp className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold font-heading tracking-tight text-foreground">
            Análise de Lucro
          </h1>
          <p className="text-sm text-muted-foreground">
            Custos, lucro por operação e distribuição entre sócios
          </p>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="settings">Configurações</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Filtro de período */}
          <div className="flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p.key}
                variant={preset === p.key ? "default" : "outline"}
                size="sm"
                onClick={() => setPreset(p.key)}
                className={cn(
                  preset === p.key && "bg-brand text-brand-foreground hover:bg-brand/90"
                )}
              >
                {p.label}
              </Button>
            ))}
            {preset === "custom" && (
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-9 w-auto"
                />
                <span className="text-muted-foreground">até</span>
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-9 w-auto"
                />
              </div>
            )}
          </div>

          <ProfitOverview data={data} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="settings">
          <ProfitSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
