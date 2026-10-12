/**
 * Lo que la persona elige en una pantalla (año, trimestre, periodo) se guarda
 * en la URL, para que al volver atrás desde un modelo o una factura la
 * pantalla siga en el mismo año (spec arranque-2027, A.1).
 *
 * Se cambia la URL con history.replaceState: no recarga ni añade pasos al
 * historial, y Next (14.1 o posterior) mantiene useSearchParams al día. Las
 * pantallas del panel se montan solo en el navegador (el layout espera a la
 * sesión), así que se puede leer la URL al crear el estado.
 */
import { anioDeTexto } from './anios';

/** Valor de la URL que significa «Todos los años». */
export const TODOS_LOS_ANIOS = 'todos';

/** Un parámetro de la URL actual (null si no viene o fuera del navegador). */
export function paramDeUrl(nombre: string): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(nombre);
}

/**
 * Año de la URL: un año, null para «todos», o undefined si no viene o no vale
 * (entonces la pantalla abre su año por defecto).
 */
export function anioOTodosDeUrl(nombre = 'ejercicio'): number | null | undefined {
  const t = paramDeUrl(nombre);
  if (t === TODOS_LOS_ANIOS) return null;
  return anioDeTexto(t) ?? undefined;
}

/** Pone (o quita, con null o '') parámetros en la URL actual sin recargar. */
export function ponerEnUrl(valores: Record<string, string | number | null | undefined>): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(valores)) {
    if (v === null || v === undefined || v === '') url.searchParams.delete(k);
    else url.searchParams.set(k, String(v));
  }
  const nueva = `${url.pathname}${url.search}${url.hash}`;
  if (nueva !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(null, '', nueva);
}

/** Trimestre de la URL (?trimestre=1 a 4); 0 si no viene: todo el año. */
export function trimestreDeUrl(nombre = 'trimestre'): number {
  const t = Number(paramDeUrl(nombre));
  return Number.isInteger(t) && t >= 1 && t <= 4 ? t : 0;
}

/** Texto del año para la URL: el año o «todos». */
export const anioParaUrl = (anio: number | null): string => (anio === null ? TODOS_LOS_ANIOS : String(anio));
