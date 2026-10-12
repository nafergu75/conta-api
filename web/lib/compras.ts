/**
 * Facturas de gasto (Compras): tipos de la API, textos y calculos que
 * comparten el listado, la ficha, el alta, la edicion y el lector de gastos.
 *
 * Las reglas son las del servidor (backend: domain/factura-gasto.model.ts y
 * schemas/factura-gasto.schemas.ts). Aqui solo se repiten para que lo que ve el
 * usuario mientras escribe sea lo que se guarda; el servidor decide.
 */

import { ApiError } from './api';

export const TIPOS_GASTO = ['COMPRA', 'SERVICIO_PROFESIONAL', 'ALQUILER', 'SUMINISTROS'] as const;
export type TipoGasto = (typeof TIPOS_GASTO)[number];

/** Etiqueta, cuenta de gasto por defecto y retenciones de IRPF que admite cada tipo. */
export const TIPO_GASTO_INFO: Record<TipoGasto, { texto: string; cuenta: string; retenciones: number[] }> = {
  COMPRA: { texto: 'Compras de mercaderías', cuenta: '600', retenciones: [0] },
  // Profesionales: 0, 7, 15 y 19 (el servidor rechaza el 1 y el 2, que son de otras actividades).
  SERVICIO_PROFESIONAL: { texto: 'Profesionales independientes', cuenta: '623', retenciones: [0, 7, 15, 19] },
  ALQUILER: { texto: 'Alquileres', cuenta: '621', retenciones: [0, 19] },
  SUMINISTROS: { texto: 'Suministros y otros servicios', cuenta: '628', retenciones: [0] },
};

/** Tipo de gasto de una cuenta, como el servidor (tipoGastoDeCuenta): 621 alquiler, 623 profesionales, 600 compras; el resto, suministros. */
export function tipoGastoDeCuenta(cuenta: string | null | undefined): TipoGasto {
  const c = String(cuenta ?? '');
  if (c.startsWith('621')) return 'ALQUILER';
  if (c.startsWith('623')) return 'SERVICIO_PROFESIONAL';
  if (c.startsWith('600')) return 'COMPRA';
  return 'SUMINISTROS';
}

/**
 * Tipo de gasto que admite una retencion de IRPF: el 19 %, alquileres (modelo
 * 115); el 7 y el 15 %, profesionales (modelo 111). null si ninguno la admite
 * (el 1 o el 2 %, de otras actividades).
 */
export function tipoGastoParaRetencion(tipoRetencion: number): TipoGasto | null {
  if (!(tipoRetencion > 0)) return null;
  if (tipoRetencion === 19) return 'ALQUILER';
  return TIPO_GASTO_INFO.SERVICIO_PROFESIONAL.retenciones.includes(tipoRetencion) ? 'SERVICIO_PROFESIONAL' : null;
}

export const esTipoGasto = (v: unknown): v is TipoGasto => typeof v === 'string' && (TIPOS_GASTO as readonly string[]).includes(v);

/**
 * 409 `rectificar_303`: un abono que reduce el IVA deducido cae en un 303 ya
 * presentado. Se puede registrar igualmente si la persona lo confirma
 * (confirmaRectificar303) y despues presenta una autoliquidacion rectificativa.
 */
export interface Rectificar303 {
  /** 'fechaRegistro' (periodo de recepcion) o 'rectificativa' (periodo de la original, en un error de IVA). */
  campo: string | null;
  ejercicio: number | null;
  /** '1T'..'4T' o '01'..'12'. */
  periodo: string | null;
  /** Pantalla del 303 ('/dashboard/fiscal/modelo-303'); null si ese 303 se presentó fuera de la app (no hay pantalla que ver). */
  enlace: string | null;
}

/** Lo que pide hacer un 409 del servidor con una factura de gasto (segun sus details). */
export interface ConflictoGasto {
  /** Su trimestre ya esta presentado: hay que poner la fecha en que se recibio («¿La recibiste más tarde?»). */
  fechaRegistro: boolean;
  /** Abono que reduce el IVA de un 303 presentado: se ofrece «Registrar y avisarme de rectificar el 303». */
  rectificar303: Rectificar303 | null;
  /** La factura afectada (llega al aprobar su asiento en el Motor contable). */
  facturaId: string | null;
  /** Factura anterior de un trimestre declarado: primero hay que contabilizarla. */
  contabilizar: boolean;
  /** Otra persona u otra pestaña la ha cambiado mientras tanto: hay que volver a abrirla. */
  cambiada: boolean;
}

/** null si no es un 409. */
export function conflictoGasto(err: unknown): ConflictoGasto | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const d = (err.detalles && typeof err.detalles === 'object' ? err.detalles : {}) as Record<string, unknown>;
  const rectificar303: Rectificar303 | null =
    d.motivo === 'rectificar_303'
      ? {
          campo: typeof d.campo === 'string' ? d.campo : null,
          ejercicio: typeof d.ejercicio === 'number' ? d.ejercicio : Number(d.ejercicio) || null,
          periodo: typeof d.periodo === 'string' ? d.periodo : null,
          enlace:
            d.fueraDeLaApp === true || d.enlace === null
              ? null
              : typeof d.enlace === 'string' && d.enlace.startsWith('/dashboard/')
                ? d.enlace
                : '/dashboard/fiscal/modelo-303',
        }
      : null;
  return {
    // Con rectificar_303 no hace falta cambiar la fecha: se confirma (aunque details.campo sea fechaRegistro).
    fechaRegistro: d.campo === 'fechaRegistro' && !rectificar303,
    rectificar303,
    facturaId: typeof d.facturaId === 'string' ? d.facturaId : null,
    contabilizar: d.accion === 'contabilizar',
    cambiada: d.motivo === 'factura_cambiada' || /^La factura ha cambiado mientras/.test(err.message),
  };
}

/** Modificar la factura con «¿La recibiste más tarde?» abierto y el cursor en la fecha. */
export const enlaceRecibidaTarde = (facturaId: string) => `/dashboard/compras/${encodeURIComponent(facturaId)}/editar?campo=fechaRegistro`;

/** Tipos de IVA de una factura de gasto, de mayor a menor. */
export const TIPOS_IVA_GASTO = [21, 10, 5, 4, 0] as const;

/** Texto del tipo de IVA en los desplegables: el 0 % es «Exento» (o «Sin IVA» si no lleva IVA español). */
export const textoTipoIva = (t: number, extranjero: boolean) => (t !== 0 ? `${t} %` : extranjero ? 'Sin IVA' : 'Exento');

/** Cuentas de gasto habituales (grupo 62 y la 600). */
export const CUENTAS_GASTO_HABITUALES: Array<[string, string]> = [
  ['600', 'Compras de mercaderías'],
  ['621', 'Arrendamientos y cánones'],
  ['622', 'Reparaciones y conservación'],
  ['623', 'Servicios de profesionales independientes'],
  ['624', 'Transportes'],
  ['625', 'Primas de seguros'],
  ['626', 'Servicios bancarios y similares'],
  ['627', 'Publicidad, propaganda y relaciones públicas'],
  ['628', 'Suministros'],
  ['629', 'Otros servicios'],
];

// ---------------------------------------------------------------------------
// Abonos y facturas rectificativas de proveedor
// (backend: domain/rectificativa-gasto.model.ts; los textos son los mismos)
// ---------------------------------------------------------------------------

export const CAUSAS_RECTIFICACION = ['DEVOLUCION', 'DESCUENTO', 'RAPPEL', 'PRONTO_PAGO', 'ANULACION_PRECIO', 'ERROR_IVA', 'ERROR_DERECHO'] as const;
export type CausaRectificacion = (typeof CAUSAS_RECTIFICACION)[number];
export const esCausaRectificacion = (v: unknown): v is CausaRectificacion => typeof v === 'string' && (CAUSAS_RECTIFICACION as readonly string[]).includes(v);

/** I = por diferencias (los importes son lo que cambia); S = por sustitucion (trae la factura corregida entera). */
export type TipoRectificativa = 'I' | 'S';

export const CAUSA_INFO: Record<
  CausaRectificacion,
  {
    texto: string;
    /** Cuenta que se propone si la linea original es de compras (subgrupo 60). */
    cuentaCompra: '606' | '608' | '609' | null;
    /** Admite un periodo en vez de facturas (rappel o descuento por volumen). */
    admitePeriodo: boolean;
    /** Solo puede bajar el importe (un descuento o una devolucion resta). */
    soloBaja: boolean;
  }
> = {
  DEVOLUCION: { texto: 'Devolución de mercancías o envases', cuentaCompra: '608', admitePeriodo: false, soloBaja: true },
  DESCUENTO: { texto: 'Descuento o bonificación después de la factura', cuentaCompra: '608', admitePeriodo: true, soloBaja: true },
  RAPPEL: { texto: 'Rappel por volumen de compras', cuentaCompra: '609', admitePeriodo: true, soloBaja: true },
  PRONTO_PAGO: { texto: 'Descuento por pronto pago', cuentaCompra: '606', admitePeriodo: false, soloBaja: true },
  ANULACION_PRECIO: { texto: 'Operación anulada en todo o en parte, o precio rebajado', cuentaCompra: '608', admitePeriodo: false, soloBaja: true },
  ERROR_IVA: { texto: 'El proveedor se equivocó en el IVA (tipo o cuota)', cuentaCompra: null, admitePeriodo: false, soloBaja: false },
  ERROR_DERECHO: { texto: 'Error fundado de derecho', cuentaCompra: null, admitePeriodo: false, soloBaja: false },
};

/**
 * Cuenta que se propone para una linea del abono (la misma regla que el
 * servidor): 606, 608 y 609 solo corrigen compras del subgrupo 60; en otra
 * cuenta (servicios 62x...) se queda la de la original. Un descuento con
 * periodo (por volumen) va a la 609, como un rappel.
 */
export function cuentaPropuesta(causa: CausaRectificacion, cuentaOriginal: string | null, conPeriodo: boolean): string | null {
  if (!cuentaOriginal || !cuentaOriginal.startsWith('60')) return cuentaOriginal;
  if (causa === 'DESCUENTO' && conPeriodo) return '609';
  return CAUSA_INFO[causa].cuentaCompra ?? cuentaOriginal;
}

/** Estado de pago de un abono: lo que queda a tu favor se devuelve o se aplica a otra factura. */
export function textoEstadoAbono(estadoPago: string, estado?: string): string {
  // Borrador del lector: al aprobar su asiento se descuenta solo de la factura que rectifica.
  if (estado === 'DRAFT') return 'Se aplicará al aprobarlo';
  if (estadoPago === 'PAGADA') return 'Devuelto o aplicado';
  if (estadoPago === 'PARCIAL') return 'Devuelto o aplicado en parte';
  return 'Pendiente de devolver';
}

/** Clases de la insignia «Abono» del listado y la ficha. */
export const claseInsigniaAbono = 'inline-block rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700';

/** Periodo de un modelo en palabras: '1T' -> '1T de 2027'; '04' -> 'abril de 2027'. */
export function textoPeriodoModelo(ejercicio: number | null, periodo: string | null): string {
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const p = String(periodo ?? '');
  const que = /^\d{2}$/.test(p) ? meses[Number(p) - 1] ?? p : p;
  return ejercicio ? `${que} de ${ejercicio}` : que;
}

/** Una factura que rectifica (en la ficha de la rectificativa). id null: de fuera de la app. */
export interface OriginalDeRectificativa {
  id: string | null;
  numeroCompleto: string | null;
  numero: string | null;
  fecha: string | null;
  /** Parte de la rectificacion que le toca (con signo); null si es toda. */
  base: number | null;
  cuota: number | null;
}

/** Bloque `rectificativa` de GET /expense-invoices/:id (solo en las rectificativas). */
export interface RectificativaDeFicha {
  tipo: TipoRectificativa | null;
  causa: CausaRectificacion;
  causaTexto: string;
  motivo: string | null;
  originales: OriginalDeRectificativa[];
  periodo: { desde: string; hasta: string } | null;
  /** Donde cuenta su IVA: '40-41' (rectificacion de deducciones) o '28-29' (periodo de la original). */
  imputacionIva: { fecha: string; casillas: '40-41' | '28-29' };
  /**
   * Con la original de fuera de la app: true si se descuenta de lo que se le debe
   * («No, se descuenta…»), false si ya estaba pagada; null si no se preguntó.
   * Se aplica al contabilizarlo (en un borrador del lector, al aprobarlo).
   */
  compensarFuera?: boolean | null;
}

/** Una rectificativa vigente de la factura (en la ficha de la original). */
export interface RectificativaResumen {
  id: string;
  numeroCompleto: string;
  numero: string | null;
  fecha: string;
  total: number;
  tipo: TipoRectificativa | null;
}

/** Aplicacion de un abono a una factura (CompensacionGasto). */
export interface CompensacionGasto {
  id: string;
  abonoId: string;
  facturaId: string | null;
  /** La otra parte: la factura que recibe el abono (en el abono) o el abono que se aplica (en la factura). */
  otra: { id: string | null; numeroCompleto: string | null; numero: string | null; fecha: string | null; fuera: boolean };
  fecha: string;
  /** En positivo. */
  importe: number;
  /** AUTO (al contabilizar el abono, contra su original) o MANUAL. */
  origen: string;
  /** ACTIVO o ANULADO. */
  estado: string;
  asientoId: string | null;
  anuladaEn: string | null;
}

/** Candidata a factura original (GET /expense-invoices/originales). */
export interface CandidataOriginal {
  id: string;
  numeroCompleto: string;
  numero: string | null;
  fecha: string;
  total: number;
  exacta: boolean;
}

export interface OriginalesBuscadas {
  coincidencia: 'EXACTA' | 'PARECIDA' | 'NINGUNA';
  candidatas: CandidataOriginal[];
}

/** GET /expense-invoices/:id/rectificar: datos para prellenar un abono de esa factura. */
export interface DatosParaRectificar {
  original: {
    id: string;
    numeroCompleto: string;
    numero: string | null;
    fechaEmision: string;
    fechaRegistro: string | null;
    baseTotal: number;
    ivaTotal: number;
    retencionTotal: number;
    totalFactura: number;
    esRectificativa: boolean;
  };
  proveedor: { id: string; nombreFiscal: string; nifCif: string; pais: string };
  tipoGasto: TipoGasto;
  tipoGastoTexto: string;
  lineas: Array<{
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    descuentoPorcentaje: number;
    tipoIva: number;
    tipoRetencion: number;
    baseLine: number;
    ivaImporte: number;
    cuenta: string;
    cuentaPropuesta: Record<CausaRectificacion, string | null>;
    cuentaPropuestaConPeriodo: string | null;
  }>;
  rectificativas: RectificativaResumen[];
  /** Suma con signo de sus rectificativas vigentes. */
  yaRectificado: number;
  pendiente: number;
  /** Lo que se puede abonar como mucho (en positivo). */
  abonoMaximo: number;
  causas: Array<{ causa: CausaRectificacion; texto: string; admitePeriodo: boolean; soloBaja: boolean }>;
}

// ---------------------------------------------------------------------------
// Respuestas de la API
// ---------------------------------------------------------------------------

export interface LineaGastoApi {
  id: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  baseLine: number;
  descuentoPorcentaje: number;
  descuentoImporte: number;
  tipoIva: number;
  ivaImporte: number;
  tipoRetencion: number;
  retencionImporte: number;
  accountCode: string | null;
}

/** GET /expense-invoices/:id (y respuesta del alta, la edicion y la anulacion). */
export interface GastoDetalle {
  id: string;
  serie: string;
  numero: number;
  numeroCompleto: string;
  numeroFacturaProveedor: string | null;
  fechaEmision: string;
  fechaRegistro: string | null;
  fechaVencimiento: string;
  estado: string;
  estadoTexto: string;
  estadoPago: string;
  estadoPagoTexto: string;
  vencida: boolean;
  tipoGasto: string;
  tipoGastoTexto: string;
  cuentaGasto: string | null;
  tipoIva: number;
  tipoRetencion: number;
  baseTotal: number;
  ivaTotal: number;
  retencionTotal: number;
  totalFactura: number;
  importePagado: number;
  importePendiente: number;
  observaciones?: string;
  monedaCuenta: string;
  supplier: { id: string; nombreFiscal: string; nifCif: string; pais: string };
  lineas: LineaGastoApi[];
  asiento: { id: string; numeroAsiento: string; estado: string; fecha: string } | null;
  anulacion: { fecha: string; motivo: string; contraasientoId: string | null } | null;
  acciones: {
    editar: { permitido: boolean; motivo?: string };
    anular: { permitido: boolean; motivo?: string; conContraasiento: boolean };
    contabilizar: boolean;
  };
  /** Abono o rectificativa de proveedor (importes con signo). */
  esRectificativa: boolean;
  /** En una rectificativa: que rectifica, tipo, causa y donde va su IVA. */
  rectificativa: RectificativaDeFicha | null;
  /** En una original: sus rectificativas vigentes. */
  rectificativas: RectificativaResumen[];
  /** La original, si es una sola de la app. */
  facturaOriginalId: string | null;
  /** Avisos del alta o la correccion que no la impiden. */
  avisos?: string[];
  /** Aplicaciones del abono a otras facturas, o de abonos a esta factura. */
  compensaciones: CompensacionGasto[];
  /** Pendiente con signo (total - pagos - compensaciones): en un abono, lo que queda a tu favor en negativo. */
  pendiente: number;
  /** Solo en los abonos: lo que queda a favor de la empresa (en positivo). */
  aFavor?: number;
  /**
   * Abono registrado despues de presentar el 303 de su IVA: recordatorio de
   * preparar la autoliquidacion rectificativa (enlace null si ese 303 se llevo fuera de la app).
   */
  rectificar303?: { ejercicio: number; periodo: string; confirmadoEn: string; aviso: string; enlace: string | null } | null;
}

export interface GastoListado {
  id: string;
  numeroCompleto: string;
  numeroFacturaProveedor: string | null;
  fechaEmision: string;
  fechaRegistro: string | null;
  fechaVencimiento: string;
  supplier: { id: string; nombreFiscal: string; nifCif: string };
  supplierNombre: string;
  tipoGasto: string;
  tipoGastoTexto: string;
  estado: string;
  estadoTexto: string;
  estadoPago: string;
  estadoPagoTexto: string;
  vencida: boolean;
  baseTotal: number;
  ivaTotal: number;
  retencionTotal: number;
  totalFactura: number;
  importePendiente: number;
  esRectificativa: boolean;
  /** Abono (total < 0). */
  esAbono: boolean;
}

/** GET /expense-invoices */
export interface ListadoGastos {
  items: GastoListado[];
  total: number;
  page: number;
  limit: number;
  paginas: number;
  contadores: {
    todas: number;
    sinContabilizar: number;
    pendientesRevision: number;
    contabilizadas: number;
    anuladas: number;
    pendientesPago: number;
    vencidas: number;
    /** Cuantos abonos tienen algo a favor de la empresa. */
    abonosAFavor: number;
  };
  /** pendiente: de las facturas (sin los abonos); aFavor: lo que queda a favor en los abonos (en positivo). */
  totales: { base: number; iva: number; retencion: number; total: number; pendiente: number; aFavor: number };
  monedaCuenta: string;
}

/** POST /gastos-extractor/extraer-ia */
export interface GastoExtraido {
  numeroFactura: string | null;
  proveedor: string | null;
  nifProveedor: string | null;
  fecha: string | null;
  conceptoGasto: string | null;
  base: number;
  iva: number;
  total: number;
  tipoIva: number | null;
  tipoRetencion: number | null;
  retencion: number;
  moneda: string | null;
  cuentaContableBase: string | null;
  cuentaContableNombre: string | null;
  tipoGastoSugerido: TipoGasto;
  confianza: number;
  errores: string[];
  tipoDocumento: 'factura' | 'nomina' | 'seguros_sociales';
  /** Dirección del proveedor leída en la factura (para la ficha de un proveedor nuevo); `revisar` si se leyó con poca seguridad. */
  direccionProveedor?: { calle: string | null; cp: string | null; municipio: string | null; provincia: string | null; revisar: boolean } | null;
  proveedorExistente: { id: string; nombreFiscal: string; nifCif: string } | null;
  duplicada: { facturaId: string; numeroCompleto: string } | null;
  /** Cuenta que mas usa el proveedor en sus ultimas facturas (si sigue activa). */
  cuentaHabitual?: { codigo: string; nombre: string } | null;
}

/** POST /gastos-extractor/confirmar */
export interface GastoRegistrado {
  factura: GastoDetalle;
  asientoId?: string | null;
  asientoEstado?: string;
  proveedorCreado?: boolean;
}

// ---------------------------------------------------------------------------
// Textos y estilos
// ---------------------------------------------------------------------------

const INSIGNIA = 'inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium';

/** Clases de la insignia del estado de la factura (no el de pago). */
export function claseEstadoGasto(estado: string): string {
  if (estado === 'ACCOUNTED') return `${INSIGNIA} border-emerald-200 bg-emerald-50 text-emerald-700`;
  if (estado === 'DRAFT') return `${INSIGNIA} border-amber-200 bg-amber-50 text-amber-800`;
  if (estado === 'ANULADA') return `${INSIGNIA} border-slate-300 bg-slate-100 text-slate-600`;
  return `${INSIGNIA} border-blue-200 bg-blue-50 text-blue-700`; // sin contabilizar (facturas anteriores)
}

/** Clases de la insignia del estado de pago. */
export function claseEstadoPago(estadoPago: string, vencida: boolean): string {
  if (estadoPago === 'PAGADA') return `${INSIGNIA} border-emerald-200 bg-emerald-50 text-emerald-700`;
  if (vencida) return `${INSIGNIA} border-rose-200 bg-rose-50 text-rose-700`;
  if (estadoPago === 'PARCIAL') return `${INSIGNIA} border-blue-200 bg-blue-50 text-blue-700`;
  return `${INSIGNIA} border-amber-200 bg-amber-50 text-amber-800`;
}

/** Estado de un asiento en castellano. */
export function textoEstadoAsiento(estado: string): string {
  if (estado === 'POSTED') return 'en firme';
  if (estado === 'DRAFT') return 'en borrador';
  if (estado === 'PENDING_REVIEW') return 'pendiente de revisar';
  if (estado === 'REVERSED') return 'anulado';
  return estado;
}

// ---------------------------------------------------------------------------
// Fechas (AAAA-MM-DD como texto: sin new Date(), para no pintar el dia anterior)
// ---------------------------------------------------------------------------

/** '2026-04-03' -> '03/04/2026'. Vacio si no es una fecha. */
export function fechaCorta(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** Hoy en España, como AAAA-MM-DD (la regla común de lib/anios). */
export { hoyIso } from './anios';

/** Suma dias a una fecha AAAA-MM-DD (en UTC, sin cambios de hora). '' si no es una fecha. */
export function sumarDias(iso: string, dias: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Calculo de la factura (el mismo redondeo que el servidor: por linea y despues la suma)
// ---------------------------------------------------------------------------

/**
 * Redondeo a centimos sobre el valor absoluto y con el signo despues, como el
 * servidor en los abonos (-10,125 da -10,13, igual que 10,125 da 10,13). En
 * positivo es el Math.round de siempre: las facturas normales no cambian.
 */
const r2 = (v: number) => (v < 0 ? -Math.round(-v * 100) / 100 : Math.round(v * 100) / 100) || 0;
const centimos = (v: number) => Math.round(v * 100);

export interface LineaParaCalculo {
  cantidad: number;
  precioUnitario: number;
  descuentoPorcentaje?: number;
  tipoIva: number;
  tipoRetencion?: number;
}

/** Base, IVA, retencion y total de una linea. */
export function calcularLinea(l: LineaParaCalculo): { base: number; iva: number; retencion: number } {
  const cantidad = Number.isFinite(l.cantidad) ? l.cantidad : 0;
  const precio = Number.isFinite(l.precioUnitario) ? l.precioUnitario : 0;
  const pvp = r2(cantidad * precio);
  const base = r2(pvp - r2((pvp * (l.descuentoPorcentaje ?? 0)) / 100));
  return { base, iva: r2((base * l.tipoIva) / 100), retencion: r2((base * (l.tipoRetencion ?? 0)) / 100) };
}

/** Totales de la factura y el IVA por tipo. */
export function calcularTotales(lineas: LineaParaCalculo[]): {
  base: number;
  iva: number;
  retencion: number;
  total: number;
  ivaPorTipo: Array<{ tipo: number; base: number; cuota: number }>;
} {
  let base = 0;
  let iva = 0;
  let ret = 0;
  const porTipo = new Map<number, { base: number; cuota: number }>();
  for (const l of lineas) {
    const c = calcularLinea(l);
    base += centimos(c.base);
    iva += centimos(c.iva);
    ret += centimos(c.retencion);
    const t = porTipo.get(l.tipoIva) ?? { base: 0, cuota: 0 };
    t.base += centimos(c.base);
    t.cuota += centimos(c.iva);
    porTipo.set(l.tipoIva, t);
  }
  return {
    base: base / 100,
    iva: iva / 100,
    retencion: ret / 100,
    total: (base + iva - ret) / 100,
    ivaPorTipo: Array.from(porTipo)
      .sort((a, b) => b[0] - a[0])
      .map(([tipo, t]) => ({ tipo, base: t.base / 100, cuota: t.cuota / 100 })),
  };
}

/** El tipo de IVA valido mas cercano a un porcentaje (el lector a veces solo da la cuota). */
export function tipoIvaMasCercano(porcentaje: number): number {
  if (!Number.isFinite(porcentaje)) return 21;
  return Array.from(TIPOS_IVA_GASTO).reduce((mejor, t) => (Math.abs(t - porcentaje) < Math.abs(mejor - porcentaje) ? t : mejor), 21);
}

/** NIF-IVA de la UE: el pais del prefijo (EL -> GR). null si no lo parece. */
export function paisDelPrefijo(nif: string): string | null {
  const n = String(nif ?? '').toUpperCase().replace(/[\s.\-]/g, '');
  const m = /^([A-Z]{2})[0-9A-Z+*]{2,12}$/.exec(n);
  if (!m || !/\d/.test(n.slice(2))) return null;
  return m[1] === 'EL' ? 'GR' : m[1];
}
