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
import type { TeamPermissions, TeamRole } from "@/types";

export interface PermissionsFormValue {
  role: TeamRole;
  permissions: TeamPermissions;
  can_edit: boolean;
  can_delete: boolean;
  can_export: boolean;
}

interface PermissionsFormProps {
  value: PermissionsFormValue;
  onChange: (value: PermissionsFormValue) => void;
}

export function PermissionsForm({ value, onChange }: PermissionsFormProps) {
  const isCustom = value.role === "custom";

  function setRole(role: TeamRole) {
    onChange({ ...value, role });
  }

  function togglePermission(key: keyof TeamPermissions, checked: boolean) {
    onChange({
      ...value,
      permissions: { ...value.permissions, [key]: checked },
    });
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
    </div>
  );
}
