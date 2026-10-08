"use client";

import { useState } from "react";
import { CollectionsTabs } from "@/components/collections/collections-tabs";
import { CobrancaHoje, CollectionsKpis } from "@/components/collections/collections-kpis";
import { CollectionsBoard } from "@/components/collections/collections-board";

export interface CollectionFilters {
  search: string;
  statusIds: string[];
  attendants: string[];
  products: string[];
  platforms: string[];
  /** Modalidade: afterpay, antecipado, recuperacao ([] = todas). */
  saleTypes: string[];
}

const DEFAULT_FILTERS: CollectionFilters = {
  search: "",
  statusIds: [],
  attendants: [],
  products: [],
  platforms: [],
  saleTypes: [],
};

export default function CollectionsPage() {
  const [filters, setFilters] = useState<CollectionFilters>(DEFAULT_FILTERS);

  return (
    <div className="space-y-4">
      {/* Título com os números do dia ao lado (a linha tinha espaço sobrando) */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Cobrança</h1>
        <CobrancaHoje filters={filters} />
      </div>

      <CollectionsTabs />
      <CollectionsKpis filters={filters} />
      <CollectionsBoard filters={filters} onFiltersChange={setFilters} />
    </div>
  );
}
