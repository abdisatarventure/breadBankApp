import { auth } from 'src/services/auth';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = auth.getToken();
  const headers: Record<string, string> = options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    headers,
    ...options,
  });
  // Token expired or invalid mid-session — clear it and bounce to login
  // rather than surfacing a confusing error string in the UI.
  if (res.status === 401) {
    auth.logout();
    if (typeof window !== 'undefined') {
      window.location.href = '/#/login';
    }
    throw new Error('Your session has expired. Please sign in again.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((err as { error: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ──────────────────────────────────────────────────

export interface DashboardData {
  totalSpending: number;
  totalIncome: number;
  netSavings: number;
  savingsRate: number;
  previousMonthSpending: number;
  categoryBreakdown: { category: string; total: number }[];
  monthlyTrend: { month: string; monthKey: string; spending: number; income: number }[];
  topMerchants: { merchant: string; total: number; txCount: number }[];
  parkingSpend: number;
  parkingTxCount: number;
  parkingSpendYtd: number;
}

export interface ReportMerchant {
  merchant: string;
  total: number;
  txCount: number;
}

export interface ReportCategoryTrend {
  category: string;
  thisYearTotal: number;
  lastYearTotal: number;
}

export interface ReportYearOverview {
  currentYearTotal: number;
  priorYearTotal: number;
  currentMonthTotal: number;
  priorMonthTotal: number;
}

export interface ReportsData {
  topMerchants: ReportMerchant[];
  categoryTrends: ReportCategoryTrend[];
  yearOverview: ReportYearOverview;
}

export interface Transaction {
  id: number;
  date: string;
  description: string;
  merchant: string | null;
  amount: number;
  type: 'debit' | 'credit';
  notes: string | null;
  is_recurring: boolean;
  category: string | null;
  category_icon: string | null;
  category_color: string | null;
  account_name: string;
  institution: string;
}

export interface TransactionMonth {
  monthKey: string; // 'YYYY-MM'
  count: number;
}

export interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
  is_system: boolean;
  transaction_count: number;
}

export interface Subscription {
  merchant: string;
  cadence: 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
  averageAmount: number;
  lastAmount: number;
  monthlyCost: number;
  occurrences: number;
  lastChargeDate: string;
  nextEstimatedDate: string;
  category: string | null;
  categoryColor: string | null;
  confidence: 'high' | 'medium';
}

export interface SubscriptionsData {
  subscriptions: Subscription[];
  summary: { count: number; totalMonthly: number; totalYearly: number };
}

export interface Budget {
  categoryId: number;
  name: string;
  icon: string;
  color: string;
  limit: number;
  spent: number;
  lastMonthSpent: number;
}

export interface BudgetSuggestion {
  categoryId: number;
  name: string;
  icon: string;
  color: string;
  lastMonthSpent: number;
  suggestedLimit: number;
}

export interface BudgetsData {
  budgets: Budget[];
  summary: { totalLimit: number; totalSpent: number };
  suggestions: BudgetSuggestion[];
}

export interface BudgetPlanItem {
  categoryId: number;
  name: string;
  icon: string;
  color: string;
  lastMonthSpent: number;
  suggestedLimit: number;
  note: string;
}

export interface BudgetPlan {
  plan: BudgetPlanItem[];
  reductionPercent: number;
}

export interface Account {
  id: number;
  name: string;
  type: string;
  institution: string;
  transaction_count: number;
  // SUM(...) over an account with no transactions returns NULL, so the
  // balance can be null even though callers usually coalesce it to 0.
  balance: number | null;
  // Real bank balance from Plaid, when the account is linked. Null for
  // CSV-only accounts — fall back to the transaction-derived `balance`.
  current_balance: number | null;
}

export interface PlaidLinkStatus {
  linked: { institution: string; created_at: string }[];
}

export interface InvestmentAccount {
  name: string;
  institution: string;
  value: number;
}

export interface Holding {
  account: string;
  name: string;
  ticker: string | null;
  type: string | null;
  quantity: number;
  price: number;
  value: number;
  costBasis: number | null;
  gain: number | null;
}

export interface InvestmentsData {
  summary: {
    totalValue: number;
    totalCostBasis: number;
    totalGain: number;
    gainPct: number;
    holdingsCount: number;
  };
  accounts: InvestmentAccount[];
  holdings: Holding[];
}

export interface UploadResult {
  success: boolean;
  imported: number;
  duplicatesSkipped: number;
  total: number;
}

export interface UploadHistory {
  id: number;
  filename: string;
  transaction_count: number;
  duplicate_count: number;
  created_at: string;
  account_name: string;
  institution: string;
}

export interface AiSummary {
  summary: string;
  suggestions: string[];
}

export interface AiStatus {
  monthKey: string;
  inputTokens: number;
  outputTokens: number;
  estCostUsd: number;
  monthlyBudgetUsd: number | null;
  percentUsed: number | null;
  creditExhausted: boolean;
  creditExhaustedAt: string | null;
  level: 'ok' | 'warning' | 'over' | 'exhausted';
}

// ── API methods ────────────────────────────────────────────

export const api = {
  // Dashboard
  getDashboard: () => request<DashboardData>('/dashboard'),

  // Transactions
  getTransactions: (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ transactions: Transaction[]; total: number }>(`/transactions${q}`);
  },
  getTransactionMonths: () => request<TransactionMonth[]>('/transactions/months'),
  updateTransaction: (id: number, body: { categoryId?: number; notes?: string; merchant?: string; date?: string }) =>
    request<{ success: boolean }>(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  assignTransactionCategory: (id: number, categoryId: number) =>
    request<{ success: boolean }>(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify({ categoryId }) }),
  bulkCategorize: (ids: number[], categoryId: number) =>
    request<{ success: boolean; updated: number }>('/transactions/bulk/categorize', {
      method: 'PUT',
      body: JSON.stringify({ ids, categoryId }),
    }),
  reclassifyMerchant: (merchant: string, categoryId: number) =>
    request<{ success: boolean; updated: number }>('/transactions/reclassify-merchant', {
      method: 'PUT',
      body: JSON.stringify({ merchant, categoryId }),
    }),

  // Upload
  uploadCSV: (file: File, accountId: number, accountType: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('accountId', String(accountId));
    form.append('accountType', accountType);
    return request<UploadResult>('/upload', { method: 'POST', body: form });
  },
  getUploadHistory: () => request<UploadHistory[]>('/upload/history'),

  // Categories
  getCategories: () => request<Category[]>('/categories'),
  getUnknownTransactions: () => request<Transaction[]>('/categories/unknown'),
  createCategory: (name: string, icon?: string, color?: string) =>
    request<Category>('/categories', { method: 'POST', body: JSON.stringify({ name, icon, color }) }),
  deleteCategory: (id: number) =>
    request<{ success: boolean }>(`/categories/${id}`, { method: 'DELETE' }),

  // Subscriptions
  getSubscriptions: () => request<SubscriptionsData>('/subscriptions'),

  // Reports
  getReports: () => request<ReportsData>('/reports'),

  // Budgets
  getBudgets: () => request<BudgetsData>('/budgets'),
  setBudget: (categoryId: number, limit: number) =>
    request<{ success: boolean }>('/budgets', { method: 'PUT', body: JSON.stringify({ categoryId, limit }) }),
  setBudgetsBulk: (items: { categoryId: number; limit: number }[]) =>
    request<{ success: boolean; updated: number }>('/budgets/bulk', { method: 'PUT', body: JSON.stringify({ items }) }),
  generateBudgetPlan: (reductionPercent: number) =>
    request<BudgetPlan>('/budgets/generate', { method: 'POST', body: JSON.stringify({ reductionPercent }) }),
  deleteBudget: (categoryId: number) =>
    request<{ success: boolean }>(`/budgets/${categoryId}`, { method: 'DELETE' }),

  // Accounts
  getAccounts: () => request<Account[]>('/accounts'),

  // Plaid (bank linking)
  getPlaidStatus: () => request<PlaidLinkStatus>('/plaid/status'),
  createPlaidLinkToken: () =>
    request<{ link_token: string }>('/plaid/link-token', { method: 'POST' }),
  exchangePlaidToken: (publicToken: string) =>
    request<{ success: boolean; institution: string; imported: number }>('/plaid/exchange', {
      method: 'POST',
      body: JSON.stringify({ public_token: publicToken }),
    }),
  syncPlaid: () =>
    request<{ success: boolean; banks: number; imported: number }>('/plaid/sync', { method: 'POST' }),
  getInvestments: () => request<InvestmentsData>('/plaid/investments'),

  // AI
  getAiSummary: (month: number, year: number) =>
    request<AiSummary>('/ai/summary', { method: 'POST', body: JSON.stringify({ month, year }) }),
  askAi: (question: string) =>
    request<{ answer: string }>('/ai/chat', { method: 'POST', body: JSON.stringify({ question }) }),
  getAiStatus: () => request<AiStatus>('/ai/status'),
  setAiBudget: (budget: number | null) =>
    request<AiStatus>('/ai/budget', { method: 'PUT', body: JSON.stringify({ budget }) }),
};
