/**
 * «Traer la contabilidad de 2026»: tipos y llamadas al servidor
 * (/companies/:companyId/arranque). El ejercicio de destino es 2027.
 */
import { ApiError, apiFetch, companyPath } from './api';
import { euros } from './lecturas';

/** Año que se empieza a llevar en la app; el anterior lo llevó la gestoría. */
export const EJERCICIO_ARRANQUE = 2027;
export const ANIO_GESTORIA = EJERCICIO_ARRANQUE - 1;
export const RUTA_ARRANQUE = '/dashboard/contabilidad/arranque';
export const RUTA_INMOVILIZADO = '/dashboard/contabilidad/inmovilizado';

export type TipoHoja =
  | 'PLAN'
  | 'TERCEROS_CLIENTES'
  | 'TERCEROS_PROVEEDORES'
  | 'SUMAS_Y_SALDOS'
  | 'DIARIO'
  | 'CARTERA'
  | 'INMOVILIZADO'
  | 'BALANCE'
  | 'PYG'
  | 'DESCONOCIDO';

/** Tipos que se pueden elegir a mano, con su nombre en pantalla (el mismo que da el servidor). */
export const TIPOS_ELEGIBLES: Array<[Exclude<TipoHoja, 'DESCONOCIDO'>, string]> = [
  ['PLAN', 'Plan de cuentas'],
  ['TERCEROS_CLIENTES', 'Listado de clientes'],
  ['TERCEROS_PROVEEDORES', 'Listado de proveedores y acreedores'],
  ['SUMAS_Y_SALDOS', 'Sumas y saldos'],
  ['DIARIO', 'Libro diario'],
  ['CARTERA', 'Cartera de cobros y pagos pendientes'],
  ['INMOVILIZADO', 'Inmovilizado'],
  ['BALANCE', 'Balance de situación'],
  ['PYG', 'Cuenta de pérdidas y ganancias'],
];

/** Datos que puede llevar una columna, con su nombre para la persona. */
export const NOMBRE_CAMPO: Record<string, string> = {
  cuenta: 'Cuenta o subcuenta',
  nombre: 'Nombre o descripción',
  nif: 'NIF',
  debe: 'Debe',
  haber: 'Haber',
  saldoDeudor: 'Saldo deudor',
  saldoAcreedor: 'Saldo acreedor',
  saldo: 'Saldo con signo (deudor +, acreedor −)',
  saldoAnterior: 'Saldo anterior',
  pesetas: 'Importe en pesetas',
  fecha: 'Fecha',
  asiento: 'Nº de asiento',
  concepto: 'Concepto',
  importe: 'Importe (una sola columna)',
  signo: 'Lado D/H',
  contrapartida: 'Contrapartida',
  documento: 'Nº de factura o documento',
  vencimiento: 'Vencimiento',
  pendiente: 'Importe pendiente',
  importeOriginal: 'Importe total de la factura',
  moneda: 'Moneda',
  tipoTercero: 'Tipo (cliente o proveedor)',
  direccion: 'Domicilio',
  cp: 'Código postal',
  municipio: 'Población',
  provincia: 'Provincia',
  pais: 'País',
  email: 'Correo',
  telefono: 'Teléfono',
  coste: 'Coste del bien',
  amortAcumulada: 'Amortización acumulada',
  coeficiente: '% de amortización anual',
  vidaUtil: 'Vida útil (años)',
  fechaAlta: 'Fecha de alta',
  fechaInicioAmort: 'Inicio de la amortización',
  valorResidual: 'Valor residual',
  cuentaAmortAcum: 'Cuenta de amortización acumulada',
  cuentaDotacion: 'Cuenta del gasto de amortización',
};

export interface ColumnaHoja {
  indice: number;
  letra: string;
  titulo: string;
  ejemplo: string;
  /** Hasta dos valores de filas con datos. */
  ejemplos?: string[];
}

export interface HojaAnalizada {
  id: string;
  fichero: string;
  sha256: string;
  hoja: string;
  formato: string;
  tipo: TipoHoja;
  nombreTipo: string;
  tipoReconocido: TipoHoja;
  elegidoAMano: boolean;
  confianza: number;
  candidatos: Array<{ tipo: TipoHoja; nombre: string; puntos: number }>;
  dudosa: boolean;
  programa: string;
  textoPrograma: string | null;
  fechaCorte: string | null;
  filas: number;
  excluida: boolean;
  mapeo: Record<string, number>;
  resumen: string;
  avisos: string[];
  /** Columnas leídas y su fila de títulos (1 = primera; 0 = sin títulos), para revisarlas a mano. */
  columnas?: ColumnaHoja[];
  filaTitulos?: number;
  error: {
    mensaje: string;
    necesitaMapeo?: boolean;
    faltan?: string[];
    columnas?: ColumnaHoja[];
    filaTitulos?: number;
    /** Primeras filas de una hoja sin reconocer. */
    muestra?: string[][];
  } | null;
}

export type NivelPunto = 'ERROR' | 'FALTA' | 'AVISO' | 'INFO';
export type NivelCarga = 'CORRECTO' | 'FALTAN_DATOS' | 'ERRORES';

export interface PuntoComprobacion {
  clave: string;
  nivel: NivelPunto;
  texto: string;
  detalle?: string[];
  excluye?: 'DIARIO' | 'INMOVILIZADO';
}

export interface ResultadoComprobaciones {
  nivel: NivelCarga;
  mensaje: string;
  puntos: PuntoComprobacion[];
  excluidos: string[];
}

export interface ComprobacionesArranque extends ResultadoComprobaciones {
  carga: { id: string; version: number; tipo: string; estado: string };
  aceptados: Array<{ clave: string; motivo: string; userId: string; en: string }>;
  completado: boolean;
  deBorrador: boolean;
  /** Bancos (572) de la apertura con su extracto y su cuenta de Tesorería. */
  bancos: BancoComprobar[] | null;
  datosFiscales: DatosFiscales | null;
  resultadoDeclarado: number | null;
}

export interface SubcuentaTercero {
  codigo: string;
  nombre: string;
  tipo: 'cliente' | 'proveedor';
  nif: string | null;
  accion: 'enlazar' | 'crear' | 'pendiente' | 'ya-enlazada' | 'no-se-enlaza';
  ficha: { id: string | null; nombre: string } | null;
  sustituye?: string;
  motivo?: string;
}

export interface BancoComprobar {
  subcuenta: string;
  nombre: string;
  saldoApertura: number;
  saldoExtracto: number | null;
  cuenta: string | null;
  aceptada: boolean;
}

export interface DatosFiscales {
  resultado303T4?: number | null;
  cuotasIvaACompensar?: number | null;
  basesNegativas?: Array<{ ejercicio: number; importe: number }>;
  deducciones?: Array<{ concepto: string; importe: number }>;
}

export interface VistaCarga {
  ejercicio: number;
  tipoCarga: 'PROVISIONAL' | 'DEFINITIVA';
  hojas: HojaAnalizada[];
  repetidos: string[];
  plan: {
    cuentas: number;
    nuevas: number;
    existentes: number;
    nuevasMuestra: Array<{ codigo: string; nombre: string }>;
    fueraDelPlan: string[];
    nombresCambian: Array<{ codigo: string; actual: string; nuevo: string }>;
    nombresSeQuedan: Array<{ codigo: string; actual: string; nuevo: string; motivo: string }>;
    omitidas: Array<{ codigo: string; motivo: string }>;
    longitud: { delPlan: number | null; actual: number; seFija: boolean; motivo: string | null };
    avisos: string[];
  };
  terceros: {
    resumen: { enlazar: number; crear: number; pendientes: number; yaEnlazadas: number; noSeEnlazan: number };
    lista: SubcuentaTercero[];
  };
  historico: {
    asientos: number;
    apuntes: number;
    desde: string;
    hasta: string;
    especiales: { apertura: number; regularizacion: number; cierre: number };
    cuadraConSumasYSaldos: boolean | null;
    seImporta: boolean;
  } | null;
  apertura: {
    fecha: string;
    origen: 'SUMAS_Y_SALDOS' | 'DIARIO';
    tipoSumasSaldos: string;
    lineas: number;
    debe: number;
    haber: number;
    masas: { activo: number; patrimonioNeto: number; pasivo: number };
    resultado: number;
    sustituye: string[];
  } | null;
  cartera: {
    partidas: number;
    cobros: number;
    pagos: number;
    sinDetalle: number;
    facturasEnlazadas: number;
    cuadre: Array<{ subcuenta: string; tipo: 'COBRO' | 'PAGO'; saldoApertura: number; sumaPartidas: number; diferencia: number; partidas: number }>;
  } | null;
  inmovilizado: { activos: number; coste: number; amortAcumulada: number; seImporta: boolean } | null;
  llevanzaExterna: boolean;
  /** La carga fijará el inicio de los impuestos en la app el 1 de enero (no estaba indicado). */
  fijaInicioEnApp?: boolean;
  retirados: Record<string, number>;
  sustituyeVersion: number | null;
  bancos: BancoComprobar[] | null;
  repeticion: {
    modo: 'NUEVA' | 'REEMPLAZAR' | 'COMPLEMENTARIO';
    textoModo: string;
    diferencias: Array<{ subcuenta: string; nombre: string; anterior: number; nuevo: number; diferencia: number; movimientos2027: number }>;
    totalDiferencias: number;
    partidasQueSiguen: number;
    activosQueSiguen: number;
  } | null;
  datosFiscales: DatosFiscales | null;
  resultadoDeclarado: number | null;
  comprobaciones: ResultadoComprobaciones;
  confirmacion: string;
  puedeConfirmar: boolean;
  huella: string;
}

export interface FicheroCarga {
  nombre: string;
  sha256: string;
  tamano: number;
}

export interface EstadoFase {
  fase: string;
  estado: 'PENDIENTE' | 'HECHA' | 'OMITIDA';
  inicio?: string;
  fin?: string;
  cursor?: number;
  total?: number;
  resultado?: string;
}

export interface CargaBreve {
  id: string;
  version: number;
  tipo: 'PROVISIONAL' | 'DEFINITIVA';
  estado: 'BORRADOR' | 'APLICANDO' | 'CONFIRMADA' | 'SUSTITUIDA' | 'DESHECHA';
  ficheros: FicheroCarga[];
  fases: EstadoFase[] | null;
  creadaEn: string;
  confirmadaPor: string | null;
  confirmadaEn: string | null;
  nivel: NivelCarga | null;
  /** Ficheros de los que no se usó nada (marcados «No usar» o ilegibles). */
  ficherosNoUsados?: string[];
}

export interface EstadoArranque {
  ejercicio: number;
  llevanzaAnterior: 'APP' | 'EXTERNA';
  vigente: CargaBreve | null;
  aplicando: CargaBreve | null;
  borrador: (CargaBreve & { vista: VistaCarga | null }) | null;
  versiones: CargaBreve[];
  fases: Record<string, string>;
}

export interface RespuestaCarga {
  carga: { id: string; version: number; tipo: string; estado: string; ficheros: FicheroCarga[] };
  vista: VistaCarga;
  avisos: string[];
}

export interface ResultadoFase {
  fase: string;
  nombre: string;
  hecho: string;
  siguiente: string | null;
  terminada: boolean;
  progreso: { cursor: number; total: number } | null;
  fases: EstadoFase[];
  comprobaciones: ComprobacionesArranque | null;
}

export interface PlanDeshacer {
  cargaId: string;
  version: number;
  estado: string;
  puede: boolean;
  bloqueos: string[];
  acciones: string[];
  fichasCreadas: Array<{ id: string; tipo: 'cliente' | 'proveedor'; nombre: string; nif: string; borrable: boolean; motivo?: string }>;
  asientos2026: number;
  vuelveVersion: number | null;
  hecho?: string;
}

export interface AvisoArranque {
  nivel: 'A_MEDIAS' | 'FALTAN_DATOS' | 'INVITACION';
  texto: string;
  puntos: string[];
  total: number;
  enlace: string;
}

/** Ajustes que la pantalla manda al analizar (todos opcionales: solo lo que cambia). */
export interface AjustesCarga {
  tipoCarga?: 'PROVISIONAL' | 'DEFINITIVA';
  resultadoDeclarado?: number | null;
  fechaCorte?: string | null;
  motivoAjuste?: string | null;
  bancos?: Record<string, { saldoExtracto: string | number | null; bankAccountId?: string; nueva?: { iban: string; bancoNombre?: string | null }; aceptarDiferencia?: boolean }> | null;
  datosFiscales?: Partial<Record<keyof DatosFiscales, unknown>> | null;
  hojas?: Record<string, { tipo?: string; mapeo?: Record<string, number>; filaCabecera?: number; excluida?: boolean } | null>;
}

const base = (ruta = '') => companyPath(`/arranque${ruta}`);
const deEjercicio = (ruta = '') => base(`/${EJERCICIO_ARRANQUE}${ruta}`);

export const arranqueApi = {
  estado: () => apiFetch<EstadoArranque>(deEjercicio()),
  aviso: () => apiFetch<AvisoArranque | null>(base('/aviso')),
  comprobaciones: () => apiFetch<ComprobacionesArranque | null>(deEjercicio('/comprobaciones')),
  /** Sube ficheros pequeños (multipart) o ids de subidas por trozos y analiza el borrador. */
  subir: (archivos: File[], subidaIds: string[], ajustes?: AjustesCarga) => {
    const d = new FormData();
    for (const f of archivos) d.append('archivos', f, f.name);
    if (subidaIds.length) d.append('subidaIds', JSON.stringify(subidaIds));
    if (ajustes) d.append('ajustes', JSON.stringify(ajustes));
    return apiFetch<RespuestaCarga>(deEjercicio('/cargas'), { method: 'POST', body: d });
  },
  analizar: (cargaId: string, ajustes: AjustesCarga) =>
    apiFetch<RespuestaCarga>(deEjercicio(`/cargas/${cargaId}/analizar`), { method: 'POST', body: JSON.stringify({ ajustes }) }),
  quitarFichero: (cargaId: string, sha: string) => apiFetch(deEjercicio(`/cargas/${cargaId}/ficheros/${sha}`), { method: 'DELETE' }),
  confirmar: (cargaId: string, huella: string) =>
    apiFetch<{ cargaId: string; version: number; fases: EstadoFase[] }>(deEjercicio(`/cargas/${cargaId}/confirmar`), { method: 'POST', body: JSON.stringify({ huella }) }),
  aplicar: (cargaId: string) => apiFetch<ResultadoFase>(deEjercicio(`/cargas/${cargaId}/aplicar`), { method: 'POST' }),
  vistaDeshacer: (cargaId: string) => apiFetch<PlanDeshacer>(deEjercicio(`/cargas/${cargaId}/deshacer`)),
  deshacer: (cargaId: string, opciones: { devolverAsientos2026: boolean; borrarFichas: string[] }) =>
    apiFetch<PlanDeshacer>(deEjercicio(`/cargas/${cargaId}`), { method: 'DELETE', body: JSON.stringify(opciones) }),
  aceptarAviso: (clave: string, motivo: string) =>
    apiFetch<ComprobacionesArranque>(deEjercicio(`/avisos/${encodeURIComponent(clave)}/aceptar`), { method: 'POST', body: JSON.stringify({ motivo }) }),
  bancos: (bancos: NonNullable<AjustesCarga['bancos']>) =>
    apiFetch<ComprobacionesArranque>(deEjercicio('/bancos'), { method: 'PUT', body: JSON.stringify({ bancos }) }),
  datosFiscales: (datos: Record<string, unknown>) =>
    apiFetch<ComprobacionesArranque>(deEjercicio('/datos-fiscales'), { method: 'PUT', body: JSON.stringify(datos) }),
  series: () => apiFetch<{ series: string[]; texto: string }>(deEjercicio('/series'), { method: 'POST' }),
  volverApp: () => apiFetch<{ texto: string }>(deEjercicio('/ejercicios/llevanza'), { method: 'POST' }),
};

/** Código (details.codigo) de un error del servidor, si lo trae. */
export function codigoDelError(e: unknown): string | undefined {
  const d = e instanceof ApiError ? e.detalles : undefined;
  const c = d && typeof d === 'object' ? (d as { codigo?: unknown }).codigo : undefined;
  return typeof c === 'string' ? c : undefined;
}

// ---------------------------------------------------------------------------
// Facturas de 2026 pendientes (partidas)
// ---------------------------------------------------------------------------

export type EstadoPartida = 'PENDIENTE' | 'PARCIAL' | 'LIQUIDADA' | 'ANULADA';

export interface PartidaVista {
  id: string;
  tipo: 'COBRO' | 'PAGO';
  subcuenta: string;
  tercero: string;
  customerId: string | null;
  supplierId: string | null;
  incomeInvoiceId: string | null;
  expenseInvoiceId: string | null;
  numeroDocumento: string;
  fechaDocumento: string | null;
  fechaVencimiento: string | null;
  importeOriginal: number | null;
  importeInicial: number;
  /** Cobrado o pagado, contando los abonos del proveedor ya descontados. */
  liquidado: number;
  /** De lo liquidado, lo descontado con abonos del proveedor (sin movimiento de dinero). */
  compensado: number;
  pendiente: number;
  moneda: string;
  sinDetalle: boolean;
  estado: EstadoPartida;
  vencida: boolean;
}

export interface Liquidacion {
  id: string;
  fecha: string;
  importe: number;
  comision: number;
  cuentaTesoreria: string;
  estado: 'ACTIVO' | 'ANULADO';
  asiento: string | null;
  nota: string | null;
}

export interface ListaPartidas {
  partidas: PartidaVista[];
  totales: { cobros: { abiertas: number; pendiente: number }; pagos: { abiertas: number; pendiente: number } };
}

export const partidasApi = {
  listar: (filtro: { tipo?: string; estado?: string; tercero?: string; q?: string } = {}) => {
    const qs = new URLSearchParams(Object.entries(filtro).filter(([, v]) => v) as Array<[string, string]>).toString();
    return apiFetch<ListaPartidas>(base(`/partidas${qs ? `?${qs}` : ''}`));
  },
  detalle: (id: string) => apiFetch<PartidaVista & { liquidaciones: Liquidacion[] }>(base(`/partidas/${id}`)),
  liquidar: (id: string, cuerpo: { fecha?: string; importe?: number; comision?: number; cuentaBancariaId?: string; caja?: boolean; nota?: string }) =>
    apiFetch(base(`/partidas/${id}/liquidar`), { method: 'POST', body: JSON.stringify(cuerpo) }),
  anular: (liquidacionId: string, fecha?: string) =>
    apiFetch<{ contraasiento: boolean }>(base(`/partidas/liquidaciones/${liquidacionId}/anular`), { method: 'POST', body: JSON.stringify(fecha ? { fecha } : {}) }),
  conciliar: (movimientoId: string, partidaId: string) =>
    apiFetch(companyPath(`/bancos/movimientos/${movimientoId}/conciliar-partida`), { method: 'POST', body: JSON.stringify({ partidaId }) }),
};

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

/**
 * Importes en euros como en el resto de la app («1.210,00 €», también con
 * cuatro cifras: Intl en es-ES no pone el punto de miles hasta las cinco).
 */
export const eur = { format: (n: number) => euros(n) };
export const fechaEs = (f: string | null | undefined) => (f ? f.slice(0, 10).split('-').reverse().join('/') : '');
/** Número entero o decimal con el punto de miles siempre («1.234»). */
export const numero = (n: number) => {
  const [ent, dec] = String(Math.abs(n)).split('.');
  return `${n < 0 ? '-' : ''}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${dec ? `,${dec}` : ''}`;
};
/** «1 cuenta» / «3 cuentas». */
export const varios = (n: number, uno: string, muchos: string) => `${numero(n)} ${n === 1 ? uno : muchos}`;

/** Importe escrito por la persona («1.250,30», «1250.30», «-80») a número; null si está vacío o no se entiende. */
export function leerImporte(texto: string): number | null {
  const t = texto.trim().replace(/\s|€/g, '');
  if (!t) return null;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** Número para un campo de texto con coma decimal. */
export const importeEnCampo = (n: number | null | undefined) =>
  n === null || n === undefined ? '' : n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
