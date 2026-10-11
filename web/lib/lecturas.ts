import { ApiError, apiFetch, companyPath } from './api';
import type { GastoExtraido } from './compras';

/**
 * Lecturas de facturas con Azure (y Claude de respaldo) para los dos lectores.
 *
 *  POST /<lector>/lecturas               sube el archivo: 202 (Azure leyendo) o 200 (leida ya)
 *  GET  /<lector>/lecturas/:id           estado; la pantalla consulta cada pocos segundos
 *  POST /<lector>/lecturas/:id/descartar la deja descartada y borra el archivo
 *
 * El servidor valida lo leido campo a campo (cuadre, NIF, tipos de IVA,
 * fechas, duplicadas, QR VERI*FACTU) y la pantalla lo ensena en PanelLectura.
 * El usuario confirma siempre antes de registrar.
 */

export type LectorPantalla = 'gastos' | 'ventas';
export type NivelValidacion = 'ok' | 'revisar' | 'error';
export type FuenteCampo = 'azure' | 'claude' | 'qr' | 'calculado' | 'facturae';

export type CampoId =
  | 'tipoDocumento'
  | 'emisor.nombre'
  | 'emisor.nif'
  | 'receptor.nombre'
  | 'receptor.nif'
  | 'numero'
  | 'fechaEmision'
  | 'fechaVencimiento'
  | 'moneda'
  | `desglose.${number}.base`
  | `desglose.${number}.cuota`
  | `desglose.${number}.recargo`
  | 'retencion.tipo'
  | 'retencion.importe'
  | 'totales.base'
  | 'totales.cuotaIva'
  | 'totales.totalFactura'
  | 'totales.totalAPagar'
  | 'iban'
  | 'rectificativa.numeroRectificada'
  | 'concepto';

export interface EstadoCampo {
  estado: NivelValidacion;
  /** 0-1; null si el lector no la da (Claude, calculado). */
  confianza: number | null;
  fuente: FuenteCampo;
  valorLeido: string | number | null;
  motivos: string[];
  sugerencia?: string;
}

export type EstadoQr = 'SIN_QR' | 'COINCIDE' | 'NO_COINCIDE' | 'ILEGIBLE' | 'AJENO';

export interface DiferenciaQr {
  campo: 'nif' | 'numero' | 'fecha' | 'importe';
  enQr: string;
  leido: string | null;
  nivel: 'revisar' | 'error';
}

export interface InfoLectura {
  lecturaId: string;
  origen: 'AZURE' | 'AZURE_CLAUDE' | 'CLAUDE' | 'FACTURAE';
  textoOrigen: string;
  /** texto null: se leyo con Claude sin que haya nada que contar (Azure no configurado, WEBP...). */
  respaldo: { motivo: string; texto: string | null } | null;
  confianza: number | null;
  estado: NivelValidacion;
  requiereRevision: boolean;
  campos: Partial<Record<CampoId, EstadoCampo>>;
  qr: { estado: EstadoQr; verifactu: boolean | null; texto: string; diferencias: DiferenciaQr[] };
  avisos: string[];
  paginas: { archivo: number | null; leidas: number | null };
}

/** Lo leido de una factura de venta (el servidor la registra con lo que guardo, no con esto). */
export interface IngresoExtraido {
  documentId: string;
  numeroFactura: string | null;
  cliente: string | null;
  nifCliente: string | null;
  fecha: string | null;
  concepto: string | null;
  cuentaContable: string | null;
  base: number | null;
  iva: number | null;
  total: number | null;
  retencion: number | null;
  confianza: number;
  /** Problemas que impiden registrarla. */
  errores: string[];
}

export interface LecturaGastoLista {
  lecturaId: string;
  estado: 'LISTA';
  gasto: GastoExtraido;
  lectura: InfoLectura;
}

export interface LecturaIngresoLista {
  lecturaId: string;
  estado: 'LISTA';
  ingreso: IngresoExtraido;
  lectura: InfoLectura;
}

type Leyendo = { lecturaId: string; estado: 'LEYENDO'; reintentarEnMs: number; segundos: number };
type ConError = { lecturaId: string; estado: 'ERROR'; codigo: string; mensaje: string };
type Cerrada = { lecturaId: string; estado: 'CONFIRMADA' | 'DESCARTADA' };
type Respuesta<L> = Leyendo | L | ConError | Cerrada;

type ListaDe<T extends LectorPantalla> = T extends 'gastos' ? LecturaGastoLista : LecturaIngresoLista;

const RUTA: Record<LectorPantalla, string> = {
  gastos: '/gastos-extractor/lecturas',
  ventas: '/ingresos-extractor/lecturas',
};

/** Alta a mano de cada lector, por si la lectura no esta disponible. */
export const ALTA_MANUAL: Record<LectorPantalla, { ruta: string; texto: string }> = {
  gastos: { ruta: '/dashboard/compras/nueva', texto: 'Registrar la factura a mano' },
  ventas: { ruta: '/dashboard/facturas/nueva', texto: 'Crear la factura a mano' },
};

export const MENSAJE_TARDA = 'La lectura está tardando más de lo normal. Prueba otra vez dentro de un rato o registra la factura a mano.';
const MENSAJE_SIN_IA: Record<LectorPantalla, string> = {
  gastos: 'La lectura automática de facturas no está activada en esta instalación.',
  ventas: 'La lectura automática de facturas no está activada en esta instalación.',
};
const MENSAJE_CERRADA = 'Esta lectura ya se cerró. Vuelve a subir la factura.';

const ESPERA_MIN_MS = 1500;
const ESPERA_MAX_MS = 5000;
const PLAZO_MAX_MS = 120_000;

/** Error de una lectura, con su codigo y, si la hay, una salida para registrarla a mano. */
export class ErrorLectura extends Error {
  constructor(
    message: string,
    readonly codigo: string,
    readonly alternativa?: { ruta: string; texto: string },
  ) {
    super(message);
    this.name = 'ErrorLectura';
  }
}

function codigoDe(e: unknown): string | undefined {
  const d = e instanceof ApiError ? e.detalles : undefined;
  const c = d && typeof d === 'object' ? (d as { codigo?: unknown }).codigo : undefined;
  return typeof c === 'string' ? c : undefined;
}

/** Espera que se corta con el AbortController. */
function esperar(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Cancelada', 'AbortError'));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', alCancelar);
      resolve();
    }, ms);
    function alCancelar() {
      clearTimeout(t);
      reject(new DOMException('Cancelada', 'AbortError'));
    }
    signal?.addEventListener('abort', alCancelar, { once: true });
  });
}

/** ¿Se ha cortado la lectura con "Leer otra"? (no es un error que haya que ensenar). */
export function esCancelada(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

/**
 * Sube la factura y espera a que este leida.
 *
 * - `alEmpezar(lecturaId)`: en cuanto el servidor la acepta (para poder descartarla).
 * - Consulta cada `reintentarEnMs` (entre 1,5 y 5 s) y se rinde a los 120 s.
 * - Un `signal` cancelado corta la espera (lanza un AbortError: ver esCancelada).
 */
export async function leerFactura<T extends LectorPantalla>(
  lector: T,
  archivo: File,
  opciones: { signal?: AbortSignal; alEmpezar?: (lecturaId: string) => void } = {},
): Promise<ListaDe<T>> {
  const { signal, alEmpezar } = opciones;
  const datos = new FormData();
  datos.append('archivo', archivo, archivo.name);

  let r: Respuesta<ListaDe<T>>;
  try {
    r = await apiFetch<Respuesta<ListaDe<T>>>(companyPath(RUTA[lector]), { method: 'POST', body: datos, signal });
  } catch (e) {
    if (signal?.aborted) throw new DOMException('Cancelada', 'AbortError');
    if (codigoDe(e) === 'LECTOR_SIN_IA') throw new ErrorLectura(MENSAJE_SIN_IA[lector], 'LECTOR_SIN_IA', ALTA_MANUAL[lector]);
    throw e;
  }
  alEmpezar?.(r.lecturaId);

  const inicio = Date.now();
  for (;;) {
    if (r.estado === 'LISTA') return r as ListaDe<T>;
    if (r.estado === 'ERROR') {
      const e = r as ConError;
      const mensaje = e.codigo === 'LECTOR_SIN_IA' ? MENSAJE_SIN_IA[lector] : e.mensaje;
      throw new ErrorLectura(mensaje, e.codigo, ALTA_MANUAL[lector]);
    }
    if (r.estado !== 'LEYENDO') throw new ErrorLectura(MENSAJE_CERRADA, r.estado);

    const pedida = Number((r as Leyendo).reintentarEnMs) || ESPERA_MIN_MS;
    const espera = Math.min(ESPERA_MAX_MS, Math.max(ESPERA_MIN_MS, pedida));
    if (Date.now() - inicio + espera > PLAZO_MAX_MS) throw new ErrorLectura(MENSAJE_TARDA, 'TARDA', ALTA_MANUAL[lector]);
    await esperar(espera, signal);
    try {
      r = await apiFetch<Respuesta<ListaDe<T>>>(companyPath(`${RUTA[lector]}/${encodeURIComponent(r.lecturaId)}`), { signal });
    } catch (e) {
      if (signal?.aborted) throw new DOMException('Cancelada', 'AbortError');
      throw e;
    }
  }
}

/** Descarta una lectura sin registrar (borra el archivo). Sin errores: si falla, el servidor la purga a los 7 dias. */
export async function descartarLectura(lector: LectorPantalla, lecturaId: string): Promise<void> {
  await apiFetch(companyPath(`${RUTA[lector]}/${encodeURIComponent(lecturaId)}/descartar`), { method: 'POST' }).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Textos
// ---------------------------------------------------------------------------

const ETIQUETA_CAMPO: Record<string, { gastos: string; ventas: string }> = {
  tipoDocumento: { gastos: 'Tipo de documento', ventas: 'Tipo de documento' },
  'emisor.nombre': { gastos: 'Nombre del proveedor', ventas: 'Nombre de la empresa emisora' },
  'emisor.nif': { gastos: 'NIF del proveedor', ventas: 'NIF de la empresa emisora' },
  'receptor.nombre': { gastos: 'Nombre de la empresa', ventas: 'Nombre del cliente' },
  'receptor.nif': { gastos: 'NIF de la empresa', ventas: 'NIF del cliente' },
  numero: { gastos: 'Número de factura', ventas: 'Número de factura' },
  fechaEmision: { gastos: 'Fecha de la factura', ventas: 'Fecha de la factura' },
  fechaVencimiento: { gastos: 'Vencimiento', ventas: 'Vencimiento' },
  moneda: { gastos: 'Moneda', ventas: 'Moneda' },
  'retencion.tipo': { gastos: 'Tipo de retención de IRPF', ventas: 'Tipo de retención de IRPF' },
  'retencion.importe': { gastos: 'Retención de IRPF', ventas: 'Retención de IRPF' },
  'totales.base': { gastos: 'Base imponible total', ventas: 'Base imponible total' },
  'totales.cuotaIva': { gastos: 'IVA total', ventas: 'IVA total' },
  'totales.totalFactura': { gastos: 'Total de la factura', ventas: 'Total de la factura' },
  'totales.totalAPagar': { gastos: 'Total a pagar', ventas: 'Total a cobrar' },
  iban: { gastos: 'IBAN', ventas: 'IBAN' },
  'rectificativa.numeroRectificada': { gastos: 'Factura que rectifica', ventas: 'Factura que rectifica' },
  concepto: { gastos: 'Concepto', ventas: 'Concepto' },
};

/** "Base del tramo 2 de IVA" / "Base imponible" (si solo hay un tramo). */
export function etiquetaCampo(id: string, lector: LectorPantalla, variosTramos: boolean): string {
  const fija = ETIQUETA_CAMPO[id];
  if (fija) return fija[lector];
  const m = /^desglose\.(\d+)\.(base|cuota|recargo)$/.exec(id);
  if (m) {
    const tramo = variosTramos ? ` (tramo ${Number(m[1]) + 1})` : '';
    if (m[2] === 'base') return `Base imponible${tramo}`;
    if (m[2] === 'cuota') return `Cuota de IVA${tramo}`;
    return `Recargo de equivalencia${tramo}`;
  }
  return id;
}

/** 1234.5 -> "1.234,50 €". */
export function euros(n: number): string {
  const v = Math.round(n * 100) / 100;
  const [ent, dec] = Math.abs(v).toFixed(2).split('.');
  return `${v < 0 ? '-' : ''}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec} €`;
}

/** AAAA-MM-DD -> DD/MM/AAAA; cualquier otra cosa, tal cual. */
export function fechaLegible(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}

const ES_IMPORTE = /^(desglose\.\d+\.(base|cuota|recargo)|retencion\.importe|totales\.)/;

/** El valor leido de un campo, como lo leeria una persona. */
export function valorLegible(id: string, v: string | number | null): string {
  if (v === null || v === undefined || v === '') return 'sin leer';
  if (typeof v === 'number') {
    if (id === 'retencion.tipo') return `${String(v).replace('.', ',')} %`;
    if (ES_IMPORTE.test(id)) return euros(v);
    return String(v).replace('.', ',');
  }
  if (id === 'fechaEmision' || id === 'fechaVencimiento') return fechaLegible(v);
  return v;
}

/** "Alta" (80 % o mas), "Media" (60 % o mas) o "Baja". */
export function nivelConfianza(c: number): 'Alta' | 'Media' | 'Baja' {
  return c >= 0.8 ? 'Alta' : c >= 0.6 ? 'Media' : 'Baja';
}

const NOMBRE_DIFERENCIA: Record<DiferenciaQr['campo'], string> = {
  nif: 'NIF',
  numero: 'número',
  fecha: 'fecha',
  importe: 'importe',
};

/** "Importe: en el QR 241,40 €; leído 214,40 €". */
export function textoDiferenciaQr(d: DiferenciaQr): string {
  const valor = (v: string | null) => {
    if (v === null || v === '') return 'sin leer';
    if (d.campo === 'importe' && Number.isFinite(Number(v))) return euros(Number(v));
    if (d.campo === 'fecha') return fechaLegible(v);
    return v;
  };
  const nombre = NOMBRE_DIFERENCIA[d.campo];
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)}: en el QR ${valor(d.enQr)}; leído ${valor(d.leido)}`;
}

/** Sin tildes ni mayusculas, para no repetir el mismo aviso dos veces. */
export function claveTexto(t: string): string {
  return t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
