'use client';

/**
 * Rectificativas y abonos de venta: tipos del contrato con el servidor, las
 * llamadas (motivos, buscador de originales y datos para rectificar) y las
 * ayudas sin React que usan «Nueva factura» y el lector de ventas.
 *
 * El servidor decide (backend: domain/rectificativa-venta.model.ts y
 * services/rectificativasVenta.service.ts). Aqui solo se prepara lo que se
 * envia y se avisa de lo que falta antes de enviarlo.
 *
 * Rutas (todas bajo /companies/:companyId/income-invoices):
 *  - GET /rectificativas/opciones   motivos (con su tipo R1-R4) y series
 *  - GET /originales?q=&numero=&customerId=&desde=&hasta=&ticket=&take=
 *  - GET /:id/rectificar            la original con sus lineas y lo que queda
 */
import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch, companyPath, errorMessage } from './api';
import { lineasDoc, type LineaCalculo } from './divisas';
import { parseImporte } from './moneda';

// ---------------------------------------------------------------------------
// Motivos y tipos
// ---------------------------------------------------------------------------

export const MOTIVOS_VENTA = ['DEVOLUCION', 'DESCUENTO', 'RAPPEL', 'CAMBIO_PRECIO', 'ERROR_DERECHO', 'ERROR', 'OTROS', 'CONCURSO', 'IMPAGO'] as const;
export type MotivoVenta = (typeof MOTIVOS_VENTA)[number];
export const esMotivoVenta = (v: unknown): v is MotivoVenta => typeof v === 'string' && (MOTIVOS_VENTA as readonly string[]).includes(v);

/** Tipo de rectificativa de VERI*FACTU (lista L2 de la Orden HAC/1177/2024). R5: la de un ticket. */
export type TipoRectificativaVenta = 'R1' | 'R2' | 'R3' | 'R4' | 'R5';

/** I: por diferencias (solo lo que cambia). S: por sustitucion (la factura corregida entera). */
export type FormaRectificacion = 'I' | 'S';

/** Un motivo de GET /rectificativas/opciones (la misma tabla que usa el servidor). */
export interface MotivoInfoVenta {
  codigo: MotivoVenta;
  /** «Devolución de mercancías o envases». */
  texto: string;
  /** Una linea de ayuda para elegirlo. */
  ayuda: string;
  tipoFactura: 'R1' | 'R2' | 'R3' | 'R4';
  /** Precepto (p. ej. «art. 80.Dos LIVA»). */
  articulo: string | null;
  /** Tiene que restar: devolucion, descuento, rappel, impago y concurso. */
  soloResta: boolean;
  /** Admite un periodo en vez de facturas concretas (rappel o descuento por volumen). */
  admitePeriodo: boolean;
  /** Solo por diferencias (impago y concurso). */
  soloDiferencias: boolean;
  /** Aviso que no bloquea (plazos, modelo 952...). */
  aviso: string | null;
  /** false: todavia no se puede usar (sale desactivado, con su explicacion). */
  disponible: boolean;
}

export interface OpcionesRectificativa {
  motivos: MotivoInfoVenta[];
  series: {
    /** existe: hay una serie de rectificativas activa. */
    rectificativas: { codigo: string; existe: boolean };
    /**
     * La de las rectificativas de tickets (RT). Si no existe, se crea al guardar la primera.
     * desactivada: la empresa la tiene pero desactivada (no se crea otra); las series
     * históricas del lector, con la numeración de otro programa, no cuentan. Un servidor
     * anterior no lo manda.
     */
    tickets: { codigo: string; existe: boolean; desactivada?: boolean };
  };
}

/** Lo que es cada tipo, en palabras (para enseñarlo junto al motivo). */
export const TEXTO_TIPO_R: Record<TipoRectificativaVenta, string> = {
  R1: 'devolución, descuento o rappel, cambio de precio o error al aplicar la ley',
  R2: 'concurso de acreedores del cliente',
  R3: 'impago del cliente (crédito incobrable)',
  R4: 'error en los datos o en los importes, u otra causa',
  R5: 'rectificación de un ticket o factura simplificada',
};

/** Tipo R que sale del motivo (el que calcula el servidor). null si aun no hay motivo o no se conoce. */
export function tipoFacturaDe(motivo: MotivoVenta | '', ticket: boolean, opciones: OpcionesRectificativa | null): TipoRectificativaVenta | null {
  if (!motivo) return null;
  if (ticket) return 'R5';
  return opciones?.motivos.find((m) => m.codigo === motivo)?.tipoFactura ?? null;
}

export const infoMotivo = (opciones: OpcionesRectificativa | null, motivo: MotivoVenta | ''): MotivoInfoVenta | null =>
  (motivo && opciones?.motivos.find((m) => m.codigo === motivo)) || null;

/**
 * Grupos del desplegable de motivos, como los pidió el usuario: devolución,
 * descuento o rappel, error (con la casilla de error al interpretar la ley),
 * impago o concurso y otros. ERROR_DERECHO no sale en la lista: es «Error»
 * con la casilla marcada.
 */
export const GRUPOS_MOTIVO: Array<{ titulo: string; motivos: MotivoVenta[] }> = [
  { titulo: 'Devolución o cambio de la venta', motivos: ['DEVOLUCION', 'CAMBIO_PRECIO'] },
  { titulo: 'Descuento o rappel', motivos: ['DESCUENTO', 'RAPPEL'] },
  { titulo: 'Error', motivos: ['ERROR'] },
  { titulo: 'Impago o concurso', motivos: ['IMPAGO', 'CONCURSO'] },
  { titulo: 'Otros', motivos: ['OTROS'] },
];

// ---------------------------------------------------------------------------
// Originales (buscador y datos para rectificar)
// ---------------------------------------------------------------------------

export type Coincidencia = 'EXACTA' | 'PARECIDA' | 'NINGUNA';

/** Una factura emitida que se puede rectificar (GET /originales). */
export interface CandidataOriginalVenta {
  id: string;
  numeroCompleto: string;
  serie: string;
  fechaEmision: string;
  customerId: string;
  cliente: string;
  nifCliente: string | null;
  tipoFactura: string;
  moneda: string;
  tipoOperacion: string | null;
  totalFactura: number;
  /** Lo que queda por rectificar (descontadas sus rectificativas). */
  restante: number;
  /** Numero de la rectificativa por sustitucion que la reemplaza, si la hay. */
  sustituidaPor: string | null;
  /** 'app' o 'lector'. */
  origen: string;
  /** Su numero coincide con el buscado. */
  exacta: boolean;
  rectificable: boolean;
  motivoNoRectificable: string | null;
}

/** Cobro de 2026 traido con la carga, sin factura en la app y con algo pendiente (solo con customerId). */
export interface PartidaFueraVenta {
  partidaId: string;
  numero: string;
  fecha: string | null;
  pendiente: number;
  exacta: boolean;
}

export interface OriginalesBuscadasVenta {
  coincidencia: Coincidencia;
  candidatas: CandidataOriginalVenta[];
  partidasFuera: PartidaFueraVenta[];
}

export interface LineaOriginalVenta {
  descripcion: string;
  cantidad: number;
  /** En la moneda de la factura. */
  precioUnitario: number;
  descuentoPorcentaje: number;
  tipoIva: number;
  tipoRetencion: number;
  productoServicioId: string | null;
  cuenta: string | null;
  baseLine: number;
  ivaImporte: number;
}

/** GET /:id/rectificar. */
export interface DatosParaRectificarVenta {
  original: {
    id: string;
    numeroCompleto: string;
    serie: string;
    fechaEmision: string;
    devengo: string;
    tipoFactura: string;
    origen: string;
    customerId: string;
    cliente: { id: string; nombreFiscal: string; nifCif: string | null; pais: string | null };
    moneda: string;
    tipoCambio: number;
    tipoOperacion: string | null;
    causaExencion: string | null;
    referenciaLegal: string | null;
    baseTotal: number;
    ivaTotal: number;
    retencionTotal: number;
    totalFactura: number;
    totalFacturaDoc: number;
  };
  lineas: LineaOriginalVenta[];
  /** Cuenta que se propone por tipo de IVA (la de la linea de mayor base de ese tipo). */
  cuentaPorTipoIva: Record<string, string>;
  rectificativas: Array<{ id: string; numeroCompleto: string; fechaEmision: string; totalFactura: number; forma: FormaRectificacion; tipoFactura: string }>;
  /** Lo que queda por rectificar (la original, o su sustituta, mas las rectificativas por diferencias). */
  restante: { base: number; cuota: number; total: number };
  /** En la moneda de la factura (original.moneda), no en la de la contabilidad. */
  pendienteCobro: number;
  /** Es una simplificada (F2): se rectifica con R5. */
  ticket: boolean;
  rectificable: boolean;
  motivoNoRectificable: string | null;
  /** false si ya tiene alguna rectificativa. */
  admiteSustitucion: boolean;
  /**
   * Solo en la pantalla (no lo manda el servidor): la factura sustituida se
   * rectifica sobre su sustituta, así que `lineas` y `cuentaPorTipoIva` son los
   * de esa rectificativa por sustitución (ver useDatosOriginales).
   */
  lineasDe?: { id: string; numeroCompleto: string } | null;
}

/**
 * Anulada por completo: sus rectificativas la dejan a cero (como
 * `anuladaPorCompleto` de la ficha). Ya no se puede restar más; para deshacer
 * la anulación se hace otra rectificativa en positivo.
 */
export const anuladaEntera = (d: DatosParaRectificarVenta): boolean =>
  Math.round(d.restante.total * 100) === 0 && Math.round(d.original.totalFactura * 100) !== 0;

/** La rectificativa por sustitución vigente de una factura (la última), o null. */
export function sustitutaDe(d: DatosParaRectificarVenta): { id: string; numeroCompleto: string } | null {
  const s = d.rectificativas.filter((r) => r.forma === 'S').pop();
  return s ? { id: s.id, numeroCompleto: s.numeroCompleto } : null;
}

export interface FiltrosOriginales {
  q?: string;
  numero?: string;
  customerId?: string | null;
  desde?: string;
  hasta?: string;
  /** true: solo simplificadas (F2); false: sin las F2. */
  ticket?: boolean;
  take?: number;
}

export function opcionesRectificativa(): Promise<OpcionesRectificativa> {
  return apiFetch<OpcionesRectificativa>(companyPath('/income-invoices/rectificativas/opciones'));
}

export function buscarOriginales(f: FiltrosOriginales): Promise<OriginalesBuscadasVenta> {
  const p = new URLSearchParams();
  if (f.q?.trim()) p.set('q', f.q.trim());
  if (f.numero?.trim()) p.set('numero', f.numero.trim());
  if (f.customerId) p.set('customerId', f.customerId);
  if (f.desde) p.set('desde', f.desde);
  if (f.hasta) p.set('hasta', f.hasta);
  if (f.ticket !== undefined) p.set('ticket', f.ticket ? '1' : '0');
  if (f.take) p.set('take', String(f.take));
  const qs = p.toString();
  return apiFetch<OriginalesBuscadasVenta>(companyPath(`/income-invoices/originales${qs ? `?${qs}` : ''}`));
}

export function paraRectificar(id: string): Promise<DatosParaRectificarVenta> {
  return apiFetch<DatosParaRectificarVenta>(companyPath(`/income-invoices/${encodeURIComponent(id)}/rectificar`));
}

// ---------------------------------------------------------------------------
// Compatibilidad con el servidor anterior (solo durante la publicación)
// ---------------------------------------------------------------------------

/**
 * Las rectificativas nuevas necesitan el servidor nuevo. Si la pantalla se
 * publica antes que el servidor (o el servidor vuelve a una versión anterior),
 * GET /rectificativas/opciones no existe y da 404. Entonces se usa el camino de
 * siempre: la ficha anula la factura entera (POST /:id/credit-note) y «Nueva
 * factura» hace el abono de una factura de fuera con los campos de antes.
 * Cuando el servidor nuevo esté publicado, todo esto se puede quitar
 * (ver components/ventas/RectificativaServidorAnterior.tsx).
 */
export const esServidorAnterior = (e: unknown): boolean => e instanceof ApiError && e.status === 404;

/**
 * ¿Tiene el servidor las rectificativas nuevas? false solo si la ruta de los
 * motivos no existe; con cualquier otro fallo, true (la pantalla nueva ya
 * enseña su error y deja reintentar).
 */
export async function servidorConRectificativasNuevas(): Promise<boolean> {
  try {
    await opcionesRectificativa();
    return true;
  } catch (e) {
    return !esServidorAnterior(e);
  }
}

/**
 * Motivos y series, una vez por formulario (solo cuando hace falta: `activo`).
 * `anterior`: el servidor todavía no tiene las rectificativas nuevas (ver arriba).
 */
export function useOpcionesRectificativa(activo: boolean): { opciones: OpcionesRectificativa | null; error: string; anterior: boolean; recargar: () => void } {
  const [opciones, setOpciones] = useState<OpcionesRectificativa | null>(null);
  const [error, setError] = useState('');
  const [anterior, setAnterior] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  const cargadas = opciones !== null;
  useEffect(() => {
    if (!activo || cargadas) return;
    let vivo = true;
    setError('');
    opcionesRectificativa()
      .then((o) => {
        if (!vivo) return;
        setOpciones(o);
        setAnterior(false);
      })
      .catch((e) => {
        if (!vivo) return;
        setAnterior(esServidorAnterior(e));
        setError(errorMessage(e));
      });
    return () => {
      vivo = false;
    };
  }, [activo, cargadas, vuelta]);
  const recargar = useCallback(() => setVuelta((n) => n + 1), []);
  return { opciones, error, anterior, recargar };
}

const sinClave = <T,>(o: Record<string, T>, k: string): Record<string, T> => Object.fromEntries(Object.entries(o).filter(([c]) => c !== k));

/**
 * Datos para rectificar una original. Si ya se sustituyó, lo que queda por
 * rectificar es su sustituta: las líneas y las cuentas que se proponen son las
 * de esa rectificativa por sustitución (las de la original ya no valen). Se
 * piden a GET /:idSustituta/rectificar.
 */
async function datosParaRectificar(id: string): Promise<DatosParaRectificarVenta> {
  const d = await paraRectificar(id);
  const s = sustitutaDe(d);
  if (!s) return d;
  try {
    const ds = await paraRectificar(s.id);
    return { ...d, lineas: ds.lineas, cuentaPorTipoIva: ds.cuentaPorTipoIva, lineasDe: s };
  } catch (e) {
    throw new Error(`faltan las líneas de la ${s.numeroCompleto}, que la sustituyó. ${errorMessage(e)}`);
  }
}

/**
 * Datos para rectificar de cada original de la app elegida (GET /:id/rectificar),
 * guardados por id: si se quita una y se vuelve a poner, no se pide otra vez.
 * Una original sustituida trae las líneas de su sustituta (datosParaRectificar).
 */
export function useDatosOriginales(ids: string[]): {
  datos: Record<string, DatosParaRectificarVenta>;
  errores: Record<string, string>;
  cargando: boolean;
} {
  const [datos, setDatos] = useState<Record<string, DatosParaRectificarVenta>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [pedidos, setPedidos] = useState<Record<string, true>>({});
  const clave = ids.join(',');
  useEffect(() => {
    const faltan = ids.filter((id) => !pedidos[id]);
    if (faltan.length === 0) return;
    setPedidos((p) => ({ ...p, ...Object.fromEntries(faltan.map((id) => [id, true as const])) }));
    for (const id of faltan) {
      datosParaRectificar(id)
        .then((d) => {
          setDatos((x) => ({ ...x, [id]: d }));
          setErrores((x) => sinClave(x, id));
        })
        .catch((e) => {
          setErrores((x) => ({ ...x, [id]: errorMessage(e) }));
          // Se puede volver a intentar quitandola y eligiendola otra vez.
          setPedidos((p) => sinClave(p, id));
        });
    }
    // `clave` resume los ids; `pedidos` se actualiza dentro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  const cargando = ids.some((id) => !datos[id] && !errores[id]);
  return { datos, errores, cargando };
}

// ---------------------------------------------------------------------------
// Estado del bloque en el formulario
// ---------------------------------------------------------------------------

/** Una factura que se rectifica: de la app (buscada) o de fuera (numero y fecha a mano). */
export interface OriginalVentaForm {
  clave: number;
  origen: 'app' | 'fuera';
  /** Solo en las de la app. */
  id?: string;
  /** Numero completo (de la app) o el escrito a mano. Vacio en una de la app mientras se cargan sus datos. */
  numero: string;
  /** AAAA-MM-DD. */
  fecha: string;
  /** Partida de cobro de la carga de 2026 que rebaja este abono (solo de fuera). */
  partidaId?: string | null;
  /** Lo pendiente de esa partida, para enseñarlo. */
  pendientePartida?: number;
  /** De la app: su cliente, para no mezclar facturas de clientes distintos. */
  customerId?: string;
  cliente?: string;
  total?: number;
  restante?: number;
  /** Reparto con varias originales: texto con signo; '' = el que sale de sus lineas. */
  base: string;
  cuota: string;
  retencion: string;
}

export interface EstadoRectificativaVenta {
  motivo: MotivoVenta | '';
  forma: FormaRectificacion;
  /** La causa, en palabras del usuario: sale en el PDF. */
  explicacion: string;
  que: 'facturas' | 'periodo';
  originales: OriginalVentaForm[];
  periodo: { desde: string; hasta: string };
}

let clave = 1;
export const nuevaClave = () => clave++;

export function estadoVacio(): EstadoRectificativaVenta {
  return { motivo: '', forma: 'I', explicacion: '', que: 'facturas', originales: [], periodo: { desde: '', hasta: '' } };
}

const sinReparto = { base: '', cuota: '', retencion: '' };

export function originalDeCandidata(c: CandidataOriginalVenta): OriginalVentaForm {
  return {
    clave: nuevaClave(),
    origen: 'app',
    id: c.id,
    numero: c.numeroCompleto,
    fecha: c.fechaEmision,
    customerId: c.customerId,
    cliente: c.cliente,
    total: c.totalFactura,
    restante: c.restante,
    ...sinReparto,
  };
}

/** Una original de la app de la que solo se sabe el id (al llegar desde su ficha): el resto llega con sus datos. */
export function originalDeApp(id: string): OriginalVentaForm {
  return { clave: nuevaClave(), origen: 'app', id, numero: '', fecha: '', ...sinReparto };
}

export function originalDeFuera(numero = '', fecha = '', partidaId: string | null = null, pendientePartida?: number): OriginalVentaForm {
  return { clave: nuevaClave(), origen: 'fuera', numero, fecha, partidaId, ...(pendientePartida !== undefined ? { pendientePartida } : {}), ...sinReparto };
}

export const originalDePartida = (p: PartidaFueraVenta): OriginalVentaForm => originalDeFuera(p.numero, p.fecha ?? '', p.partidaId, p.pendiente);

/** Completa una original de la app con sus datos (numero, fecha, cliente y lo que queda). */
export function conDatos(o: OriginalVentaForm, d: DatosParaRectificarVenta | undefined): OriginalVentaForm {
  if (o.origen !== 'app' || !d || d.original.id !== o.id) return o;
  return {
    ...o,
    numero: o.numero || d.original.numeroCompleto,
    fecha: o.fecha || d.original.fechaEmision,
    customerId: d.original.customerId,
    cliente: d.original.cliente.nombreFiscal,
    total: d.original.totalFactura,
    restante: d.restante.total,
  };
}

/** Lo que devuelve el servidor en `invoice.rectificativa`. */
export interface OriginalDeRectificativaVenta {
  id: string | null;
  numeroCompleto: string;
  fecha: string | null;
  partidaId: string | null;
  enApp: boolean;
  base: number | null;
  cuota: number | null;
  retencion: number | null;
}

export interface RectificativaVentaResp {
  ticket: boolean;
  forma: FormaRectificacion;
  motivo: string | null;
  motivoTexto: string | null;
  explicacion: string | null;
  originales: OriginalDeRectificativaVenta[];
  periodo: { desde: string; hasta: string } | null;
}

const texto = (n: number | null | undefined) => (n === undefined || n === null || !Number.isFinite(n) ? '' : String(n).replace('.', ','));

/** Un borrador de rectificativa guardado, para seguir editandolo. */
export function estadoDesdeResp(r: RectificativaVentaResp): EstadoRectificativaVenta {
  const varias = r.originales.length > 1;
  return {
    motivo: esMotivoVenta(r.motivo) ? r.motivo : '',
    forma: r.forma === 'S' ? 'S' : 'I',
    explicacion: r.explicacion ?? '',
    que: r.periodo ? 'periodo' : 'facturas',
    periodo: r.periodo ?? { desde: '', hasta: '' },
    originales: r.originales.map((o) => ({
      clave: nuevaClave(),
      origen: o.enApp && o.id ? 'app' : 'fuera',
      ...(o.enApp && o.id ? { id: o.id } : {}),
      numero: o.numeroCompleto,
      fecha: o.fecha ?? '',
      partidaId: o.partidaId,
      base: varias ? texto(o.base) : '',
      cuota: varias ? texto(o.cuota) : '',
      retencion: varias ? texto(o.retencion) : '',
    })),
  };
}

// ---------------------------------------------------------------------------
// Lineas propuestas, diferencia de la sustitucion y reparto
// ---------------------------------------------------------------------------

export interface LineaPropuesta {
  descripcion: string;
  cantidad: number;
  /** En la moneda de la factura. */
  precioUnitario: number;
  descuentoPorcentaje: number;
  tipoIva: number;
  tipoRetencion: number;
  productoServicioId?: string;
  cuenta?: string;
  /** Factura de la que sale (para el reparto entre varias). */
  originalId: string;
}

/**
 * Lineas que se proponen desde las originales de la app:
 *  - por diferencias (I): las mismas con la cantidad en negativo (se dejan las
 *    que cambian; un rappel puede ser «1 × -500»);
 *  - por sustitucion (S): la original en positivo, para corregirla.
 * Cada linea lleva la cuenta de la linea original. Una original sustituida
 * propone las de su sustituta (`lineasDe`). Una anulada por completo, en
 * positivo: lo único que admite es deshacer la anulación (otra rectificativa en
 * positivo).
 */
export function lineasPropuestas(datos: DatosParaRectificarVenta[], forma: FormaRectificacion): LineaPropuesta[] {
  return datos.flatMap((d) =>
    d.lineas.map((l) => ({
      descripcion: l.descripcion,
      cantidad: forma === 'I' && !anuladaEntera(d) ? -l.cantidad : l.cantidad,
      precioUnitario: l.precioUnitario,
      descuentoPorcentaje: l.descuentoPorcentaje ?? 0,
      tipoIva: l.tipoIva,
      tipoRetencion: l.tipoRetencion ?? 0,
      ...(l.productoServicioId ? { productoServicioId: l.productoServicioId } : {}),
      ...(l.cuenta ? { cuenta: l.cuenta } : {}),
      originalId: d.original.id,
    })),
  );
}

const cent = (n: number) => Math.round(n * 100);
const deCent = (c: number) => (c === 0 ? 0 : c / 100);

export interface DiferenciaTipo {
  tipoIva: number;
  base: number;
  cuota: number;
}

/**
 * Por sustitucion: lo que se registra es la factura corregida menos la
 * original, por tipo de IVA (el asiento, el libro y los modelos toman esto).
 */
export function diferenciaSustitucion(
  corregida: LineaCalculo[],
  original: LineaCalculo[],
): { porTipo: DiferenciaTipo[]; base: number; cuota: number; retencion: number; total: number } {
  const suma = new Map<number, { base: number; cuota: number }>();
  let ret = 0;
  const anadir = (lineas: LineaCalculo[], signo: 1 | -1) => {
    lineasDoc(lineas, { simetrico: true }).forEach((imp, i) => {
      const t = lineas[i].tipoIva;
      const v = suma.get(t) ?? { base: 0, cuota: 0 };
      suma.set(t, { base: v.base + signo * cent(imp.baseLine), cuota: v.cuota + signo * cent(imp.ivaImporte) });
      ret += signo * cent(imp.retencionImporte);
    });
  };
  anadir(corregida, 1);
  anadir(original, -1);
  const porTipo = Array.from(suma.entries())
    .filter(([, v]) => v.base !== 0 || v.cuota !== 0)
    .sort((a, b) => b[0] - a[0])
    .map(([tipoIva, v]) => ({ tipoIva, base: deCent(v.base), cuota: deCent(v.cuota) }));
  const base = porTipo.reduce((a, t) => a + cent(t.base), 0);
  const cuota = porTipo.reduce((a, t) => a + cent(t.cuota), 0);
  return { porTipo, base: deCent(base), cuota: deCent(cuota), retencion: deCent(ret), total: deCent(base + cuota - ret) };
}

/** Lineas de la original de la app, para calcular la diferencia de una sustitucion. */
export const lineasCalculoDe = (d: DatosParaRectificarVenta): LineaCalculo[] =>
  d.lineas.map((l) => ({
    cantidad: l.cantidad,
    precioUnitario: l.precioUnitario,
    descuentoPorcentaje: l.descuentoPorcentaje ?? 0,
    tipoIva: l.tipoIva,
    tipoRetencion: l.tipoRetencion ?? 0,
  }));

export interface ParteReparto {
  base: number;
  cuota: number;
  retencion: number;
}

/**
 * Reparto que sale de las lineas: la parte de cada original es la suma de las
 * lineas que se propusieron desde ella. Las lineas anadidas a mano no son de
 * ninguna: `sinOriginal` dice si hay alguna.
 */
export function repartoDeLineas(lineas: Array<LineaCalculo & { originalId?: string }>): { porOriginal: Record<string, ParteReparto>; sinOriginal: boolean } {
  const acc: Record<string, { base: number; cuota: number; retencion: number }> = {};
  let sinOriginal = false;
  lineasDoc(lineas, { simetrico: true }).forEach((imp, i) => {
    const id = lineas[i].originalId;
    if (!id) {
      sinOriginal = true;
      return;
    }
    const v = acc[id] ?? { base: 0, cuota: 0, retencion: 0 };
    acc[id] = { base: v.base + cent(imp.baseLine), cuota: v.cuota + cent(imp.ivaImporte), retencion: v.retencion + cent(imp.retencionImporte) };
  });
  const porOriginal = Object.fromEntries(Object.entries(acc).map(([id, v]) => [id, { base: deCent(v.base), cuota: deCent(v.cuota), retencion: deCent(v.retencion) }]));
  return { porOriginal, sinOriginal };
}

/**
 * El reparto entre varias facturas se escribe sin signo (en Nueva factura y en
 * el lector): si la rectificativa resta, cada parte escrita se manda en
 * negativo; si suma, tal cual. La que sale de las lineas ya lleva su signo.
 */
export function repartoConSigno(e: EstadoRectificativaVenta, resta: boolean): EstadoRectificativaVenta {
  if (!resta || e.que !== 'facturas' || e.originales.length < 2) return e;
  const conSigno = (v: string) => (v.trim() ? `-${v.trim().replace(/^[-−+]\s*/, '')}` : v);
  return { ...e, originales: e.originales.map((o) => ({ ...o, base: conSigno(o.base), cuota: conSigno(o.cuota), retencion: conSigno(o.retencion) })) };
}

/**
 * Cuenta que se propone para un tipo de IVA con una o varias originales de la
 * app: la de la original que tiene más base a ese tipo (con una sola, la suya,
 * cuentaPorTipoIva). null si ninguna tiene ese tipo.
 */
export function cuentaDeOriginales(datos: DatosParaRectificarVenta[], tipoIva: number): { codigo: string; numero: string } | null {
  let mejor: { codigo: string; numero: string; base: number } | null = null;
  for (const d of datos) {
    const codigo = d.cuentaPorTipoIva?.[String(tipoIva)];
    if (!codigo) continue;
    const base = d.lineas.filter((l) => l.tipoIva === tipoIva).reduce((a, l) => a + Math.abs(l.baseLine ?? 0), 0);
    if (!mejor || base > mejor.base) mejor = { codigo, numero: d.original.numeroCompleto, base };
  }
  return mejor ? { codigo: mejor.codigo, numero: mejor.numero } : null;
}

/** Parte de una original en el reparto: la escrita o, si no, la de sus lineas. null si no hay ninguna. */
export function parteDe(o: OriginalVentaForm, propuesto: Record<string, ParteReparto> | undefined): ParteReparto | null {
  const auto = o.id ? propuesto?.[o.id] : undefined;
  const leer = (v: string, def: number | undefined) => {
    if (!v.trim()) return def;
    const n = parseImporte(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const base = leer(o.base, auto?.base);
  const cuota = leer(o.cuota, auto?.cuota);
  const retencion = leer(o.retencion, auto?.retencion ?? 0);
  if (base === undefined || cuota === undefined || retencion === undefined) return null;
  return { base, cuota, retencion };
}

// ---------------------------------------------------------------------------
// Validacion y cuerpo
// ---------------------------------------------------------------------------

/** ¿Se puede hacer por sustitucion? Solo con una original de la app sin otras rectificativas. */
export function sustitucionPosible(
  e: EstadoRectificativaVenta,
  datos: Record<string, DatosParaRectificarVenta>,
  motivo: MotivoInfoVenta | null,
): { posible: boolean; porque: string } {
  if (motivo?.soloDiferencias) return { posible: false, porque: 'Un impago o un concurso solo se rectifican por diferencias.' };
  if (e.que === 'periodo') return { posible: false, porque: 'Un periodo solo se rectifica por diferencias.' };
  const app = e.originales.filter((o) => o.origen === 'app');
  if (e.originales.length !== 1 || app.length !== 1) {
    return { posible: false, porque: 'Por sustitución se corrige una sola factura, y tiene que estar en la app.' };
  }
  const d = app[0].id ? datos[app[0].id] : undefined;
  if (d && !d.admiteSustitucion) return { posible: false, porque: `La ${d.original.numeroCompleto} ya tiene alguna rectificativa: ahora solo se puede rectificar por diferencias.` };
  return { posible: true, porque: '' };
}

/** Lo primero que falta en el bloque, con el campo que lo arregla (el mismo nombre que usa el servidor). null si esta completo. */
export function faltaEnBloque(
  e: EstadoRectificativaVenta,
  { emitir, fechaEmision }: { emitir: boolean; fechaEmision: string },
): { mensaje: string; campo: string } | null {
  if (e.que === 'periodo') {
    if (!e.periodo.desde || !e.periodo.hasta) return { mensaje: 'Indica el periodo del rappel o del descuento: desde y hasta.', campo: 'rectificativa.periodo' };
    if (e.periodo.desde > e.periodo.hasta) return { mensaje: 'El periodo está al revés: la fecha «desde» es posterior a «hasta».', campo: 'rectificativa.periodo' };
  } else {
    if (!e.originales.length) {
      return { mensaje: 'Elige la factura que rectificas. Si no está en la app, escribe su número y su fecha.', campo: 'rectificativa.originales' };
    }
    for (let i = 0; i < e.originales.length; i++) {
      const o = e.originales[i];
      if (o.origen !== 'fuera') continue;
      if (!o.numero.trim()) return { mensaje: 'Escribe el número de la factura que rectificas.', campo: `rectificativa.originales.${i}.numero` };
      if (!o.fecha) return { mensaje: `Indica la fecha de la factura ${o.numero.trim()}.`, campo: `rectificativa.originales.${i}.fecha` };
      if (fechaEmision && o.fecha > fechaEmision) {
        return { mensaje: `La factura ${o.numero.trim()} no puede ser posterior a la rectificativa.`, campo: `rectificativa.originales.${i}.fecha` };
      }
    }
  }
  if (!e.motivo) return { mensaje: 'Elige el motivo de la rectificación.', campo: 'rectificativa.motivo' };
  if (emitir && !e.explicacion.trim()) {
    return { mensaje: 'Explica en una frase por qué rectificas la factura: es obligatorio y sale en el PDF.', campo: 'rectificativa.explicacion' };
  }
  return null;
}

/** Original tal como se manda. */
export type OriginalParaEnviar =
  | { id: string; base?: number; cuota?: number; retencion?: number }
  | { numero: string; fecha: string; partidaId?: string; base?: number; cuota?: number; retencion?: number };

/** Bloque `rectificativa` del cuerpo de POST y PUT /income-invoices. */
export interface BloqueRectificativaVenta {
  ticket: boolean;
  forma: FormaRectificacion;
  motivo: MotivoVenta;
  explicacion: string;
  originales?: OriginalParaEnviar[];
  periodo?: { desde: string; hasta: string };
}

/**
 * El bloque que se envia. Con varias originales, la parte de cada una (la
 * escrita o la de sus lineas) va siempre: el servidor exige que sumen al
 * centimo lo de la rectificativa.
 */
export function bloqueParaEnviar(
  e: EstadoRectificativaVenta,
  { ticket, reparto }: { ticket: boolean; reparto?: Record<string, ParteReparto> },
): BloqueRectificativaVenta {
  const varias = e.que === 'facturas' && e.originales.length > 1;
  const originales: OriginalParaEnviar[] = e.originales.map((o) => {
    const parte = varias ? parteDe(o, reparto) : null;
    const importes = parte ? { base: parte.base, cuota: parte.cuota, retencion: parte.retencion } : {};
    return o.origen === 'app' && o.id
      ? { id: o.id, ...importes }
      : { numero: o.numero.trim(), fecha: o.fecha, ...(o.partidaId ? { partidaId: o.partidaId } : {}), ...importes };
  });
  return {
    ticket,
    forma: e.forma,
    motivo: e.motivo as MotivoVenta,
    explicacion: e.explicacion.trim(),
    ...(e.que === 'periodo' ? { periodo: { desde: e.periodo.desde, hasta: e.periodo.hasta } } : { originales }),
  };
}

/**
 * Comprueba el reparto entre varias originales contra los totales de la
 * rectificativa (en la moneda de cuenta). Devuelve el mensaje si no cuadra.
 */
export function faltaEnReparto(
  e: EstadoRectificativaVenta,
  reparto: Record<string, ParteReparto> | undefined,
  totales: { base: number; iva: number; retencion: number },
): { mensaje: string; campo: string } | null {
  if (e.que !== 'facturas' || e.originales.length < 2) return null;
  let base = 0;
  let cuota = 0;
  let retencion = 0;
  for (let i = 0; i < e.originales.length; i++) {
    const p = parteDe(e.originales[i], reparto);
    if (!p) {
      return {
        mensaje: `Escribe cuánto le toca a la ${e.originales[i].numero.trim() || `factura ${i + 1}`}: base e IVA.`,
        campo: `rectificativa.originales.${i}.base`,
      };
    }
    base += cent(p.base);
    cuota += cent(p.cuota);
    retencion += cent(p.retencion);
  }
  if (base !== cent(totales.base) || cuota !== cent(totales.iva) || retencion !== cent(totales.retencion)) {
    return {
      mensaje: 'El reparto entre las facturas no suma lo mismo que la rectificativa. Corrige la base, el IVA o la retención de alguna.',
      campo: 'rectificativa.originales',
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lector de ventas (GET /ingresos-extractor/lecturas/:id → ingreso.rectificativa)
// ---------------------------------------------------------------------------

export interface RectificativaVentaLeida {
  numeroRectificada: string | null;
  motivoLeido: string | null;
  motivoPropuesto: MotivoVenta | null;
  importesNegativos: boolean;
  /** Es rectificativa y trae los importes en positivo: hay que decir si restan o suman. */
  pideSigno: boolean;
  /** I con negativos; con positivos no se propone. */
  formaPropuesta: 'I' | null;
  propuesta: { coincidencia: Coincidencia; original: CandidataOriginalVenta | null; candidatas: CandidataOriginalVenta[] };
  partidasFuera: PartidaFueraVenta[];
  clienteDeLaOriginal: { id: string; nombreFiscal: string; nifCif: string | null } | null;
  /** El NIF leido no es el del cliente de la original. */
  clienteDistinto: boolean;
}

// ---------------------------------------------------------------------------
// Avisos al guardar (invoice.avisosFiscales), para enseñarlos en la ficha
// ---------------------------------------------------------------------------

const CLAVE_AVISOS = (id: string) => `conta:avisos-venta:${id}`;

export function guardarAvisosVenta(id: string, avisos: Array<{ codigo: string; mensaje: string }> | undefined): void {
  if (!avisos?.length) return;
  try {
    const previos = leerSinBorrar(id);
    const todos = [...previos, ...avisos].filter((a, i, arr) => arr.findIndex((b) => b.codigo === a.codigo) === i);
    sessionStorage.setItem(CLAVE_AVISOS(id), JSON.stringify(todos));
  } catch {
    // Sin sessionStorage (modo privado, bloqueado): no se enseñan.
  }
}

function leerSinBorrar(id: string): Array<{ codigo: string; mensaje: string }> {
  try {
    const v = sessionStorage.getItem(CLAVE_AVISOS(id));
    const a = v ? (JSON.parse(v) as unknown) : null;
    return Array.isArray(a)
      ? a.filter((x): x is { codigo: string; mensaje: string } => !!x && typeof x === 'object' && typeof x.codigo === 'string' && typeof x.mensaje === 'string')
      : [];
  } catch {
    return [];
  }
}

/** Lee y borra los avisos guardados al guardar o emitir la factura. */
export function leerAvisosVenta(id: string): Array<{ codigo: string; mensaje: string }> {
  const a = leerSinBorrar(id);
  try {
    sessionStorage.removeItem(CLAVE_AVISOS(id));
  } catch {
    // Nada que borrar.
  }
  return a;
}
