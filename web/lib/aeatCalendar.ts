/**
 * Plazos de presentación de la AEAT para una pyme con ejercicio natural.
 *
 * Lo normal es usar los del servidor (GET /impuestos/modelos, con los ajustes
 * fiscales y la fecha de inicio en la app de cada empresa). Esto es el
 * respaldo para quien no puede leerlos: el calendario general, con las mismas
 * reglas que el servidor (src/domain/plazosAeat.ts):
 *
 *  - 303, 111 y 115: hasta el 20 del mes siguiente al trimestre; el 4T del 303,
 *    hasta el 30 de enero, y el del 111 y el 115, hasta el 20 de enero.
 *  - 390, hasta el 30 de enero; 190, hasta el 31; 347, todo febrero; 200,
 *    hasta el 25 de julio.
 *  - Si el último día cae en sábado, domingo o fiesta nacional (Viernes Santo
 *    incluido), el plazo acaba el siguiente día hábil.
 *
 * Fechas como texto AAAA-MM-DD; el día de hoy, el de España.
 */
import { hoyIso } from './anios';

export interface VencimientoAeat {
  id: string;
  modelo: string;
  periodo: string;
  /** Último día para presentarlo (AAAA-MM-DD). */
  fechaVencimiento: string;
  /** Días que quedan (0 = hoy; negativo = ya ha vencido). */
  diasFaltantes: number;
  enlace: string;
}

// ---------------------------------------------------------------------------
// Día hábil (las mismas reglas que el servidor)
// ---------------------------------------------------------------------------

function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Domingo de Pascua (algoritmo anónimo gregoriano), AAAA-MM-DD. */
export function pascua(anio: number): string {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const mm = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * mm + 114) / 31);
  const dia = ((h + l - 7 * mm + 114) % 31) + 1;
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Fiestas nacionales fijas (mes-día), iguales en todas las comunidades. */
const FIJAS = ['01-01', '01-06', '05-01', '08-15', '10-12', '11-01', '12-06', '12-08', '12-25'];

/** Fiestas nacionales de un año: las fijas y el Viernes Santo. */
export function festivosNacionales(anio: number): Set<string> {
  return new Set([...FIJAS.map((md) => `${anio}-${md}`), sumarDias(pascua(anio), -2)]);
}

/** ¿Se puede presentar ese día? No es sábado, domingo ni fiesta nacional. */
export function esDiaHabilAeat(fecha: string): boolean {
  const d = new Date(`${fecha.slice(0, 10)}T00:00:00Z`);
  const dia = d.getUTCDay();
  if (dia === 0 || dia === 6) return false;
  return !festivosNacionales(d.getUTCFullYear()).has(fecha.slice(0, 10));
}

/** Último día real del plazo: la fecha de la norma o, si no es hábil, el siguiente día hábil. */
export function plazoAeat(fecha: string): string {
  let f = fecha.slice(0, 10);
  for (let i = 0; i < 10 && !esDiaHabilAeat(f); i++) f = sumarDias(f, 1);
  return f;
}

/** Último día de febrero (29 en los bisiestos). */
export function ultimoDiaFebrero(anio: number): string {
  return `${anio}-02-${String(new Date(Date.UTC(anio, 2, 0)).getUTCDate()).padStart(2, '0')}`;
}

/** Días de `desde` a `hasta` (AAAA-MM-DD); negativo si `hasta` es anterior. */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${hasta.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Calendario general (respaldo)
// ---------------------------------------------------------------------------

interface Plazo {
  codigo: string;
  periodo: string;
  ejercicio: number;
  /** Fecha que dice la norma; plazoAeat la pasa al día hábil. */
  fecha: string;
}

const NOMBRE_PERIODO: Record<string, string> = { '1T': '1T', '2T': '2T', '3T': '3T', '4T': '4T' };

function plazosDelAnio(anio: number): Plazo[] {
  const plazos: Plazo[] = [];
  for (const codigo of ['303', '111', '115']) {
    plazos.push(
      { codigo, periodo: '1T', ejercicio: anio, fecha: `${anio}-04-20` },
      { codigo, periodo: '2T', ejercicio: anio, fecha: `${anio}-07-20` },
      { codigo, periodo: '3T', ejercicio: anio, fecha: `${anio}-10-20` },
      { codigo, periodo: '4T', ejercicio: anio, fecha: codigo === '303' ? `${anio + 1}-01-30` : `${anio + 1}-01-20` },
    );
  }
  plazos.push(
    { codigo: '390', periodo: '0A', ejercicio: anio, fecha: `${anio + 1}-01-30` },
    { codigo: '190', periodo: '0A', ejercicio: anio, fecha: `${anio + 1}-01-31` },
    { codigo: '347', periodo: '0A', ejercicio: anio, fecha: ultimoDiaFebrero(anio + 1) },
    { codigo: '200', periodo: '0A', ejercicio: anio, fecha: `${anio + 1}-07-25` },
  );
  return plazos;
}

/** Enlace a la pantalla del modelo, abierta en su ejercicio y periodo. */
export function enlaceModelo(codigo: string, ejercicio: number, periodo: string): string {
  const q = new URLSearchParams({ ejercicio: String(ejercicio) });
  if (periodo && periodo !== '0A') q.set('periodo', periodo);
  return `/dashboard/fiscal/modelo-${codigo}?${q.toString()}`;
}

/** «4T de 2026», «Enero de 2027» o «Ejercicio 2026». */
export function textoPeriodoModelo(ejercicio: number, periodo: string): string {
  if (periodo === '0A') return `Ejercicio ${ejercicio}`;
  if (NOMBRE_PERIODO[periodo]) return `${periodo} de ${ejercicio}`;
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const mes = MESES[Number(periodo) - 1];
  return mes ? `${mes} de ${ejercicio}` : `${periodo} de ${ejercicio}`;
}

/** Los próximos `n` plazos generales desde `hoy` (incluido), ordenados por fecha. */
export function proximosVencimientos(hoy: string = hoyIso(), n = 4): VencimientoAeat[] {
  const anio = Number(hoy.slice(0, 4));
  return [...plazosDelAnio(anio - 1), ...plazosDelAnio(anio)]
    .map((p) => ({ ...p, fecha: plazoAeat(p.fecha) }))
    .filter((p) => p.fecha >= hoy)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.codigo.localeCompare(b.codigo))
    .slice(0, n)
    .map((p) => ({
      id: `${p.codigo}-${p.ejercicio}-${p.periodo}`,
      modelo: `Modelo ${p.codigo}`,
      periodo: textoPeriodoModelo(p.ejercicio, p.periodo),
      fechaVencimiento: p.fecha,
      diasFaltantes: diasEntre(hoy, p.fecha),
      enlace: enlaceModelo(p.codigo, p.ejercicio, p.periodo),
    }));
}

// ---------------------------------------------------------------------------
// Periodo que se abre por defecto en los modelos
// ---------------------------------------------------------------------------

/**
 * Trimestre que toca presentar: el último terminado (en octubre, el 3T; de
 * enero a marzo, el 4T del año anterior). Nunca antes de `primero` (el primer
 * año de la empresa en la app): una empresa que empieza en 2027 abre el 1T de
 * 2027 y no un 4T de 2026 que no tiene.
 */
export function trimestreAPresentar(hoy: string = hoyIso(), primero?: number): { ejercicio: number; trimestre: number } {
  const anio = Number(hoy.slice(0, 4));
  const trimestreEnCurso = Math.floor((Number(hoy.slice(5, 7)) - 1) / 3) + 1;
  const r = trimestreEnCurso === 1 ? { ejercicio: anio - 1, trimestre: 4 } : { ejercicio: anio, trimestre: trimestreEnCurso - 1 };
  if (primero !== undefined && r.ejercicio < primero) return { ejercicio: Math.min(primero, anio), trimestre: 1 };
  return r;
}

/** Los modelos anuales (390, 190, 347, 200, 180) se presentan por el ejercicio anterior; nunca antes de `primero`. */
export function ejercicioAnualAPresentar(hoy: string = hoyIso(), primero?: number): number {
  const anio = Number(hoy.slice(0, 4));
  const r = anio - 1;
  return primero !== undefined && r < primero ? Math.min(primero, anio) : r;
}


/** @deprecated Usa useAniosEmpresa().aniosModelos: se quita cuando no lo use ninguna pantalla. */
export function ejerciciosSeleccionables(hoy: string = hoyIso()): number[] {
  const anio = Number(hoy.slice(0, 4));
  return Array.from({ length: 5 }, (_, i) => anio - i);
}
