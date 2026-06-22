"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PERMISSION_LABELS, ROLE_LABELS } from "@/lib/team/roles";
import type {
  TeamPermissions,
  TeamRole,
  TeamScopeMode,
  TeamSrcAreas,
} from "@/types";

export interface AttendantOption {
  id: string | null;
  name: string;
  src: string;
}

export interface PermissionsFormValue {
  role: TeamRole;
  permissions: TeamPermissions;
  can_edit: boolean;
  can_delete: boolean;
  can_export: boolean;
  // Vinculo de atendente / escopo por SRC
  scope_mode: TeamScopeMode;
  attendant_id: string | null;
  attendant_src: string | null;
  src_areas: TeamSrcAreas;
}

interface PermissionsFormProps {
  value: PermissionsFormValue;
  onChange: (value: PermissionsFormValue) => void;
  attendantOptions?: AttendantOption[];
}

const NONE = "__none__";

export function PermissionsForm({
  value,
  onChange,
  attendantOptions = [],
}: PermissionsFormProps) {
  const isCustom = value.role === "custom";
  const isAttendant = value.scope_mode === "attendant";

  function setRole(role: TeamRole) {
    onChange({ ...value, role });
  }

  function togglePermission(key: keyof TeamPermissions, checked: boolean) {
    onChange({
      ...value,
      permissions: { ...value.permissions, [key]: checked },
    });
  }

  function setScopeMode(mode: TeamScopeMode) {
    onChange({ ...value, scope_mode: mode });
  }

  function setAttendant(src: string) {
    if (src === NONE) {
      onChange({ ...value, attendant_id: null, attendant_src: null });
      return;
    }
    const opt = attendantOptions.find((o) => o.src === src);
    onChange({
      ...value,
      attendant_src: src,
      attendant_id: opt?.id ?? null,
    });
  }

  function setArea(key: keyof TeamSrcAreas, checked: boolean) {
    onChange({ ...value, src_areas: { ...value.src_areas, [key]: checked } });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label>Papel</Label>
        <Select value={value.role} onValueChange={(v) => setRole(v as TeamRole)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["admin", "editor", "viewer", "custom"] as TeamRole[]).map((r) => (
              <SelectItem key={r} value={r}>
                {ROLE_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {value.role === "admin" &&
            "Acesso total a todas as abas, com edição e exclusão."}
          {value.role === "editor" &&
            "Vê tudo e pode editar, mas não pode excluir registros."}
          {value.role === "viewer" && "Vê tudo, sem editar nem excluir."}
          {value.role === "custom" &&
            "Escolha manualmente as abas e ações permitidas."}
        </p>
      </div>

      {isCustom && (
        <>
          <div className="space-y-3">
            <Label className="text-sm">Abas permitidas</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PERMISSION_LABELS.map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-start gap-2 rounded-lg border border-border p-2.5 text-sm hover:bg-accent/50 cursor-pointer"
                >
                  <Checkbox
                    checked={!!value.permissions[key]}
                    onCheckedChange={(c) => togglePermission(key, c === true)}
                    className="mt-0.5"
                  />
                  <span className="leading-tight text-foreground">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-border p-3">
            <Label className="text-sm">Ações</Label>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">Pode editar dados</span>
              <Switch
                checked={value.can_edit}
                onCheckedChange={(c) => onChange({ ...value, can_edit: c })}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">Pode excluir registros</span>
              <Switch
                checked={value.can_delete}
                onCheckedChange={(c) => onChange({ ...value, can_delete: c })}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">Pode exportar dados</span>
              <Switch
                checked={value.can_export}
                onCheckedChange={(c) => onChange({ ...value, can_export: c })}
              />
            </div>
          </div>
        </>
      )}

      {/* Vinculo de atendente / escopo por SRC */}
      <div className="space-y-3 rounded-lg border border-border p-3">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Vincular a um atendente</Label>
            <p className="text-xs text-muted-foreground">
              Restringe a visão deste membro aos dados do atendente (SRC).
            </p>
          </div>
          <Switch
            checked={isAttendant}
            onCheckedChange={(c) => setScopeMode(c ? "attendant" : "all")}
          />
        </div>

        {isAttendant && (
          <div className="space-y-3 pt-1">
            <div className="space-y-2">
              <Label className="text-sm">Atendente (SRC)</Label>
              <Select
                value={value.attendant_src ?? NONE}
                onValueChange={setAttendant}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o atendente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhum</SelectItem>
                  {attendantOptions.map((o) => (
                    <SelectItem key={o.src} value={o.src}>
                      {o.name === o.src ? o.name : `${o.name} (${o.src})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {attendantOptions.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhum atendente/SRC encontrado ainda nos dados.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Aplicar o filtro de SRC em</Label>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={value.src_areas.cobranca}
                    onCheckedChange={(c) => setArea("cobranca", c === true)}
                  />
                  <span className="text-foreground">Cobrança</span>
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={value.src_areas.financeiro}
                    onCheckedChange={(c) => setArea("financeiro", c === true)}
                  />
                  <span className="text-foreground">Financeiro</span>
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Nas demais áreas permitidas, o membro vê tudo da conta.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
