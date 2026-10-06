const TOKEN_KEY = 'conta_token';
const USER_KEY = 'conta_user';

export interface EmpresaSesion {
  companyId: string;
  codigo?: string | null;
  nombre: string;
}

export interface SessionUser {
  email: string;
  roles: string[];
  /** Empresas del usuario, tal como las devuelve el login del backend. */
  companies?: string[];
  /** Las mismas, con su nombre (para el selector de empresa). */
  empresas?: EmpresaSesion[];
  /** Empresa con la que se trabaja ahora. Sin ella, la primera. */
  empresaActiva?: string;
  /**
   * Permisos efectivos que devuelve el login ('contabilidad:read', '*'...).
   * `roles` son nombres de rol ('contable'), no sirven para filtrar el menu.
   */
  permisos?: string[];
  /** Permisos en cada empresa: un contable puede ser solo lectura en otra. */
  permisosPorEmpresa?: Record<string, string[]>;
  /** Administrador de la plataforma: ve y gestiona todas las empresas. */
  esAdminGlobal?: boolean;
}

const ULTIMA_EMPRESA = (email: string) => `conta_empresa_${email}`;

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
 * Empresa activa: la elegida en el selector o, si no, la primera de la sesion.
 * Sesiones antiguas (guardadas antes de que el login devolviera las empresas)
 * caen en '1', la empresa demo.
 */
export function getCompanyId(): string {
  const u = getUser();
  return u?.empresaActiva ?? u?.companies?.[0] ?? '1';
}

/**
 * Empresa con la que empezar al entrar: la ultima que uso esa persona en este
 * navegador, si todavia tiene acceso; si no, la primera.
 */
export function empresaInicial(email: string, empresas: string[], esAdminGlobal = false): string | undefined {
  try {
    const ultima = localStorage.getItem(ULTIMA_EMPRESA(email));
    if (ultima && (esAdminGlobal || empresas.includes(ultima))) return ultima;
  } catch {
    // Sin localStorage (modo privado estricto): la primera.
  }
  return empresas[0];
}

/**
 * Cambia la empresa activa. Quien llama recarga la pagina despues: cada
 * pantalla lee la empresa al cargar sus datos.
 */
export function cambiarEmpresa(companyId: string, nombre?: string) {
  const u = getUser();
  if (!u) return;
  const empresas = u.empresas ?? [];
  if (nombre && !empresas.some((e) => e.companyId === companyId)) empresas.push({ companyId, nombre });
  localStorage.setItem(USER_KEY, JSON.stringify({ ...u, empresas, empresaActiva: companyId }));
  try {
    localStorage.setItem(ULTIMA_EMPRESA(u.email), companyId);
  } catch {
    // Solo se pierde recordar la ultima empresa.
  }
}

/** Permisos en la empresa activa (el admin global, todos). */
export function permisosActivos(user: SessionUser | null): string[] {
  if (!user) return [];
  if (user.esAdminGlobal) return ['*'];
  const activa = user.empresaActiva ?? user.companies?.[0];
  return (activa && user.permisosPorEmpresa?.[activa]) || user.permisos || user.roles || [];
}

/**
 * true si el usuario tiene al menos uno de los permisos pedidos. Misma regla que
 * el backend (rbac.service): '*' lo cubre todo y 'recurso:*' cubre 'recurso:read'.
 * Sin requisitos, accesible a todos.
 */
export function tieneAlgunPermiso(user: SessionUser | null, requeridos?: string[]): boolean {
  if (!requeridos || requeridos.length === 0) return true;
  // Los de la empresa activa: se puede ser contable en una y solo lectura en otra.
  const permisos = permisosActivos(user);
  return requeridos.some((p) => {
    if (permisos.includes('*') || permisos.includes(p)) return true;
    return permisos.includes(`${p.split(':')[0]}:*`);
  });
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
