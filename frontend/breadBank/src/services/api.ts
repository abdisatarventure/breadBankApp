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

// Same auth/401 handling as request(), but returns the raw body as a Blob —
// used for file downloads like the transactions CSV export.
async function requestBlob(path: string): Promise<Blob> {
  const token = auth.getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
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
  return res.blob();
}

// ── Types ──────────────────────────────────────────────────

export interface DashboardData {
  totalSpending: number;
  totalIncome: number;
  netSavings: number;
  savingsRate: number;
  // How much of this month's net savings has been put into savings goals, and
  // how much is still free to allocate. Net Savings itself is unaffected.
  allocatedToGoals: number;
  unallocatedSavings: number;
  // This month's net moved into the Savings category (deposits − withdrawals).
  savedThisMonth: number;
  // Money-back that reduced spending (never income): merchant/tax refunds and
  // person-to-person reimbursements.
  refundsThisMonth: number;
  refundsYtd: number;
  reimbursementsThisMonth: number;
  reimbursementsYtd: number;
  // Money paid toward credit cards (excluded from spending — the card's
  // purchases are the real spending).
  cardPaymentsThisMonth: number;
  cardPaymentsYtd: number;
  previousMonthSpending: number;
  categoryBreakdown: { category: string; total: number }[];
  monthlyTrend: { month: string; monthKey: string; spending: number; income: number }[];
  topMerchants: { merchant: string; total: number; txCount: number }[];
  parkingSpend: number;
  parkingTxCount: number;
  parkingSpendYtd: number;
  anomalies: SpendingAnomaly[];
}

export interface SpendingAnomaly {
  category: string;
  color: string | null;
  icon: string | null;
  thisWeek: number;
  avgWeek: number;
  ratio: number;
}

export interface Bill {
  id: string;
  source: 'subscription' | 'liability';
  name: string;
  amount: number;
  dueDate: string; // 'YYYY-MM-DD'
  status: 'paid' | 'upcoming';
  cadence?: string;
  category?: string | null;
  categoryColor?: string | null;
  accountName?: string | null;
}

export interface CalendarData {
  bills: Bill[];
  summary: { count: number; totalUpcoming: number; dueThisWeek: number; dueThisWeekCount: number };
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

export interface MonthlyBreakdownEntry {
  monthKey: string; // 'YYYY-MM'
  label: string;    // 'Jan'
  spending: number;
  income: number;
  net: number;
  netWorth: number; // running cumulative net, carried across years
}

export interface MonthlyBreakdown {
  year: number;
  availableYears: number[];
  months: MonthlyBreakdownEntry[];
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
  // The expense this row (a reimbursement) is attached to, if any.
  reimburses_transaction_id: number | null;
  // For an expense: total reimbursed against it (0 if nothing linked).
  reimbursed_amount: number;
}

export interface ReimbursementOption {
  id: number;
  date: string;
  description: string;
  amount: number;
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
  // User-entered credit limit (credit cards only), for utilization tracking.
  credit_limit: number | null;
  // Archived accounts keep their transactions but are hidden from uploads,
  // credit utilization, and current balances.
  is_archived: boolean;
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
  creditTotalUsd: number;
  creditSpentAllTimeUsd: number;
  creditRemainingUsd: number;
  creditWarnAtUsd: number;
  creditLow: boolean;
}

// ── Savings goals ──────────────────────────────────────────

export interface SavingsGoal {
  id: number;
  name: string;
  target: number;
  saved: number;        // lifetime total saved into this bucket (persists)
  remaining: number;
  pct: number;
  targetDate: string | null; // 'YYYY-MM-DD'
  icon: string | null;
  color: string | null;
  priority: number;
}

export interface SavingsReserve {
  id: number;
  savedLifetime: number;       // total ever set aside into Savings
  savedThisMonth: number;      // of this month's 20%, how much is funded
  targetThisMonth: number;     // 20% of this month's net savings
  remainingThisMonth: number;  // still to set aside this month
  pct: number;
}

export interface SavingsGoalsData {
  goals: SavingsGoal[];
  reserve: SavingsReserve;     // the built-in "pay yourself first" bucket
  summary: { totalSaved: number; totalTarget: number };
  reservePct: number;          // 0.20
  netSavings: number;          // this month's leftover (== dashboard Net Savings)
  inSavings: number;           // real money in the Savings category (lifetime)
  savedThisMonth: number;      // real Savings deposits this month
  availableForGoals: number;   // real savings not yet earmarked to a purchase goal
  allocatedToOthersThisMonth: number;
  available: number;           // the 80% pot still free for purchase goals
  moveReminder: {              // nudge to actually move money into savings
    needed: number;            // still short of this month's 20% target
    savedThisMonth: number;
    targetThisMonth: number;
  };
}

export interface SavingsSplitItem {
  goalId: number;
  name: string;
  icon: string | null;
  color: string | null;
  remaining: number;
  suggestedAmount: number;
  note: string;
}

export interface SavingsSplitPlan {
  plan: SavingsSplitItem[];
  available: number;
}

export interface SaveGoalInput {
  name: string;
  target: number;
  targetDate?: string | null;
  icon?: string | null;
  color?: string | null;
  priority?: number;
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
  exportTransactionsCsv: (params?: Record<string, string>) => {
    const q = params && Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
    return requestBlob(`/transactions/export${q}`);
  },
  updateTransaction: (id: number, body: { categoryId?: number; notes?: string; merchant?: string; date?: string }) =>
    request<{ success: boolean }>(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  getReimbursements: (id: number) =>
    request<{ linked: ReimbursementOption[]; available: ReimbursementOption[] }>(`/transactions/${id}/reimbursements`),
  setReimbursements: (id: number, reimbursementIds: number[]) =>
    request<{ success: boolean; linked: number }>(`/transactions/${id}/reimbursements`, {
      method: 'PUT', body: JSON.stringify({ reimbursementIds }),
    }),
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
  uploadCSV: (file: File, accountId: number, accountType: string, historical = false) => {
    const form = new FormData();
    form.append('file', file);
    form.append('accountId', String(accountId));
    form.append('accountType', accountType);
    if (historical) form.append('historical', 'true');
    return request<UploadResult>('/upload', { method: 'POST', body: form });
  },
  getUploadHistory: () => request<UploadHistory[]>('/upload/history'),
  deleteUpload: (id: number) =>
    request<{ success: boolean; removedTransactions: number }>(`/upload/${id}`, { method: 'DELETE' }),

  // Categories
  getCategories: () => request<Category[]>('/categories'),
  getUnknownTransactions: () => request<Transaction[]>('/categories/unknown'),
  createCategory: (name: string, icon?: string, color?: string) =>
    request<Category>('/categories', { method: 'POST', body: JSON.stringify({ name, icon, color }) }),
  deleteCategory: (id: number) =>
    request<{ success: boolean }>(`/categories/${id}`, { method: 'DELETE' }),

  // Subscriptions
  getSubscriptions: () => request<SubscriptionsData>('/subscriptions'),

  // User preferences (per-account, stored server-side)
  getSettings: () => request<{ theme: string }>('/settings'),
  setTheme: (theme: string) =>
    request<{ theme: string }>('/settings/theme', { method: 'PUT', body: JSON.stringify({ theme }) }),

  // Bill calendar
  getCalendar: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const q = params.toString();
    return request<CalendarData>(`/calendar${q ? '?' + q : ''}`);
  },

  // Reports
  getReports: () => request<ReportsData>('/reports'),
  getMonthlyBreakdown: (year?: number) =>
    request<MonthlyBreakdown>(`/reports/monthly${year ? `?year=${year}` : ''}`),

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
  setCreditLimit: (id: number, creditLimit: number | null) =>
    request<{ success: boolean }>(`/accounts/${id}/credit-limit`, {
      method: 'PUT', body: JSON.stringify({ creditLimit }),
    }),
  archiveAccount: (id: number, archived: boolean) =>
    request<{ success: boolean }>(`/accounts/${id}/archive`, {
      method: 'PUT', body: JSON.stringify({ archived }),
    }),

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
    request<{ success: boolean; banks: number; imported: number; failed: { institution: string; reason: string }[] }>('/plaid/sync', { method: 'POST' }),
  getInvestments: () => request<InvestmentsData>('/plaid/investments'),

  // Savings goals
  getGoals: () => request<SavingsGoalsData>('/goals'),
  createGoal: (body: SaveGoalInput) =>
    request<{ success: boolean; id: number }>('/goals', { method: 'POST', body: JSON.stringify(body) }),
  updateGoal: (id: number, body: SaveGoalInput) =>
    request<{ success: boolean }>(`/goals/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteGoal: (id: number) =>
    request<{ success: boolean }>(`/goals/${id}`, { method: 'DELETE' }),
  fundSavingsReserve: () =>
    request<{ success: boolean; funded: number }>('/goals/reserve/fund', { method: 'POST' }),
  suggestSavingsSplit: () =>
    request<SavingsSplitPlan>('/goals/suggest', { method: 'POST' }),
  applySavingsSplit: (items: { goalId: number; amount: number }[]) =>
    request<{ success: boolean; applied: number; total: number; reserved: number }>('/goals/apply', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),

  // AI
  getAiSummary: (month: number, year: number) =>
    request<AiSummary>('/ai/summary', { method: 'POST', body: JSON.stringify({ month, year }) }),
  askAi: (question: string) =>
    request<{ answer: string }>('/ai/chat', { method: 'POST', body: JSON.stringify({ question }) }),
  getAiStatus: () => request<AiStatus>('/ai/status'),
  setAiBudget: (budget: number | null) =>
    request<AiStatus>('/ai/budget', { method: 'PUT', body: JSON.stringify({ budget }) }),
  setAiCreditTotal: (total: number) =>
    request<AiStatus>('/ai/credit', { method: 'PUT', body: JSON.stringify({ total }) }),
};
