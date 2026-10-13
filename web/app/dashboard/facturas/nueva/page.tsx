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
}

interface Serie {
  id: string;
  codigo: string;
  descripcion: string;
  activa: boolean;
  porDefecto: boolean;
  ultimoNumero?: number;
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
}

interface Linea {
  clave: number;
  productoServicioId: string;
  descripcion: string;
  cantidad: string;
  precioUnitario: string;
  descuentoPorcentaje: string;
  tipoIva: number;
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
});

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
  const l = /^lineas\.(\d+)\.(cantidad|precioUnitario|descripcion)/.exec(c);
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
        setProductos(prod.items ?? []);

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

  const elegirProducto = (clave: number, id: string) => {
    const p = productos.find((x) => x.id === id);
    if (!p) return cambiarLinea(clave, { productoServicioId: '' });
    // El precio del catalogo esta en la moneda de la contabilidad: en otra moneda se convierte al tipo propuesto.
    const precio = enDivisa && tipoAplicado ? redondear2(p.precio * tipoAplicado) : p.precio;
    const iva = IVAS.includes(p.ivaPorcentaje) ? p.ivaPorcentaje : 21;
    cambiarLinea(clave, {
      productoServicioId: p.id,
      descripcion: p.descripcion,
      precioUnitario: String(precio),
      ...(sinCuota ? { tipoIva: 0, ivaPrevio: iva } : { tipoIva: iva }),
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
  // Las rectificativas redondean con signo (-0,525 da -0,53), como el servidor.
  const lineasCalculo = useMemo(
    () =>
      lineas.map((l) => ({
        cantidad: num(l.cantidad),
        precioUnitario: num(l.precioUnitario),
        descuentoPorcentaje: num(l.descuentoPorcentaje),
        tipoIva: l.tipoIva,
        tipoRetencion: irpf,
      })),
    [lineas, irpf],
  );
  const calculo = useMemo(
    () => calcularFactura(lineasCalculo, { tipoCambio: tipoAplicado, mismaMoneda: !enDivisa, simetrico: esRect }),
    [lineasCalculo, tipoAplicado, enDivisa, esRect],
  );
  // Varias originales: lo que toca a cada una sale de las líneas propuestas desde ella.
  const repartoLineas = useMemo(
    () => repartoDeLineas(lineasCalculo.map((l, i) => ({ ...l, originalId: lineas[i]?.origenId }))),
    [lineasCalculo, lineas],
  );
  // El reparto entre varias facturas se escribe sin signo: si la rectificativa resta, cada parte va en negativo.
  const restaRect = calculo.doc.base < 0 || (calculo.doc.base === 0 && calculo.doc.total < 0);
  const rectEnviar = useMemo(() => repartoConSigno(rect, restaRect), [rect, restaRect]);
  // Por diferencias, cada línea propuesta lleva la retención de su factura y una rectificativa lleva una sola.
  const retencionesDistintas = esRect && !sustitucion ? Array.from(new Set(lineas.filter((l) => l.retencionOrigen !== undefined).map((l) => l.retencionOrigen as number))) : [];
  // Por sustitución: la factura corregida menos la original (lo que se registra).
  const diferencia = useMemo(
    () => (sustitucion && datosPrincipal ? diferenciaSustitucion(lineasCalculo, lineasCalculoDe(datosPrincipal)) : null),
    [sustitucion, datosPrincipal, lineasCalculo],
  );
  const totales = calculo.doc;
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
    const lineasCuerpo = lineas.map((l) => ({
      descripcion: l.descripcion.trim(),
      cantidad: num(l.cantidad),
      precioUnitario: num(l.precioUnitario),
      descuentoPorcentaje: num(l.descuentoPorcentaje),
      tipoIva: sinCuota ? 0 : l.tipoIva,
      tipoRetencion: sinRetencion ? 0 : irpf,
      productoServicioId: l.productoServicioId || undefined,
      // Sin cuenta, el servidor usa la del producto (o la 700).
      ...(l.cuenta ? { cuenta: l.cuenta } : {}),
      moneda: monedaDoc,
    }));
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
        observaciones: observaciones.trim() || undefined,
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
        observaciones: observaciones.trim() || undefined,
        // Con una original de la app, la moneda, el tipo de cambio y el tipo de operación son los suyos.
        ...(conOriginalApp
          ? {}
          : { moneda: monedaDoc, ...(enDivisa && tipoManual.trim() ? { tipoCambio: manual } : volverAlBce ? { tipoCambio: null } : {}), ...fiscal }),
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
      observaciones: observaciones.trim() || undefined,
      moneda: monedaDoc,
      // Solo el tipo escrito a mano; sin el, el del BCE (null: volver al del BCE).
      ...(enDivisa && tipoManual.trim() ? { tipoCambio: manual } : volverAlBce ? { tipoCambio: null } : {}),
      ...fiscal,
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
    const mal = lineas.findIndex((l) => !l.descripcion.trim() || num(l.cantidad) === 0 || l.precioUnitario === '');
    if (mal >= 0) {
      const l = lineas[mal];
      const que = !l.descripcion.trim() ? 'descripcion' : num(l.cantidad) === 0 ? 'cantidad' : 'precioUnitario';
      return falla(`Completa la línea ${mal + 1}: descripción, cantidad y precio.`, `lineas.${mal}.${que}`);
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
              <select id="serie" className={campo} value={serieRect} onChange={(e) => setSerieRect(e.target.value)} {...marca('serie')}>
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
            <select id="serie" className={campo} value={serie} onChange={(e) => setSerie(e.target.value)} {...marca('serie')}>
              {series.map((s) => (
                <option key={s.id} value={s.codigo}>
                  {s.codigo} — {s.descripcion}
                </option>
              ))}
            </select>
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
                setLineas((ls) => [...ls, lineaVacia(sinCuota ? 0 : 21)]);
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
                ? `Salen ${deDondeSalen}, en negativo. Deja solo lo que se devuelve o se descuenta y ajusta las cantidades. Un rappel puede ir en una línea: 1 × -500.`
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
                        aria-label={`Descuento de la línea ${i + 1}`}
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
      </section>

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
            <p className="mt-1 text-xs text-slate-500">Se imprimen en {esProforma ? 'la proforma' : 'la factura'}.</p>
          </div>
        </div>

        <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-600">Base imponible</dt>
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
