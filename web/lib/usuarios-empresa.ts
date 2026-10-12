import type { Areas, EmpresaSesion, SessionUser } from './auth';

/**
 * Configuracion > Usuarios: tipos de /companies/:companyId/usuarios y quien
 * puede entrar. El servidor vuelve a comprobarlo todo en cada peticion.
 */

export type EstadoUsuarioEmpresa = 'activo' | 'contrasena_pendiente' | 'contrasena_caducada' | 'desactivado';

/** Un usuario con acceso a la empresa (GET /companies/:companyId/usuarios). */
export interface UsuarioEmpresa {
  userId: string;
  nombre: string | null;
  email: string;
  telefono: string | null;
  /** Rol en esta empresa: admin | contable | ventas | solo_lectura. */
  rol: string;
  personalizado: boolean;
  /** Lo que puede en cada area; null con el perfil Administrador (todo). */
  areas: Areas | null;
  activo: boolean;
  esAdminGlobal: boolean;
  estado: EstadoUsuarioEmpresa;
  contrasenaProvisionalHasta: string | null;
  ultimoAcceso: string | null;
  /** Lo que puede hacer con el quien pregunta (el servidor lo decide). */
  puedes: {
    editarAcceso: boolean;
    nuevaContrasena: boolean;
    quitarAcceso: boolean;
    /** Cambiar su nombre y su teléfono (los propios, siempre). Un servidor antiguo no lo manda. */
    datosPersonales?: boolean;
  };
}

/** Respuesta de POST /usuarios. La contraseña solo viene con un usuario nuevo, y solo esta vez. */
export type ResultadoAltaUsuario =
  | { usuarioNuevo: true; usuario: UsuarioEmpresa; contrasenaProvisional: string }
  | { usuarioNuevo: false; usuario: UsuarioEmpresa };

/** Respuesta de POST /usuarios/:userId/contrasena-provisional. */
export interface ResultadoNuevaContrasena {
  userId: string;
  contrasenaProvisional: string;
  contrasenaProvisionalHasta: string;
  estado: 'contrasena_pendiente';
}

/** Respuesta de POST /usuarios/comprobar-correo. */
export interface ComprobacionCorreo {
  existe: boolean;
  yaTieneAcceso: boolean;
  /**
   * Desde esta pantalla no se le puede dar acceso: es el administrador global o
   * una cuenta que no entra en ninguna empresa. Solo el global puede.
   */
  soloAdminGlobal?: boolean;
}

/** Empresa que se puede elegir en el desplegable de Usuarios. */
export interface EmpresaGestionable {
  id: string;
  nombre: string;
  /** null si no se sabe (se lee al elegirla). */
  pais: string | null;
  activa: boolean;
}

/** Bajo la contraseña recien generada: donde se saca otra en esta pantalla. */
export const OTRA_CONTRASENA = 'Si se pierde, genera otra desde la lista con «Nueva contraseña provisional».';

/** Codigos de details.codigo que da el servidor en los 409. */
export const CODIGO_YA_TIENE_ACCESO = 'YA_TIENE_ACCESO';
export const CODIGO_ULTIMO_ADMIN = 'ULTIMO_ADMIN_EMPRESA';

/** Ruta bajo una empresa concreta (no la activa): la elegida en el desplegable. */
export const rutaUsuarios = (companyId: string, resto = '') => `/companies/${encodeURIComponent(companyId)}/usuarios${resto}`;

const administraEsta = (permisos: string[] | undefined) => !!permisos && (permisos.includes('*') || permisos.includes('admin:empresa'));

/**
 * Empresas en las que el usuario tiene el perfil Administrador, segun la
 * sesion (permisosPorEmpresa, que el panel refresca con /auth/me).
 */
export function empresasQueAdministra(user: SessionUser | null): EmpresaSesion[] {
  if (!user) return [];
  const porEmpresa = user.permisosPorEmpresa ?? {};
  const empresas = user.empresas ?? (user.companies ?? []).map((c) => ({ companyId: c, nombre: c }));
  return empresas.filter((e) => administraEsta(porEmpresa[e.companyId]));
}

/** ¿Ve la entrada «Usuarios»? El administrador global y quien administra al menos una empresa. */
export function puedeGestionarUsuarios(user: SessionUser | null): boolean {
  return user?.esAdminGlobal === true || empresasQueAdministra(user).length > 0;
}

/** Fecha y hora cortas en hora de España: «12/10/2026, 18:30». */
export function fechaHoraCorta(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  });
}
