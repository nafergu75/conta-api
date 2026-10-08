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
  SERVICIO_PROFESIONAL: { texto: 'Profesionales independientes', cuenta: '623', retenciones: [0, 1, 2, 7, 15, 19] },
  ALQUILER: { texto: 'Alquileres', cuenta: '621', retenciones: [0, 19] },
  SUMINISTROS: { texto: 'Suministros y otros servicios', cuenta: '628', retenciones: [0] },
};

export const esTipoGasto = (v: unknown): v is TipoGasto => typeof v === 'string' && (TIPOS_GASTO as readonly string[]).includes(v);

/** Lo que pide hacer un 409 del servidor con una factura de gasto (segun sus details). */
export interface ConflictoGasto {
  /** Su trimestre ya esta presentado: hay que poner la fecha en que se recibio («¿La recibiste más tarde?»). */
  fechaRegistro: boolean;
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
  return {
    fechaRegistro: d.campo === 'fechaRegistro',
    facturaId: typeof d.facturaId === 'string' ? d.facturaId : null,
    contabilizar: d.accion === 'contabilizar',
    cambiada: d.motivo === 'factura_cambiada' || /^La factura ha cambiado mientras/.test(err.message),
  };
}

/** Modificar la factura con «¿La recibiste más tarde?» abierto y el cursor en la fecha. */
export const enlaceRecibidaTarde = (facturaId: string) => `/dashboard/compras/${encodeURIComponent(facturaId)}/editar?campo=fechaRegistro`;

/** Tipos de IVA de una factura de gasto, de mayor a menor. */
export const TIPOS_IVA_GASTO = [21, 10, 5, 4, 0] as const;

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
  };
  totales: { base: number; iva: number; retencion: number; total: number; pendiente: number };
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
  proveedorExistente: { id: string; nombreFiscal: string; nifCif: string } | null;
  duplicada: { facturaId: string; numeroCompleto: string } | null;
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

/** Hoy en la hora del navegador, como AAAA-MM-DD. */
export function hoyIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

const r2 = (v: number) => Math.round(v * 100) / 100;
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
