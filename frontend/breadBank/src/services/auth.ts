interface AuthUser {
  id: number;
  email: string;
  name?: string | null;
}

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api';
const STORAGE_TOKEN_KEY = 'bb_auth_token';
const STORAGE_USER_KEY = 'bb_auth_user';

function safeStorageGet(key: string) {
  return typeof window === 'undefined' ? null : window.localStorage.getItem(key);
}

function safeStorageSet(key: string, value: string) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(key, value);
  }
}

function safeStorageRemove(key: string) {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(key);
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new Error((errorBody as { error?: string })?.error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const auth = {
  login: async (email: string, password: string) => {
    const normalizedEmail = email.trim();
    const normalizedPassword = password.trim();

    if (!normalizedEmail || !normalizedPassword) {
      throw new Error('Please enter both email and password.');
    }

    const response = await request<{ token: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: normalizedEmail, password: normalizedPassword }),
    });

    safeStorageSet(STORAGE_TOKEN_KEY, response.token);
    safeStorageSet(STORAGE_USER_KEY, JSON.stringify(response.user));

    return response;
  },

  register: async (email: string, password: string, name?: string) => {
    const normalizedEmail = email.trim();
    const normalizedPassword = password.trim();

    if (!normalizedEmail || !normalizedPassword) {
      throw new Error('Please enter both email and password.');
    }

    const response = await request<{ id: number; email: string; name: string | null }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: normalizedEmail, password: normalizedPassword, name: name?.trim() ?? null }),
    });

    return response;
  },

  logout: () => {
    safeStorageRemove(STORAGE_TOKEN_KEY);
    safeStorageRemove(STORAGE_USER_KEY);
  },

  getToken: () => safeStorageGet(STORAGE_TOKEN_KEY),

  getUser: (): AuthUser | null => {
    const raw = safeStorageGet(STORAGE_USER_KEY);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as AuthUser;
    } catch {
      return null;
    }
  },

  isAuthenticated: () => Boolean(safeStorageGet(STORAGE_TOKEN_KEY)),
};
