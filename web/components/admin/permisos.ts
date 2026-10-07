import type { Area, Areas, CatalogoPermisos, Nivel } from '@/lib/auth';

/**
 * Ayudas puras para los permisos a medida (GET /admin/permisos/catalogo y
 * PUT /admin/usuarios/:id/empresas/:companyId). La API habla en areas y
 * niveles: "Modificar" incluye "Ver" por construccion.
 */

/** Orden de las filas si el catalogo no lo trae (el del servidor manda). */
export const AREAS_ORDEN: readonly Area[] = ['ventas', 'compras', 'contabilidad', 'tesoreria', 'impuestos', 'nominas'];

export type Columna = 'ver' | 'modificar';

/** 'solo-lectura' -> 'solo_lectura' (como lo guarda el servidor). */
export const rolNormalizado = (rol: string) => rol.replace(/-/g, '_');

export const esAdministrador = (rol: string) => rolNormalizado(rol) === 'admin';

/** Perfil del catalogo para un rol (o undefined si el catalogo no lo trae). */
export function perfilDe(catalogo: CatalogoPermisos | null, rol: string) {
  const r = rolNormalizado(rol);
  return catalogo?.perfiles.find((p) => rolNormalizado(p.rol) === r);
}

/** Areas de un perfil. null para Administrador (lo puede todo) o si no se conoce. */
export function areasDelPerfil(catalogo: CatalogoPermisos | null, rol: string): Areas | null {
  if (esAdministrador(rol)) return null;
  const p = perfilDe(catalogo, rol);
  return p && !p.todo && p.areas ? { ...p.areas } : null;
}

export function mismasAreas(a: Areas | null | undefined, b: Areas | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return AREAS_ORDEN.every((k) => a[k] === b[k]);
}

/** true si las areas no son las del perfil de partida (acceso "a medida"). */
export function difiereDelPerfil(catalogo: CatalogoPermisos | null, rol: string, areas: Areas | null): boolean {
  if (!areas || esAdministrador(rol)) return false;
  const perfil = areasDelPerfil(catalogo, rol);
  return !!perfil && !mismasAreas(perfil, areas);
}

export const todoNinguno = (areas: Areas) => AREAS_ORDEN.every((k) => areas[k] === 'ninguno');

/** Estado de las dos casillas de un nivel. */
export const casillas = (nivel: Nivel) => ({ ver: nivel !== 'ninguno', modificar: nivel === 'modificar' });

/**
 * Nivel tras pulsar una casilla. Marcar Modificar marca Ver; desmarcar Ver
 * quita tambien Modificar; desmarcar Modificar deja Ver.
 */
export function nivelTrasPulsar(actual: Nivel, columna: Columna, marcado: boolean): Nivel {
  if (columna === 'modificar') return marcado ? 'modificar' : actual === 'ninguno' ? 'ninguno' : 'ver';
  if (!marcado) return 'ninguno';
  return actual === 'modificar' ? 'modificar' : 'ver';
}

export function aplicarPulsacion(areas: Areas, area: Area, columna: Columna, marcado: boolean): Areas {
  return { ...areas, [area]: nivelTrasPulsar(areas[area], columna, marcado) };
}

/**
 * Lo que se manda en `areas`: las del editor si difieren del perfil; null si
 * son las del perfil (o el perfil es Administrador), para no personalizar.
 */
export function areasParaEnviar(catalogo: CatalogoPermisos | null, rol: string, areas: Areas | null): Areas | null {
  return areas && difiereDelPerfil(catalogo, rol, areas) ? areas : null;
}

/** null o vacio cuenta como Espana (empresas sin datos todavia). */
export const esEmpresaEspanola = (pais: string | null | undefined) => !pais || pais.trim().toUpperCase() === 'ES';
