export interface StockMovement {
  id: string;
  type: "entry" | "exit";
  quantity: number;
  unit_cost: number;
  total_cost: number;
  transaction_id: string | null;
  product_name: string | null;
  description: string | null;
  kit_matched: boolean;
  date: string;
  created_at: string;
  balance_after: number;
}

export interface StockBalance {
  balance: number;
  stock_value: number;
  avg_unit_cost: number;
  period_entries: number;
  period_exits: number;
  low_stock_alert: number;
  is_low: boolean;
  default_unit_cost: number;
}

export interface StockConfig {
  default_unit_cost: number;
  low_stock_alert: number;
}
