/**
 * Datos del Resumen (app/dashboard/page.tsx). Salen de las FACTURAS y de las
 * NÓMINAS (estén cobradas o no), no de los movimientos anotados a mano:
 * GET /companies/:id/movements/stats/* del backend (panel.service). Las ventas
 * van por su devengo (la fecha de la operación si la tienen; si no, la de la
 * factura) y una sustitución cuenta su diferencia; los gastos, por la fecha de
 * la factura. Importes sin IVA y en la moneda de cuenta.
 *
 * Las compras de inmovilizado (líneas de la cuenta 2xx, todo el grupo 2) no
 * cuentan como gasto: van aparte (`inmovilizado`). Su IVA sí está en el IVA
 * soportado del bloque «IVA y retenciones».
 */
import { nombreTrimestre } from './anios';
import { PATRON_TRIMESTRE } from './quarters';

/** Periodo que devuelve el servidor (?anio y, si se pidió, ?trimestre o ?mes). */
export interface PeriodoPanel {
  anio: number;
  trimestre: number | null;
  mes: number | null;
  mesDesde: number;
  mesHasta: number;
  /** AAAA-MM-DD */
  desde: string;
  /** AAAA-MM-DD (último día real del periodo) */
  hasta: string;
}

/** GET /movements/stats/summary */
export interface ResumenPanel {
  /** Base de las ventas (las rectificativas restan). */
  totalIncome: number;
  /** gastoFacturas + gastoPersonal. */
  totalExpense: number;
  /** Ingresos − gastos del periodo. */
  balance: number;
  /** Facturas de venta más de gasto. */
  totalMovements: number;
  periodo: PeriodoPanel;
  monedaCuenta: string;
  facturasVenta: number;
  /** Facturas de gasto que cuentan (sin las que son solo compras de inmovilizado). */
  facturasGasto: number;
  /** Base de las facturas de gasto (los abonos restan), sin las compras de inmovilizado. */
  gastoFacturas: number;
  /**
   * Compras de inmovilizado (base de las líneas 2xx): no cuentan como gasto. Su IVA sí está en
   * el IVA soportado. Un servidor anterior no lo manda.
   */
  inmovilizado?: number;
  /** Facturas de gasto con alguna línea de inmovilizado. */
  facturasInmovilizado?: number;
  /** Coste de las nóminas para la empresa (0 si no se incluyen). */
  gastoPersonal: number;
  nominas: number;
  /** false: quien mira no tiene permiso para ver las nóminas y los gastos van sin ellas. */
  nominasIncluidas: boolean;
  /** Movimientos anotados a mano antes en la empresa (de cualquier año; ya no se crean): no cuentan. */
  movimientosManuales: number;
}

/** GET /movements/stats/by-month: una fila por mes del periodo, tenga datos o no. */
export interface FilaMesPanel {
  /** AAAA-MM */
  month: string;
  income: number;
  expense: number;
  balance: number;
  facturasVenta: number;
  facturasGasto: number;
  gastoFacturas: number;
  gastoPersonal: number;
  nominas: number;
}

/** GET /movements/stats/by-category, de mayor a menor. */
export interface FilaCategoriaPanel {
  /** Nombre de la cuenta de gasto en el plan de la empresa (o en el PGC), o «Personal». */
  category: string;
  expense: number;
  percentage: number;
  /** Cuenta de 3 cifras (628), o null en «Personal». */
  cuenta: string | null;
  /** Clave estable para React: «cuenta:628» o «personal». */
  clave: string;
}

/** GET /movements/stats/ingresos-por-cliente y /gastos-por-proveedor, de mayor a menor. */
export interface FilaTerceroPanel {
  /** Cliente o proveedor; null en «Personal (nóminas)». */
  id: string | null;
  name: string;
  nif: string | null;
  /** Base del periodo, con las rectificativas o los abonos ya restados. */
  total: number;
  /** Número de facturas (o de nóminas, en «Personal (nóminas)»). */
  facturas: number;
  letter: string;
}

/** GET /movements/stats/ultimas-facturas: ventas y gastos juntos, de la más reciente a la más antigua. */
export interface UltimaFacturaPanel {
  id: string;
  facturaId: string;
  tipo: 'venta' | 'gasto';
  type: 'income' | 'expense';
  /** AAAA-MM-DD */
  date: string;
  numero: string;
  referenceDocument: string;
  tercero: string;
  terceroId: string;
  description: string;
  /** «Ventas», el tipo de gasto o «Inmovilizado» (un gasto que es solo compra de inmovilizado). */
  category: string;
  /** Base en la moneda de cuenta (negativa en rectificativas y abonos). */
  base: number;
  total: number;
  amount: string;
  rectificativa: boolean;
  status: 'approved';
  /**
   * Texto para la persona. Ventas: Cobrada, Cobrada en parte, Vencida o Pendiente de cobro (como en «Cobros de clientes», también
   * las rectificativas en positivo), Rectificativa (un abono), Sustituida o Anulada (sus rectificativas la dejan a cero).
   * Gastos: Pagada, Pagada en parte, Vencida, Pendiente de pago, Abono o Rectificativa.
   */
  estado: string;
  /** /dashboard/facturas/:id o /dashboard/compras/:id */
  enlace: string;
}

interface TotalesFacturas {
  facturas: number;
  base: number;
  iva: number;
  retencion: number;
  total: number;
}

/** GET /movements/stats/fiscal: IVA y retenciones del mismo periodo, desde las facturas. */
export interface ResumenFiscalPanel {
  periodo: { anio: number; trimestre: number | null; mes: number | null; desde: string; hasta: string };
  monedaCuenta: string;
  /** false: empresa no establecida en España (sin IVA ni modelos de la AEAT). */
  empresaEspanola: boolean;
  ventas: TotalesFacturas;
  /** Todos los gastos (base e IVA con el inmovilizado) y, aparte, la base del inmovilizado (un servidor anterior no la manda). */
  gastos: TotalesFacturas & { baseInmovilizado?: number };
  /** Repercutido − soportado (orientativo). */
  ivaResultado: number;
  /** Las que la empresa practica en sus gastos (111/115). */
  retencionesAIngresar: number;
}

// ---------------------------------------------------------------------------
// Periodo elegido en la pantalla: '' (todo el año), 'AAAA-Qn' o 'AAAA-MM'.
// ---------------------------------------------------------------------------

const PATRON_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** «2026-10» -> «Oct». */
export function mesCorto(month: string): string {
  return MESES_CORTOS[Number(month.slice(5, 7)) - 1] ?? month;
}

/** «2026-10» -> «octubre de 2026». */
export function nombreMes(month: string): string {
  const m = MESES[Number(month.slice(5, 7)) - 1];
  return m ? `${m} de ${month.slice(0, 4)}` : month;
}

/** Consulta del servidor para el año y el periodo elegidos: «anio=2026&trimestre=4». */
export function consultaPeriodo(anio: number, periodo: string): string {
  const q = new URLSearchParams({ anio: String(anio) });
  if (PATRON_TRIMESTRE.test(periodo)) q.set('trimestre', periodo.slice(-1));
  else if (PATRON_MES.test(periodo)) q.set('mes', String(Number(periodo.slice(5, 7))));
  return q.toString();
}

/** Nombre del periodo para los títulos: «2026», «4.º trimestre de 2026», «octubre de 2026». */
export function nombrePeriodo(anio: number, periodo: string): string {
  if (PATRON_TRIMESTRE.test(periodo)) return `${nombreTrimestre(Number(periodo.slice(-1)))} de ${anio}`;
  if (PATRON_MES.test(periodo)) return nombreMes(periodo);
  return String(anio);
}

/** Para una frase: «en 2026», «en el 4.º trimestre de 2026», «en octubre de 2026». */
export function enPeriodo(anio: number, periodo: string): string {
  return `${PATRON_TRIMESTRE.test(periodo) ? 'en el' : 'en'} ${nombrePeriodo(anio, periodo)}`;
}

/** Filas del año que caen en el periodo elegido (todas si es el año entero). */
export function mesesDelPeriodo<T extends { month: string }>(filas: T[], periodo: string): T[] {
  if (PATRON_TRIMESTRE.test(periodo)) {
    const t = Number(periodo.slice(-1));
    return filas.filter((f) => Math.floor((Number(f.month.slice(5, 7)) - 1) / 3) + 1 === t);
  }
  if (PATRON_MES.test(periodo)) return filas.filter((f) => f.month === periodo);
  return filas;
}

/** Tipo de periodo para el desplegable «Período». */
export function tipoDePeriodo(periodo: string): 'year' | 'quarters' | 'months' {
  if (PATRON_TRIMESTRE.test(periodo)) return 'quarters';
  if (PATRON_MES.test(periodo)) return 'months';
  return 'year';
}

/** 'AAAA-MM-DD' -> 'DD/MM/AAAA' (sin pasar por Date: no se desplaza por la zona horaria). */
export function fechaCorta(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso;
}

/** Cifra corta para los ejes de los gráficos: 12.500 -> «12,5 mil». */
const COMPACTO = new Intl.NumberFormat('es-ES', { notation: 'compact', maximumFractionDigits: 1 });
export const cifraCompacta = (n: number) => COMPACTO.format(n);

/** «euros» o «dólares», para las frases. */
export function nombreMonedaPlural(moneda: string): string {
  const m = (moneda || 'EUR').toUpperCase();
  if (m === 'EUR') return 'euros';
  if (m === 'USD') return 'dólares';
  return m;
}
