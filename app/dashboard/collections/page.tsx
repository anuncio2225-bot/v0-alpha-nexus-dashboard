"use client";

import { useState } from "react";
import { CollectionsTabs } from "@/components/collections/collections-tabs";
import { CollectionsKpis } from "@/components/collections/collections-kpis";
import { CollectionsBoard } from "@/components/collections/collections-board";

export interface CollectionFilters {
  search: string;
  statusIds: string[];
  attendants: string[];
  products: string[];
}

const DEFAULT_FILTERS: CollectionFilters = {
  search: "",
  statusIds: [],
  attendants: [],
  products: [],
};

export default function CollectionsPage() {
  const [filters, setFilters] = useState<CollectionFilters>(DEFAULT_FILTERS);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cobrança</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe e recupere vendas em aberto com seu CRM de cobrança.
          </p>
        </div>
      </div>

      <CollectionsTabs />
      <CollectionsKpis filters={filters} />
      <CollectionsBoard filters={filters} onFiltersChange={setFilters} />
    </div>
  );
}
