const TOKEN_KEY = 'conta_token';
const USER_KEY = 'conta_user';

export interface SessionUser {
  email: string;
  roles: string[];
  /** Empresas del usuario, tal como las devuelve el login del backend. */
  companies?: string[];
  /**
   * Permisos efectivos que devuelve el login ('contabilidad:read', '*'...).
   * `roles` son nombres de rol ('contable'), no sirven para filtrar el menu.
   */
  permisos?: string[];
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

/**
 * true si el usuario tiene al menos uno de los permisos pedidos. Misma regla que
 * el backend (rbac.service): '*' lo cubre todo y 'recurso:*' cubre 'recurso:read'.
 * Sin requisitos, accesible a todos.
 */
export function tieneAlgunPermiso(user: SessionUser | null, requeridos?: string[]): boolean {
  if (!requeridos || requeridos.length === 0) return true;
  // Sesiones demo anteriores guardaban los permisos en `roles`.
  const permisos = user?.permisos ?? user?.roles ?? [];
  return requeridos.some((p) => {
    if (permisos.includes('*') || permisos.includes(p)) return true;
    return permisos.includes(`${p.split(':')[0]}:*`);
  });
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
