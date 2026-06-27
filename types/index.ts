// ============================================================================
// USER & AUTH
// ============================================================================

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  name: string | null;
  avatar_url: string | null;
  role: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// EQUIPE / ACESSO
// ============================================================================

// Chaves de permissao por pagina (espelham a sidebar)
export type TeamPermissionKey =
  | "dashboard"
  | "investimento_ads"
  | "integracoes"
  | "webhooks"
  | "atendentes"
  | "cobranca"
  | "financeiro"
  | "cashflow"
  | "logs"
  | "settings"
  | "equipe";

export type TeamPermissions = Record<TeamPermissionKey, boolean>;

export type TeamRole = "admin" | "editor" | "viewer" | "custom";
export type TeamMemberStatus = "pending" | "active" | "revoked";

// Modo de visao do membro: "all" ve tudo da conta; "attendant" ve so o SRC dele
export type TeamScopeMode = "all" | "attendant";

// Areas onde o filtro por SRC (atendente) se aplica
export interface TeamSrcAreas {
  cobranca: boolean;
  financeiro: boolean;
}

export interface TeamMember {
  id: string;
  owner_id: string;
  invited_email: string;
  invited_name: string | null;
  invite_token: string;
  member_user_id: string | null;
  role: TeamRole;
  status: TeamMemberStatus;
  permissions: TeamPermissions;
  can_edit: boolean;
  can_delete: boolean;
  can_export: boolean;
  // Vinculo com atendente / escopo por SRC
  attendant_id: string | null;
  attendant_src: string | null;
  scope_mode: TeamScopeMode;
  src_areas: TeamSrcAreas;
  invited_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  last_access_at: string | null;
  updated_at: string;
}

// Escopo de DADOS resolvido para o usuario logado (usado nas rotas de API)
export interface TeamDataScope {
  ownerId: string;
  // Quando definido, filtra os dados das areas marcadas por este SRC
  srcFilter: string | null;
  srcAreas: TeamSrcAreas;
}

// Contexto de equipe resolvido para o usuario logado
export interface TeamContext {
  isOwner: boolean;
  isMember: boolean;
  permissions: TeamPermissions;
  canEdit: boolean;
  canDelete: boolean;
  canExport: boolean;
  ownerName: string | null;
  ownerId: string;
}

export const ALL_PERMISSIONS_TRUE: TeamPermissions = {
  dashboard: true,
  investimento_ads: true,
  integracoes: true,
  webhooks: true,
  atendentes: true,
  cobranca: true,
  financeiro: true,
  cashflow: true,
  logs: true,
  settings: true,
  equipe: true,
};

export const ALL_PERMISSIONS_FALSE: TeamPermissions = {
  dashboard: false,
  investimento_ads: false,
  integracoes: false,
  webhooks: false,
  atendentes: false,
  cobranca: false,
  financeiro: false,
  cashflow: false,
  logs: false,
  settings: false,
  equipe: false,
};

export interface Settings {
  id: string;
  user_id: string;
  meta_tax_multiplier: number;
  ads_tax_percentage: number;
  timezone: string;
  currency: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// WEBHOOKS
// ============================================================================

export interface Webhook {
  id: string;
  user_id: string;
  source: string;
  event_type: string | null;
  payload: Record<string, unknown>;
  status: string;
  error_message: string | null;
  processed_at: string | null;
  created_at: string;
  name: string | null;
  product_name: string | null;
  token: string;
  is_active: boolean;
  updated_at: string;
  operational_type: "afterpay" | "antecipado";
}

export type OperationalMode = "all" | "afterpay" | "antecipado" | "recuperacao";

// ============================================================================
// CONTAS A PAGAR
// ============================================================================

export interface Bill {
  id: string;
  user_id: string;
  titulo: string;
  categoria: string;
  valor: number;
  vencimento: string;
  recorrente: boolean;
  observacao: string | null;
  status: "pendente" | "pago" | "vencido";
  created_at: string;
  updated_at: string;
}

export const BILL_CATEGORIES = [
  "Trafego Pago",
  "Ferramenta",
  "Equipe",
  "Imposto",
  "Atendente",
  "Infraestrutura",
  "Operacional",
  "Outros",
] as const;

// ============================================================================
// TRANSACTIONS
// ============================================================================

export interface Transaction {
  id: string;
  user_id: string;
  webhook_id: string | null;
  transaction_code: string | null;
  product_name: string | null;
  product_id: string | null;
  plan_name: string | null;
  status: string;
  original_status: string | null;
  payment_method: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_doc: string | null;
  amount: number;
  commission: number;
  currency: string;
  sale_date: string | null;
  guarantee_date: string | null;
  tracking_code: string | null;
  tracking_url: string | null;
  attendant_id: string | null;
  source: string;
  raw_payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Sale {
  id: string;
  user_id: string;
  transaction_id: string | null;
  product_name: string | null;
  customer_name: string | null;
  attendant_name: string | null;
  amount: number;
  commission: number;
  status: string | null;
  payment_method: string | null;
  sale_date: string | null;
  created_at: string;
}

// ============================================================================
// ATTENDANTS
// ============================================================================

export interface Attendant {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
  monthly_goal: number;
  commission_rate: number;
  total_sales: number;
  total_revenue: number;
  avatar_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// FINANCIAL
// ============================================================================

export interface BankAccount {
  id: string;
  user_id: string;
  name: string;
  bank_name: string | null;
  account_type: string;
  balance: number;
  color: string;
  is_default: boolean;
  position: number;
  category: string;
  last_balance_update: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccountBalanceLog {
  id: string;
  account_id: string;
  user_id: string;
  old_balance: number;
  new_balance: number;
  changed_at: string;
}

export interface AdInvestment {
  id: string;
  user_id: string;
  date: string;
  platform: string;
  campaign_name: string | null;
  investment_value: number;
  created_at: string;
  updated_at: string;
}

export const AD_PLATFORMS = [
  { value: "meta_ads", label: "Meta Ads (Facebook/Instagram)" },
  { value: "google_ads", label: "Google Ads" },
  { value: "tiktok_ads", label: "TikTok Ads" },
  { value: "kwai_ads", label: "Kwai Ads" },
  { value: "youtube_ads", label: "YouTube Ads" },
  { value: "taboola", label: "Taboola" },
  { value: "outros", label: "Outros" },
] as const;

export interface CustomCategory {
  id: string;
  user_id: string;
  name: string;
  type: "income" | "expense";
  created_at: string;
}

export interface CashflowEntry {
  id: string;
  user_id: string;
  bank_account_id: string | null;
  type: "income" | "expense";
  category: string;
  description: string | null;
  amount: number;
  date: string;
  is_recurring: boolean;
  recurrence_period: string | null;
  status: string;
  source: string;
  transaction_id: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// META ADS
// ============================================================================

export interface MetaConfig {
  id: string;
  user_id: string;
  access_token: string | null;
  token_expires_at: string | null;
  is_connected: boolean;
  connected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MetaAdAccount {
  id: string;
  user_id: string;
  account_id: string;
  account_name: string | null;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MetaAdsPerformance {
  id: string;
  user_id: string;
  ad_account_id: string;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  reach: number;
  cpm: number;
  cpc: number;
  ctr: number;
  conversions: number;
  cost_per_conversion: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// DASHBOARD
// ============================================================================

export interface KpiData {
  label: string;
  value: number;
  formatted: string;
  subtitle?: string;
  change?: number;
  changeLabel?: string;
  tooltip?: string;
  color?: "brand" | "success" | "warning" | "danger" | "neutral";
}

export interface DailyData {
  date: string;
  label: string;
  agendadas: number;
  antecipadas: number;
  pagas: number;
  frustradas: number;
  comissao: number;
  investimento: number;
}

export interface CampaignData {
  id: string;
  name: string;
  spend: number;
  revenue: number;
  conversions: number;
  roi: number;
  ctr: number;
  cpc: number;
  score: "Escalar" | "Testar" | "Pausar";
}

export interface AttendantRanking {
  id: string;
  name: string;
  sales: number;
  revenue: number;
  commission: number;
  goal: number;
  goalProgress: number;
}

export interface ProductOption {
  id: string;
  name: string;
  count: number;
  webhookName?: string | null;
  webhookId?: string | null;
}

export interface DashboardMetrics {
  kpis: {
    agendadas: KpiData;
    antecipadas: KpiData;
    pagas: KpiData;
    frustradas: KpiData;
    entradasHoje: KpiData;
    comissaoReal: KpiData;
    comissaoProjetada: KpiData;
    valorReceber: KpiData;
    investimento: KpiData;
    roi: KpiData;
    cac: KpiData;
    lucro: KpiData;
    taxaFrustracao: KpiData;
    cpa: KpiData;
    caixaEsperado: KpiData;
    taxaConversao: KpiData;
    ticketMedio: KpiData;
  };
  dailyData: DailyData[];
  campaigns: CampaignData[];
  attendants: AttendantRanking[];
  products: ProductOption[];
  financialBreakdown: { label: string; value: number; color: string }[];
  operationalFunnel: { label: string; value: number; color: string }[];
}

// ============================================================================
// FILTERS
// ============================================================================

export type FilterPreset = "today" | "yesterday" | "7d" | "14d" | "30d" | "custom";

export interface DateRange {
  from: Date;
  to: Date;
}

// ============================================================================
// MAPS & CONSTANTS
// ============================================================================

export const STATUS_MAP: Record<string, string> = {
  "1": "Aguardando Pagamento",
  "2": "Pago",
  "3": "Cancelado",
  "4": "Devolvido",
  "5": "Em Disputa",
  "6": "Chargeback",
  "7": "Expirado",
  "8": "Em Analise",
  "9": "Recuperado",
  "10": "Aprovado",
};

export const PAYMENT_MAP: Record<string, string> = {
  "1": "Boleto",
  "2": "Cartao",
  "3": "PIX",
  "4": "Saldo",
  "5": "PayPal",
};

export const CATEGORY_OPTIONS = [
  { value: "vendas", label: "Vendas" },
  { value: "trafego", label: "Trafego Pago" },
  { value: "ferramentas", label: "Ferramentas" },
  { value: "equipe", label: "Equipe" },
  { value: "impostos", label: "Impostos" },
  { value: "outros", label: "Outros" },
] as const;

// Account categories with icons
export const ACCOUNT_CATEGORIES = [
  { value: "bank", label: "Banco", icon: "Building2" },
  { value: "investment", label: "Investimento", icon: "TrendingUp" },
  { value: "wallet", label: "Carteira", icon: "Wallet" },
  { value: "emergency_reserve", label: "Reserva de Emergencia", icon: "ShieldCheck" },
  { value: "payment_platform", label: "Plataforma de Pagamento", icon: "CreditCard" },
  { value: "investment_reserve", label: "Reserva de Investimento", icon: "PiggyBank" },
  { value: "other", label: "Outros", icon: "MoreHorizontal" },
] as const;

// Payment methods for cashflow
export const CASHFLOW_PAYMENT_METHODS = [
  { value: "pix", label: "PIX" },
  { value: "cartao", label: "Cartao" },
  { value: "boleto", label: "Boleto" },
  { value: "transferencia", label: "Transferencia" },
  { value: "saldo_conta", label: "Saldo em Conta" },
  { value: "reserva_emergencia", label: "Reserva de Emergencia" },
  { value: "reserva_investimento", label: "Reserva de Investimento" },
] as const;

// Default expense categories
export const DEFAULT_EXPENSE_CATEGORIES = [
  "Trafego Pago",
  "Ferramenta",
  "Equipe",
  "Imposto",
  "Atendente",
  "Cartao",
  "Operacional",
  "Outros",
] as const;

// Default income categories
export const DEFAULT_INCOME_CATEGORIES = [
  "Venda",
  "Comissoes",
  "Salario",
  "Freelance",
  "Investimentos",
  "Outros",
] as const;

// ============================================================
// Modulo de Cobranca (CRM)
// ============================================================
export interface CollectionStatus {
  id: string;
  user_id: string;
  name: string;
  color: string;
  icon: string | null;
  position: number;
  is_default: boolean;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

export interface CollectionPlatform {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  is_system: boolean;
  created_at: string;
}

export interface CollectionClient {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  document: string | null;
  product_name: string | null;
  product_id: string | null;
  plan_name: string | null;
  platform_id: string | null;
  platform_name: string | null;
  attendant_id: string | null;
  attendant_name: string | null;
  src: string | null;
  transaction_id: string | null;
  total_value: number;
  order_total_value: number | null;
  paid_value: number;
  remaining_value: number;
  payment_method: string | null;
  payment_link: string | null;
  status_id: string | null;
  status_name: string | null;
  braip_status: string | null;
  braip_status_code: number | null;
  order_date: string | null;
  payment_date: string | null;
  negotiation_date: string | null;
  next_collection_date: string | null;
  tracking_code: string | null;
  delivery_status: string | null;
  shipping_company: string | null;
  address_full: string | null;
  last_contact_at: string | null;
  days_without_response: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type CollectionHistoryType =
  | "note"
  | "status_change"
  | "payment"
  | "call"
  | "message"
  | "schedule";

export interface CollectionHistoryEvent {
  id: string;
  user_id: string;
  client_id: string;
  type: CollectionHistoryType;
  description: string;
  old_status: string | null;
  new_status: string | null;
  payment_amount: number | null;
  payment_method: string | null;
  scheduled_date: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CollectionCalendarEmail {
  id: string;
  user_id: string;
  email: string;
  name: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CollectionMetrics {
  total_due_today: number;
  received_today: number;
  scheduled_today: number;
  braip_scheduled_count: number;
  braip_scheduled_value: number;
  no_response_count: number;
  recovery_rate: number;
  total_clients: number;
  total_received: number;
  total_pending: number;
  by_status: Record<string, { count: number; value: number }>;
  by_attendant: Record<string, { count: number; pending: number; received: number }>;
  by_product: Record<string, { count: number; pending: number }>;
  attendant_status: Record<string, Record<string, number>>;
  status_names: string[];
  }
