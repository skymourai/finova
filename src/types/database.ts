
export type AccountType =
  | "pea"
  | "cto"
  | "crypto"
  | "savings"
  | "current"
  | "other";

export type AssetType =
  | "stock"
  | "etf"
  | "crypto"
  | "fund"
  | "other";

export interface Account {
  id: string;
  user_id: string;
  name: string;
  account_type: AccountType;
  broker: string | null;
  currency: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PortfolioPosition {
  id: string;
  user_id: string;
  account_id: string;
  asset_id: string;
  quantity: number;
  average_cost: number;
  cost_currency: string;
  opened_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Asset {
  id: string;
  user_id: string;
  name: string;
  ticker: string | null;
  isin: string | null;
  asset_type: AssetType;
  exchange?: string | null;
  currency: string;
  quote_provider?: string | null;
  quote_symbol?: string | null;
  is_manual_quote?: boolean;
  created_at?: string;
  updated_at?: string;
}
