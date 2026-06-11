"use client";

import { useState } from "react";
import { Check, ChevronsUpDown, Package, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ProductOption } from "@/types";

interface ProductMultiSelectProps {
  products: ProductOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}

export function ProductMultiSelect({
  products,
  selected,
  onChange,
}: ProductMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const isAll = selected.length === 0;
  const allSelected = selected.length === products.length && products.length > 0;

  const triggerLabel = isAll
    ? "Todos os produtos"
    : selected.length === 1
      ? products.find((p) => p.id === selected[0])?.name || "1 produto"
      : `${selected.length} produtos`;

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  function toggleAll() {
    if (allSelected || isAll) {
      onChange([]);
    } else {
      onChange(products.map((p) => p.id));
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full sm:w-[260px] justify-between bg-card border-border"
        >
          <span className="flex items-center gap-2 min-w-0">
            <Package className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="truncate text-sm">{triggerLabel}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[320px] p-0 bg-card border-border"
        align="end"
      >
        {/* Select all */}
        <button
          type="button"
          onClick={toggleAll}
          className="flex items-center gap-3 w-full px-3 py-2.5 border-b border-border hover:bg-muted/40 transition-colors text-left"
        >
          <Checkbox
            checked={isAll || allSelected}
            onCheckedChange={toggleAll}
            className="pointer-events-none"
          />
          <span className="text-sm font-medium text-foreground flex-1">
            Todos os produtos
          </span>
          {isAll && (
            <Check className="h-4 w-4 text-brand" />
          )}
        </button>

        {/* Product list */}
        <div className="max-h-[320px] overflow-y-auto py-1">
          {products.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6 px-4">
              Nenhum produto no periodo
            </p>
          ) : (
            products.map((p) => {
              const isSelected = selected.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className="flex items-start gap-3 w-full px-3 py-2 hover:bg-muted/40 transition-colors text-left"
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggle(p.id)}
                    className="pointer-events-none mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {p.name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">
                        {p.count} {p.count === 1 ? "venda" : "vendas"}
                      </span>
                      {p.webhookName && (
                        <>
                          <span className="text-xs text-muted-foreground">
                            &middot;
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "h-5 gap-1 px-1.5 text-[10px] font-normal",
                              "border-brand/30 bg-brand/10 text-brand"
                            )}
                          >
                            <Webhook className="h-2.5 w-2.5" />
                            {p.webhookName}
                          </Badge>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
