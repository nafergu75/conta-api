const TOKEN_KEY = 'conta_token';
const USER_KEY = 'conta_user';

export interface SessionUser {
  email: string;
  roles: string[];
  /** Empresas del usuario, tal como las devuelve el login del backend. */
  companies?: string[];
}

export function saveSession(token: string, user: SessionUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Empresa activa: la primera de la sesion. Sesiones antiguas (guardadas antes
 * de que el login devolviera las empresas) caen en '1', la empresa demo.
 */
export function getCompanyId(): string {
  return getUser()?.companies?.[0] ?? '1';
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
