export interface AuthProfile {
  userId?: number;
  loginName?: string;
  displayName?: string;
  orgId?: number;
  roles?: string[];
  permissions?: string[];
  dataScope?: { type?: string; orgId?: number };
  fieldDenies?: string[];
  token?: string;
}

const TOKEN_KEY = 'lowcode_token';
const PROFILE_KEY = 'lowcode_profile';

let cachedProfile: AuthProfile | null = null;

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getProfile(): AuthProfile | null {
  if (cachedProfile) return cachedProfile;
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) return null;
  try {
    cachedProfile = JSON.parse(raw) as AuthProfile;
    return cachedProfile;
  } catch {
    return null;
  }
}

export function setSession(profile: AuthProfile) {
  if (profile.token) {
    localStorage.setItem(TOKEN_KEY, profile.token);
  }
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  cachedProfile = profile;
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PROFILE_KEY);
  cachedProfile = null;
}

export function can(perm: string): boolean {
  const profile = getProfile();
  const perms = profile?.permissions || [];
  return perms.includes('*') || perms.includes(perm);
}

export function canPage(pageCode: string): boolean {
  return can(`page:${pageCode}`);
}

export function canAction(actionCode: string): boolean {
  return can(`action:${actionCode}`);
}

export function installAuthFetch() {
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers || {});
    const token = getToken();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const res = await original(input, { ...init, headers });
    if (res.status === 401) {
      const url = String(input);
      if (url.includes('/api/') && !url.includes('/auth/login') && !url.includes('/auth/status')) {
        // leave session for login screen to clear if needed
      }
    }
    return res;
  };
}

export async function fetchAuthStatus(): Promise<{ enabled: boolean }> {
  const res = await fetch('/api/v1/auth/status');
  if (!res.ok) return { enabled: false };
  return res.json();
}

export async function login(loginName: string, password: string): Promise<AuthProfile> {
  const res = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginName, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Login failed');
  }
  setSession(data as AuthProfile);
  return data as AuthProfile;
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/v1/auth/logout', { method: 'POST' });
  } catch {
    /* ignore */
  }
  clearSession();
}

export async function fetchMe(): Promise<AuthProfile> {
  const res = await fetch('/api/v1/auth/me');
  if (!res.ok) {
    clearSession();
    throw new Error('Not logged in');
  }
  const data = (await res.json()) as AuthProfile;
  const token = getToken();
  setSession({ ...data, token: token || data.token });
  return data;
}
