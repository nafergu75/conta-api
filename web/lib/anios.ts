/**
 * Regla común de años (spec arranque-2027, apartado A).
 *
 * El año y el día de hoy se calculan siempre con la hora de España
 * (Europe/Madrid), nunca con la del navegador ni en UTC: entre las 00:00 y las
 * 01:00 del 1 de enero, `new Date().toISOString()` todavía dice el año
 * anterior. Las fechas van como texto AAAA-MM-DD, sin `Date` de por medio.
 */

const DIA_MADRID = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Hoy en España como AAAA-MM-DD. */
export function hoyIso(ahora: Date = new Date()): string {
  return DIA_MADRID.format(ahora);
}

/** Año en curso en España. */
export function anioEspana(ahora: Date = new Date()): number {
  return Number(hoyIso(ahora).slice(0, 4));
}

/** Mes en curso en España (1-12). */
export function mesEspana(ahora: Date = new Date()): number {
  return Number(hoyIso(ahora).slice(5, 7));
}

/** Trimestre en curso en España (1-4). */
export function trimestreEspana(ahora: Date = new Date()): number {
  return Math.floor((mesEspana(ahora) - 1) / 3) + 1;
}

/** Primer año que se acepta en cualquier pantalla (el mismo que el servidor). */
export const ANIO_MINIMO = 1990;

/** ¿Es un año de cuatro cifras razonable? */
export const esAnio = (a: unknown): a is number => typeof a === 'number' && Number.isInteger(a) && a >= ANIO_MINIMO && a <= 2999;

/** Año de la URL (?ejercicio=2027) o null si no viene o no vale. */
export function anioDeTexto(valor: string | null | undefined): number | null {
  const t = String(valor ?? '').trim();
  if (!/^\d{4}$/.test(t)) return null;
  const n = Number(t);
  return esAnio(n) ? n : null;
}

export interface OpcionesRango {
  /** Primer año con datos de la empresa. */
  primero: number;
  /** Año en curso en España. */
  actual: number;
  /** Años después del actual: 1 en los filtros generales, 0 en los modelos de la AEAT. */
  extra?: number;
  /** Años que tienen que salir siempre (los que tienen datos, el elegido o el de la URL). */
  incluir?: Array<number | null | undefined>;
}

/**
 * Años de un desplegable, de mayor a menor: del primero al actual más `extra`,
 * unidos a los de `incluir`.
 */
export function rangoAnios({ primero, actual, extra = 1, incluir = [] }: OpcionesRango): number[] {
  const set = new Set<number>();
  const desde = Math.min(esAnio(primero) ? primero : actual, actual);
  for (let a = desde; a <= actual + extra; a++) set.add(a);
  for (const a of incluir) if (esAnio(a)) set.add(a);
  return [...set].sort((a, b) => b - a);
}

/** Si no se pueden leer los años de la empresa: de actual − 4 a actual + 1 (el selector nunca se queda vacío). */
export const PRIMERO_RESPALDO = (actual: number) => actual - 4;

/** Primer y último día de un año, o de un trimestre (1-4), como AAAA-MM-DD. */
export function rangoFechas(anio: number, trimestre?: number | null): { desde: string; hasta: string } {
  if (!trimestre) return { desde: `${anio}-01-01`, hasta: `${anio}-12-31` };
  const fin = ['03-31', '06-30', '09-30', '12-31'][trimestre - 1];
  const inicio = ['01-01', '04-01', '07-01', '10-01'][trimestre - 1];
  return { desde: `${anio}-${inicio}`, hasta: `${anio}-${fin}` };
}
