'use client';

import { Fragment, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowCounterClockwise, ArrowLeft, Plus, Trash, WarningCircle } from '@phosphor-icons/react';
import { Tooltip } from '@/app/dashboard/components/Tooltip';
import { apiFetch, campoDelError, companyPath, errorMessage } from '@/lib/api';
import {
  DESVIACION_AVISO,
  desviacion,
  formatoImporte,
  formatoTipo,
  NOMBRE_MONEDA,
  pareceInvertido,
  parseImporte,
  parseTipo,
  redondear2,
  simboloMoneda,
  textoTipo,
  tipoParaEditar,
} from '@/lib/moneda';
import { calcularFactura } from '@/lib/divisas';
import { conDevengoFuera, useContextoFiscal, type AvisoFiscal } from '@/lib/fiscal';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { useCuentasLinea } from '@/lib/subcuentas';
import { CuentaLinea } from '@/components/contabilidad/CuentaLinea';
import { hoyEspana, LIMITE_SIMPLIFICADA, useRedSeguridad } from '@/lib/verifactu';
import AvisoRedSeguridad from '@/components/verifactu/AvisoRedSeguridad';
import { useAvisoPlanAnterior } from '@/components/contabilidad/AvisoPlanAnterior';
import BloqueRectificativaVenta from '@/components/ventas/BloqueRectificativaVenta';
import { AvisoServidorAnterior, BloqueRectificaFueraAnterior } from '@/components/ventas/RectificativaServidorAnterior';
import LineasEnvases, { kgPropuestos, seguirPropuestas, udsPropuestas } from '@/components/ventas/LineasEnvases';
import ResumenEnvases, { type SinIeepnr } from '@/components/ventas/ResumenEnvases';
import LineasCeramica, { cantidadCeramica, propuestasCeramica, seguirPropuestasCeramica } from '@/components/ventas/LineasCeramica';
import ResumenCeramica from '@/components/ventas/ResumenCeramica';
import { CALIDAD_MAX, esUnidadPrecio, FORMATO_MAX, OBRA_MAX, resumenCeramica, TEXTO_CARGO_PALETS, type UnidadPrecio } from '@/lib/ceramica';
import {
  admiteCeramica,
  admiteDescuento,
  admiteEnvases,
  admiteTextoAdicional,
  calcularIeepnr,
  decimalesDe,
  formatoCantidad,
  ivaPorTipo,
  leerCantidad,
  NOMBRE_PLANTILLA,
  normalizarPlantilla,
  paraEditar,
  problemaTextoAdicional,
  resumenEnvases,
} from '@/lib/plantillasFactura';
import {
  anuladaEntera,
  bloqueParaEnviar,
  diferenciaSustitucion,
  estadoDesdeResp,
  estadoVacio,
  type EstadoRectificativaVenta,
  faltaEnBloque,
  faltaEnReparto,
  guardarAvisosVenta,
  infoMotivo,
  type LineaPropuesta,
  lineasCalculoDe,
  lineasPropuestas,
  originalDeApp,
  originalDeFuera,
  repartoConSigno,
  repartoDeLineas,
  type RectificativaVentaResp,
  tipoFacturaDe,
  useDatosOriginales,
  useOpcionesRectificativa,
} from '@/lib/rectificativasVenta';

/**
 * Alta de factura de venta, o edicion de un borrador (?id=...).
 *
 * "Guardar borrador" la deja sin numero y editable. "Pasar a factura" le da el
 * siguiente numero de la serie y ya no se puede cambiar: los errores se
 * corrigen con una rectificativa (como exige Verifactu).
 *
 * Con ?tipo=proforma (o al editar una proforma pendiente) es el formulario de
 * la factura proforma: mismo documento, numerado en la serie P al guardarlo y
 * sin efectos fiscales. Solo tiene "Guardar proforma".
 *
 * Moneda: EUR o USD. En otra moneda que la de la contabilidad se propone el
 * tipo de referencia del BCE (editable); el definitivo se fija al emitir.
 *
 * Tipo de operacion de IVA (solo empresas espanolas): uno por factura. Los
 * tipos sin cuota (exenta, intracomunitaria, exportacion...) ponen el IVA a 0.
 * Una empresa no establecida en Espana factura sin IVA ni IRPF, en su moneda.
 *
 * Rectificativa o abono (tipo «Rectificativa o abono», R1-R4 segun el motivo,
 * o «Rectificativa de un ticket», R5): el bloque «¿Qué rectificas?» elige la
 * factura o facturas (o un periodo, o una de fuera de la app), el motivo, la
 * forma y la explicacion. Con una original de la app, el cliente, la moneda, el
 * tipo de cambio y el tipo de operacion son los suyos (el servidor los hereda)
 * y las lineas se proponen desde las suyas: en negativo por diferencias, o
 * enteras por sustitucion. Va en una serie de rectificativas (la R; la de
 * tickets en una R5), nunca en la A ni en la B. Entradas:
 *  - ?rectifica=<id> (desde la ficha, «Hacer rectificativa»), con &ticket=1 si es un ticket;
 *  - ?rectificaFuera=1&numero=…&fecha=…&cliente=…[&partida=…] (Facturas de 2026 pendientes).
 * Con el servidor anterior a las rectificativas nuevas (solo durante la
 * publicación), el abono de una factura de fuera va con los campos de antes y
 * lo demás se hace desde la ficha (ver RectificativaServidorAnterior).
 *
 * Plantilla (Configuración > Series): la de la serie elegida (la proforma, la
 * de su serie P; una rectificativa de una factura de la app, la de esa
 * factura). Con la plantilla A (envases) las líneas llevan packs, uds, kg de
 * plástico, IEEPNR y texto adicional (LineasEnvases), sin descuento, con el
 * resumen y el peso bruto (ResumenEnvases), y el IVA se calcula por tipo. Con
 * la plantilla B (cerámica), la obra, las líneas con palets, cajas, m², piezas,
 * formato, calidad, peso, la unidad del precio y el cargo de palets
 * (LineasCeramica), sin descuento, con los totales y los pesos neto y bruto
 * (ResumenCeramica), y el IVA por tipo. Con las demás, la tabla de siempre.
 * Las observaciones por defecto de la serie salen escritas en una factura nueva
 * mientras no se toquen.
 */

interface Cliente {
  id: string;
  nombreFiscal: string;
  nifCif: string;
  pais?: string;
  monedaPreferida?: string | null;
}

/** Lo que se usa de GET /ajustes-facturacion (Configuracion > Facturacion). */
interface AjustesFacturacionApi {
  formaPago: 'TRANSFERENCIA' | 'GIRO' | 'CONTADO';
  diasVencimiento: number;
  irpfDefecto: number;
  empresaEspanola: boolean;
  /** IEEPNR (plantilla A): si la empresa lo repercute y a cuánto el kg. Un servidor anterior no los manda. */
  ieepnrRepercute?: boolean;
  ieepnrPorKg?: number;
  /** Plantilla B: cuenta del cargo de palets (null = la de ventas). */
  cuentaPalets?: string | null;
}

interface Serie {
  id: string;
  codigo: string;
  descripcion: string;
  activa: boolean;
  porDefecto: boolean;
  ultimoNumero?: number;
  /** Plantilla que usa la serie ('default', 'A'...). Un servidor anterior no la manda: la estándar. */
  plantilla?: string;
  /** Observaciones que salen escritas en cada factura nueva de la serie. */
  observacionesDefecto?: string | null;
}

interface Producto {
  id: string;
  referencia: string;
  descripcion: string;
  precio: number;
  ivaPorcentaje: number;
  bloqueado: boolean;
  /** Cuenta de ventas del producto (la suya, la de su familia, o 705 / 700). */
  cuentaVentasEfectiva?: string;
  /** Plantilla A: unidades por pack, kg de plástico por unidad, si lleva IEEPNR y su texto en la factura. */
  unidadesPorPack?: number | null;
  kgPlasticoUnidad?: number | null;
  llevaIeepnr?: boolean;
  textoFactura?: string | null;
  /** Plantilla B: formato, m² y piezas por caja, unidad del precio y kg por esa unidad. */
  formato?: string | null;
  metros2PorCaja?: number | null;
  piezasPorCaja?: number | null;
  unidadPrecio?: string | null;
  pesoKgPorUnidad?: number | null;
}

interface Linea {
  clave: number;
  productoServicioId: string;
  descripcion: string;
  /** Uds en la plantilla A. */
  cantidad: string;
  precioUnitario: string;
  descuentoPorcentaje: string;
  tipoIva: number;
  /** Plantilla A: packs, kg de plástico y texto adicional (con las demás no se mandan). */
  packs: string;
  kgPlastico: string;
  textoAdicional: string;
  /** Plantilla A: las uds o los kg se escribieron a mano y ya no siguen a la propuesta. */
  udsTocadas?: boolean;
  kgTocados?: boolean;
  /** Plantilla B: palets, cajas, m², piezas, formato, calidad, peso y unidad del precio (con las demás no se mandan). */
  palets: string;
  cajas: string;
  metros2: string;
  piezas: string;
  formato: string;
  calidad: string;
  pesoKg: string;
  unidadPrecio: UnidadPrecio;
  /** Plantilla B: es el cargo de palets de madera (va en el pie del PDF). */
  cargoPalets?: boolean;
  /** Plantilla B: se escribieron a mano y ya no siguen a la propuesta. */
  cajasTocadas?: boolean;
  m2Tocados?: boolean;
  piezasTocadas?: boolean;
  pesoTocado?: boolean;
  /** IVA que tenia antes de elegir un tipo de operacion sin cuota (se restaura al volver a nacional). */
  ivaPrevio?: number;
  /** Cuenta de ingresos propia de la linea (70x); sin ella, la del producto o la 700. */
  cuenta?: string;
  /** Rectificativa: factura de la que se propuso la linea (para el reparto entre varias). */
  origenId?: string;
  /** Rectificativa: retención de la línea en la factura de la que sale (una rectificativa lleva una sola). */
  retencionOrigen?: number;
}

interface FacturaApi {
  id: string;
  customerId: string;
  serie: string;
  numeroCompleto?: string | null;
  estadoDocumento: string;
  estado: string;
  tipoFactura: string;
  formaPago?: string;
  fechaEmision: string;
  fechaVencimiento: string;
  fechaOperacion?: string | null;
  observaciones?: string;
  moneda?: string;
  tipoCambio?: number;
  fuenteTipoCambio?: string;
  tipoOperacion?: string | null;
  causaExencion?: string | null;
  referenciaLegal?: string | null;
  motivoRectificacion?: string;
  esRectificativa?: boolean;
  facturaOriginalId?: string | null;
  tipoRectificativa?: string | null;
  /** Rectificativa de una factura de fuera de la app (de antes de facturar con ella). */
  rectificaFuera?: { numero: string; fecha: string | null };
  /** Rectificativa: lo que rectifica, el motivo y la forma. */
  rectificativa?: RectificativaVentaResp | null;
  /** Plantillas A y B: peso bruto escrito a mano. */
  pesoBrutoKg?: number | null;
  /** Plantilla B: obra y peso neto escrito a mano. */
  obra?: string | null;
  pesoNetoKg?: number | null;
  /** Plantilla con la que se guardó (la fija el servidor). */
  plantillaId?: string;
  lineas: Array<{
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    precioUnitarioDoc?: number;
    descuentoPorcentaje: number;
    tipoIva: number;
    tipoRetencion: number;
    productoServicioId?: string;
    cuenta?: string | null;
    packs?: number | null;
    kgPlastico?: number | null;
    textoAdicional?: string | null;
    palets?: number | null;
    cajas?: number | null;
    metros2?: number | null;
    piezas?: number | null;
    formato?: string | null;
    calidad?: string | null;
    pesoKg?: number | null;
    unidadPrecio?: string | null;
    cargoPalets?: boolean;
  }>;
}

interface TipoCambioApi {
  monedaCuenta: string;
  moneda: string;
  tipoCambio: number | null;
  fechaTipoCambio: string | null;
  fuente: string;
  texto: string | null;
  textoInverso: string | null;
  provisional: boolean;
  aviso?: string;
}

interface Revision {
  mencion: { es: string; en: string | null } | null;
  avisosCliente?: AvisoFiscal[];
  revision?: { tipoOperacion: string | null; errores: AvisoFiscal[]; avisos: AvisoFiscal[] };
}

const IVAS = [21, 10, 5, 4, 0];
// Los mismos que admite el IRPF habitual de Configuracion > Facturacion (1 y 2 %: actividades agricolas y ganaderas).
const IRPFS = [0, 1, 2, 7, 15, 19];
const FORMAS_PAGO = [
  ['TRANSFERENCIA', 'Transferencia bancaria'],
  ['GIRO', 'Giro / recibo domiciliado'],
  ['CONTADO', 'Contado'],
] as const;
const num = (s: string): number => {
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
// Hoy en España: entre las 00:00 y las 02:00 el dia UTC todavia seria ayer.
const hoy = () => hoyEspana();
const masDias = (fecha: string, dias: number) => {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};
const fechaES = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
/** «con retención del 15 %» o «sin retención». */
const textoRetencion = (t: number) => (t ? `con retención del ${t} %` : 'sin retención');

let siguienteClave = 1;
const lineaVacia = (tipoIva = 21): Linea => ({
  clave: siguienteClave++,
  productoServicioId: '',
  descripcion: '',
  cantidad: '1',
  precioUnitario: '',
  descuentoPorcentaje: '0',
  tipoIva,
  packs: '',
  kgPlastico: '',
  textoAdicional: '',
  palets: '',
  cajas: '',
  metros2: '',
  piezas: '',
  formato: '',
  calidad: '',
  pesoKg: '',
  unidadPrecio: 'M2',
});

/** Línea del cargo de palets de madera (plantilla B): por unidad, con su texto y la cantidad de palets propuesta. */
const lineaCargoPalets = (tipoIva: number, palets: number): Linea => ({
  ...lineaVacia(tipoIva),
  descripcion: TEXTO_CARGO_PALETS,
  cantidad: palets > 0 ? String(palets) : '1',
  unidadPrecio: 'UNIDAD',
  cargoPalets: true,
});

/**
 * Datos de cerámica de una línea guardada (borrador o propuesta de una
 * rectificativa, plantilla B). Las medidas siguen a la propuesta del producto
 * solo si coinciden con ella; si no, son las que se escribieron.
 */
function ceramicaGuardada(
  l: {
    cantidad: number;
    palets?: number | null;
    cajas?: number | null;
    metros2?: number | null;
    piezas?: number | null;
    formato?: string | null;
    calidad?: string | null;
    pesoKg?: number | null;
    unidadPrecio?: string | null;
    cargoPalets?: boolean;
  },
  p: Producto | undefined,
): Pick<Linea, 'palets' | 'cajas' | 'metros2' | 'piezas' | 'formato' | 'calidad' | 'pesoKg' | 'unidadPrecio' | 'cargoPalets' | 'cajasTocadas' | 'm2Tocados' | 'piezasTocadas' | 'pesoTocado'> {
  const datos = {
    palets: paraEditar(l.palets),
    cajas: paraEditar(l.cajas),
    metros2: paraEditar(l.metros2),
    piezas: paraEditar(l.piezas),
    formato: l.formato ?? '',
    calidad: l.calidad ?? '',
    pesoKg: paraEditar(l.pesoKg),
    unidadPrecio: (esUnidadPrecio(l.unidadPrecio) ? l.unidadPrecio : l.cargoPalets ? 'UNIDAD' : 'M2') as UnidadPrecio,
    cargoPalets: l.cargoPalets === true,
  };
  const pr = propuestasCeramica({ ...datos, clave: 0, productoServicioId: '', descripcion: '', cantidad: '', precioUnitario: '', tipoIva: 21, textoAdicional: '' }, p);
  return {
    ...datos,
    cajasTocadas: true,
    m2Tocados: pr.metros2 !== null && pr.metros2 !== (l.metros2 ?? null),
    piezasTocadas: pr.piezas !== null && pr.piezas !== (l.piezas ?? null),
    pesoTocado: pr.peso !== null && pr.peso !== (l.pesoKg ?? null),
  };
}

/**
 * Datos de envase de una línea guardada (borrador o propuesta de una
 * rectificativa). Las uds y los kg siguen a la propuesta del producto solo si
 * coinciden con ella; si no, son los que se escribieron.
 */
function envaseGuardado(
  l: { cantidad: number; packs?: number | null; kgPlastico?: number | null; textoAdicional?: string | null },
  p: Producto | undefined,
): Pick<Linea, 'packs' | 'kgPlastico' | 'textoAdicional' | 'udsTocadas' | 'kgTocados'> {
  const packs = paraEditar(l.packs);
  const kgPlastico = paraEditar(l.kgPlastico);
  const uds = udsPropuestas({ packs }, p);
  const kg = kgPropuestos({ cantidad: paraEditar(l.cantidad) }, p);
  return {
    packs,
    kgPlastico,
    textoAdicional: l.textoAdicional ?? '',
    udsTocadas: uds !== null && uds !== l.cantidad,
    kgTocados: kg !== null && kg !== (l.kgPlastico ?? null),
  };
}

/** Cuenta de ingresos de una linea sin cuenta propia: la del producto o la 700. */
const cuentaPorDefecto = (p: Producto | undefined) =>
  p?.cuentaVentasEfectiva ? { codigo: p.cuentaVentasEfectiva, texto: 'la del producto' } : { codigo: '700', texto: 'la de ventas' };

const campo =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50';
const etiqueta = 'mb-1 block text-sm font-medium text-slate-700';

const BOTON_PRINCIPAL =
  'rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50';
const BOTON_SECUNDARIO =
  'rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50';

/** Un borrador guardado en la R no pasa a ticket sin una serie de rectificativas de tickets activa (no se crea sola). */
const TEXTO_BORRADOR_SIN_TICKETS =
  'Este borrador ya está guardado en la serie de rectificativas y no hay ninguna serie de rectificativas de tickets activa. Créala o actívala en Configuración > Series y vuelve a abrir el borrador.';

/** Normal (F1 o F2), rectificativa o abono (R1-R4) o rectificativa de un ticket (R5). */
type Modo = 'normal' | 'rectificativa' | 'ticket';
type Params = { get: (clave: string) => string | null };

/** Modo con el que se abre: el borrador (?id=) dice el suyo al cargarlo. */
function modoDeParams(p: Params): Modo {
  if (p.get('id')) return 'normal';
  if (p.get('rectifica')) return p.get('ticket') === '1' ? 'ticket' : 'rectificativa';
  return p.get('rectificaFuera') === '1' ? 'rectificativa' : 'normal';
}

/** Lo que se rectifica segun el enlace de entrada. */
function rectDeParams(p: Params): EstadoRectificativaVenta {
  const e = estadoVacio();
  if (p.get('id')) return e;
  const id = p.get('rectifica');
  if (id) return { ...e, originales: [originalDeApp(id)] };
  if (p.get('rectificaFuera') === '1') return { ...e, originales: [originalDeFuera(p.get('numero') ?? '', p.get('fecha') ?? '', p.get('partida') || null)] };
  return e;
}

/** Borrador de rectificativa guardado sin el bloque nuevo (solo facturaOriginalId o rectificaFuera). */
function rectDeAntiguos(f: FacturaApi): EstadoRectificativaVenta {
  const originales = f.facturaOriginalId
    ? [originalDeApp(f.facturaOriginalId)]
    : f.rectificaFuera
      ? [originalDeFuera(f.rectificaFuera.numero, f.rectificaFuera.fecha ?? '')]
      : [];
  return { ...estadoVacio(), forma: f.tipoRectificativa === 'S' ? 'S' : 'I', explicacion: f.motivoRectificacion ?? '', originales };
}

/** Elemento al que se lleva el foco cuando el servidor (o la comprobacion) señala un campo. */
function idDelCampo(c: string | undefined, esRect: boolean): string | null {
  if (!c) return null;
  if (c === 'customer' || c.startsWith('customer.') || c === 'clienteId') return 'cliente';
  if (c === 'serie') return 'serie';
  // En una rectificativa el tipo sale del motivo; en una factura, del desplegable de tipo.
  if (c === 'tipoFactura') return esRect ? 'rv-motivo' : 'tipo';
  if (c === 'rectificativa.motivo') return 'rv-motivo';
  if (c === 'rectificativa.explicacion') return 'rv-explicacion';
  if (c === 'rectificativa.forma') return 'rv-forma-I';
  if (c.startsWith('rectificativa.periodo')) return c.endsWith('hasta') ? 'rv-hasta' : 'rv-desde';
  const o = /^rectificativa\.originales\.(\d+)(?:\.(numero|fecha|base|cuota|retencion))?/.exec(c);
  if (o) return o[2] ? `rv-original-${o[1]}-${o[2]}` : `rv-original-${o[1]}`;
  if (c.startsWith('rectificativa')) return 'rv-originales';
  // Servidor anterior a las rectificativas nuevas (abono de una factura de fuera).
  if (c === 'rectificaFuera' || c === 'rectificaFuera.numero') return 'rf-numero';
  if (c === 'rectificaFuera.fecha') return 'rf-fecha';
  if (c === 'motivoRectificacion') return 'rf-motivo';
  if (c === 'fechaEmision') return 'emision';
  if (c === 'fechaVencimiento') return 'vencimiento';
  if (c === 'fechaOperacion') return 'operacion';
  if (c === 'tipoOperacion') return 'tipo-operacion';
  if (c === 'moneda') return 'moneda';
  if (c === 'tipoCambio') return 'tipo-cambio';
  if (c === 'tipoRetencion') return 'irpf';
  if (c === 'pesoBrutoKg') return 'peso-bruto';
  if (c === 'pesoNetoKg') return 'peso-neto';
  if (c === 'obra') return 'obra';
  // packs, kgPlastico y textoAdicional: plantilla A (LineasEnvases); palets, cajas, metros2, piezas, formato, calidad,
  // pesoKg y unidadPrecio: plantilla B (LineasCeramica); el descuento, solo en la tabla de siempre.
  const l = /^lineas\.(\d+)\.(cantidad|precioUnitario|descripcion|packs|kgPlastico|textoAdicional|descuentoPorcentaje|palets|cajas|metros2|piezas|formato|calidad|pesoKg|unidadPrecio)/.exec(c);
  if (l) return `linea-${l[1]}-${l[2]}`;
  if (c.startsWith('lineas')) return 'lineas-titulo';
  return null;
}

export default function NuevaFacturaPage() {
  return (
    <Suspense fallback={<p className="p-6 text-slate-500">Cargando…</p>}>
      <FormularioFactura />
    </Suspense>
  );
}

function FormularioFactura() {
  const router = useRouter();
  const params = useSearchParams();
  const borradorId = params.get('id');
  // Proforma nueva (?tipo=proforma) o una proforma pendiente que se edita.
  const [esProforma, setEsProforma] = useState(params.get('tipo') === 'proforma');
  const [numeroProforma, setNumeroProforma] = useState('');
  // Rectificativa o abono (ver la cabecera): el modo y lo que se rectifica.
  const [modo, setModo] = useState<Modo>(() => modoDeParams(params));
  const [rect, setRect] = useState<EstadoRectificativaVenta>(() => rectDeParams(params));
  // Borrador guardado: no pasa de factura a rectificativa ni al revés (el servidor tampoco lo deja).
  const [modoFijo, setModoFijo] = useState(false);
  const esRect = modo !== 'normal' && !esProforma;
  const ticket = esRect && modo === 'ticket';
  // Serie de rectificativas: las de tipo RECTIFICATIVA (R1-R4) o RECTIFICATIVA_SIMPLIFICADA (R5).
  const [seriesRect, setSeriesRect] = useState<Serie[] | null>(null);
  const [serieRect, setSerieRect] = useState('');
  // Modo con el que ya está guardado el borrador de la rectificativa (null: aún no se ha guardado).
  const [modoGuardado, setModoGuardado] = useState<'rectificativa' | 'ticket' | null>(null);
  // Se intentó pasar a ticket un borrador guardado sin serie de tickets: se explica por qué no.
  const [avisoBorradorTicket, setAvisoBorradorTicket] = useState(false);
  // Hay series de ese tipo, pero ninguna activa (están desactivadas): no se crea otra al guardar.
  const [haySeriesRectInactivas, setHaySeriesRectInactivas] = useState(false);
  // No se han podido cargar (no es lo mismo que no tener ninguna).
  const [errorSeriesRect, setErrorSeriesRect] = useState('');
  const [vueltaSeriesRect, setVueltaSeriesRect] = useState(0);

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [series, setSeries] = useState<Serie[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  // Campo que señala el último error (del servidor o de la comprobación): se marca y recibe el foco.
  const [campoError, setCampoError] = useState<string | undefined>();
  const [intentoFallido, setIntentoFallido] = useState(0);
  const avisoPlan = useAvisoPlanAnterior();

  const [clienteId, setClienteId] = useState('');
  const [serie, setSerie] = useState('');
  const [tipoFactura, setTipoFactura] = useState('F1');
  const [formaPago, setFormaPago] = useState('TRANSFERENCIA');
  const [fechaEmision, setFechaEmision] = useState(hoy());
  const [fechaVencimiento, setFechaVencimiento] = useState(masDias(hoy(), 30));
  // Dias de vencimiento de Configuracion > Facturacion. Mientras no se toque el
  // vencimiento a mano, sigue a la fecha de emision.
  const [diasVencimiento, setDiasVencimiento] = useState(30);
  const [vencimientoTocado, setVencimientoTocado] = useState(false);
  const [fechaOperacion, setFechaOperacion] = useState('');
  const [irpf, setIrpf] = useState(0);
  const [observaciones, setObservaciones] = useState('');
  // Plantilla A: peso bruto escrito a mano, el IEEPNR de Configuración > Facturación y las series de proformas.
  const [pesoBruto, setPesoBruto] = useState('');
  // Plantilla B: la obra y el peso neto escrito a mano.
  const [obra, setObra] = useState('');
  const [pesoNeto, setPesoNeto] = useState('');
  // Observaciones por defecto de la serie que se escribieron solas (siguen a la serie mientras no se toquen).
  const [obsDeSerie, setObsDeSerie] = useState<string | null>(null);
  // Plantilla B: la cuenta del cargo de palets de Configuración > Facturación (null = la de ventas).
  const [cuentaPaletsAjustes, setCuentaPaletsAjustes] = useState<string | null>(null);
  // Plantilla con la que se guardó el borrador o la proforma que se edita (null: alta nueva).
  const [plantillaGuardada, setPlantillaGuardada] = useState<string | null>(null);
  const [ajustesIeepnr, setAjustesIeepnr] = useState<{ repercute: boolean; porKg: number }>({ repercute: false, porKg: 0.45 });
  const [seriesProforma, setSeriesProforma] = useState<Serie[]>([]);
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()]);
  // Rectificativa: las líneas se proponen desde la original mientras no se hayan tocado a mano;
  // si ya se tocaron, la propuesta nueva se ofrece con un botón.
  const [lineasTocadas, setLineasTocadas] = useState(false);
  // Las líneas son las guardadas en el borrador y aún no se han tocado en esta visita.
  const [lineasDeBorrador, setLineasDeBorrador] = useState(false);
  const [propuestaPendiente, setPropuestaPendiente] = useState<LineaPropuesta[] | null>(null);
  // La retención ya la puso la propuesta (la de la original): la de Configuración no la pisa al terminar de cargar.
  const irpfDePropuesta = useRef(false);
  // Cuentas de ingresos del plan (70x) para el «Cambiar cuenta» de cada linea. En una
  // rectificativa tambien la 706, la 708 y la 709 (solo para elegirlas).
  const catalogoCuentas = useCuentasLinea('venta', true, { rectificativa: esRect });
  const puedeCrearCuenta = tieneAlgunPermiso(getUser(), ['ventas:write', 'contabilidad:write']);

  // Moneda y tipo de cambio ('' = aun sin decidir: la de la contabilidad).
  const [moneda, setMoneda] = useState('');
  const [monedaTocada, setMonedaTocada] = useState(false);
  const [tipoManual, setTipoManual] = useState(''); // texto del campo; '' = el del BCE
  const [bce, setBce] = useState<TipoCambioApi | null>(null);
  const [bceCargando, setBceCargando] = useState(false);
  const [bceError, setBceError] = useState('');
  // Borrador guardado con tipo manual que se quiere volver a dejar en el del BCE.
  const [volverAlBce, setVolverAlBce] = useState(false);
  // Borrador creado en esta pantalla al "Pasar a factura": si emitirlo falla, el
  // reintento lo modifica (PUT) en vez de crear otro.
  const [idCreado, setIdCreado] = useState<string | null>(null);

  // Tipo de operacion de IVA.
  const [tipoOperacion, setTipoOperacion] = useState('');
  // Al rectificar una factura de la app, su tipo de operación manda: no se aplica la sugerencia.
  const [tipoTocado, setTipoTocado] = useState(() => !!params.get('rectifica'));
  const [supuesto, setSupuesto] = useState('');
  const [referenciaLegal, setReferenciaLegal] = useState('');
  const [revision, setRevision] = useState<Revision | null>(null);

  const { contexto, error: errorContexto } = useContextoFiscal(clienteId || undefined);
  const espanola = contexto?.empresaEspanola ?? true;
  const monedaCuenta = contexto?.monedaCuenta ?? 'EUR';
  const monedaDoc = moneda || monedaCuenta;
  const enDivisa = monedaDoc !== monedaCuenta;
  const regla = contexto?.tipos.find((t) => t.codigo === tipoOperacion) ?? null;
  const sinCuota = !espanola || (regla ? !regla.llevaCuota : false);
  const sinRetencion = !espanola || (regla ? !regla.admiteRetencion : false);
  const clienteElegido = clientes.find((c) => c.id === clienteId);

  // Rectificativa: motivos y series, los datos de cada original de la app y lo que se hereda de la primera.
  const { opciones, error: errorOpciones, anterior, recargar: recargarOpciones } = useOpcionesRectificativa(esRect);
  // Servidor anterior a las rectificativas nuevas: solo el abono de una factura de fuera, con los campos de antes.
  const compat = esRect && anterior;
  const compatFuera = compat && !ticket && rect.que === 'facturas' && rect.originales.length === 1 && rect.originales[0].origen === 'fuera';
  const idsApp = esRect && rect.que === 'facturas' ? rect.originales.filter((o) => o.origen === 'app' && o.id).map((o) => o.id as string) : [];
  const claveIds = idsApp.join(',');
  const { datos, errores: erroresDatos } = useDatosOriginales(idsApp);
  const conOriginalApp = idsApp.length > 0;
  const datosPrincipal = conOriginalApp ? datos[idsApp[0]] ?? null : null;
  const principalId = datosPrincipal?.original.id ?? null;
  const tipoR = esRect ? tipoFacturaDe(rect.motivo, ticket, opciones) : null;
  const infoR = esRect ? infoMotivo(opciones, rect.motivo) : null;
  const sustitucion = esRect && rect.forma === 'S';
  // Tipo que se revisa: el R que sale del motivo (sin motivo todavía, el habitual).
  const tipoFacturaEfectivo = esRect ? (tipoR ?? (ticket ? 'R5' : 'R1')) : tipoFactura;

  // Plantilla de la factura, como la fija el servidor: una rectificativa de una factura de la app, la de
  // esa factura; la proforma, la de su serie P; si no, la de la serie elegida (la de rectificativas en una
  // rectificativa). Sin el dato (servidor anterior), la estándar.
  const serieProforma = esProforma
    ? (borradorId ? seriesProforma.find((s) => s.codigo === serie) : undefined) ?? seriesProforma.find((s) => s.activa && s.porDefecto) ?? seriesProforma.find((s) => s.activa)
    : undefined;
  // La serie elegida (la P en una proforma, la de rectificativas en una rectificativa).
  const serieActual = esProforma ? serieProforma : esRect ? (seriesRect ?? []).find((s) => s.codigo === serieRect) : series.find((s) => s.codigo === serie);
  const plantilla = normalizarPlantilla(esRect && conOriginalApp ? datosPrincipal?.original.plantillaId : serieActual?.plantilla);
  const envases = admiteEnvases(plantilla);
  // Plantilla B (cerámica): obra, palets, cajas, m², piezas, pesos y cargo de palets.
  const ceramica = admiteCeramica(plantilla);
  // La A y la B no llevan descuento por línea; la A y la B, texto adicional y peso bruto.
  const sinDescuento = !admiteDescuento(plantilla);
  const conTexto = admiteTextoAdicional(plantilla);
  const cuotaPorTipo = ivaPorTipo(plantilla);
  // IEEPNR por kg: en una rectificativa de una factura de la app, el de esa factura (null si no lo
  // llevaba); si no, el de Configuración > Facturación si la empresa lo repercute (0 si no).
  const tipoIeepnr: number | null = !envases
    ? null
    : esRect && conOriginalApp
      ? (datosPrincipal?.original.ieepnrPorKg ?? null)
      : espanola && ajustesIeepnr.repercute
        ? ajustesIeepnr.porKg
        : null;
  const sinIeepnr: SinIeepnr = !envases || tipoIeepnr ? null : esRect && conOriginalApp ? 'original' : 'ajustes';

  useEffect(() => {
    (async () => {
      try {
        const [cli, ser, prod, ajustes] = await Promise.all([
          apiFetch<{ items: Cliente[] } | Cliente[]>(companyPath('/clientes?limit=1000')),
          apiFetch<Serie[]>(companyPath('/series?tipoDocumento=FACTURA')),
          apiFetch<{ items: Producto[] }>(companyPath('/productos?limit=1000&activos=true')).catch(() => ({ items: [] })),
          // Valores por defecto (Configuracion > Facturacion). Si no se pueden leer, los de siempre.
          apiFetch<AjustesFacturacionApi>(companyPath('/ajustes-facturacion')).catch(() => null),
        ]);
        setClientes(Array.isArray(cli) ? cli : cli.items ?? []);
        const activas = ser.filter((s) => s.activa);
        setSeries(activas);
        const catalogo = prod.items ?? [];
        setProductos(catalogo);
        const productoDe = (id?: string | null) => catalogo.find((p) => p.id === id);
        // El IEEPNR solo se repercute en España y si la empresa lo ha activado (el servidor manda al guardar).
        if (ajustes) setAjustesIeepnr({ repercute: !!ajustes.empresaEspanola && ajustes.ieepnrRepercute === true, porKg: Number(ajustes.ieepnrPorKg ?? 0.45) || 0.45 });
        if (ajustes) setCuentaPaletsAjustes(ajustes.cuentaPalets ?? null);

        if (borradorId) {
          const { invoice } = await apiFetch<{ invoice: FacturaApi }>(companyPath(`/income-invoices/${borradorId}`));
          const proforma = invoice.estadoDocumento === 'PROFORMA';
          if (proforma ? invoice.estado !== 'PENDIENTE' : invoice.estadoDocumento !== 'BORRADOR') {
            router.replace(`/dashboard/${proforma ? 'proformas' : 'facturas'}/${invoice.id}`);
            return;
          }
          setEsProforma(proforma);
          setNumeroProforma(proforma ? (invoice.numeroCompleto ?? '') : '');
          setClienteId(invoice.customerId);
          setSerie(invoice.serie);
          setTipoFactura(invoice.tipoFactura);
          setFormaPago(invoice.formaPago ?? 'TRANSFERENCIA');
          setFechaEmision(invoice.fechaEmision);
          setFechaVencimiento(invoice.fechaVencimiento);
          setVencimientoTocado(true);
          setFechaOperacion(invoice.fechaOperacion ?? '');
          setObservaciones(invoice.observaciones ?? '');
          setPesoBruto(paraEditar(invoice.pesoBrutoKg));
          setObra(invoice.obra ?? '');
          setPesoNeto(paraEditar(invoice.pesoNetoKg));
          setPlantillaGuardada(invoice.plantillaId ?? null);
          setIrpf(invoice.lineas.find((l) => l.tipoRetencion)?.tipoRetencion ?? 0);
          if (invoice.moneda) {
            setMoneda(invoice.moneda);
            setMonedaTocada(true);
          }
          // Con todos sus decimales: guardar sin tocarlo no cambia el tipo (formatoTipo lo redondea a 4).
          if (invoice.fuenteTipoCambio === 'MANUAL' && invoice.tipoCambio) setTipoManual(tipoParaEditar(invoice.tipoCambio));
          // Un borrador ya guardado no cambia de tipo solo: si hay sugerencia, se ofrece.
          setTipoOperacion(invoice.tipoOperacion ?? '');
          setTipoTocado(true);
          setReferenciaLegal(invoice.referenciaLegal ?? '');
          setSupuesto(invoice.causaExencion || invoice.referenciaLegal ? 'CAUSA:' : '');
          // Un borrador no cambia de factura a rectificativa ni al revés.
          setModoFijo(true);
          if (!proforma && (invoice.esRectificativa || invoice.rectificativa || invoice.rectificaFuera || invoice.facturaOriginalId)) {
            const r = invoice.rectificativa;
            const guardado = r?.ticket || invoice.tipoFactura === 'R5' ? 'ticket' : 'rectificativa';
            setModo(guardado);
            setModoGuardado(guardado);
            setRect(r ? estadoDesdeResp(r) : rectDeAntiguos(invoice));
            setSerieRect(invoice.serie);
            setFechaOperacion('');
          }
          // Sus líneas son las guardadas: no se cambian por las propuestas sin preguntar.
          setLineasTocadas(true);
          setLineasDeBorrador(true);
          setLineas(
            invoice.lineas.map((l) => ({
              clave: siguienteClave++,
              productoServicioId: l.productoServicioId ?? '',
              descripcion: l.descripcion,
              cantidad: String(l.cantidad),
              // Precio en la moneda de la factura (las anteriores no lo tienen: el de siempre).
              precioUnitario: String(l.precioUnitarioDoc ?? l.precioUnitario),
              descuentoPorcentaje: String(l.descuentoPorcentaje ?? 0),
              tipoIva: l.tipoIva,
              cuenta: l.cuenta ?? undefined,
              ...envaseGuardado(l, productoDe(l.productoServicioId)),
              ...ceramicaGuardada(l, productoDe(l.productoServicioId)),
            })),
          );
        } else {
          setSerie((activas.find((s) => s.porDefecto) ?? activas[0])?.codigo ?? '');
          // Abono de una factura de fuera de la app: el cliente viene en el enlace.
          const cliente = params.get('cliente');
          if (params.get('rectificaFuera') === '1' && cliente) setClienteId(cliente);
          if (ajustes) {
            setFormaPago(ajustes.formaPago);
            setDiasVencimiento(ajustes.diasVencimiento);
            setFechaVencimiento(masDias(hoy(), ajustes.diasVencimiento));
            // Fuera de España no hay IRPF (el servidor ya lo devuelve a 0). Al rectificar, manda la de la original.
            if (!irpfDePropuesta.current) setIrpf(ajustes.empresaEspanola ? Number(ajustes.irpfDefecto) || 0 : 0);
          }
        }
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setCargando(false);
      }
    })();
  }, [borradorId, router]);

  // Proforma: su plantilla es la de su serie P (Configuración > Series).
  useEffect(() => {
    if (!esProforma) return;
    let vivo = true;
    apiFetch<Serie[]>(companyPath('/series?tipoDocumento=PROFORMA'))
      .then((l) => vivo && setSeriesProforma(Array.isArray(l) ? l : []))
      .catch(() => vivo && setSeriesProforma([]));
    return () => {
      vivo = false;
    };
  }, [esProforma]);

  // Plantilla B: una rectificativa de una factura de la app propone la obra de esa factura.
  const obraOriginal = datosPrincipal?.original.obra ?? '';
  useEffect(() => {
    if (obraOriginal && !borradorId) setObra((o) => o || obraOriginal);
  }, [obraOriginal, borradorId]);

  // Observaciones por defecto de la serie (Configuración > Series): en un documento nuevo salen escritas y
  // siguen a la serie que se elija mientras no se toquen. Un borrador guardado conserva las suyas.
  const obsDefectoSerie = serieActual?.observacionesDefecto ?? '';
  useEffect(() => {
    if (borradorId || cargando) return;
    setObservaciones((o) => (o === '' || o === (obsDeSerie ?? '') ? obsDefectoSerie : o));
    setObsDeSerie(obsDefectoSerie || null);
  }, [borradorId, cargando, obsDefectoSerie, obsDeSerie]);

  // Supuesto de exencion guardado: se busca en el catalogo por su referencia.
  useEffect(() => {
    if (!contexto || !supuesto.startsWith('CAUSA:')) return;
    const lista = tipoOperacion === 'EXENTA' ? contexto.supuestosExencion : contexto.supuestosIsp;
    const s = lista.find((x) => x.referenciaLegal && x.referenciaLegal === referenciaLegal);
    setSupuesto(s ? s.codigo : 'OTRO');
  }, [contexto, supuesto, tipoOperacion, referenciaLegal]);

  // Cliente nuevo en una factura nueva, mientras la moneda no se haya tocado a
  // mano: la que prefiere el cliente o, si no tiene, la de la contabilidad (asi
  // corregir el cliente no deja la factura en la moneda del anterior). Con
  // precios ya escritos se pregunta si se convierten.
  useEffect(() => {
    if (!clienteElegido || monedaTocada || borradorId || !contexto || !contexto.empresaEspanola) return;
    const pref = clienteElegido.monedaPreferida;
    const nueva = pref && contexto.monedasFactura.some((m) => m.codigo === pref) ? pref : contexto.monedaCuenta;
    if (nueva !== monedaDoc) void cambiarMoneda(nueva, false);
    // cambiarMoneda y monedaDoc se leen al cambiar de cliente; no hay que repetirlo al cambiar ellos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteElegido, monedaTocada, borradorId, contexto]);
  const sugerido = contexto?.sugerencia?.tipoOperacion ?? null;
  useEffect(() => {
    if (!espanola || tipoTocado || !sugerido) return;
    aplicarTipo(sugerido);
    // aplicarTipo solo cambia estado; se quiere al cambiar la sugerencia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sugerido, espanola, tipoTocado]);

  // Empresa no espanola: sin IVA ni retencion, en su moneda.
  useEffect(() => {
    if (!contexto || contexto.empresaEspanola) return;
    setLineas((ls) => (ls.some((l) => l.tipoIva !== 0) ? ls.map((l) => ({ ...l, tipoIva: 0 })) : ls));
    setIrpf(0);
    setTipoFactura('F1');
    setModo((m) => (m === 'ticket' ? 'rectificativa' : m));
    setMoneda(contexto.monedaCuenta);
  }, [contexto]);

  // Tipo de cambio del BCE para la fecha de la operacion (o de emision).
  const devengo = fechaOperacion || fechaEmision;
  useEffect(() => {
    if (!enDivisa || !devengo) {
      setBce(null);
      setBceError('');
      return;
    }
    let vivo = true;
    setBceCargando(true);
    const t = setTimeout(() => {
      apiFetch<TipoCambioApi>(companyPath(`/tipos-cambio?moneda=${encodeURIComponent(monedaDoc)}&fecha=${devengo}`))
        .then((r) => {
          if (!vivo) return;
          setBce(r);
          setBceError(r.tipoCambio ? '' : r.aviso || 'No se ha podido obtener el tipo del BCE: indícalo a mano.');
        })
        .catch((e) => vivo && (setBce(null), setBceError(`${errorMessage(e)} Indica el tipo a mano.`)))
        .finally(() => vivo && setBceCargando(false));
    }, 350);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [enDivisa, monedaDoc, devengo]);

  // Un tipo no lleva separador de miles: '1.149' es 1,149 (parseImporte lo leeria como 1149).
  const manual = tipoManual.trim() ? parseTipo(tipoManual) : NaN;
  // Al rectificar una factura de la app, su tipo de cambio (el servidor lo hereda).
  const tipoHeredado = enDivisa && conOriginalApp && datosPrincipal ? datosPrincipal.original.tipoCambio : null;
  const tipoAplicado = enDivisa ? (tipoHeredado ?? (Number.isFinite(manual) && manual > 0 ? manual : bce?.tipoCambio ?? null)) : 1;
  const avisoTipo = (() => {
    if (!enDivisa || !tipoManual.trim()) return '';
    if (!Number.isFinite(manual) || manual <= 0) return 'El tipo de cambio tiene que ser un número mayor que cero.';
    const ref = bce?.tipoCambio;
    if (!ref) return '';
    if (pareceInvertido(manual, ref)) {
      return `Parece escrito al revés: el BCE da ${textoTipo(monedaCuenta, monedaDoc, ref)}. Indica cuántos ${monedaDoc} vale 1 ${monedaCuenta}.`;
    }
    if (manual < ref / 2 || manual > ref * 2) return `Muy lejos del tipo del BCE (${formatoTipo(ref)}). Revísalo.`;
    if (desviacion(manual, ref) > DESVIACION_AVISO) {
      return `Se separa un ${(desviacion(manual, ref) * 100).toFixed(1).replace('.', ',')} % del tipo del BCE (${formatoTipo(ref)}).`;
    }
    return '';
  })();

  const cambiarLinea = (clave: number, cambios: Partial<Linea>) => {
    setLineasTocadas(true);
    setLineasDeBorrador(false);
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));
  };

  /**
   * Lo que se pierde al pasar de la plantilla `desde` (la de ahora, si no se
   * dice) a `destino` (null si nada): los envases de la A, los datos de
   * cerámica de la B, el texto adicional y el peso bruto (la A y la B) y los
   * descuentos por línea (la A y la B no los llevan).
   */
  const perdidasDePlantilla = (destino: string, desde: string = plantilla): { datos: string | null; descuentos: boolean } => {
    const que: string[] = [];
    if (admiteEnvases(desde) && !admiteEnvases(destino) && lineas.some((l) => l.packs.trim() || l.kgPlastico.trim())) que.push('los packs, los kg de plástico y el IEEPNR');
    const conCeramica = !!obra.trim() || !!pesoNeto.trim() || lineas.some((l) => l.cargoPalets || l.palets.trim() || l.cajas.trim() || l.metros2.trim() || l.piezas.trim() || l.formato.trim() || l.calidad.trim() || l.pesoKg.trim());
    if (admiteCeramica(desde) && !admiteCeramica(destino) && conCeramica) que.push('los palets, las cajas, los m², las piezas, el formato, la calidad, el peso, la obra y el peso neto (los palets de madera quedan como una línea más)');
    if (admiteTextoAdicional(desde) && !admiteTextoAdicional(destino) && lineas.some((l) => l.textoAdicional.trim())) que.push('el texto adicional de las líneas');
    if (admiteTextoAdicional(desde) && !admiteTextoAdicional(destino) && pesoBruto.trim()) que.push('el peso bruto');
    const descuentos = admiteDescuento(desde) && !admiteDescuento(destino) && lineas.some((l) => num(l.descuentoPorcentaje) !== 0);
    return { datos: que.length ? que.join(', ') : null, descuentos };
  };

  /**
   * Antes de cambiar a una serie con otra plantilla: lo que la nueva no lleva
   * no se guarda (se pregunta); y si la nueva no lleva descuento por línea (la
   * A o la B), se quitan los descuentos (se pregunta). false: no se cambia.
   */
  const confirmarPlantilla = (otra: string | undefined): boolean => {
    const destino = normalizarPlantilla(otra);
    if (destino === plantilla) return true;
    // Ya se ha preguntado: al guardar no se vuelve a preguntar por lo mismo.
    const aceptado = () => {
      if (plantillaGuardada !== null) setPlantillaGuardada(destino);
      return true;
    };
    const { datos, descuentos } = perdidasDePlantilla(destino);
    if (datos && !window.confirm(`Esa serie usa la plantilla ${NOMBRE_PLANTILLA[destino]}, que no lleva ${datos}: si la cambias, esos datos no se guardan.\n\n¿Cambiar de serie?`)) {
      return false;
    }
    if (descuentos) {
      if (!window.confirm(`Esa serie usa la plantilla ${NOMBRE_PLANTILLA[destino]}, que no lleva descuento por línea: se quitan los descuentos y tendrás que poner el precio ya rebajado.\n\n¿Cambiar de serie?`)) {
        return false;
      }
      setLineas((ls) => ls.map((l) => ({ ...l, descuentoPorcentaje: '0' })));
    }
    // A la B: las líneas que ya hay pasan a ir por unidad, con su cantidad en las piezas.
    if (admiteCeramica(destino) && !ceramica) {
      setLineas((ls) => ls.map((l) => (l.cargoPalets || l.piezas.trim() || l.metros2.trim() ? l : { ...l, unidadPrecio: 'UNIDAD', piezas: l.cantidad })));
    }
    // De la B a otra: la cantidad de cada línea es la que se cobraba (los m² o las piezas).
    if (ceramica && !admiteCeramica(destino)) {
      setLineas((ls) => ls.map((l) => (l.cargoPalets ? { ...l, cargoPalets: false } : l)));
    }
    return aceptado();
  };

  const elegirProducto = (clave: number, id: string) => {
    const p = productos.find((x) => x.id === id);
    if (!p) return cambiarLinea(clave, { productoServicioId: '' });
    // El precio del catalogo esta en la moneda de la contabilidad: en otra moneda se convierte al tipo propuesto.
    const precio = enDivisa && tipoAplicado ? redondear2(p.precio * tipoAplicado) : p.precio;
    const iva = IVAS.includes(p.ivaPorcentaje) ? p.ivaPorcentaje : 21;
    // Plantilla A: su texto en la factura y, con unidades por pack o IEEPNR, las uds y los kg propuestos
    // (siguen a los packs y a las uds hasta que se escriban a mano). Sin IEEPNR, sin kg.
    const actual = lineas.find((l) => l.clave === clave);
    const envase = actual
      ? seguirPropuestas({ ...actual, udsTocadas: false, kgTocados: false, kgPlastico: p.llevaIeepnr ? actual.kgPlastico : '' }, p)
      : null;
    // Plantilla B: su formato y la unidad de su precio; desde las cajas, los m² y las piezas, y el peso
    // (siguen a lo que se escriba hasta que se toquen a mano).
    const ceramico =
      ceramica && actual && !actual.cargoPalets
        ? seguirPropuestasCeramica(
            {
              ...actual,
              formato: p.formato ?? actual.formato,
              unidadPrecio: esUnidadPrecio(p.unidadPrecio) ? p.unidadPrecio : actual.unidadPrecio,
              cajasTocadas: !!actual.cajas.trim(),
              m2Tocados: false,
              piezasTocadas: false,
              pesoTocado: false,
            },
            p,
          )
        : null;
    cambiarLinea(clave, {
      productoServicioId: p.id,
      descripcion: p.descripcion,
      precioUnitario: String(precio),
      ...(sinCuota ? { tipoIva: 0, ivaPrevio: iva } : { tipoIva: iva }),
      textoAdicional: p.textoFactura ?? '',
      udsTocadas: false,
      kgTocados: false,
      ...(envase && !ceramica ? { cantidad: envase.cantidad, kgPlastico: envase.kgPlastico } : {}),
      ...(ceramico
        ? {
            formato: ceramico.formato,
            unidadPrecio: ceramico.unidadPrecio,
            cajas: ceramico.cajas,
            metros2: ceramico.metros2,
            piezas: ceramico.piezas,
            pesoKg: ceramico.pesoKg,
            cantidad: ceramico.cantidad,
            cajasTocadas: ceramico.cajasTocadas,
            m2Tocados: false,
            piezasTocadas: false,
            pesoTocado: false,
          }
        : {}),
    });
  };

  /** Plantilla B: añade un cargo de palets de madera (con los palets de las líneas) al final. */
  const anadirCargoPalets = () => {
    setLineasTocadas(true);
    setLineasDeBorrador(false);
    setLineas((ls) => {
      const palets = ls.filter((l) => !l.cargoPalets).reduce((a, l) => a + (Math.trunc(num(l.palets)) || 0), 0);
      const iva = ls.find((l) => !l.cargoPalets)?.tipoIva ?? (sinCuota ? 0 : 21);
      return [...ls, lineaCargoPalets(iva, palets)];
    });
  };

  /** Elige el tipo de operacion: sin cuota, IVA a 0 (y se guarda el anterior); sin retencion, IRPF a 0. */
  function aplicarTipo(codigo: string) {
    setTipoOperacion(codigo);
    setSupuesto('');
    setReferenciaLegal('');
    const r = contexto?.tipos.find((t) => t.codigo === codigo);
    if (!r) return;
    if (!r.llevaCuota) {
      setLineas((ls) => ls.map((l) => (l.tipoIva === 0 ? l : { ...l, tipoIva: 0, ivaPrevio: l.tipoIva })));
    } else {
      setLineas((ls) => ls.map((l) => (l.ivaPrevio !== undefined ? { ...l, tipoIva: l.ivaPrevio, ivaPrevio: undefined } : l.tipoIva === 0 ? { ...l, tipoIva: 21 } : l)));
    }
    if (!r.admiteRetencion) setIrpf(0);
    if (r.tiposFacturaProhibidos.includes(tipoFactura)) setTipoFactura('F1');
  }

  /**
   * Cambio de moneda con precios ya escritos: se pregunta si se convierten.
   *  - De la moneda de la contabilidad a otra: al tipo del BCE de la nueva para
   *    la fecha de la operacion (se pide al servidor; mientras la factura va en
   *    la de la contabilidad no hay tipo cargado). Sin tipo, se avisa de que los
   *    precios no se convierten.
   *  - De otra a la de la contabilidad: al tipo aplicado (el escrito a mano, si lo hay).
   * `aMano` = false cuando la cambia el cliente elegido: la moneda sigue "sin tocar".
   */
  const cambiarMoneda = async (nueva: string, aMano = true) => {
    if (nueva === monedaDoc) return;
    if (aMano) setMonedaTocada(true);
    const conPrecios = lineas.some((l) => l.precioUnitario.trim() !== '');
    const aDivisa = monedaDoc === monedaCuenta && nueva !== monedaCuenta;
    const aCuenta = monedaDoc !== monedaCuenta && nueva === monedaCuenta;
    if (conPrecios && (aDivisa || aCuenta)) {
      let tc: number | null = aCuenta ? tipoAplicado : null;
      if (aDivisa && devengo) {
        tc = await apiFetch<TipoCambioApi>(companyPath(`/tipos-cambio?moneda=${encodeURIComponent(nueva)}&fecha=${devengo}`))
          .then((r) => r.tipoCambio)
          .catch(() => null);
      }
      if (tc && tc > 0) {
        const ok = window.confirm(
          `¿Convertir los precios a ${nueva} al tipo ${textoTipo(monedaCuenta, aDivisa ? nueva : monedaDoc, tc)}?\n\n` +
            'Aceptar: se convierten. Cancelar: se quedan como están (solo cambia la moneda).',
        );
        if (ok) {
          const t = tc;
          setLineas((ls) =>
            ls.map((l) => {
              const p = parseImporte(l.precioUnitario);
              if (!Number.isFinite(p)) return l;
              return { ...l, precioUnitario: String(redondear2(aDivisa ? p * t : p / t)) };
            }),
          );
        }
      } else {
        window.alert(`No hay tipo de cambio para convertir los precios: se quedan como están, ahora en ${nueva}. Revísalos.`);
      }
    }
    setTipoManual('');
    setMoneda(nueva);
  };

  // Rectificativa con una original de la app: su cliente, su moneda, su tipo de cambio y su tipo
  // de operación (el servidor los hereda; aquí se enseñan y se usan para calcular).
  useEffect(() => {
    if (!datosPrincipal) return;
    const o = datosPrincipal.original;
    setClienteId(o.customerId);
    setMoneda(o.moneda);
    setMonedaTocada(true);
    setTipoManual('');
    setVolverAlBce(false);
    setTipoOperacion(o.tipoOperacion ?? '');
    setTipoTocado(true);
    setReferenciaLegal(o.referenciaLegal ?? '');
    setSupuesto(o.causaExencion || o.referenciaLegal ? 'CAUSA:' : '');
    // Un ticket se rectifica con R5 y una factura completa con R1-R4: el modo sigue a la original.
    if (!modoFijo) setModo(datosPrincipal.ticket ? 'ticket' : 'rectificativa');
    // Solo al cambiar la original principal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [principalId]);

  // Líneas propuestas desde las originales de la app (en negativo por diferencias, enteras por sustitución).
  const datosListos = conOriginalApp && idsApp.every((id) => !!datos[id]);
  const propuesta = useMemo(
    () => (esRect && datosListos ? lineasPropuestas(idsApp.map((id) => datos[id]), rect.forma) : null),
    // claveIds resume idsApp.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [esRect, datosListos, claveIds, datos, rect.forma],
  );
  const ultimaPropuesta = useRef('');
  useEffect(() => {
    if (!propuesta) {
      ultimaPropuesta.current = '';
      setPropuestaPendiente(null);
      return;
    }
    const firma = JSON.stringify(propuesta);
    if (firma === ultimaPropuesta.current) return;
    ultimaPropuesta.current = firma;
    if (lineasTocadas) setPropuestaPendiente(propuesta);
    else aplicarPropuesta(propuesta);
    // Solo cuando cambia la propuesta; lineasTocadas se lee en ese momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propuesta]);

  /** Pone las líneas propuestas (con la cuenta de la línea original) y su retención. */
  function aplicarPropuesta(p: LineaPropuesta[]) {
    setLineas(
      p.length
        ? p.map((l) => ({
            clave: siguienteClave++,
            productoServicioId: l.productoServicioId ?? '',
            descripcion: l.descripcion,
            cantidad: String(l.cantidad),
            precioUnitario: String(l.precioUnitario),
            descuentoPorcentaje: String(l.descuentoPorcentaje),
            tipoIva: l.tipoIva,
            cuenta: l.cuenta,
            origenId: l.originalId,
            retencionOrigen: l.tipoRetencion,
            // Plantilla A: los packs y los kg de la original (con el signo de la cantidad) y su texto.
            ...envaseGuardado(l, productos.find((x) => x.id === l.productoServicioId)),
            // Plantilla B: sus medidas (con el signo de la cantidad), formato, calidad, unidad del precio y cargo de palets.
            ...ceramicaGuardada(l, productos.find((x) => x.id === l.productoServicioId)),
          }))
        : [lineaVacia()],
    );
    // La de la primera línea; si las originales llevan retenciones distintas, se avisa (ver retencionesDistintas).
    setIrpf(p[0]?.tipoRetencion ?? 0);
    irpfDePropuesta.current = true;
    setLineasTocadas(false);
    setLineasDeBorrador(false);
    setPropuestaPendiente(null);
  }

  // Series de rectificativas (la de tickets en una R5). La elegida se mantiene si sigue en la lista.
  const tipoSerieRect = ticket ? 'RECTIFICATIVA_SIMPLIFICADA' : 'RECTIFICATIVA';
  useEffect(() => {
    if (!esRect) return;
    let vivo = true;
    setSeriesRect(null);
    setErrorSeriesRect('');
    setHaySeriesRectInactivas(false);
    apiFetch<Serie[]>(companyPath(`/series?tipoDocumento=${tipoSerieRect}`))
      .then((l) => {
        if (!vivo) return;
        const todas = Array.isArray(l) ? l : [];
        const activas = todas.filter((s) => s.activa);
        setSeriesRect(activas);
        setHaySeriesRectInactivas(todas.length > activas.length);
        setSerieRect((prev) => (activas.some((s) => s.codigo === prev) ? prev : (activas.find((s) => s.porDefecto) ?? activas[0])?.codigo ?? ''));
      })
      .catch((e) => {
        if (!vivo) return;
        // Un fallo no es «no hay ninguna»: se dice y se deja reintentar.
        setSeriesRect([]);
        setSerieRect('');
        setErrorSeriesRect(errorMessage(e));
      });
    return () => {
      vivo = false;
    };
  }, [esRect, tipoSerieRect, vueltaSeriesRect]);

  /** Tipo de factura del desplegable: F1 o F2, o uno de los dos modos de rectificativa. */
  const cambiarTipo = (v: string) => {
    setAvisoBorradorTicket(false);
    // Borrador ya guardado sin serie de tickets: no se cambia (al guardarlo se quedaría en la R y el servidor lo rechaza).
    if (v === 'ticket' && borradorSinSerieTickets) {
      setAvisoBorradorTicket(true);
      return;
    }
    if (v === 'rectificativa' || v === 'ticket') {
      // De factura completa a ticket (o al revés) las facturas de la app elegidas ya no valen.
      if (esRect && modo !== v) setRect((r) => ({ ...r, originales: r.originales.filter((o) => o.origen !== 'app') }));
      setModo(v);
      // Una rectificativa no lleva fecha de la operación.
      setFechaOperacion('');
      return;
    }
    setModo('normal');
    setTipoFactura(v);
  };

  // Mismo calculo que el servidor (redondeo por linea), para que lo que se ve sea lo que se emite.
  // Las rectificativas redondean con signo (-0,525 da -0,53), como el servidor. Con la plantilla A,
  // sin descuento, con el IEEPNR de cada línea dentro de su base y el IVA por tipo. Con la B, sin
  // descuento, la cantidad de la unidad del precio (los m² o las piezas) y el IVA por tipo.
  const lineasCalculo = useMemo(
    () =>
      lineas.map((l) => {
        const kg = envases ? leerCantidad(l.kgPlastico) : null;
        return {
          cantidad: ceramica && !l.cargoPalets ? (cantidadCeramica(l) ?? 0) : num(l.cantidad),
          precioUnitario: num(l.precioUnitario),
          descuentoPorcentaje: sinDescuento ? 0 : num(l.descuentoPorcentaje),
          tipoIva: l.tipoIva,
          tipoRetencion: irpf,
          ...(kg && tipoIeepnr ? { ieepnr: calcularIeepnr(kg, tipoIeepnr, { simetrico: esRect }) } : {}),
        };
      }),
    [lineas, irpf, envases, ceramica, sinDescuento, tipoIeepnr, esRect],
  );
  const calculo = useMemo(
    () => calcularFactura(lineasCalculo, { tipoCambio: tipoAplicado, mismaMoneda: !enDivisa, simetrico: esRect, cuotaPorTipo }),
    [lineasCalculo, tipoAplicado, enDivisa, esRect, cuotaPorTipo],
  );
  // Varias originales: lo que toca a cada una sale de las líneas propuestas desde ella.
  const repartoLineas = useMemo(
    () => repartoDeLineas(lineasCalculo.map((l, i) => ({ ...l, originalId: lineas[i]?.origenId })), { cuotaPorTipo }),
    [lineasCalculo, lineas, cuotaPorTipo],
  );
  // El reparto entre varias facturas se escribe sin signo: si la rectificativa resta, cada parte va en negativo.
  const restaRect = calculo.doc.base < 0 || (calculo.doc.base === 0 && calculo.doc.total < 0);
  const rectEnviar = useMemo(() => repartoConSigno(rect, restaRect), [rect, restaRect]);
  // Por diferencias, cada línea propuesta lleva la retención de su factura y una rectificativa lleva una sola.
  const retencionesDistintas = esRect && !sustitucion ? Array.from(new Set(lineas.filter((l) => l.retencionOrigen !== undefined).map((l) => l.retencionOrigen as number))) : [];
  // Por sustitución: la factura corregida menos la original (lo que se registra).
  const diferencia = useMemo(
    () => (sustitucion && datosPrincipal ? diferenciaSustitucion(lineasCalculo, lineasCalculoDe(datosPrincipal), { cuotaPorTipo }) : null),
    [sustitucion, datosPrincipal, lineasCalculo, cuotaPorTipo],
  );
  const totales = calculo.doc;
  // Plantilla A: el IEEPNR y el TOTAL del artículo (uds × precio) de cada línea, y el resumen de envases.
  const ieepnrLineas = lineasCalculo.map((l) => l.ieepnr ?? 0);
  const totalesArticulo = lineasCalculo.map((l) => (esRect ? Math.sign(l.cantidad * l.precioUnitario) * r2(Math.abs(l.cantidad * l.precioUnitario)) : r2(l.cantidad * l.precioUnitario)));
  const finito = (n: number | null) => (n !== null && Number.isFinite(n) ? n : 0);
  const resumen = resumenEnvases(
    lineas.map((l, i) => ({ cantidad: num(l.cantidad), packs: finito(leerCantidad(l.packs)), kgPlastico: finito(leerCantidad(l.kgPlastico)), ieepnrImporte: ieepnrLineas[i] })),
  );
  // Plantilla B: el importe de cada línea (cantidad × precio, como el TOTAL del artículo) y los totales del pie.
  const resumenB = resumenCeramica(
    lineas.map((l, i) => ({
      cantidad: lineasCalculo[i]?.cantidad ?? 0,
      palets: finito(leerCantidad(l.palets)),
      cajas: finito(leerCantidad(l.cajas)),
      metros2: finito(leerCantidad(l.metros2)),
      piezas: finito(leerCantidad(l.piezas)),
      pesoKg: finito(leerCantidad(l.pesoKg)),
      unidadPrecio: l.unidadPrecio,
      cargoPalets: l.cargoPalets,
      baseLine: totalesArticulo[i],
    })),
  );
  const fmt = (n: number) => formatoImporte(n, monedaDoc);
  const fmtCuenta = (n: number) => formatoImporte(n, monedaCuenta);

  // Revision fiscal en el servidor (mencion del PDF, errores y avisos), sin guardar nada.
  const firmaRevision = JSON.stringify([
    clienteId,
    tipoOperacion,
    supuesto,
    referenciaLegal,
    tipoFacturaEfectivo,
    irpf,
    lineas.map((l) => [l.tipoIva, l.productoServicioId]),
    esRect && conOriginalApp,
  ]);
  const ultimaRevision = useRef('');
  useEffect(() => {
    if (!espanola || !contexto || !clienteId) {
      setRevision(null);
      return;
    }
    if (ultimaRevision.current === firmaRevision) return;
    const t = setTimeout(() => {
      ultimaRevision.current = firmaRevision;
      const c = causaYReferencia();
      apiFetch<Revision>(companyPath('/income-invoices/sugerir-operacion'), {
        method: 'POST',
        body: JSON.stringify({
          customerId: clienteId,
          tipoOperacion: tipoOperacion || null,
          causaExencion: c.causaExencion,
          referenciaLegal: c.referenciaLegal,
          tipoFactura: tipoFacturaEfectivo,
          // La proforma no se emite: sus contradicciones son avisos. Con una original de la app, el
          // tipo de operación es el suyo y no se puede cambiar: el servidor la revisa al guardar como
          // heredada (los datos del cliente ya se revisaron al emitir la original); aquí, sin bloquear.
          modo: esProforma || (esRect && conOriginalApp) ? 'guardar' : 'emitir',
          lineas: lineas.map((l) => ({ tipoIva: l.tipoIva, tipoRetencion: irpf, productoServicioId: l.productoServicioId || undefined })),
        }),
      })
        .then(setRevision)
        .catch(() => setRevision(null));
    }, 500);
    return () => clearTimeout(t);
    // causaYReferencia depende de lo que ya esta en la firma.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmaRevision, espanola, contexto, clienteId, conOriginalApp]);

  /** Causa de exencion y referencia legal segun el supuesto elegido. */
  function causaYReferencia(): { causaExencion: string | null; referenciaLegal: string | null } {
    if (tipoOperacion === 'EXENTA') {
      const s = contexto?.supuestosExencion.find((x) => x.codigo === supuesto);
      if (!s) return { causaExencion: null, referenciaLegal: null };
      return { causaExencion: s.causa ?? null, referenciaLegal: (s.referenciaLegal ?? referenciaLegal.trim()) || null };
    }
    if (tipoOperacion === 'ISP_NACIONAL') {
      const s = contexto?.supuestosIsp.find((x) => x.codigo === supuesto);
      return { causaExencion: null, referenciaLegal: (s?.referenciaLegal ?? referenciaLegal.trim()) || null };
    }
    return { causaExencion: null, referenciaLegal: null };
  }

  const serieElegida = series.find((s) => s.codigo === serie);

  // VERI*FACTU: desde el 1-1-2027, sin VERI*FACTU activo no se pasa a factura
  // (el borrador y la proforma, si). El servidor lo vuelve a comprobar.
  const redSeguridad = useRedSeguridad();
  const emisionBloqueada = !esProforma && !!redSeguridad?.bloquea;
  // Simplificada (F2): hasta 3.000 € de base mas IVA, en euros.
  const totalSimplificada = calculo.cuenta ? r2(calculo.cuenta.base + calculo.cuenta.iva) : null;
  const simplificadaExcedida = !esRect && espanola && tipoFactura === 'F2' && totalSimplificada !== null && totalSimplificada > LIMITE_SIMPLIFICADA;
  const serieElegidaRect = (seriesRect ?? []).find((s) => s.codigo === serieRect);
  // Rectificativa de un ticket sin ninguna serie de ese tipo: el servidor crea la RT (o la RTK) al guardar.
  // Si las hay pero están todas desactivadas, no crea otra: hay que activarla en Configuración > Series.
  // El servidor de ahora dice si la de tickets está desactivada (sin contar las series históricas del
  // lector, que guardan la numeración de otro programa) y, al pasar un borrador de la R a ticket sin
  // serie, le pone la de tickets (y crea la RT si hace falta). Con un servidor anterior (sin
  // `desactivada`) cuentan todas las desactivadas, y el PUT sin serie deja la que tenía: pasar a ticket
  // un borrador guardado en la R solo funciona si hay una serie de tickets activa que mandar.
  const servidorSeriesTickets = opciones?.series.tickets.desactivada !== undefined;
  const seriesRectDesactivadas = ticket && servidorSeriesTickets ? opciones?.series.tickets.desactivada === true : haySeriesRectInactivas;
  const guardadoEnLaR = modoGuardado === 'rectificativa' && !servidorSeriesTickets;
  const serieTicketsSeCrea = ticket && !guardadoEnLaR && !!seriesRect && seriesRect.length === 0 && !seriesRectDesactivadas;
  const tipoSeriesRect = ticket ? 'rectificativas de tickets' : 'rectificativas';
  const borradorSinSerieTickets = esRect && !ticket && guardadoEnLaR && opciones?.series.tickets.existe !== true;

  // Tras un error, el campo que lo causa se pone a la vista y recibe el foco; si no se sabe cuál es, el aviso.
  useEffect(() => {
    if (!intentoFallido) return;
    const id = idDelCampo(campoError, esRect);
    const el =
      (id && document.getElementById(id)) ||
      (campoError?.startsWith('rectificativa') ? document.getElementById('rv-originales') : null) ||
      document.getElementById('nf-error');
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus({ preventScroll: true });
    // Solo al fallar un intento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentoFallido]);

  /** aria-invalid (y el aviso como descripción) en el campo que señala el error. */
  const marca = (...campos: string[]) => {
    const mal = !!campoError && campos.includes(campoError);
    return { 'aria-invalid': mal, 'aria-describedby': mal && error ? 'nf-error' : undefined };
  };

  const cuerpo = () => {
    const fiscal = espanola ? { tipoOperacion: tipoOperacion || null, ...causaYReferencia() } : {};
    const lineasCuerpo = lineas.map((l, i) => ({
      descripcion: l.descripcion.trim(),
      // Plantilla B: la cantidad de la unidad del precio (los m² o las piezas).
      cantidad: lineasCalculo[i]?.cantidad ?? num(l.cantidad),
      precioUnitario: num(l.precioUnitario),
      // La plantilla A y la B no llevan descuento por línea.
      descuentoPorcentaje: sinDescuento ? 0 : num(l.descuentoPorcentaje),
      tipoIva: sinCuota ? 0 : l.tipoIva,
      tipoRetencion: sinRetencion ? 0 : irpf,
      productoServicioId: l.productoServicioId || undefined,
      // Sin cuenta, el servidor usa la del producto (o la 700; la del cargo de palets, la de los ajustes).
      ...(l.cuenta ? { cuenta: l.cuenta } : {}),
      // Plantilla A: packs y kg (el IEEPNR lo calcula el servidor). Con las demás no se mandan.
      ...(envases ? { packs: leerCantidad(l.packs), kgPlastico: leerCantidad(l.kgPlastico) } : {}),
      // Plantillas A y B: el texto adicional bajo el concepto.
      ...(conTexto ? { textoAdicional: l.textoAdicional.trim() || null } : {}),
      // Plantilla B: las medidas, el formato, la calidad, la unidad del precio y el cargo de palets.
      ...(ceramica
        ? l.cargoPalets
          ? { cargoPalets: true, unidadPrecio: 'UNIDAD' }
          : {
              palets: leerCantidad(l.palets),
              cajas: leerCantidad(l.cajas),
              metros2: leerCantidad(l.metros2),
              piezas: leerCantidad(l.piezas),
              formato: l.formato.trim() || null,
              calidad: l.calidad.trim() || null,
              pesoKg: leerCantidad(l.pesoKg),
              unidadPrecio: l.unidadPrecio,
            }
        : {}),
      moneda: monedaDoc,
    }));
    // Plantillas A y B: peso bruto escrito a mano (null: sin peso); la B, también la obra y el peso neto.
    const peso = {
      ...(conTexto ? { pesoBrutoKg: leerCantidad(pesoBruto) } : {}),
      ...(ceramica ? { obra: obra.trim() || null, pesoNetoKg: leerCantidad(pesoNeto) } : {}),
    };
    if (esRect && compat) {
      // Servidor anterior: abono de una factura de fuera, R1 por diferencias, con los campos de antes.
      const o = rect.originales[0];
      return {
        customer: { id: clienteId },
        ...(serieRect ? { serie: serieRect } : {}),
        tipoFactura: 'R1',
        tipoRectificativa: 'I',
        rectificaFuera: { numero: (o?.numero ?? '').trim(), fecha: o?.fecha ?? '' },
        motivoRectificacion: rect.explicacion.trim(),
        formaPago,
        fechaEmision,
        fechaVencimiento,
        fechaOperacion: null,
        // Vacías también se mandan: si no, el servidor pondría las de la serie por defecto.
        observaciones: observaciones.trim(),
        moneda: monedaDoc,
        ...(enDivisa && tipoManual.trim() ? { tipoCambio: manual } : volverAlBce ? { tipoCambio: null } : {}),
        ...fiscal,
        lineas: lineasCuerpo,
      };
    }
    if (esRect) {
      return {
        customer: { id: clienteId },
        // Sin serie elegida, la de rectificativas por defecto (la de tickets se crea con la primera R5).
        ...(serieRect ? { serie: serieRect } : {}),
        // El servidor lo calcula del motivo; si se manda, tiene que coincidir.
        ...(tipoR && opciones ? { tipoFactura: tipoR } : {}),
        formaPago,
        fechaEmision,
        fechaVencimiento,
        // Una rectificativa no lleva fecha de la operación.
        fechaOperacion: null,
        // Vacías también se mandan: si no, el servidor pondría las de la serie por defecto.
        observaciones: observaciones.trim(),
        // Con una original de la app, la moneda, el tipo de cambio y el tipo de operación son los suyos.
        ...(conOriginalApp
          ? {}
          : { moneda: monedaDoc, ...(enDivisa && tipoManual.trim() ? { tipoCambio: manual } : volverAlBce ? { tipoCambio: null } : {}), ...fiscal }),
        ...peso,
        lineas: lineasCuerpo,
        rectificativa: bloqueParaEnviar(rectEnviar, { ticket, reparto: repartoLineas.porOriginal }),
      };
    }
    return {
      customer: { id: clienteId },
      // La proforma va siempre en su serie de proformas (la pone el servidor).
      serie: esProforma ? undefined : serie,
      tipoFactura,
      formaPago,
      fechaEmision,
      fechaVencimiento,
      fechaOperacion: fechaOperacion && fechaOperacion !== fechaEmision ? fechaOperacion : null,
      // Vacías también se mandan: si no, el servidor pondría las de la serie por defecto.
      observaciones: observaciones.trim(),
      moneda: monedaDoc,
      // Solo el tipo escrito a mano; sin el, el del BCE (null: volver al del BCE).
      ...(enDivisa && tipoManual.trim() ? { tipoCambio: manual } : volverAlBce ? { tipoCambio: null } : {}),
      ...fiscal,
      ...peso,
      lineas: lineasCuerpo,
    };
  };

  /** Lo primero que falta antes de guardar o emitir, con el campo que lo arregla (null si nada). */
  const comprobar = (emitir: boolean): { mensaje: string; campo?: string } | null => {
    const falla = (mensaje: string, campo?: string) => ({ mensaje, campo });
    if (!contexto && emitir) {
      return falla(errorContexto ? `No se han podido cargar los datos fiscales de la empresa: ${errorContexto}` : 'Cargando los datos de la empresa…');
    }
    if (compat) {
      // Servidor anterior: solo el abono de una factura de fuera (lo demás, desde la ficha).
      const o = rect.originales[0];
      if (!compatFuera || !o) return falla('Esta forma de hacer rectificativas todavía no está disponible: hazla desde la ficha de la factura.');
      if (!o.numero.trim()) return falla('Escribe el número de la factura que rectificas.', 'rectificaFuera.numero');
      if (!o.fecha) return falla('Escribe la fecha de la factura que rectificas.', 'rectificaFuera.fecha');
      if (o.fecha > fechaEmision) return falla('La factura que rectificas no puede ser posterior a la rectificativa.', 'rectificaFuera.fecha');
      if (emitir && !rect.explicacion.trim()) return falla('Escribe el motivo de la rectificación.', 'motivoRectificacion');
    } else if (esRect) {
      const f = faltaEnBloque(rect, { emitir, fechaEmision });
      if (f) return falla(f.mensaje, f.campo);
      const sinDatos = idsApp.find((id) => !datos[id]);
      if (sinDatos) {
        const i = rect.originales.findIndex((o) => o.id === sinDatos);
        return falla(
          erroresDatos[sinDatos]
            ? `No se han podido cargar los datos de la factura que rectificas: ${erroresDatos[sinDatos]}`
            : 'Espera un momento: se están cargando los datos de la factura que rectificas.',
          `rectificativa.originales.${i}`,
        );
      }
      for (const id of idsApp) {
        const d = datos[id];
        const i = rect.originales.findIndex((o) => o.id === id);
        if (!d.rectificable) return falla(d.motivoNoRectificable ?? `La ${d.original.numeroCompleto} no se puede rectificar.`, `rectificativa.originales.${i}`);
        if (fechaEmision < d.original.fechaEmision) {
          return falla(
            `La rectificativa no puede tener fecha anterior a la factura que rectifica (la ${d.original.numeroCompleto} es del ${fechaES(d.original.fechaEmision)}).`,
            'fechaEmision',
          );
        }
      }
    }
    if (!clienteId) return falla('Elige el cliente.', 'customer');
    if (!serie && !esProforma && !esRect) return falla('Elige la serie.', 'serie');
    if (esRect && errorSeriesRect) return falla(`No se han podido cargar las series de rectificativas: ${errorSeriesRect}`, 'serie');
    if (esRect && !seriesRect) return falla('Espera un momento: se están cargando las series de rectificativas.', 'serie');
    if (esRect && ticket && guardadoEnLaR && !serieRect) return falla(TEXTO_BORRADOR_SIN_TICKETS, 'serie');
    if (esRect && seriesRect && seriesRect.length === 0 && !serieTicketsSeCrea) {
      return falla(
        seriesRectDesactivadas
          ? `Las series de ${tipoSeriesRect} están desactivadas. Activa una en Configuración > Series.`
          : `No hay ninguna serie de ${tipoSeriesRect} activa. Actívala o crea una en Configuración > Series.`,
        'serie',
      );
    }
    if (fechaVencimiento < fechaEmision) return falla('El vencimiento no puede ser anterior a la fecha de emisión.', 'fechaVencimiento');
    if (!esRect && fechaOperacion && fechaOperacion > fechaEmision) return falla('La fecha de la operación no puede ser posterior a la de emisión.', 'fechaOperacion');
    // Rectificativa por diferencias con la plantilla A: una línea de 0 uds con kg corrige solo los kg (y su IEEPNR).
    const soloKg = (l: Linea) => envases && esRect && !sustitucion && num(l.cantidad) === 0 && !!leerCantidad(l.kgPlastico);
    // Plantilla B: la cantidad es la de la unidad del precio (los m² o las piezas).
    const cantidadDe = (i: number) => lineasCalculo[i]?.cantidad ?? num(lineas[i].cantidad);
    const mal = lineas.findIndex((l, i) => !l.descripcion.trim() || (cantidadDe(i) === 0 && !soloKg(l)) || l.precioUnitario === '');
    if (mal >= 0) {
      const l = lineas[mal];
      const deUnidad = ceramica && !l.cargoPalets;
      const campoCantidad = deUnidad ? (l.unidadPrecio === 'M2' ? 'metros2' : 'piezas') : 'cantidad';
      const que = !l.descripcion.trim() ? 'descripcion' : cantidadDe(mal) === 0 ? campoCantidad : 'precioUnitario';
      const cantidadTxt = envases ? 'concepto, uds' : deUnidad ? `descripción, ${l.unidadPrecio === 'M2' ? 'm²' : 'piezas'}` : l.cargoPalets ? 'texto, palets' : 'descripción, cantidad';
      return falla(`Completa la línea ${mal + 1}: ${cantidadTxt} y precio.`, `lineas.${mal}.${que}`);
    }
    if (ceramica) {
      // Plantilla B: las mismas reglas que el servidor, con el campo que lo arregla.
      for (let i = 0; i < lineas.length; i++) {
        const l = lineas[i];
        const n = i + 1;
        const signo = Math.sign(cantidadDe(i));
        if (!l.cargoPalets) {
          for (const [k, entero, nombre] of [
            ['palets', true, 'los palets'],
            ['cajas', true, 'las cajas'],
            ['metros2', false, 'los m²'],
            ['piezas', false, 'las piezas'],
            ['pesoKg', false, 'el peso'],
          ] as const) {
            const v = leerCantidad(l[k]);
            if (v === null) continue;
            if (Number.isNaN(v) || (entero ? !Number.isInteger(v) : decimalesDe(v) > 3)) {
              return falla(`Línea ${n}: ${nombre} ${k === 'pesoKg' ? 'es un número' : 'son un número'}${entero ? ' entero' : ' con 3 decimales como mucho'}.`, `lineas.${i}.${k}`);
            }
            if (v !== 0 && Math.sign(v) !== signo) {
              return falla(`Línea ${n}: ${nombre} van con el mismo signo que la cantidad (en negativo solo si la cantidad lo está).`, `lineas.${i}.${k}`);
            }
          }
          if (l.unidadPrecio === 'PIEZA' && !Number.isInteger(cantidadDe(i))) {
            return falla(`Línea ${n}: las piezas son un número entero (si vendes por fracciones, pon el precio por unidad).`, `lineas.${i}.piezas`);
          }
          if (l.formato.trim().length > FORMATO_MAX) return falla(`Línea ${n}: el formato admite ${FORMATO_MAX} caracteres como mucho.`, `lineas.${i}.formato`);
          if (l.calidad.trim().length > CALIDAD_MAX) return falla(`Línea ${n}: la calidad admite ${CALIDAD_MAX} caracteres como mucho.`, `lineas.${i}.calidad`);
          const texto = problemaTextoAdicional(l.textoAdicional);
          if (texto) return falla(`Línea ${n}: ${texto.charAt(0).toLowerCase()}${texto.slice(1)}`, `lineas.${i}.textoAdicional`);
        }
      }
      if (obra.trim().length > OBRA_MAX) return falla(`La obra admite ${OBRA_MAX} caracteres como mucho.`, 'obra');
      for (const [valor, campo, nombre] of [
        [pesoNeto, 'pesoNetoKg', 'neto'],
        [pesoBruto, 'pesoBrutoKg', 'bruto'],
      ] as const) {
        const peso = leerCantidad(valor);
        if (peso !== null && (Number.isNaN(peso) || peso < 0 || decimalesDe(peso) > 3)) {
          return falla(`El peso ${nombre} son los kg de la mercancía: un número desde 0 y con 3 decimales como mucho.`, campo);
        }
      }
    }
    if (envases) {
      // Plantilla A: las mismas reglas que el servidor, con el campo que lo arregla.
      for (let i = 0; i < lineas.length; i++) {
        const l = lineas[i];
        const n = i + 1;
        const packs = leerCantidad(l.packs);
        if (packs !== null && !Number.isInteger(packs)) return falla(`Línea ${n}: los packs son un número entero.`, `lineas.${i}.packs`);
        const kg = leerCantidad(l.kgPlastico);
        if (kg !== null && (Number.isNaN(kg) || decimalesDe(kg) > 3)) {
          return falla(`Línea ${n}: los kg de plástico son un número con 3 decimales como mucho (por ejemplo, 103,089).`, `lineas.${i}.kgPlastico`);
        }
        const signo = Math.sign(num(l.cantidad));
        if (signo === 0) {
          // Solo corrige los kg de plástico: sin packs, y los kg de cualquier signo.
          if (packs) return falla(`Línea ${n}: una línea que solo corrige los kg de plástico va sin packs (deja los packs vacíos).`, `lineas.${i}.packs`);
        } else {
          if (packs && Math.sign(packs) !== signo) return falla(`Línea ${n}: los packs van con el mismo signo que las uds (en negativo solo si las uds lo están).`, `lineas.${i}.packs`);
          if (kg && Math.sign(kg) !== signo) return falla(`Línea ${n}: los kg de plástico van con el mismo signo que las uds (en negativo solo si las uds lo están).`, `lineas.${i}.kgPlastico`);
        }
        const texto = problemaTextoAdicional(l.textoAdicional);
        if (texto) return falla(`Línea ${n}: ${texto.charAt(0).toLowerCase()}${texto.slice(1)}`, `lineas.${i}.textoAdicional`);
      }
      const peso = leerCantidad(pesoBruto);
      if (peso !== null && (Number.isNaN(peso) || peso < 0 || decimalesDe(peso) > 3)) {
        return falla('El peso bruto son los kg de la mercancía: un número desde 0 y con 3 decimales como mucho.', 'pesoBrutoKg');
      }
      if (monedaDoc !== 'EUR' && resumen.ieepnr !== 0) {
        return falla(`El IEEPNR solo se repercute en euros y esta factura va en ${monedaDoc}. Hazla en euros o quita los kg de plástico.`, 'moneda');
      }
    }
    if (enDivisa && tipoManual.trim() && !(manual > 0)) return falla('El tipo de cambio tiene que ser un número mayor que cero.', 'tipoCambio');
    if (enDivisa && tipoManual.trim() && bce?.tipoCambio && pareceInvertido(manual, bce.tipoCambio)) return falla(avisoTipo, 'tipoCambio');
    if (esRect && !compat) {
      // Por diferencias, cada línea lleva la retención de la factura de la que sale.
      if (!sustitucion && !sinRetencion) {
        if (retencionesDistintas.length > 1) {
          return falla(
            `Las líneas vienen de facturas con retenciones distintas (${retencionesDistintas.map((t) => (t ? `${t} %` : 'sin retención')).join(' y ')}) y una rectificativa lleva una sola. Haz una rectificativa para cada retención: deja aquí solo las líneas de una.`,
            'lineas',
          );
        }
        const otra = lineas.findIndex((l) => l.retencionOrigen !== undefined && l.retencionOrigen !== irpf);
        if (otra >= 0) {
          const l = lineas[otra];
          const de = l.origenId && datos[l.origenId] ? `la ${datos[l.origenId].original.numeroCompleto}` : 'la factura que rectificas';
          return falla(
            `La línea ${otra + 1} viene de ${de}, que va ${textoRetencion(l.retencionOrigen as number)}, y la rectificativa va ${textoRetencion(irpf)}. Elige ${l.retencionOrigen ? `el ${l.retencionOrigen} %` : '«Sin retención»'} en «Retención de IRPF».`,
            'tipoRetencion',
          );
        }
      }
      // Devolución, descuento, rappel, impago y concurso solo restan (el servidor lo vuelve a mirar).
      if (infoR?.soloResta) {
        const resta = sustitucion ? diferencia : { base: totales.base, total: totales.total };
        if (resta && !(resta.base < 0 && resta.total < 0)) {
          return falla(
            sustitucion
              ? `${infoR.texto}: la factura corregida tiene que quedar por debajo de la original.`
              : `${infoR.texto}: tiene que restar. Escribe las cantidades en negativo (por ejemplo, -2).`,
            'lineas',
          );
        }
      }
      const r = faltaEnReparto(rectEnviar, repartoLineas.porOriginal, calculo.cuenta ?? totales);
      if (r) {
        // Las líneas añadidas a mano no son de ninguna factura: su parte no sale sola.
        const aMano = r.campo === 'rectificativa.originales' && repartoLineas.sinOriginal;
        return falla(aMano ? `${r.mensaje} Las líneas añadidas a mano no son de ninguna factura: suma su importe a la parte de alguna.` : r.mensaje, r.campo);
      }
    }
    if (emitir && !esProforma) {
      if (emisionBloqueada) return falla(redSeguridad?.motivo ?? 'Ahora mismo no se pueden emitir facturas de esta empresa.');
      if (fechaEmision > hoy()) return falla('La fecha de emisión no puede ser posterior a hoy. Guarda el borrador y pásalo a factura ese día.', 'fechaEmision');
      if (simplificadaExcedida) {
        return falla('Una factura simplificada no puede pasar de 3.000 € (base más IVA). Cámbiala a completa (F1) para emitirla.', 'tipoFactura');
      }
      // Al rectificar una factura de la app, el tipo de operación es el suyo.
      if (espanola && !tipoOperacion && !(esRect && conOriginalApp)) return falla('Elige el tipo de operación de la factura.', 'tipoOperacion');
      if (enDivisa && !tipoAplicado) return falla(`Sin tipo de cambio del BCE: indica el tipo a mano (1 ${monedaCuenta} = … ${monedaDoc}).`, 'tipoCambio');
      // Al emitir nunca vale un tipo viejo: el que se ve es orientativo (de dias anteriores).
      if (enDivisa && !tipoHeredado && !tipoManual.trim() && bce?.provisional) {
        return falla(
          `Aún no está el tipo del BCE de la fecha de la operación (el que se ve es orientativo, del ${fechaES(bce.fechaTipoCambio)}): indica el tipo a mano o guarda el borrador y pásalo a factura más tarde.`,
          'tipoCambio',
        );
      }
      const errores = revision?.revision?.errores ?? [];
      if (errores.length > 0) return falla(errores.map((e) => e.mensaje).join(' '));
    }
    return null;
  };

  // Número que tendrá la rectificativa (para la confirmación).
  const numeroRect = serieElegidaRect
    ? `número ${serieElegidaRect.codigo}-${(serieElegidaRect.ultimoNumero ?? 0) + 1}, aprox.`
    : serieTicketsSeCrea
      ? `el primero de la serie ${opciones?.series.tickets.codigo ?? 'RT'}, que se crea ahora`
      : 'con el siguiente número de la serie de rectificativas';

  const guardar = async (emitir: boolean) => {
    const fallo = comprobar(emitir);
    if (fallo) {
      setError(fallo.mensaje);
      setCampoError(fallo.campo);
      setIntentoFallido((n) => n + 1);
      return;
    }
    setCampoError(undefined);
    // Un borrador o una proforma guardados con otra plantilla que la que usa hoy su serie (se
    // cambió en Configuración > Series): al guardarlo pasa a la de ahora y pierde lo que esta no
    // lleva. Se pregunta una vez.
    if (plantillaGuardada !== null && normalizarPlantilla(plantillaGuardada) !== plantilla) {
      const p = perdidasDePlantilla(plantilla, normalizarPlantilla(plantillaGuardada));
      const pierde = [
        p.datos ? `${p.datos} (esa plantilla no los lleva)` : null,
        p.descuentos ? `los descuentos por línea (la plantilla ${NOMBRE_PLANTILLA[plantilla]} no los lleva: tendrás que poner el precio ya rebajado)` : null,
      ]
        .filter(Boolean)
        .join(' y ');
      if (
        pierde &&
        !window.confirm(
          `Este documento se guardó con la plantilla ${NOMBRE_PLANTILLA[normalizarPlantilla(plantillaGuardada)]} y su serie usa ahora la ${NOMBRE_PLANTILLA[plantilla]}. Al guardarlo se quitan ${pierde}.\n\n¿Guardar igualmente?`,
        )
      ) {
        return;
      }
      setPlantillaGuardada(plantilla);
    }
    if (emitir) {
      const siguiente = (serieElegida?.ultimoNumero ?? 0) + 1;
      const tipoTxt =
        enDivisa && !tipoHeredado
          ? `\n\nTipo de cambio: ${tipoManual.trim() ? `${textoTipo(monedaCuenta, monedaDoc, manual)} (indicado a mano)` : `el del BCE del día de la operación${tipoAplicado ? ` (hoy, ${textoTipo(monedaCuenta, monedaDoc, tipoAplicado)})` : ''}`}.`
          : '';
      const ok = window.confirm(
        esRect
          ? `Vas a emitir ${totales.total < 0 ? 'el abono' : 'la rectificativa'} por ${fmt(totales.total)} (${numeroRect}).\n\n` +
              'Una vez emitida recibirá el número de la serie de rectificativas y no se podrá modificar ni borrar.'
          : `Vas a pasar a factura por ${fmt(totales.total)} (número ${serie}-${siguiente}, aprox.).${tipoTxt}\n\n` +
              'Una vez pasada a factura recibirá el número de la serie y no se podrá modificar ni borrar; solo corregir con una rectificativa.',
      );
      if (!ok) return;
    }
    setGuardando(true);
    setError('');
    try {
      let id = borradorId ?? idCreado;
      if (id) {
        const r = await apiFetch<{ invoice?: { avisosFiscales?: AvisoFiscal[] } } | null>(companyPath(`/income-invoices/${id}`), {
          method: 'PUT',
          body: JSON.stringify(cuerpo()),
        });
        // Rectificativa: los avisos que no bloquean (IVA al periodo de la original, plazos...) se enseñan en la ficha.
        if (esRect) guardarAvisosVenta(id, r?.invoice?.avisosFiscales);
      } else {
        // Primer cliente de una empresa española sin el plan de la gestoría: se pregunta antes.
        const creada = await avisoPlan.intentar((extra) =>
          apiFetch<{ invoice: { id: string; avisosFiscales?: AvisoFiscal[] } }>(companyPath('/income-invoices'), {
            method: 'POST',
            body: JSON.stringify(esProforma ? { ...cuerpo(), proforma: true, ...extra } : { ...cuerpo(), borrador: true, ...extra }),
          }),
        );
        if (creada === null) {
          setGuardando(false);
          return;
        }
        const { invoice } = creada;
        id = invoice.id;
        // Si pasarlo a factura falla, el siguiente intento modifica este borrador (no crea otro).
        setIdCreado(invoice.id);
        if (esRect) guardarAvisosVenta(invoice.id, invoice.avisosFiscales);
      }
      if (esRect) setModoGuardado(ticket ? 'ticket' : 'rectificativa');
      if (emitir && !esProforma) {
        // Operación de un periodo cuyo 303 presenta la gestoría: se pregunta antes de emitirla.
        const emitida = await conDevengoFuera(
          (extra) =>
            apiFetch<{ invoice: { contabilizada?: boolean; motivoSinAsiento?: string | null; avisosFiscales?: AvisoFiscal[] } }>(
              companyPath(`/income-invoices/${id}/finalizar`),
              {
                method: 'POST',
                body: JSON.stringify({ fechaEmision, ...(enDivisa && !tipoHeredado && tipoManual.trim() ? { tipoCambio: manual } : {}), ...extra }),
              },
            ),
          esRect ? '¿La emites igualmente?' : undefined,
        );
        if (emitida === null) {
          // Sin confirmar: queda guardada como borrador.
          setGuardando(false);
          setError(`No se ha ${esRect ? 'emitido' : 'pasado a factura'}: queda guardada como borrador.`);
          return;
        }
        const { invoice } = emitida.r;
        if (esRect) guardarAvisosVenta(id, invoice.avisosFiscales);
        if (invoice.contabilizada === false) {
          try {
            sessionStorage.setItem(`conta_sin_asiento_${id}`, invoice.motivoSinAsiento || 'No se pudo contabilizar.');
          } catch {
            // Sin sessionStorage: la ficha no muestra el aviso, pero tiene el boton de contabilizar.
          }
        }
      }
      router.push(`/dashboard/${esProforma ? 'proformas' : 'facturas'}/${id}`);
    } catch (e) {
      setError(errorMessage(e));
      // El campo que señala el servidor (details.campo) se marca y recibe el foco.
      setCampoError(campoDelError(e));
      setIntentoFallido((n) => n + 1);
      setGuardando(false);
    }
  };

  if (cargando) return <p className="p-6 text-slate-500">Cargando…</p>;

  const titulo = esProforma
    ? borradorId
      ? `Editar proforma ${numeroProforma}`.trim()
      : 'Nueva proforma'
    : esRect
      ? borradorId
        ? 'Editar borrador de rectificativa'
        : ticket
          ? 'Nueva rectificativa de un ticket'
          : 'Nueva rectificativa o abono'
      : borradorId
        ? 'Editar borrador'
        : 'Nueva factura';

  const revisionErrores = revision?.revision?.errores ?? [];
  const avisosFiscales = [
    ...(revision?.avisosCliente ?? contexto?.avisosCliente ?? []),
    ...(revision?.revision?.avisos ?? []),
  ]
    // Sin repetir, y sin lo que ya sale como error.
    .filter((a, i, arr) => arr.findIndex((b) => b.codigo === a.codigo) === i && !revisionErrores.some((e) => e.codigo === a.codigo));
  const supuestosLista = tipoOperacion === 'EXENTA' ? contexto?.supuestosExencion ?? [] : tipoOperacion === 'ISP_NACIONAL' ? contexto?.supuestosIsp ?? [] : [];
  const etiquetaSinCuota = regla && !regla.llevaCuota ? regla.etiquetaCorta : 'Sin IVA';
  // Lo que resta (abonos), en rojo.
  const rojo = (n: number) => (n < 0 ? 'text-red-700' : '');

  /** El IVA de una línea (desplegable o «Sin IVA»), para los editores de la plantilla A y de la B. */
  const ivaDeLinea = (l: { clave: number; tipoIva: number }, i: number) =>
    espanola ? (
      sinCuota ? (
        <>
          <p className="mb-1 text-xs font-medium text-slate-600">IVA</p>
          <p className={`${campo} whitespace-nowrap bg-slate-100 text-slate-600`} title="El tipo de operación no lleva IVA">
            {etiquetaSinCuota}
          </p>
        </>
      ) : (
        <>
          <label htmlFor={`linea-${i}-iva`} className="mb-1 block text-xs font-medium text-slate-600">
            IVA
          </label>
          <select
            id={`linea-${i}-iva`}
            aria-label={`IVA de la línea ${i + 1}`}
            className={campo}
            value={l.tipoIva}
            onChange={(e) => cambiarLinea(l.clave, { tipoIva: Number(e.target.value) })}
          >
            {IVAS.map((t) => (
              <option key={t} value={t}>
                {t} %
              </option>
            ))}
          </select>
        </>
      )
    ) : null;

  /** La cuenta de ingresos de una línea (CuentaLinea), para los editores de la plantilla A y de la B. */
  const cuentaDeLinea = (l: { clave: number; productoServicioId: string; cargoPalets?: boolean }, i: number) => (
    <CuentaLinea
      tipo="venta"
      catalogo={catalogoCuentas}
      valor={lineas[i]?.cuenta}
      onCambiar={(codigo) => cambiarLinea(l.clave, { cuenta: codigo ?? undefined })}
      porDefecto={
        l.cargoPalets && cuentaPaletsAjustes
          ? { codigo: cuentaPaletsAjustes, texto: 'la de los palets (Configuración > Facturación)' }
          : cuentaPorDefecto(productos.find((p) => p.id === l.productoServicioId))
      }
      linea={i + 1}
      id={`fv-cuenta-${l.clave}`}
      puedeCrear={puedeCrearCuenta}
    />
  );

  // Título, avisos generales, error y tipo de factura: igual con el servidor anterior.
  const cabecera = (
    <>
      {avisoPlan.dialogo}
      <div className="flex items-center gap-3">
        <Link
          href={esProforma ? '/dashboard/proformas' : '/dashboard/facturas'}
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          aria-label={esProforma ? 'Volver a proformas' : 'Volver a facturas'}
        >
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">{titulo}</h1>
        <Tooltip
          text={
            esProforma
              ? 'La proforma recibe su número P al guardarla. No es una factura: no cuenta para el IVA ni la contabilidad. Si el cliente la acepta, pásala a factura desde su ficha.'
              : esRect
                ? 'Guárdala como borrador mientras la preparas. Al emitirla recibe el siguiente número de la serie de rectificativas y ya no se puede cambiar.'
                : 'Guarda como borrador mientras la preparas. Al pasarla a factura recibe el siguiente número de la serie y ya no se puede cambiar.'
          }
        />
      </div>

      {esProforma && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          Documento sin validez fiscal: se guarda tal cual, sin contabilizarse ni contar para el IVA.
        </p>
      )}

      {contexto && !espanola && (
        <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          Tu empresa no está establecida en España: la factura va sin IVA ni retención, en{' '}
          {monedaCuenta === 'USD' ? 'dólares' : monedaCuenta === 'EUR' ? 'euros' : monedaCuenta} ({monedaCuenta}) y el PDF sale en inglés.
        </p>
      )}

      {errorContexto && !contexto && (
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          No se han podido cargar los datos fiscales de la empresa ({errorContexto}). Puedes guardar el borrador, pero no pasarlo a factura hasta que se carguen.
        </p>
      )}

      {!esProforma && <AvisoRedSeguridad estado={redSeguridad} donde="formulario" />}

      {error && (
        <p id="nf-error" role="alert" tabIndex={-1} className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 focus:outline-none">
          {error}
        </p>
      )}

      {(espanola || !esProforma) && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
          <div className="max-w-md">
            <label className={etiqueta} htmlFor="tipo">
              Tipo de factura
            </label>
            <select id="tipo" className={campo} value={esRect ? modo : tipoFactura} onChange={(e) => cambiarTipo(e.target.value)} {...(esRect ? {} : marca('tipoFactura'))}>
              {/* Un borrador guardado no pasa de factura a rectificativa ni al revés. */}
              {!(modoFijo && esRect) && <option value="F1">{espanola ? 'Completa (F1)' : 'Factura'}</option>}
              {espanola && !(modoFijo && esRect) && (
                <option value="F2" disabled={!!regla?.tiposFacturaProhibidos.includes('F2')}>
                  Simplificada / ticket (F2)
                </option>
              )}
              {!esProforma && !(modoFijo && !esRect) && <option value="rectificativa">Rectificativa o abono</option>}
              {!esProforma && espanola && !compat && !(modoFijo && !esRect) && <option value="ticket">Rectificativa de un ticket</option>}
            </select>
            {avisoBorradorTicket && borradorSinSerieTickets && (
              <p role="alert" className="mt-1 rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
                {TEXTO_BORRADOR_SIN_TICKETS}{' '}
                <Link href="/dashboard/configuracion/series" className="font-medium underline">
                  Ir a Configuración &gt; Series
                </Link>
              </p>
            )}
            {!esRect && tipoFactura === 'F2' && (
              <p className={`mt-1 text-xs ${simplificadaExcedida ? 'text-red-700' : 'text-slate-500'}`}>
                {simplificadaExcedida
                  ? `Esta factura suma ${fmtCuenta(totalSimplificada ?? 0)} con IVA: una simplificada solo llega a 3.000 €. Cámbiala a completa (F1).`
                  : 'Hasta 3.000 € con IVA. En VERI*FACTU la simplificada no lleva los datos del cliente: si hay que identificarlo, usa la completa (F1).'}
              </p>
            )}
            {esRect && (
              <p className="mt-1 text-xs text-slate-500">
                {ticket
                  ? 'Corrige un ticket o una factura simplificada ya emitidos. Va en su propia serie, distinta de la de rectificativas.'
                  : 'Corrige o anula, entera o en parte, una factura ya emitida. Va en la serie de rectificativas, nunca en una serie de facturas.'}
              </p>
            )}
          </div>
        </section>
      )}
    </>
  );

  // Servidor anterior a las rectificativas nuevas: desde aquí solo el abono de una factura de fuera.
  if (compat && !compatFuera) {
    return (
      <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
        {cabecera}
        <AvisoServidorAnterior facturaId={borradorId ?? params.get('rectifica') ?? rect.originales.find((o) => o.origen === 'app')?.id ?? null} />
      </div>
    );
  }

  // Una original ya sustituida se rectifica sobre su sustituta: las líneas propuestas son las de esa.
  const sustitutas = idsApp.map((id) => datos[id]?.lineasDe?.numeroCompleto).filter((n): n is string => !!n);
  const deDondeSalen =
    sustitutas.length === 0
      ? 'las de la factura que rectificas'
      : idsApp.length === 1
        ? `las de la ${sustitutas[0]}, que sustituyó a la factura que rectificas`
        : `las de cada factura que rectificas (de su sustituta si se sustituyó: ${sustitutas.join(', ')})`;
  // Anulada por completo: solo se puede deshacer la anulación, con las líneas en positivo.
  const anuladas = idsApp.map((id) => datos[id]).filter((d): d is NonNullable<typeof d> => !!d && anuladaEntera(d)).map((d) => d.original.numeroCompleto);

  // Reparto entre varias facturas: sin signo, y lo que tienen que sumar.
  const textoReparto =
    `Reparto: sale de las líneas de cada factura. Cámbialo solo si quieres repartirlo de otra forma${restaRect ? '; escribe los importes sin signo (se restan, como el abono)' : ''}. ` +
    `Entre todas tienen que sumar lo mismo que la rectificativa: base ${fmtCuenta(Math.abs((calculo.cuenta ?? totales).base))} e IVA ${fmtCuenta(Math.abs((calculo.cuenta ?? totales).iva))}` +
    `${(calculo.cuenta ?? totales).retencion ? `, retención ${fmtCuenta(Math.abs((calculo.cuenta ?? totales).retencion))}` : ''}.` +
    (repartoLineas.sinOriginal ? ' Las líneas añadidas a mano no son de ninguna factura: suma su importe a la parte de alguna.' : '');

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      {cabecera}

      {compatFuera && (
        <BloqueRectificaFueraAnterior
          numero={rect.originales[0]?.numero ?? ''}
          fecha={rect.originales[0]?.fecha ?? ''}
          motivo={rect.explicacion}
          guardada={!!borradorId}
          marca={marca}
          onCambio={(c) =>
            setRect((r) => ({
              ...r,
              ...(c.motivo !== undefined ? { explicacion: c.motivo } : {}),
              originales: r.originales.map((o, i) => (i === 0 ? { ...o, ...(c.numero !== undefined ? { numero: c.numero } : {}), ...(c.fecha !== undefined ? { fecha: c.fecha } : {}) } : o)),
            }))
          }
        />
      )}

      {esRect && !compat && (
        <BloqueRectificativaVenta
          valor={rect}
          onCambio={setRect}
          opciones={opciones}
          errorOpciones={errorOpciones}
          onReintentarOpciones={recargarOpciones}
          ticket={ticket}
          clienteId={clienteId || null}
          datos={datos}
          erroresDatos={erroresDatos}
          reparto={repartoLineas.porOriginal}
          repartoSinSigno
          textoReparto={textoReparto}
          conRetencion={!sinRetencion && irpf > 0}
          monedaCuenta={monedaCuenta}
          marca={marca}
          espanola={espanola}
          error={error ? { campo: campoError, mensaje: error } : null}
        />
      )}

      <section className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-3">
        <div className="md:col-span-2">
          {esRect && conOriginalApp ? (
            <>
              <p className={etiqueta}>Cliente</p>
              <p id="cliente" tabIndex={-1} className={`${campo} bg-slate-50 text-slate-700`}>
                <span className="sr-only">Cliente: </span>
                {datosPrincipal
                  ? `${datosPrincipal.original.cliente.nombreFiscal}${datosPrincipal.original.cliente.nifCif ? ` — ${datosPrincipal.original.cliente.nifCif}` : ''}`
                  : 'Cargando…'}
              </p>
              <p className="mt-1 text-xs text-slate-500">Es el de la factura que rectificas y no se puede cambiar.</p>
            </>
          ) : (
            <>
              <label className={etiqueta} htmlFor="cliente">Cliente</label>
              <select id="cliente" className={campo} value={clienteId} onChange={(e) => setClienteId(e.target.value)} {...marca('customer', 'customer.id', 'clienteId')}>
                <option value="">Elige un cliente…</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombreFiscal} — {c.nifCif}
                    {c.pais && c.pais !== 'ES' ? ` (${c.pais})` : ''}
                  </option>
                ))}
              </select>
              {clientes.length === 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  No hay clientes. <Link href="/dashboard/clientes" className="text-blue-700 underline">Da de alta uno</Link> antes de facturar.
                </p>
              )}
            </>
          )}
        </div>
        <div>
          <label className={etiqueta} htmlFor="serie">Serie</label>
          {esRect ? (
            seriesRect === null ? (
              <p id="serie" className={`${campo} bg-slate-50 text-slate-500`}>
                Cargando…
              </p>
            ) : errorSeriesRect ? (
              <p id="serie" tabIndex={-1} role="alert" className="mt-1 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                No se han podido cargar las series de rectificativas: {errorSeriesRect}{' '}
                <button type="button" className="font-medium underline" onClick={() => setVueltaSeriesRect((n) => n + 1)}>
                  Reintentar
                </button>
              </p>
            ) : seriesRect.length === 0 ? (
              serieTicketsSeCrea ? (
                <p id="serie" tabIndex={-1} className={`${campo} bg-slate-50 text-slate-600`}>
                  {opciones?.series.tickets.codigo ?? 'RT'}: se crea al guardar
                </p>
              ) : (
                <p id="serie" tabIndex={-1} className="mt-1 rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
                  {seriesRectDesactivadas ? `Las series de ${tipoSeriesRect} están desactivadas.` : `No hay ninguna serie de ${tipoSeriesRect} activa.`}{' '}
                  <Link href="/dashboard/configuracion/series" className="font-medium underline">
                    {seriesRectDesactivadas ? 'Activa una en Configuración' : 'Actívala o crea una en Configuración'}
                  </Link>
                  .
                </p>
              )
            ) : (
              <select
                id="serie"
                className={campo}
                value={serieRect}
                onChange={(e) => {
                  const v = e.target.value;
                  // Con una factura de la app, la plantilla es la suya: la serie no la cambia.
                  if (conOriginalApp || confirmarPlantilla(seriesRect.find((s) => s.codigo === v)?.plantilla)) setSerieRect(v);
                }}
                {...marca('serie')}
              >
                {seriesRect.map((s) => (
                  <option key={s.id} value={s.codigo}>
                    {s.codigo} — {s.descripcion}
                  </option>
                ))}
              </select>
            )
          ) : esProforma ? (
            <p id="serie" className={`${campo} bg-slate-50 text-slate-600`}>
              {numeroProforma ? `Proforma ${numeroProforma}` : 'Proformas (P): el número se asigna al guardar'}
            </p>
          ) : series.length === 0 && !cargando ? (
            <p id="serie" className="mt-1 rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
              No hay ninguna serie de facturas activa.{' '}
              <Link href="/dashboard/configuracion/series" className="font-medium underline">
                Actívala o crea una en Configuración
              </Link>
              .
            </p>
          ) : (
            <select
              id="serie"
              className={campo}
              value={serie}
              onChange={(e) => {
                const v = e.target.value;
                if (confirmarPlantilla(series.find((s) => s.codigo === v)?.plantilla)) setSerie(v);
              }}
              {...marca('serie')}
            >
              {series.map((s) => (
                <option key={s.id} value={s.codigo}>
                  {s.codigo} — {s.descripcion}
                </option>
              ))}
            </select>
          )}
          {/* La plantilla sale de la serie (Configuración > Series); la A y la B cambian las líneas. */}
          {envases && (
            <p className="mt-1 text-xs text-slate-500">
              {esRect && conOriginalApp
                ? 'Plantilla A (envases): la de la factura que rectificas.'
                : 'Plantilla A (envases): packs, uds, kg de plástico e IEEPNR, sin descuento por línea.'}
            </p>
          )}
          {ceramica && (
            <p className="mt-1 text-xs text-slate-500">
              {esRect && conOriginalApp
                ? 'Plantilla B (cerámica): la de la factura que rectificas.'
                : 'Plantilla B (cerámica): obra, palets, cajas, m², piezas, formato, calidad, peso y palets de madera, sin descuento por línea.'}
            </p>
          )}
          {esRect && (
            <p className="mt-1 text-xs text-slate-500">
              {ticket ? 'Solo series de rectificativas de tickets.' : 'Solo series de rectificativas, nunca una de facturas.'}
            </p>
          )}
        </div>

        {espanola && contexto && esRect && conOriginalApp && (
          <>
            <div className="md:col-span-2">
              <p className={etiqueta}>Tipo de operación (IVA)</p>
              <p id="tipo-operacion" className={`${campo} bg-slate-50 text-slate-700`}>
                {regla?.etiqueta ?? (tipoOperacion || 'Sin indicar en la factura que rectificas')}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                El de la factura que rectificas: no se puede cambiar, tampoco por sustitución.{referenciaLegal ? ` ${referenciaLegal}.` : ''} Si lo que está mal es el tipo de
                operación (por ejemplo, se cobró IVA en una venta exenta), anula la factura con una rectificativa por diferencias y emite después una factura nueva con el
                tipo correcto.
              </p>
            </div>
            <div className="hidden md:block" />
          </>
        )}
        {espanola && contexto && !(esRect && conOriginalApp) && (
          <>
            <div className="md:col-span-2">
              <label className={etiqueta} htmlFor="tipo-operacion">
                Tipo de operación (IVA)
              </label>
              <select
                id="tipo-operacion"
                className={campo}
                value={tipoOperacion}
                {...marca('tipoOperacion')}
                onChange={(e) => {
                  setTipoTocado(true);
                  aplicarTipo(e.target.value);
                }}
              >
                <option value="">Elige…</option>
                {contexto.tipos.map((t) => (
                  <option key={t.codigo} value={t.codigo}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
              {tipoTocado && clienteId && sugerido && sugerido !== tipoOperacion && (
                <p className="mt-1 text-xs text-slate-600">
                  Para este cliente se suele usar «{contexto.tipos.find((t) => t.codigo === sugerido)?.etiqueta ?? sugerido}».{' '}
                  <button type="button" className="font-medium text-blue-700 underline" onClick={() => aplicarTipo(sugerido)}>
                    Aplicar
                  </button>
                </p>
              )}
            </div>
            {supuestosLista.length > 0 ? (
              <div>
                  <label className={etiqueta} htmlFor="supuesto">
                    {tipoOperacion === 'EXENTA' ? 'Supuesto de exención' : 'Supuesto (opcional)'}
                  </label>
                  <select id="supuesto" className={campo} value={supuesto} onChange={(e) => setSupuesto(e.target.value)}>
                    <option value="">{tipoOperacion === 'EXENTA' ? 'Elige…' : 'Sin indicar'}</option>
                    {supuestosLista.map((s) => (
                      <option key={s.codigo} value={s.codigo}>
                        {s.etiqueta}
                      </option>
                    ))}
                  </select>
                  {supuesto === 'OTRO' && (
                    <input
                      aria-label="Precepto legal"
                      className={`${campo} mt-2`}
                      maxLength={200}
                      value={referenciaLegal}
                      placeholder={tipoOperacion === 'EXENTA' ? 'Ej.: art. 20.Uno.12.º Ley 37/1992' : 'Ej.: g)'}
                      onChange={(e) => setReferenciaLegal(e.target.value)}
                    />
                  )}
              </div>
            ) : (
              <div className="hidden md:block" />
            )}
          </>
        )}

        <div>
          <label className={etiqueta} htmlFor="moneda">Moneda</label>
          <select
            id="moneda"
            className={campo}
            value={monedaDoc}
            disabled={!contexto || !espanola || (contexto.monedasFactura?.length ?? 0) < 2 || (esRect && conOriginalApp)}
            onChange={(e) => void cambiarMoneda(e.target.value)}
            {...marca('moneda')}
          >
            {(contexto?.monedasFactura ?? [{ codigo: monedaCuenta, nombre: monedaCuenta, simbolo: monedaCuenta }]).map((m) => (
              <option key={m.codigo} value={m.codigo}>
                {m.codigo} — {NOMBRE_MONEDA[m.codigo] ?? m.nombre}
              </option>
            ))}
          </select>
        </div>
        {enDivisa && esRect && conOriginalApp && (
          <div className="md:col-span-2">
            <p className={etiqueta}>Tipo de cambio</p>
            <p id="tipo-cambio" className="text-sm text-slate-700">
              {tipoHeredado ? <span className="font-mono">{textoTipo(monedaCuenta, monedaDoc, tipoHeredado)}</span> : 'Cargando…'}{' '}
              <span className="text-xs text-slate-500">(el de la factura que rectificas)</span>
            </p>
          </div>
        )}
        {enDivisa && !(esRect && conOriginalApp) && (
          <div className="md:col-span-2">
            <label className={etiqueta} htmlFor="tipo-cambio">
              Tipo de cambio
            </label>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
              <span className="whitespace-nowrap">1 {monedaCuenta} =</span>
              <input
                id="tipo-cambio"
                inputMode="decimal"
                className={`${campo.replace('w-full ', '')} w-32 text-right font-mono`}
                value={tipoManual || (bce?.tipoCambio ? formatoTipo(bce.tipoCambio) : '')}
                placeholder={bceCargando ? 'Buscando…' : '0,0000'}
                onChange={(e) => {
                  setTipoManual(e.target.value);
                  setVolverAlBce(false);
                }}
              />
              <span>{monedaDoc}</span>
              {tipoManual.trim() ? (
                <>
                  <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs">Indicado a mano</span>
                  {bce?.tipoCambio && (
                    <button
                      type="button"
                      className="text-xs font-medium text-blue-700 underline"
                      onClick={() => {
                        setTipoManual('');
                        setVolverAlBce(true);
                      }}
                    >
                      Usar el del BCE ({formatoTipo(bce.tipoCambio)})
                    </button>
                  )}
                </>
              ) : (
                bce?.tipoCambio && (
                  <span className="text-xs text-slate-500">
                    BCE {fechaES(bce.fechaTipoCambio)}
                    {bce.provisional ? ' · provisional' : ''}
                  </span>
                )
              )}
            </div>
            {avisoTipo && <p className="mt-1 text-xs text-amber-700">{avisoTipo}</p>}
            {bceError && !tipoManual.trim() && <p className="mt-1 text-xs text-amber-700">{bceError}</p>}
            {!esProforma && (
              <p className="mt-1 text-xs text-slate-500">
                Se toma el tipo de referencia del BCE de la fecha de la operación; el definitivo se fija al pasarla a factura. Si lo cambias, queda el tuyo.
              </p>
            )}
          </div>
        )}

        <div>
          <label className={etiqueta} htmlFor="forma-pago">Forma de pago</label>
          <select id="forma-pago" className={campo} value={formaPago} onChange={(e) => setFormaPago(e.target.value)}>
            {FORMAS_PAGO.map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={etiqueta} htmlFor="emision">Fecha de emisión</label>
          <input
            id="emision"
            type="date"
            className={campo}
            {...marca('fechaEmision')}
            value={fechaEmision}
            onChange={(e) => {
              setFechaEmision(e.target.value);
              if (!vencimientoTocado && /^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setFechaVencimiento(masDias(e.target.value, diasVencimiento));
            }}
          />
        </div>
        <div>
          <label className={etiqueta} htmlFor="vencimiento">Vencimiento</label>
          <input
            id="vencimiento"
            type="date"
            className={campo}
            {...marca('fechaVencimiento')}
            value={fechaVencimiento}
            onChange={(e) => {
              setFechaVencimiento(e.target.value);
              setVencimientoTocado(true);
            }}
          />
        </div>
        {/* Una rectificativa no lleva fecha de la operación. */}
        {!esRect && (
          <div>
            <label className={etiqueta} htmlFor="operacion">
              Fecha de la operación <span className="font-normal text-slate-500">(si es distinta)</span>
            </label>
            <input
              id="operacion"
              type="date"
              className={campo}
              max={fechaEmision}
              value={fechaOperacion}
              onChange={(e) => setFechaOperacion(e.target.value)}
              {...marca('fechaOperacion')}
            />
          </div>
        )}
      </section>

      {espanola && contexto && clienteId && (revision?.mencion || revisionErrores.length > 0 || avisosFiscales.length > 0) && (
        <section className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          {revision?.mencion && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Mención en la factura</p>
              <p className="mt-0.5 text-slate-800">{revision.mencion.es}</p>
              {revision.mencion.en && <p className="text-slate-500">{revision.mencion.en}</p>}
            </div>
          )}
          {revisionErrores.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
              {revisionErrores.map((e) => (
                <li key={e.codigo} className="flex gap-2">
                  <WarningCircle size={16} className="mt-0.5 shrink-0" /> {e.mensaje}
                </li>
              ))}
            </ul>
          )}
          {avisosFiscales.length > 0 && (
            <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
              {avisosFiscales.map((a) => (
                <li key={a.codigo} className="flex gap-2">
                  <WarningCircle size={16} className="mt-0.5 shrink-0" /> {a.mensaje}
                  {a.codigo === 'CLIENTE_SIN_NIF_IVA' && (
                    <Link href={`/dashboard/clientes/${clienteId}`} className="whitespace-nowrap font-medium underline">
                      Ficha del cliente
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
          <h2 id="lineas-titulo" tabIndex={-1} className="font-semibold text-slate-900 focus:outline-none">
            Líneas
          </h2>
          <div className="flex flex-wrap gap-2">
            {propuestaPendiente && (
              <button
                type="button"
                onClick={() => aplicarPropuesta(propuestaPendiente)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                <ArrowCounterClockwise size={16} /> Usar las líneas de la factura que rectificas
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setLineasTocadas(true);
                setLineasDeBorrador(false);
                // Plantilla B: las líneas nuevas van antes de los palets de madera (que salen en el pie).
                setLineas((ls) => {
                  const nueva = lineaVacia(sinCuota ? 0 : 21);
                  const primerCargo = ceramica ? ls.findIndex((l) => l.cargoPalets) : -1;
                  return primerCargo < 0 ? [...ls, nueva] : [...ls.slice(0, primerCargo), nueva, ...ls.slice(primerCargo)];
                });
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              <Plus size={16} /> Añadir línea
            </button>
          </div>
        </div>
        {esRect && (
          <p className="border-b border-slate-100 px-5 py-2 text-sm text-slate-600">
            {sustitucion
              ? 'Escribe la factura corregida entera, en positivo. Se registra solo la diferencia con la original.'
              : conOriginalApp && anuladas.length > 0
                ? `${anuladas.length === 1 ? `La ${anuladas[0]} ya está anulada` : `Las ${anuladas.join(', ')} ya están anuladas`} por completo: salen sus líneas en positivo, que es como se deshace la anulación. Elige el motivo (una devolución, un descuento, un rappel, un impago o un concurso no valen: solo restan) y explica por qué se deshace.`
                : conOriginalApp
                ? `Salen ${deDondeSalen}, en negativo. Deja solo lo que se devuelve o se descuenta y ajusta las cantidades. Un rappel puede ir en una línea: 1 × -500.${envases ? ' Los packs y los kg de plástico van con el mismo signo que las uds. Para corregir solo los kg de plástico (y su IEEPNR), pon 0 uds, deja los packs vacíos y escribe los kg que sobran (en negativo) o los que faltan.' : ''}`
                : 'Escribe lo que cambia: en negativo lo que baja, como una devolución o un descuento.'}
            {propuestaPendiente &&
              (lineasDeBorrador
                ? ' Son las líneas guardadas en el borrador: si quieres volver a las de la factura que rectificas, usa el botón de arriba.'
                : ' Has cambiado las líneas: si quieres volver a las de la factura que rectificas, usa el botón de arriba.')}
          </p>
        )}
        {retencionesDistintas.length > 1 && !sinRetencion && (
          <p role="status" className="flex gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2 text-sm text-amber-900">
            <WarningCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              Las facturas que rectificas llevan retenciones distintas ({retencionesDistintas.map((t) => (t ? `${t} %` : 'sin retención')).join(' y ')}) y una rectificativa lleva
              una sola. Haz una rectificativa para cada retención: deja aquí solo las líneas de una y elige su retención abajo.
            </span>
          </p>
        )}
        {envases ? (
          <LineasEnvases
            lineas={lineas}
            productos={productos}
            ieepnr={ieepnrLineas}
            totales={totalesArticulo}
            moneda={monedaDoc}
            fmt={fmt}
            onCambiar={cambiarLinea}
            onElegirProducto={elegirProducto}
            onQuitar={(clave) => {
              setLineasTocadas(true);
              setLineasDeBorrador(false);
              setLineas((ls) => ls.filter((x) => x.clave !== clave));
            }}
            marca={marca}
            iva={ivaDeLinea}
            cuenta={cuentaDeLinea}
          />
        ) : ceramica ? (
          <>
            {/* Plantilla B: la obra sale en la franja OBRA: del PDF, sobre la tabla. */}
            <div className="border-b border-slate-100 px-4 py-3 md:px-5">
              <label htmlFor="obra" className="mb-1 block text-sm font-medium text-slate-700">
                Obra <span className="font-normal text-slate-500">(opcional)</span>
              </label>
              <input
                id="obra"
                className={campo}
                value={obra}
                maxLength={OBRA_MAX}
                placeholder="La obra o el proyecto del cliente"
                onChange={(e) => setObra(e.target.value)}
                {...marca('obra')}
              />
            </div>
            <LineasCeramica
              lineas={lineas}
              productos={productos}
              importes={totalesArticulo}
              moneda={monedaDoc}
              fmt={fmt}
              onCambiar={cambiarLinea}
              onElegirProducto={elegirProducto}
              onQuitar={(clave) => {
                setLineasTocadas(true);
                setLineasDeBorrador(false);
                setLineas((ls) => ls.filter((x) => x.clave !== clave));
              }}
              onAnadirCargo={anadirCargoPalets}
              marca={marca}
              iva={ivaDeLinea}
              cuenta={cuentaDeLinea}
            />
          </>
        ) : (
        <div className="overflow-x-auto">
          <table className={`w-full text-sm ${espanola ? 'min-w-[860px]' : 'min-w-[720px]'}`}>
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 font-medium">Descripción</th>
                <th className="w-20 px-3 py-2 text-right font-medium">Cant.</th>
                <th className="w-28 px-3 py-2 text-right font-medium">Precio ({simboloMoneda(monedaDoc)})</th>
                <th className="w-20 px-3 py-2 text-right font-medium">Dto. %</th>
                {espanola && <th className="w-24 px-3 py-2 font-medium">IVA</th>}
                <th className="w-32 px-3 py-2 text-right font-medium">Importe</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lineas.map((l, i) => {
                // En una rectificativa, con signo (-0,525 da -0,53), como el servidor.
                const red = (n: number) => (esRect ? Math.sign(n) * r2(Math.abs(n)) : r2(n));
                const bruto = red(num(l.cantidad) * num(l.precioUnitario));
                const importe = red(bruto - red((bruto * num(l.descuentoPorcentaje)) / 100));
                return (
                  <Fragment key={l.clave}>
                  <tr>
                    <td className="px-3 py-2">
                      <select
                        aria-label={`Producto de la línea ${i + 1}`}
                        className={campo}
                        value={l.productoServicioId}
                        onChange={(e) => elegirProducto(l.clave, e.target.value)}
                      >
                        <option value="">Libre</option>
                        {productos.filter((p) => !p.bloqueado).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.referencia} — {p.descripcion}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        id={`linea-${i}-descripcion`}
                        aria-label={`Descripción de la línea ${i + 1}`}
                        {...marca(`lineas.${i}.descripcion`)}
                        className={campo}
                        value={l.descripcion}
                        onChange={(e) => cambiarLinea(l.clave, { descripcion: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        id={`linea-${i}-cantidad`}
                        aria-label={`Cantidad de la línea ${i + 1}`}
                        {...marca(`lineas.${i}.cantidad`)}
                        inputMode="decimal"
                        className={`${campo} text-right`}
                        value={l.cantidad}
                        onChange={(e) => cambiarLinea(l.clave, { cantidad: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        id={`linea-${i}-precioUnitario`}
                        aria-label={`Precio de la línea ${i + 1} en ${monedaDoc}`}
                        {...marca(`lineas.${i}.precioUnitario`)}
                        inputMode="decimal"
                        className={`${campo} text-right`}
                        value={l.precioUnitario}
                        onChange={(e) => cambiarLinea(l.clave, { precioUnitario: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        id={`linea-${i}-descuentoPorcentaje`}
                        aria-label={`Descuento de la línea ${i + 1}`}
                        {...marca(`lineas.${i}.descuentoPorcentaje`)}
                        inputMode="decimal"
                        className={`${campo} text-right`}
                        value={l.descuentoPorcentaje}
                        onChange={(e) => cambiarLinea(l.clave, { descuentoPorcentaje: e.target.value })}
                      />
                    </td>
                    {espanola && (
                      <td className="px-3 py-2">
                        {sinCuota ? (
                          <p className={`${campo} whitespace-nowrap bg-slate-100 text-slate-600`} title="El tipo de operación no lleva IVA">
                            {etiquetaSinCuota}
                          </p>
                        ) : (
                          <select
                            aria-label={`IVA de la línea ${i + 1}`}
                            className={campo}
                            value={l.tipoIva}
                            onChange={(e) => cambiarLinea(l.clave, { tipoIva: Number(e.target.value) })}
                          >
                            {IVAS.map((t) => (
                              <option key={t} value={t}>
                                {t} %
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                    )}
                    <td className={`px-3 py-2 text-right font-mono tabular-nums ${importe < 0 ? 'text-red-700' : 'text-slate-900'}`}>{fmt(importe)}</td>
                    <td className="px-1 py-2">
                      <button
                        type="button"
                        aria-label={`Quitar la línea ${i + 1}`}
                        disabled={lineas.length === 1}
                        onClick={() => {
                          setLineasTocadas(true);
                          setLineasDeBorrador(false);
                          setLineas((ls) => ls.filter((x) => x.clave !== l.clave));
                        }}
                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                      >
                        <Trash size={16} />
                      </button>
                    </td>
                  </tr>
                  <tr className="!border-t-0">
                    <td colSpan={espanola ? 8 : 7} className="px-3 pb-3 pt-0">
                      {/* Visible aunque la tabla se desplace de lado en el movil. */}
                      <div className="sticky left-3 max-w-[calc(100vw-4rem)] sm:max-w-none">
                        <CuentaLinea
                          tipo="venta"
                          catalogo={catalogoCuentas}
                          valor={l.cuenta}
                          onCambiar={(codigo) => cambiarLinea(l.clave, { cuenta: codigo ?? undefined })}
                          porDefecto={cuentaPorDefecto(productos.find((p) => p.id === l.productoServicioId))}
                          linea={i + 1}
                          id={`fv-cuenta-${l.clave}`}
                          puedeCrear={puedeCrearCuenta}
                        />
                      </div>
                    </td>
                  </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </section>

      {envases && (
        <ResumenEnvases
          resumen={resumen}
          pesoBruto={pesoBruto}
          onPesoBruto={setPesoBruto}
          marca={marca}
          tipoIeepnr={tipoIeepnr}
          sinIeepnr={sinIeepnr}
          monedaNoEuro={monedaDoc !== 'EUR' ? monedaDoc : null}
          ventaFuera={tipoOperacion === 'EXPORTACION' || tipoOperacion === 'INTRACOMUNITARIA' ? tipoOperacion : null}
          puedeConfigurar={tieneAlgunPermiso(getUser(), ['ventas:write'])}
          fmt={fmt}
        />
      )}
      {ceramica && (
        <ResumenCeramica resumen={resumenB} pesoNeto={pesoNeto} onPesoNeto={setPesoNeto} pesoBruto={pesoBruto} onPesoBruto={setPesoBruto} marca={marca} />
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          {espanola && (
            <div>
              <label className={etiqueta} htmlFor="irpf">
                Retención de IRPF
              </label>
              <select
                id="irpf"
                className={campo}
                value={sinRetencion ? 0 : irpf}
                disabled={sinRetencion}
                onChange={(e) => setIrpf(Number(e.target.value))}
                {...marca('tipoRetencion')}
              >
                {IRPFS.map((t) => (
                  <option key={t} value={t}>
                    {t === 0 ? 'Sin retención' : `${t} %`}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                {sinRetencion ? 'A un cliente no residente no se le aplica retención.' : 'Profesionales: 15 % (7 % los tres primeros años de actividad).'}
              </p>
            </div>
          )}
          <div>
            <label className={etiqueta} htmlFor="obs">Observaciones</label>
            <textarea
              id="obs"
              rows={3}
              className={campo}
              value={observaciones}
              placeholder="Ej.: pedido nº 1234; entrega en almacén; gracias por su confianza…"
              onChange={(e) => setObservaciones(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">
              Se imprimen en {esProforma ? 'la proforma' : 'la factura'}.
              {obsDeSerie && observaciones === obsDeSerie && ' Son las de la serie por defecto: puedes cambiarlas.'}
            </p>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <dl className="space-y-2 text-sm">
            {/* Plantilla A: el subtotal (la base del IVA) son los artículos más el IEEPNR. */}
            {envases && (
              <>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-600">Artículos</dt>
                  <dd className={`font-mono tabular-nums ${rojo(totales.base)}`}>{fmt((Math.round(totales.base * 100) - Math.round(resumen.ieepnr * 100)) / 100)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-600">
                    IEEPNR{tipoIeepnr ? ` (${formatoCantidad(tipoIeepnr, 4)} € por kg)` : ''}
                  </dt>
                  <dd className={`font-mono tabular-nums ${rojo(resumen.ieepnr)}`}>{fmt(resumen.ieepnr)}</dd>
                </div>
              </>
            )}
            {/* Plantilla B: el total bruto (la base) lleva los palets de madera. */}
            {ceramica && resumenB.cargoPalets.importe !== 0 && (
              <>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-600">Materiales</dt>
                  <dd className={`font-mono tabular-nums ${rojo(totales.base)}`}>{fmt((Math.round(totales.base * 100) - Math.round(resumenB.cargoPalets.importe * 100)) / 100)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-600">Palets de madera</dt>
                  <dd className={`font-mono tabular-nums ${rojo(resumenB.cargoPalets.importe)}`}>{fmt(resumenB.cargoPalets.importe)}</dd>
                </div>
              </>
            )}
            <div className={`flex justify-between gap-3 ${envases || (ceramica && resumenB.cargoPalets.importe !== 0) ? 'border-t border-slate-200 pt-2 font-medium' : ''}`}>
              <dt className="text-slate-600">{envases ? 'Subtotal (base imponible)' : ceramica ? 'Total bruto (base imponible)' : 'Base imponible'}</dt>
              <dd className={`font-mono tabular-nums ${rojo(totales.base)}`}>{fmt(totales.base)}</dd>
            </div>
            {espanola &&
              totales.porTipo.map((t) => (
                <div key={t.tipoIva} className="flex justify-between gap-3">
                  <dt className="text-slate-600">
                    {t.tipoIva === 0 && regla && !regla.llevaCuota ? `${regla.etiquetaCorta} sobre ${fmt(t.base)}` : `IVA ${t.tipoIva} % sobre ${fmt(t.base)}`}
                  </dt>
                  <dd className={`font-mono tabular-nums ${rojo(t.cuota)}`}>{fmt(t.cuota)}</dd>
                </div>
              ))}
            {/* En un abono la retención también es negativa: se enseña igual (el total la incluye). */}
            {totales.retencion !== 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-600">Retención IRPF {irpf} %</dt>
                <dd className="font-mono tabular-nums">{fmt(-totales.retencion)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3 border-t border-slate-300 pt-2 text-base font-bold text-slate-900">
              <dt>Total</dt>
              <dd className={`font-mono tabular-nums ${rojo(totales.total)}`}>{fmt(totales.total)}</dd>
            </div>
          </dl>
          {esRect && !sustitucion && totales.total < 0 && (
            <p className="text-xs text-slate-600">
              Es un abono: resta de lo que te debe el cliente. Lo que no quepa en lo pendiente de cobro quedará a su favor y podrás devolvérselo desde la ficha.
            </p>
          )}
          {sustitucion && datosPrincipal && diferencia && (
            <div className="rounded-lg border border-violet-200 bg-white p-3 text-sm">
              <p className="font-medium text-slate-700">Diferencia que se registra</p>
              <p className="mb-2 text-xs text-slate-500">
                La factura corregida menos la {datosPrincipal.original.numeroCompleto} ({fmt(datosPrincipal.original.totalFacturaDoc ?? datosPrincipal.original.totalFactura)}). Es lo que
                va a la contabilidad y al IVA.
              </p>
              <dl className="space-y-1">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-600">Base imponible</dt>
                  <dd className={`font-mono tabular-nums ${rojo(diferencia.base)}`}>{fmt(diferencia.base)}</dd>
                </div>
                {espanola &&
                  diferencia.porTipo.map((t) => (
                    <div key={t.tipoIva} className="flex justify-between gap-3">
                      <dt className="text-slate-600">IVA {t.tipoIva} %</dt>
                      <dd className={`font-mono tabular-nums ${rojo(t.cuota)}`}>{fmt(t.cuota)}</dd>
                    </div>
                  ))}
                {diferencia.retencion !== 0 && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-600">Retención</dt>
                    <dd className="font-mono tabular-nums">{fmt(-diferencia.retencion)}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-3 font-semibold text-slate-900">
                  <dt>Total</dt>
                  <dd className={`font-mono tabular-nums ${rojo(diferencia.total)}`}>{fmt(diferencia.total)}</dd>
                </div>
              </dl>
            </div>
          )}
          {esRect && !sustitucion && idsApp.length === 1 && datosPrincipal && calculo.cuenta && calculo.cuenta.total < 0 && -calculo.cuenta.total > datosPrincipal.restante.total + 0.005 && (
            <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {anuladaEntera(datosPrincipal)
                ? `La ${datosPrincipal.original.numeroCompleto} ya está anulada por completo: no se puede restar más. Si quieres deshacer la anulación, escribe las líneas en positivo.`
                : `Resta ${fmtCuenta(-calculo.cuenta.total)} y de la ${datosPrincipal.original.numeroCompleto} solo queda por rectificar ${fmtCuenta(datosPrincipal.restante.total)}. Revisa las líneas: así no se podrá guardar.`}
            </p>
          )}
          {enDivisa && (
            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <p className="mb-1 font-medium text-slate-700">
                Contravalor en {monedaCuenta} <span className="font-normal text-slate-500">(provisional hasta emitir)</span>
              </p>
              {calculo.cuenta ? (
                <dl className="space-y-1">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-600">Base imponible</dt>
                    <dd className="font-mono tabular-nums">{fmtCuenta(calculo.cuenta.base)}</dd>
                  </div>
                  {espanola && !sinCuota && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-600">Cuota de IVA</dt>
                      <dd className="font-mono tabular-nums">{fmtCuenta(calculo.cuenta.iva)}</dd>
                    </div>
                  )}
                  {calculo.cuenta.retencion !== 0 && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-600">Retención</dt>
                      <dd className="font-mono tabular-nums">{fmtCuenta(-calculo.cuenta.retencion)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-3 font-semibold text-slate-900">
                    <dt>Total</dt>
                    <dd className="font-mono tabular-nums">{fmtCuenta(calculo.cuenta.total)}</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-slate-500">Sin tipo de cambio todavía.</p>
              )}
            </div>
          )}
        </div>
      </section>

      {emisionBloqueada && (
        <p id="motivo-sin-emitir" className="text-left text-sm text-rose-700 sm:text-right">
          No se puede pasar a factura sin VERI*FACTU. Guarda el borrador y pásalo a factura cuando esté activo.
        </p>
      )}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        {esProforma ? (
          <button
            type="button"
            disabled={guardando}
            onClick={() => guardar(false)}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {guardando ? 'Guardando…' : 'Guardar proforma'}
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={guardando}
              onClick={() => guardar(false)}
              // Con el bloqueo, guardar el borrador es lo único que se puede hacer: pasa a ser el botón principal.
              className={emisionBloqueada ? BOTON_PRINCIPAL : BOTON_SECUNDARIO}
            >
              Guardar borrador
            </button>
            <button
              type="button"
              disabled={guardando || !contexto || emisionBloqueada}
              onClick={() => guardar(true)}
              title={emisionBloqueada ? redSeguridad?.motivo ?? undefined : undefined}
              aria-describedby={emisionBloqueada ? 'motivo-sin-emitir' : undefined}
              className={emisionBloqueada ? BOTON_SECUNDARIO : BOTON_PRINCIPAL}
            >
              {guardando ? 'Guardando…' : esRect ? 'Emitir rectificativa' : 'Pasar a factura'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
