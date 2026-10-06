import { clearSession, getCompanyId, getToken } from './auth';

/** Prefijo que next.config.mjs reenvia al backend (API_PROXY_TARGET). */
export const API_BASE = '/api/conta';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Ruta bajo la empresa activa: companyPath('/clientes') -> '/companies/<id>/clientes'. */
export function companyPath(path: string): string {
  return `/companies/${encodeURIComponent(getCompanyId())}${path.startsWith('/') ? path : `/${path}`}`;
}

function redirigirALogin() {
  clearSession();
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.replace('/login');
  }
}

/**
 * fetch contra el backend con el token de la sesion.
 *
 * - Un 401 cierra la sesion y lleva al login.
 * - Si la respuesta no es JSON (el proxy no llega al backend y devuelve una
 *   pagina de error), lanza un error legible en vez de "Unexpected token '<'".
 * - Devuelve `data` del sobre { data } del backend, o el cuerpo tal cual.
 */
export async function apiFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('No se puede conectar con el servidor.', 0);
  }

  if (res.status === 401) {
    redirigirALogin();
    throw new ApiError('Tu sesión ha caducado. Vuelve a iniciar sesión.', 401);
  }

  const esJson = (res.headers.get('content-type') ?? '').includes('application/json');
  const cuerpo = esJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const mensaje =
      (cuerpo && (cuerpo.message || cuerpo.error)) ||
      (esJson ? `Error ${res.status}` : `El servidor no responde (HTTP ${res.status}).`);
    throw new ApiError(String(mensaje), res.status);
  }
  if (!esJson) {
    throw new ApiError(`Respuesta inesperada del servidor (HTTP ${res.status}).`, res.status);
  }
  return (cuerpo && typeof cuerpo === 'object' && 'data' in cuerpo ? cuerpo.data : cuerpo) as T;
}

/** Descarga binaria (PDF, fichero AEAT...) con el token de la sesion. */
export async function apiDownload(path: string, nombreFichero: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (res.status === 401) {
    redirigirALogin();
    throw new ApiError('Tu sesión ha caducado. Vuelve a iniciar sesión.', 401);
  }
  if (!res.ok) throw new ApiError(`No se pudo descargar el fichero (HTTP ${res.status}).`, res.status);

  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreFichero;
  a.click();
  URL.revokeObjectURL(url);
}

/** Mensaje para mostrar al usuario a partir de cualquier error. */
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Error desconocido';
}
