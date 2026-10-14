import { ApiError, apiFetch, companyPath } from './api';
import type { CandidataOriginal, CausaRectificacion, GastoExtraido, TipoRectificativa } from './compras';
import type { OrigenTercero } from './fiscal';
import type { RectificativaVentaLeida } from './rectificativasVenta';

/**
 * Lecturas de facturas con Azure (y Claude de respaldo) para los dos lectores.
 *
 *  POST /<lector>/lecturas               sube el archivo: 202 (Azure leyendo) o 200 (leida ya)
 *  GET  /<lector>/lecturas/:id           estado; la pantalla consulta cada pocos segundos
 *  POST /<lector>/lecturas/:id/descartar la deja descartada y borra el archivo
 *  POST /<lector>/lecturas/:id/origen-tercero   de donde es el cliente o el proveedor: vuelve a validar sin leer otra vez
 *  POST /<lector>/lecturas/:id/manual    «Rellenarla a mano»: la lectura que ha fallado, tarda o sale muy
 *                                        incompleta pasa a vacia (origen MANUAL), con el archivo ya subido
 *
 * Al subir la factura va tambien de donde ha dicho la persona que es el
 * cliente (ventas) o el proveedor (gastos): esa eleccion manda en las validaciones.
 *
 * El servidor valida lo leido campo a campo (cuadre, NIF, tipos de IVA,
 * fechas, duplicadas, QR VERI*FACTU) y la pantalla lo ensena en PanelLectura.
 * El usuario confirma siempre antes de registrar.
 */

export type LectorPantalla = 'gastos' | 'ventas';
export type NivelValidacion = 'ok' | 'revisar' | 'error';
/** manual: lo ha escrito la persona al corregir la lectura o al rellenarla a mano. */
export type FuenteCampo = 'azure' | 'claude' | 'qr' | 'calculado' | 'facturae' | 'manual';

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
  /** Codigos de las validaciones que lo marcan (CUOTA_TIPO, CUADRE...): para reconocer cada caso sin leer el texto. */
  codigos?: string[];
  sugerencia?: string;
  /** Solo en desglose.N.*: el tipo de IVA del tramo ("Base del 21 %"). */
  tipoIva?: number;
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
  /** MANUAL: no se ha leido nada; la persona la rellena a mano con el archivo ya subido. */
  origen: 'AZURE' | 'AZURE_CLAUDE' | 'CLAUDE' | 'FACTURAE' | 'MANUAL';
  textoOrigen: string;
  /** texto null: se leyo con Claude sin que haya nada que contar (Azure no configurado, WEBP...). */
  respaldo: { motivo: string; texto: string | null } | null;
  confianza: number | null;
  estado: NivelValidacion;
  requiereRevision: boolean;
  campos: Partial<Record<CampoId, EstadoCampo>>;
  /**
   * completados: datos que no se leyeron en la factura y se tomaron del QR (no se han cotejado).
   * pruebas: QR del entorno de pruebas de la AEAT (llega como NO_COINCIDE sin diferencias).
   */
  qr: { estado: EstadoQr; verifactu: boolean | null; texto: string; diferencias: DiferenciaQr[]; completados: DiferenciaQr['campo'][]; pruebas: boolean };
  /** Lo que hay que revisar y no va ligado a un dato (archivo ya registrado, QR ilegible o de pruebas). El servidor tambien lo pone en avisos. */
  generales: Array<{ nivel: NivelValidacion; mensaje: string }>;
  avisos: string[];
  paginas: { archivo: number | null; leidas: number | null };
  /** El cliente (ventas) o el proveedor (gastos): de donde es y como se llama su numero fiscal. Un servidor anterior no lo manda. */
  tercero?: InfoTercero;
}

/** Lo que ha dicho la persona de donde es el tercero. pais: ISO-2, o null si no lo ha elegido (en ES, 'ES'). */
export interface EleccionOrigen {
  origen: OrigenTercero;
  pais: string | null;
}

/** De donde es el tercero de la lectura, segun el servidor (services/lectura/origen-tercero.ts). */
export interface InfoTercero {
  tipo: 'cliente' | 'proveedor';
  /** Lo elegido (null: no se dijo y se deduce de la factura). */
  eleccion: EleccionOrigen | null;
  /** Con lo que se ha validado: la eleccion o lo que se deduce. null: no se sabe. */
  origen: OrigenTercero | null;
  pais: string | null;
  por: 'eleccion' | 'ficha' | 'prefijo' | 'direccion' | 'forma' | null;
  /** Lo que se deduce de la factura sin la eleccion. */
  detectado: { origen: OrigenTercero | null; pais: string | null; por: InfoTercero['por'] };
  /** Lo leido contradice la eleccion: lo que se propone elegir y por que. */
  contradiccion: { origen: OrigenTercero; pais: string | null; mensaje: string } | null;
  /** «NIF», «NIF-IVA (VAT)», «RNC»... */
  numeroFiscal: string;
  /** El NIF-IVA leido sin prefijo, ya con el de su pais (para la ficha del alta). */
  nifPropuesto: string | null;
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
  /** Rectificativa o abono (V19/V20 en «revisar»): la factura que rectifica propuesta por el servidor. null si no lo es. */
  rectificativa?: RectificativaVentaLeida | null;
  /** Las lineas con que se registrara (una por tipo de IVA): la cuenta de cada una se puede cambiar. */
  lineas?: Array<{ descripcion: string; base: number; tipoIva: number }>;
  /** El cliente dado de alta con el NIF leido, o null: hay que darlo de alta o elegir uno antes de registrar. */
  clienteExistente?: { id: string; nombreFiscal: string; nifCif: string; pais?: string | null } | null;
  /**
   * Direccion del cliente leida en la factura, para rellenar la ficha del alta; null si no se ha
   * leido nada. Un servidor anterior no la manda (undefined).
   */
  direccionCliente?: DireccionClienteLeida | null;
}

/** Direccion del cliente leida en una factura de venta. */
export interface DireccionClienteLeida {
  calle: string | null;
  cp: string | null;
  municipio: string | null;
  provincia: string | null;
  /** Codigo ISO de dos letras (ES, FR, PT...), solo si se deduce con seguridad del pais leido; si no, null. */
  pais: string | null;
  /** Leida con poca seguridad: hay que compararla con la factura (mismo criterio que direccionProveedor.revisar). */
  revisar: boolean;
}

/** Base y cuota de cada tipo de IVA de una factura de gasto (una linea del formulario por tramo). */
export interface TramoGasto {
  tipoIva: number;
  base: number;
  cuota: number;
  /** Las partidas de ese tipo ("Tóner", "Libros y revistas") o un texto neutro ("Base al 10 %"). */
  descripcion?: string;
}

/** Texto neutro de una linea por tipo de IVA: "Base al 10 %"; al 0 %, "Base exenta". */
export function descripcionNeutraTramo(tipoIva: number): string {
  return tipoIva === 0 ? 'Base exenta' : `Base al ${porcentaje(tipoIva)}`;
}

/**
 * Lectura de una rectificativa o un abono de proveedor (V19 en «revisar»):
 * la factura que rectifica propuesta por el servidor y lo que se deduce de lo
 * leido. null si no es una rectificativa ni trae importes en negativo.
 */
export interface RectificativaLeida {
  /** Numero de la factura que rectifica, tal como se leyo. */
  numeroRectificada: string | null;
  motivo: string | null;
  /** Causa que sale del motivo leido; null: hay que elegirla. */
  causaPropuesta: CausaRectificacion | null;
  importesNegativos: boolean;
  /** I con importes en negativo; S si en positivo pasa del 50 % de la original; null: hay que elegir. */
  tipoPropuesto: TipoRectificativa | null;
  /** 'REDUCE' con importes en negativo; null: hay que elegir si reduce o aumenta. */
  sentido: 'REDUCE' | null;
  /** null sin proveedor en la app (la original ira «de fuera», con el numero leido). */
  propuesta: { coincidencia: 'EXACTA' | 'PARECIDA' | 'NINGUNA'; original: CandidataOriginal | null; candidatas: CandidataOriginal[] } | null;
}

/** Lo leido de una factura de gasto: lo del extractor clasico y, ademas, un tramo por tipo de IVA. */
export type GastoLeido = GastoExtraido & { tramos?: TramoGasto[]; rectificativa?: RectificativaLeida | null };

export interface LecturaGastoLista {
  lecturaId: string;
  estado: 'LISTA';
  gasto: GastoLeido;
  lectura: InfoLectura;
}

export interface LecturaIngresoLista {
  lecturaId: string;
  estado: 'LISTA';
  ingreso: IngresoExtraido;
  lectura: InfoLectura;
}

type Leyendo = { lecturaId: string; estado: 'LEYENDO'; reintentarEnMs: number; segundos: number };
/** puedeRellenarAMano: el archivo sigue guardado y se puede terminar a mano (un servidor anterior no lo manda). */
type ConError = { lecturaId: string; estado: 'ERROR'; codigo: string; mensaje: string; puedeRellenarAMano?: boolean };
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

/**
 * Error de una lectura, con su codigo y, si la hay, una salida para registrarla
 * a mano. `aMano`: la lectura (lecturaId) se puede rellenar a mano con el
 * archivo ya subido (POST /lecturas/:id/manual): ha fallado y el servidor ha
 * guardado el archivo, o tarda demasiado.
 */
export class ErrorLectura extends Error {
  constructor(
    message: string,
    readonly codigo: string,
    readonly alternativa?: { ruta: string; texto: string },
    readonly aMano?: { lecturaId: string } | null,
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
 * Senal que se corta si la corta el usuario (Cancelar) o si se pasa el plazo.
 * Con AbortController y setTimeout (AbortSignal.any no esta en todos los navegadores).
 */
function conPlazo(signal: AbortSignal | undefined, ms: number): { signal: AbortSignal; vencido: () => boolean; limpiar: () => void } {
  const c = new AbortController();
  let vencido = false;
  const alCancelar = () => c.abort();
  if (signal?.aborted) c.abort();
  else signal?.addEventListener('abort', alCancelar, { once: true });
  const t = setTimeout(() => {
    vencido = true;
    c.abort();
  }, Math.max(1000, ms));
  return {
    signal: c.signal,
    vencido: () => vencido && !signal?.aborted,
    limpiar: () => {
      clearTimeout(t);
      signal?.removeEventListener('abort', alCancelar);
    },
  };
}

/**
 * Sube la factura y espera a que este leida.
 *
 * - `alEmpezar(lecturaId)`: en cuanto el servidor la acepta (para poder descartarla).
 * - Consulta cada `reintentarEnMs` (entre 1,5 y 5 s) y se rinde a los 120 s,
 *   tambien si una peticion se queda colgada (cada una se corta al llegar al plazo).
 * - Un `signal` cancelado corta la espera (lanza un AbortError: ver esCancelada).
 */
export async function leerFactura<T extends LectorPantalla>(
  lector: T,
  archivo: File,
  opciones: { signal?: AbortSignal; alEmpezar?: (lecturaId: string) => void; origen?: EleccionOrigen | null } = {},
): Promise<ListaDe<T>> {
  const { signal, alEmpezar, origen } = opciones;
  const datos = new FormData();
  // De donde es el tercero, antes del archivo (el servidor lo lee con el resto del formulario).
  if (origen) {
    datos.append('origenTercero', origen.origen);
    if (origen.pais) datos.append('paisTercero', origen.pais);
  }
  datos.append('archivo', archivo, archivo.name);
  const inicio = Date.now();
  // La que tarda demasiado se puede rellenar a mano si el servidor ya la ha aceptado (tiene id).
  let id: string | null = null;
  const tarda = () => new ErrorLectura(MENSAJE_TARDA, 'TARDA', ALTA_MANUAL[lector], id ? { lecturaId: id } : null);

  /** Una peticion con el tope de lo que queda de plazo. */
  const pedir = async (ruta: string, init: RequestInit = {}): Promise<Respuesta<ListaDe<T>>> => {
    const plazo = conPlazo(signal, PLAZO_MAX_MS - (Date.now() - inicio));
    try {
      const r = await apiFetch<Respuesta<ListaDe<T>>>(companyPath(ruta), { ...init, signal: plazo.signal });
      // Un corte mientras se leia el cuerpo deja la respuesta vacia: cuenta como corte.
      if (signal?.aborted) throw new DOMException('Cancelada', 'AbortError');
      if (plazo.vencido()) throw tarda();
      if (!r) throw new ErrorLectura('El servidor no ha respondido bien. Prueba otra vez.', 'SIN_RESPUESTA', ALTA_MANUAL[lector]);
      return r;
    } catch (e) {
      if (e instanceof ErrorLectura || esCancelada(e)) throw e;
      if (signal?.aborted) throw new DOMException('Cancelada', 'AbortError');
      if (plazo.vencido()) throw tarda();
      throw e;
    } finally {
      plazo.limpiar();
    }
  };

  let r: Respuesta<ListaDe<T>>;
  try {
    r = await pedir(RUTA[lector], { method: 'POST', body: datos });
  } catch (e) {
    if (codigoDe(e) === 'LECTOR_SIN_IA') throw new ErrorLectura(MENSAJE_SIN_IA[lector], 'LECTOR_SIN_IA', ALTA_MANUAL[lector]);
    throw e;
  }
  id = r.lecturaId;
  alEmpezar?.(r.lecturaId);

  for (;;) {
    if (r.estado === 'LISTA') {
      const lista = r as ListaDe<T>;
      return { ...lista, lectura: conDatosDelQr(lista.lectura) } as ListaDe<T>;
    }
    if (r.estado === 'ERROR') {
      const e = r as ConError;
      const mensaje = e.codigo === 'LECTOR_SIN_IA' ? MENSAJE_SIN_IA[lector] : e.mensaje;
      throw new ErrorLectura(mensaje, e.codigo, ALTA_MANUAL[lector], e.puedeRellenarAMano ? { lecturaId: e.lecturaId } : null);
    }
    if (r.estado !== 'LEYENDO') throw new ErrorLectura(MENSAJE_CERRADA, r.estado);

    const pedida = Number((r as Leyendo).reintentarEnMs) || ESPERA_MIN_MS;
    const espera = Math.min(ESPERA_MAX_MS, Math.max(ESPERA_MIN_MS, pedida));
    if (Date.now() - inicio + espera > PLAZO_MAX_MS) throw tarda();
    await esperar(espera, signal);
    r = await pedir(`${RUTA[lector]}/${encodeURIComponent(r.lecturaId)}`);
  }
}

export const MOTIVO_DATO_DEL_QR = 'No se ha podido leer en la factura: se ha sacado del QR. Compruébalo con el documento.';

/** Campo de la lectura de cada dato del QR (como CAMPO_QR del servidor). */
export const CAMPO_QR: Record<DiferenciaQr['campo'], CampoId> = {
  nif: 'emisor.nif',
  numero: 'numero',
  fecha: 'fechaEmision',
  importe: 'totales.totalFactura',
};

/**
 * Un dato sacado del QR no se ha comprobado con nada: nunca cuenta como
 * "comprobado sin problemas" y pide "He revisado". El servidor ya lo manda
 * en "revisar"; esto cubre una lectura guardada antes de ese cambio.
 */
export function conDatosDelQr(info: InfoLectura): InfoLectura {
  const completados = info.qr?.completados ?? [];
  if (!completados.length) return info;
  const campos = { ...info.campos };
  let cambiado = false;
  for (const c of completados) {
    const id = CAMPO_QR[c];
    const e = campos[id];
    if (!e || e.estado !== 'ok') continue;
    campos[id] = { ...e, estado: 'revisar', motivos: e.motivos.length ? e.motivos : [MOTIVO_DATO_DEL_QR] };
    cambiado = true;
  }
  if (!cambiado) return info;
  return { ...info, campos, estado: info.estado === 'ok' ? 'revisar' : info.estado, requiereRevision: true };
}

/**
 * Cambia de donde es el tercero de una lectura ya leida (null: que lo deduzca
 * de la factura). El servidor vuelve a validar sin leer otra vez y devuelve la
 * lectura como al terminar.
 */
export async function cambiarOrigenLectura<T extends LectorPantalla>(lector: T, lecturaId: string, origen: EleccionOrigen | null): Promise<ListaDe<T>> {
  const r = await apiFetch<ListaDe<T>>(companyPath(`${RUTA[lector]}/${encodeURIComponent(lecturaId)}/origen-tercero`), {
    method: 'POST',
    body: JSON.stringify({ origen: origen?.origen ?? null, pais: origen?.pais ?? null }),
  });
  if (!r || r.estado !== 'LISTA') throw new ErrorLectura(MENSAJE_CERRADA, 'CERRADA');
  return { ...r, lectura: conDatosDelQr(r.lectura) } as ListaDe<T>;
}

/** Descarta una lectura sin registrar (borra el archivo). Sin errores: si falla, el servidor la purga a los 7 dias. */
export async function descartarLectura(lector: LectorPantalla, lecturaId: string): Promise<void> {
  await apiFetch(companyPath(`${RUTA[lector]}/${encodeURIComponent(lecturaId)}/descartar`), { method: 'POST' }).catch(() => undefined);
}

/**
 * «Rellenarla a mano»: la lectura que ha fallado, que tarda demasiado o que ha
 * salido muy incompleta pasa a vacia, con el archivo ya subido (se archiva con
 * la factura al registrarla). Devuelve la lectura LISTA con origen MANUAL: en
 * ventas, el ingreso vacio (se registra con `correcciones`); en gastos, el
 * gasto vacio. Errores: 409 ARCHIVO_YA_BORRADO (hay que subirla otra vez) o
 * LECTURA_YA_CONFIRMADA, 400 LECTURA_NO_LISTA (descartada).
 */
export async function rellenarAMano<T extends LectorPantalla>(lector: T, lecturaId: string): Promise<ListaDe<T>> {
  const r = await apiFetch<Respuesta<ListaDe<T>>>(companyPath(`${RUTA[lector]}/${encodeURIComponent(lecturaId)}/manual`), { method: 'POST' });
  if (!r || r.estado !== 'LISTA') throw new ErrorLectura(MENSAJE_CERRADA, 'CERRADA');
  return r as ListaDe<T>;
}

/** Lo que una lectura tiene que traer como minimo; si falta, sale muy incompleta. */
const CAMPOS_OBLIGATORIOS = /^(numero|fechaEmision|totales\.base|totales\.totalAPagar|desglose\.\d+\.base)$/;

/**
 * La lectura ha salido muy incompleta: falta el numero, la fecha, alguna base
 * o el total (el servidor lo marca con OBLIGATORIOS), o se ha leido con menos
 * del 50 % de confianza. Entonces se ofrece «Rellenarla a mano».
 */
export function esMuyIncompleta(info: InfoLectura | null | undefined): boolean {
  if (!info || info.origen === 'MANUAL') return false;
  if (info.confianza !== null && info.confianza < 0.5) return true;
  return Object.entries(info.campos).some(([id, c]) => !!c && CAMPOS_OBLIGATORIOS.test(id) && !!c.codigos?.includes('OBLIGATORIOS'));
}

/** La lectura se rellena a mano: no hay nada leido. */
export const esAMano = (info: InfoLectura | null | undefined) => info?.origen === 'MANUAL';

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

/** 21 -> "21 %", 5.2 -> "5,2 %". */
export function porcentaje(n: number): string {
  return `${String(Math.round(n * 100) / 100).replace('.', ',')} %`;
}

/**
 * "Base del 21 %", "IVA del 10 %", "Base exenta" (si se sabe el tipo del tramo), "Base imponible
 * (tramo 2)" si no se sabe y hay varios, o "Base imponible" si solo hay uno.
 *
 * `numeroFiscal`: como se llama el numero del tercero en su pais («RNC», «NIF-IVA (VAT)»...): la
 * tarjeta del NIF del cliente (ventas) o del proveedor (gastos) dice «RNC del cliente».
 */
export function etiquetaCampo(id: string, lector: LectorPantalla, variosTramos: boolean, tipoIva?: number, numeroFiscal?: string): string {
  if (numeroFiscal && id === (lector === 'ventas' ? 'receptor.nif' : 'emisor.nif')) return `${numeroFiscal} del ${lector === 'ventas' ? 'cliente' : 'proveedor'}`;
  const fija = ETIQUETA_CAMPO[id];
  if (fija) return fija[lector];
  const m = /^desglose\.(\d+)\.(base|cuota|recargo)$/.exec(id);
  if (m) {
    if (typeof tipoIva === 'number' && Number.isFinite(tipoIva)) {
      // Al 0 %: exento, no "IVA del 0 %".
      if (tipoIva === 0) return m[2] === 'base' ? 'Base exenta' : m[2] === 'cuota' ? 'IVA (exento)' : 'Recargo de equivalencia (exento)';
      const del = `del ${porcentaje(tipoIva)}`;
      if (m[2] === 'base') return `Base ${del}`;
      if (m[2] === 'cuota') return `IVA ${del}`;
      return `Recargo de equivalencia (IVA ${del})`;
    }
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

/** Los tipos de documento que da el servidor, en castellano. */
const TIPO_DOCUMENTO: Record<string, string> = {
  factura: 'Factura',
  simplificada: 'Factura simplificada',
  rectificativa: 'Factura rectificativa',
  ticket: 'Ticket',
  recibo: 'Recibo',
  nomina: 'Nómina',
  seguros_sociales: 'Seguros sociales',
  otro: 'Otro documento',
};

/** El valor leido de un campo, como lo leeria una persona. */
export function valorLegible(id: string, v: string | number | null): string {
  if (v === null || v === undefined || v === '') return 'sin leer';
  if (id === 'tipoDocumento') return TIPO_DOCUMENTO[String(v)] ?? 'Otro documento';
  if (typeof v === 'number') {
    if (id === 'retencion.tipo') return `${String(v).replace('.', ',')} %`;
    if (ES_IMPORTE.test(id)) return euros(v);
    return String(v).replace('.', ',');
  }
  if (id === 'fechaEmision' || id === 'fechaVencimiento') return fechaLegible(v);
  return v;
}

/** Lo que se anuncia al lector de pantalla cuando termina la lectura. */
export function anuncioLecturaTerminada(info: InfoLectura): string {
  if (info.origen === 'MANUAL') return 'Formulario vacío: escribe los datos de la factura mirando el archivo.';
  const n = Object.values(info.campos).filter((c) => c && c.estado !== 'ok').length;
  const g = (info.generales ?? []).length;
  const delQr = (info.qr.completados ?? []).length;
  if (n === 0 && g === 0 && delQr === 0 && !qrConProblema(info.qr)) return 'Lectura terminada. No se ha encontrado nada raro: revisa los datos antes de registrarla.';
  const partes = [n > 0 ? (n === 1 ? '1 dato' : `${n} datos`) : '', g > 0 ? (g === 1 ? '1 aviso' : `${g} avisos`) : ''].filter(Boolean);
  if (!partes.length) return delQr > 0 ? 'Lectura terminada: hay datos sacados del QR que conviene comprobar.' : 'Lectura terminada: revisa el aviso del QR antes de registrarla.';
  return `Lectura terminada: hay ${partes.join(' y ')} para comprobar.`;
}

/** El QR no se ha podido usar o no cuadra (de pruebas, ilegible, no coincide). */
export function qrConProblema(qr: InfoLectura['qr']): boolean {
  return qr.estado === 'NO_COINCIDE' || qr.estado === 'ILEGIBLE';
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

/** Como se llama cada dato del QR cuando se dice que se ha tomado de el. */
const NOMBRE_COMPLETADO: Record<DiferenciaQr['campo'], { gastos: string; ventas: string }> = {
  nif: { gastos: 'el NIF del proveedor', ventas: 'el NIF de la empresa emisora' },
  numero: { gastos: 'el número de factura', ventas: 'el número de factura' },
  fecha: { gastos: 'la fecha', ventas: 'la fecha' },
  importe: { gastos: 'el importe total', ventas: 'el importe total' },
};

/**
 * "En la factura no se ha podido leer el número de factura: se ha sacado del QR.
 * Compruébalo con el documento. El NIF del proveedor, la fecha y el importe total
 * sí coinciden con el QR."
 */
export function textoCompletadosQr(campos: DiferenciaQr['campo'][], lector: LectorPantalla, marcadosAbajo = false): string {
  const orden: DiferenciaQr['campo'][] = ['nif', 'numero', 'fecha', 'importe'];
  const nombres = orden.filter((c) => campos.includes(c)).map((c) => NOMBRE_COMPLETADO[c][lector]);
  const cotejados = orden.filter((c) => !campos.includes(c)).map((c) => NOMBRE_COMPLETADO[c][lector]);
  if (!nombres.length) return '';
  const unir = (l: string[], y: string) => (l.length === 1 ? l[0] : `${l.slice(0, -1).join(', ')} ${y} ${l[l.length - 1]}`);
  const uno = nombres.length === 1;
  // Si cada dato tiene su tarjeta abajo, alli va el "compruébalo": aqui no se repite.
  const comprobar = marcadosAbajo ? (uno ? 'Lo tienes marcado abajo.' : 'Los tienes marcados abajo.') : `${uno ? 'Compruébalo' : 'Compruébalos'} con el documento.`;
  let t = `En la factura no se ha podido leer ${unir(nombres, 'ni')}: ${uno ? 'se ha sacado' : 'se han sacado'} del QR. ${comprobar}`;
  if (cotejados.length) {
    const lista = unir(cotejados, 'y');
    t += ` ${lista.charAt(0).toUpperCase()}${lista.slice(1)} sí ${cotejados.length === 1 ? 'coincide' : 'coinciden'} con el QR.`;
  }
  return t;
}

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
