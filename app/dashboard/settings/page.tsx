"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { User, Settings as SettingsIcon } from "lucide-react";
import type { Profile, Settings } from "@/types";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [taxMultiplier, setTaxMultiplier] = useState("1.0");
  const [adsTaxPercentage, setAdsTaxPercentage] = useState("6");
  const [timezone, setTimezone] = useState("America/Sao_Paulo");

  const { data: profileData } = useSWR<{ profile: Profile }>("/api/profile", fetcher);
  const { data: settingsData, mutate } = useSWR<{ settings: Settings }>("/api/settings", fetcher);

  const profile = profileData?.profile;
  const settings = settingsData?.settings;

  useEffect(() => {
    if (settings) {
      setTaxMultiplier(String(settings.meta_tax_multiplier || 1.0));
      setAdsTaxPercentage(String(settings.ads_tax_percentage ?? 6));
      setTimezone(settings.timezone || "America/Sao_Paulo");
    }
  }, [settings]);

  async function handleSaveSettings() {
    setLoading(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meta_tax_multiplier: parseFloat(taxMultiplier),
          ads_tax_percentage: parseFloat(adsTaxPercentage),
          timezone,
        }),
      });

      if (!res.ok) throw new Error();

      toast.success("Configurações salvas");
      mutate();
    } catch {
      toast.error("Erro ao salvar configurações");
    } finally {
      setLoading(false);
    }
  }

  const initials = profile?.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "U";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground font-heading">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie seu perfil e preferências
        </p>
      </div>

      {/* Profile Card */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-brand" />
            <CardTitle className="text-lg">Perfil</CardTitle>
          </div>
          <CardDescription>Informações da sua conta Google</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 border-2 border-border">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-brand/20 text-brand text-lg font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-lg font-semibold text-foreground">
                {profile?.full_name || profile?.name || "Usuário"}
              </p>
              <p className="text-sm text-muted-foreground">{profile?.email}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Membro desde {profile?.created_at ? new Date(profile.created_at).toLocaleDateString("pt-BR") : "-"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Settings Card */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-brand" />
            <CardTitle className="text-lg">Preferências</CardTitle>
          </div>
          <CardDescription>Configurações do sistema</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tax">Multiplicador de Imposto Meta</Label>
              <Input
                id="tax"
                type="number"
                step="0.01"
                min="1"
                max="2"
                value={taxMultiplier}
                onChange={(e) => setTaxMultiplier(e.target.value)}
                className="bg-card-elevated border-border"
              />
              <p className="text-xs text-muted-foreground">
                Multiplicador aplicado ao gasto do Meta Ads (ex: 1.1 = 10% de imposto)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ads_tax">Imposto sobre Ads (%)</Label>
              <Input
                id="ads_tax"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={adsTaxPercentage}
                onChange={(e) => setAdsTaxPercentage(e.target.value)}
                className="bg-card-elevated border-border"
              />
              <p className="text-xs text-muted-foreground">
                Porcentagem de imposto aplicada sobre investimento em ads (ex: 6%)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Fuso Horário</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger className="bg-card-elevated border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/Sao_Paulo">São Paulo (BRT)</SelectItem>
                  <SelectItem value="America/Manaus">Manaus (AMT)</SelectItem>
                  <SelectItem value="America/Fortaleza">Fortaleza (BRT)</SelectItem>
                  <SelectItem value="America/Recife">Recife (BRT)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={handleSaveSettings}
            disabled={loading}
            className="bg-brand hover:bg-brand/90"
          >
            {loading ? "Salvando..." : "Salvar Configurações"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
