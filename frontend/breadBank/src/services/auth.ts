interface AuthUser {
  id: number;
  email: string;
  name?: string | null;
}

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';
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

// A few ready-made questions for the sign-up dropdown. The backend stores
// whatever string it's given, so a custom question works too.
export const SECURITY_QUESTIONS = [
  'What was the name of your first pet?',
  'What city were you born in?',
  'What was the make of your first car?',
  'What is your mother\'s maiden name?',
  'What was the name of your elementary school?',
  'What is your favorite book?',
];

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = safeStorageGet(STORAGE_TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    headers,
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

  register: async (
    email: string,
    password: string,
    name?: string,
    securityQuestion?: string,
    securityAnswer?: string,
  ) => {
    const normalizedEmail = email.trim();
    const normalizedPassword = password.trim();

    if (!normalizedEmail || !normalizedPassword) {
      throw new Error('Please enter both email and password.');
    }

    const response = await request<{ id: number; email: string; name: string | null }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: normalizedEmail,
        password: normalizedPassword,
        name: name?.trim() ?? null,
        securityQuestion: securityQuestion?.trim() || null,
        securityAnswer: securityAnswer?.trim() || null,
      }),
    });

    return response;
  },

  // Password reset (security question). Step 1: fetch the question for an email.
  getSecurityQuestion: async (email: string) => {
    return request<{ question: string }>('/auth/forgot/question', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim() }),
    });
  },

  // Step 2: answer it and set a new password.
  resetPassword: async (email: string, answer: string, newPassword: string) => {
    return request<{ ok: boolean }>('/auth/forgot/reset', {
      method: 'POST',
      body: JSON.stringify({ email: email.trim(), answer, newPassword }),
    });
  },

  // Settings: read whether the logged-in user has a question, and set/update it.
  getMySecurity: async () => {
    return request<{ hasSecurityQuestion: boolean; question: string | null }>('/auth/me/security');
  },

  setMySecurity: async (currentPassword: string, question: string, answer: string) => {
    return request<{ hasSecurityQuestion: boolean; question: string }>('/auth/me/security', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, question: question.trim(), answer }),
    });
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
