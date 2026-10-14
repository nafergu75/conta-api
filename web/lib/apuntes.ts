/**
 * Contabilidad > Movimientos: los apuntes de los asientos (cada cargo y abono),
 * con filtros, totales, paginas y descarga en PDF o Excel.
 *
 * Backend: GET /companies/:id/informes-contables/apuntes (contabilidad:read).
 * Los movimientos anotados a mano antes (tabla Movement) se consultan aparte,
 * en /dashboard/movimientos/antiguos.
 */
import { nombreTrimestre } from './anios';

export type EstadoFiltro = 'todos' | 'aprobados' | 'borradores';

/** Cliente o proveedor elegido (el nombre llega con la respuesta si se abre con un enlace). */
export interface TerceroFiltro {
  tipo: 'cliente' | 'proveedor';
  id: string;
  nombre: string;
  nif: string | null;
  subcuentas: string[];
}

export interface FiltrosApuntes {
  ejercicio: number;
  /** '' todo el año, 'T1'..'T4' un trimestre o 'M01'..'M12' un mes. */
  periodo: string;
  /** AAAA-MM-DD o vacío: acotan el periodo. */
  desde: string;
  hasta: string;
  /** Cuenta o prefijo (solo cifras). */
  cuenta: string;
  tercero: TerceroFiltro | null;
  texto: string;
  estado: EstadoFiltro;
  /** Como los escribe la persona («1.250,50»); se normalizan al pedir. */
  importeMin: string;
  importeMax: string;
  /** Con la regularización y el cierre del ejercicio (por defecto no salen, como en el libro diario). */
  incluirCierre: boolean;
}

/** Tipo del asiento: la regularización y el cierre solo salen si se piden, y se marcan. */
export type TipoAsientoApunte = 'NORMAL' | 'APERTURA' | 'REGULARIZACION' | 'CIERRE';

export type TipoDocumentoApunte =
  | 'FACTURA_VENTA'
  | 'COBRO'
  | 'FACTURA_COMPRA'
  | 'PAGO'
  | 'NOMINA'
  | 'PAGO_NOMINAS'
  | 'SEGUROS_SOCIALES'
  | 'PARTIDA_GESTORIA'
  | 'RETENCIONES'
  | 'AMORTIZACION'
  | 'APERTURA'
  | 'REGULARIZACION'
  | 'CIERRE'
  | 'IMPORTACION'
  | 'GESTORIA'
  | 'MANUAL';

export interface Apunte {
  id: string;
  fecha: string;
  asientoId: string;
  asiento: string;
  estado: 'APROBADO' | 'BORRADOR';
  tipoAsiento: TipoAsientoApunte;
  enlaceAsiento: string;
  cuenta: string;
  nombreCuenta: string;
  concepto: string;
  referencia: string | null;
  debe: number;
  haber: number;
  documento: { tipo: TipoDocumentoApunte; texto: string; enlace: string | null } | null;
  tercero: { tipo: 'cliente' | 'proveedor'; id: string; nombre: string } | null;
}

export interface TotalesApuntes {
  apuntes: number;
  debe: number;
  haber: number;
  /** Debe − Haber. */
  diferencia: number;
  enBorrador: number;
  /**
   * Apuntes de la regularización y el cierre que cumplen el resto del filtro:
   * los que salen si se piden o, si no, los que se han dejado fuera.
   */
  deCierre: number;
}

export interface RespuestaApuntes {
  periodo: { desde: string; hasta: string; nombre: string | null };
  filtro: { tercero: TerceroFiltro | null; incluirCierre: boolean };
  pagina: number;
  porPagina: number;
  paginas: number;
  totales: TotalesApuntes;
  apuntes: Apunte[];
  /** Movimientos anotados a mano antes (tabla Movement): con alguno, se enseña el enlace a «Movimientos antiguos». */
  movimientosAntiguos: number;
}

export const POR_PAGINA = 50;

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Opciones del desplegable «Periodo». */
export const PERIODOS: Array<{ grupo: string; opciones: Array<{ valor: string; texto: string }> }> = [
  { grupo: 'Trimestres', opciones: [1, 2, 3, 4].map((t) => ({ valor: `T${t}`, texto: capital(nombreTrimestre(t)) })) },
  { grupo: 'Meses', opciones: MESES.map((m, i) => ({ valor: `M${String(i + 1).padStart(2, '0')}`, texto: capital(m) })) },
];

export const periodoValido = (p: string | null | undefined): string => (p && /^(T[1-4]|M(0[1-9]|1[0-2]))$/.test(p) ? p : '');

const ultimoDia = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 0)).getUTCDate();
const dos = (n: number) => String(n).padStart(2, '0');

/** Primer y último día del año, del trimestre o del mes elegido (AAAA-MM-DD). */
export function rangoPeriodo(anio: number, periodo: string): { desde: string; hasta: string } {
  if (periodo.startsWith('T')) {
    const t = Number(periodo.slice(1));
    return { desde: `${anio}-${dos((t - 1) * 3 + 1)}-01`, hasta: `${anio}-${dos(t * 3)}-${ultimoDia(anio, t * 3)}` };
  }
  if (periodo.startsWith('M')) {
    const m = Number(periodo.slice(1));
    return { desde: `${anio}-${dos(m)}-01`, hasta: `${anio}-${dos(m)}-${ultimoDia(anio, m)}` };
  }
  return { desde: `${anio}-01-01`, hasta: `${anio}-12-31` };
}

/** «2026», «el 1.er trimestre de 2026», «marzo de 2026». */
export function textoPeriodo(anio: number, periodo: string): string {
  if (periodo.startsWith('T')) return `el ${nombreTrimestre(Number(periodo.slice(1)))} de ${anio}`;
  if (periodo.startsWith('M')) return `${MESES[Number(periodo.slice(1)) - 1] ?? ''} de ${anio}`;
  return String(anio);
}

/**
 * Importe escrito por la persona («1.250,50», «1250,5», «1250.50», «1.250»)
 * como lo espera el servidor («1250.50»). null si no es un importe; '' si está vacío.
 */
export function importeNormalizado(texto: string): string | null {
  let s = texto.replace(/[\s€]/g, '');
  if (!s) return '';
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return /^\d+(\.\d{1,2})?$/.test(s) ? s : null;
}

/** ¿Hay algún filtro aparte del año y el periodo? */
export function hayFiltros(f: FiltrosApuntes): boolean {
  return !!(f.desde || f.hasta || f.cuenta || f.tercero || f.texto.trim() || f.estado !== 'todos' || f.importeMin.trim() || f.importeMax.trim() || f.incluirCierre);
}

/** Parámetros de la API para unos filtros (sin la página ni el formato). Los importes ya deben ser válidos. */
export function parametrosApuntes(f: FiltrosApuntes): URLSearchParams {
  const p = new URLSearchParams({ ejercicio: String(f.ejercicio) });
  if (f.periodo.startsWith('T')) p.set('trimestre', f.periodo.slice(1));
  if (f.periodo.startsWith('M')) p.set('mes', String(Number(f.periodo.slice(1))));
  if (f.desde) p.set('desde', f.desde);
  if (f.hasta) p.set('hasta', f.hasta);
  if (f.cuenta) p.set('cuenta', f.cuenta);
  if (f.tercero) {
    p.set('tercero', f.tercero.id);
    p.set('tipoTercero', f.tercero.tipo);
  }
  if (f.texto.trim()) p.set('texto', f.texto.trim());
  if (f.estado !== 'todos') p.set('estado', f.estado);
  const min = importeNormalizado(f.importeMin);
  const max = importeNormalizado(f.importeMax);
  if (min) p.set('importeMin', min);
  if (max) p.set('importeMax', max);
  if (f.incluirCierre) p.set('incluirCierre', '1');
  return p;
}

/** Lo que va en la URL de la pantalla, para volver al mismo sitio desde un asiento o una factura. */
export function filtrosParaUrl(f: FiltrosApuntes, pagina: number): Record<string, string | null> {
  return {
    ejercicio: String(f.ejercicio),
    periodo: f.periodo || null,
    desde: f.desde || null,
    hasta: f.hasta || null,
    cuenta: f.cuenta || null,
    tercero: f.tercero?.id ?? null,
    tipoTercero: f.tercero?.tipo ?? null,
    texto: f.texto.trim() || null,
    estado: f.estado === 'todos' ? null : f.estado,
    importeMin: f.importeMin.trim() || null,
    importeMax: f.importeMax.trim() || null,
    cierre: f.incluirCierre ? '1' : null,
    pagina: pagina > 1 ? String(pagina) : null,
  };
}

const fechaUrl = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');

/** Filtros que trae la URL (?ejercicio=2026&periodo=T1&cuenta=572...). */
export function filtrosDeUrl(sp: URLSearchParams | null, anio: number): { filtros: FiltrosApuntes; pagina: number } {
  const g = (k: string) => sp?.get(k) ?? null;
  const tipo = g('tipoTercero');
  const tercero = g('tercero');
  const estado = g('estado');
  const pagina = Number(g('pagina'));
  return {
    filtros: {
      ejercicio: anio,
      periodo: periodoValido(g('periodo')),
      desde: fechaUrl(g('desde')),
      hasta: fechaUrl(g('hasta')),
      cuenta: (g('cuenta') ?? '').replace(/\D/g, ''),
      tercero: tercero && (tipo === 'cliente' || tipo === 'proveedor') ? { tipo, id: tercero, nombre: '', nif: null, subcuentas: [] } : null,
      texto: (g('texto') ?? '').slice(0, 100),
      estado: estado === 'aprobados' || estado === 'borradores' ? estado : 'todos',
      importeMin: g('importeMin') ?? '',
      importeMax: g('importeMax') ?? '',
      incluirCierre: g('cierre') === '1',
    },
    pagina: Number.isInteger(pagina) && pagina > 1 ? pagina : 1,
  };
}

const fechaFichero = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

/** Partes del nombre del fichero: «Apuntes contables - cuenta 572 - 1.er trimestre 2026». */
export function partesNombreDescarga(f: FiltrosApuntes, nombreTercero: string): string[] {
  const cuando =
    f.desde || f.hasta
      ? (() => {
          const r = rangoPeriodo(f.ejercicio, f.periodo);
          return `${fechaFichero(f.desde || r.desde)} a ${fechaFichero(f.hasta || r.hasta)}`;
        })()
      : textoPeriodo(f.ejercicio, f.periodo).replace(/^el /, '').replace(' de ', ' ');
  return [
    'Apuntes contables',
    f.tercero ? nombreTercero || f.tercero.nombre : '',
    f.cuenta ? `cuenta ${f.cuenta}` : '',
    f.estado === 'aprobados' ? 'aprobados' : f.estado === 'borradores' ? 'borradores' : '',
    f.incluirCierre ? 'con cierre' : '',
    cuando,
  ].filter(Boolean);
}
