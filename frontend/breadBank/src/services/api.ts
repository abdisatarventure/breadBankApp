import { auth } from 'src/services/auth';

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';

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

export interface Category {
  id: number;
  name: string;
  icon: string;
  color: string;
  is_system: boolean;
  transaction_count: number;
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

// ── API methods ────────────────────────────────────────────

export const api = {
  // Dashboard
  getDashboard: () => request<DashboardData>('/dashboard'),

  // Transactions
  getTransactions: (params?: Record<string, string>) => {
    const q = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<{ transactions: Transaction[]; total: number }>(`/transactions${q}`);
  },
  updateTransaction: (id: number, body: { categoryId?: number; notes?: string; merchant?: string }) =>
    request<{ success: boolean }>(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  bulkCategorize: (ids: number[], categoryId: number) =>
    request<{ success: boolean; updated: number }>('/transactions/bulk/categorize', {
      method: 'PUT',
      body: JSON.stringify({ ids, categoryId }),
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

  // Reports
  getReports: () => request<ReportsData>('/reports'),

  // Accounts
  getAccounts: () => request<Account[]>('/accounts'),

  // AI
  getAiSummary: (month: number, year: number) =>
    request<AiSummary>('/ai/summary', { method: 'POST', body: JSON.stringify({ month, year }) }),
  askAi: (question: string) =>
    request<{ answer: string }>('/ai/chat', { method: 'POST', body: JSON.stringify({ question }) }),
};
