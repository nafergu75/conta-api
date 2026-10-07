import { clearSession, getCompanyId, getToken, marcarCambioObligatorio, RUTA_CAMBIAR_CONTRASENA } from './auth';

/** Prefijo que next.config.mjs reenvia al backend (API_PROXY_TARGET). */
export const API_BASE = '/api/conta';

export class ApiError extends Error {
  /** `detalles`: los `details` del backend, si los manda (p. ej. { campo: 'nif' } en un error de validacion). */
  constructor(message: string, readonly status: number, readonly detalles?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Campo del formulario al que se refiere un error del backend (details.campo), si lo dice. */
export function campoDelError(e: unknown): string | undefined {
  const d = e instanceof ApiError ? e.detalles : undefined;
  const campo = d && typeof d === 'object' ? (d as { campo?: unknown }).campo : undefined;
  return typeof campo === 'string' ? campo : undefined;
}

/** Ruta bajo la empresa activa: companyPath('/clientes') -> '/companies/<id>/clientes'. */
export function companyPath(path: string): string {
  return `/companies/${encodeURIComponent(getCompanyId())}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Codigo (details.codigo) del 403 que da el servidor a quien entro con una
 * contrasena provisional y todavia no ha puesto una suya.
 */
export const CODIGO_CAMBIO_CONTRASENA = 'CAMBIO_CONTRASENA_OBLIGATORIO';

const MENSAJE_CAMBIO_CONTRASENA = 'Antes de seguir tienes que poner una contraseña tuya.';

/** ¿Es el 403 de "pon una contrasena tuya"? */
function esCambioObligatorio(status: number, cuerpo: unknown): boolean {
  if (status !== 403 || !cuerpo || typeof cuerpo !== 'object') return false;
  const details = (cuerpo as { details?: unknown }).details;
  return !!details && typeof details === 'object' && (details as { codigo?: unknown }).codigo === CODIGO_CAMBIO_CONTRASENA;
}

/**
 * Lleva a la pantalla de cambio de contrasena SIN cerrar la sesion: el token
 * sigue valiendo para /auth/me y /auth/cambiar-contrasena.
 */
function llevarACambioContrasena() {
  marcarCambioObligatorio();
  if (typeof window !== 'undefined' && window.location.pathname !== RUTA_CAMBIAR_CONTRASENA) {
    window.location.replace(RUTA_CAMBIAR_CONTRASENA);
  }
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
 * - Un 403 CAMBIO_CONTRASENA_OBLIGATORIO lleva a poner una contrasena propia.
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

  if (esCambioObligatorio(res.status, cuerpo)) {
    llevarACambioContrasena();
    throw new ApiError(MENSAJE_CAMBIO_CONTRASENA, 403, cuerpo.details);
  }

  if (!res.ok) {
    const mensaje =
      (cuerpo && (cuerpo.message || cuerpo.error)) ||
      (esJson ? `Error ${res.status}` : `El servidor no responde (HTTP ${res.status}).`);
    throw new ApiError(String(mensaje), res.status, cuerpo?.details);
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
  if (!res.ok) {
    // El backend explica el motivo en JSON (p. ej. "Falta el NIF de la empresa..."): se muestra tal cual.
    const cuerpo = (res.headers.get('content-type') ?? '').includes('application/json') ? await res.json().catch(() => null) : null;
    if (esCambioObligatorio(res.status, cuerpo)) {
      llevarACambioContrasena();
      throw new ApiError(MENSAJE_CAMBIO_CONTRASENA, 403, cuerpo.details);
    }
    const motivo = cuerpo && (cuerpo.message || cuerpo.error);
    throw new ApiError(motivo ? String(motivo) : `No se pudo descargar el fichero (HTTP ${res.status}).`, res.status);
  }

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
