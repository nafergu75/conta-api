import { ApiError } from './api';

/**
 * Errores de VERI*FACTU al emitir o al guardar una factura de venta.
 *
 * El servidor comprueba, antes de numerar, lo que la AEAT rechazaría
 * (services/verifactu/alta.ts, validarAlta y problemaDestinatario) y responde
 * 422 con details.codigo VERIFACTU_* y un texto para la persona. Los 409 son
 * FACTURA_REGISTRADA y VERIFACTU_INMUTABLE (una factura registrada no se
 * cambia), VERIFACTU_CONFIG_CAMBIADA (la configuración cambió mientras se
 * emitía) y VERIFACTU_NIF_CAMBIADO (el NIF de la empresa ya no es el dado de
 * alta). El texto se enseña tal cual; aquí solo se decide en qué campo del
 * formulario se marca y qué salida se ofrece al lado.
 *
 * Un 422 deshace la emisión: el borrador sigue guardado y sin número.
 */

/** Dónde se arregla. */
export type ArregloVerifactu =
  /** En la ficha del cliente (NIF, país, nombre). */
  | 'cliente'
  /** En los datos de la empresa (NIF o denominación). */
  | 'empresa'
  /** En Configuración > Series (el código de la serie). */
  | 'serie'
  /** En la propia factura: fechas, tipo, tipo de operación, líneas, descripción. */
  | 'factura'
  /** Volver a emitirla, sin cambiar nada. */
  | 'reintentar'
  /** Ya está registrada: solo se corrige con una rectificativa. */
  | 'rectificativa';

export interface ErrorVerifactu {
  codigo: string;
  status: number;
  /** Texto del servidor, tal cual. */
  mensaje: string;
  /** Campo del formulario de factura, con los nombres de details.campo del servidor. */
  campo?: string;
  arreglo: ArregloVerifactu;
}

/** Lo que no admite la AEAT del cliente de la factura. */
const DEL_CLIENTE = [
  'VERIFACTU_CLIENTE_SIN_NIF',
  'VERIFACTU_CLIENTE_SIN_IDENTIFICACION',
  'VERIFACTU_ID_DESTINATARIO_LARGO',
  'VERIFACTU_NIF_IVA',
  'VERIFACTU_PAIS_CLIENTE',
  'VERIFACTU_R2_DESTINATARIO',
  'VERIFACTU_CLIENTE_ES_EMISOR',
  'VERIFACTU_CLIENTE_SIN_NOMBRE',
  'VERIFACTU_E5_SIN_IDOTRO',
];

/** Lo que no admite de la empresa que emite. */
const DE_LA_EMPRESA = ['VERIFACTU_NIF_EMISOR', 'VERIFACTU_NOMBRE_EMISOR', 'VERIFACTU_NIF_CAMBIADO'];

/** Campo del formulario de cada código de la factura (los del cliente van a «customer»). */
const CAMPO: Record<string, string> = {
  VERIFACTU_NUMERO_SERIE: 'serie',
  VERIFACTU_FECHA_EXPEDICION: 'fechaEmision',
  VERIFACTU_FECHA_OPERACION: 'fechaOperacion',
  VERIFACTU_F2_LIMITE: 'tipoFactura',
  VERIFACTU_DESTINATARIO_PROHIBIDO: 'tipoFactura',
  VERIFACTU_S2: 'tipoFactura',
  VERIFACTU_IVA_EN_OPERACION_SIN_IVA: 'tipoOperacion',
  VERIFACTU_CLAVE_REGIMEN: 'tipoOperacion',
  VERIFACTU_DESGLOSE: 'tipoOperacion',
  VERIFACTU_TIPO_IMPOSITIVO: 'lineas',
  VERIFACTU_CUOTA: 'lineas',
  VERIFACTU_DESGLOSE_VACIO: 'lineas',
  VERIFACTU_DESGLOSE_LARGO: 'lineas',
  VERIFACTU_IMPORTE_GRANDE: 'lineas',
  VERIFACTU_TIPO_RECTIFICATIVA: 'rectificativa.forma',
  VERIFACTU_IMPORTE_RECTIFICACION: 'rectificativa.originales',
  VERIFACTU_DESCRIPCION: 'descripcionOperacion',
};

/** details.codigo de un error del servidor, o undefined. */
export function codigoDelError(e: unknown): string | undefined {
  const d = e instanceof ApiError ? e.detalles : undefined;
  if (!d || typeof d !== 'object') return undefined;
  const { codigo, code } = d as { codigo?: unknown; code?: unknown };
  const c = codigo ?? code;
  return typeof c === 'string' ? c : undefined;
}

/**
 * El error de VERI*FACTU que trae `e`, o null si es otro. `esRect`: en una
 * rectificativa la fecha de la operación es la de la factura que se rectifica,
 * así que se señala la lista de facturas rectificadas.
 */
export function errorVerifactu(e: unknown, opciones: { esRect?: boolean } = {}): ErrorVerifactu | null {
  if (!(e instanceof ApiError)) return null;
  const codigo = codigoDelError(e);
  if (!codigo || !(codigo.startsWith('VERIFACTU_') || codigo === 'FACTURA_REGISTRADA')) return null;
  const d = e.detalles as { campo?: unknown };
  let campo: string | undefined = typeof d.campo === 'string' ? d.campo : undefined;
  let arreglo: ArregloVerifactu = 'factura';
  if (DEL_CLIENTE.includes(codigo)) {
    arreglo = 'cliente';
    if (!campo) campo = 'customer';
  } else if (DE_LA_EMPRESA.includes(codigo)) {
    arreglo = 'empresa';
  } else if (codigo === 'VERIFACTU_NUMERO_SERIE') {
    arreglo = 'serie';
  } else if (codigo === 'VERIFACTU_CONFIG_CAMBIADA') {
    arreglo = 'reintentar';
  } else if (codigo === 'FACTURA_REGISTRADA' || codigo === 'VERIFACTU_INMUTABLE') {
    arreglo = 'rectificativa';
  }
  if (!campo && CAMPO[codigo]) {
    campo = opciones.esRect && codigo === 'VERIFACTU_FECHA_OPERACION' ? 'rectificativa.originales' : CAMPO[codigo];
  }
  return { codigo, status: e.status, mensaje: e.message, campo, arreglo };
}

/** Descripción de la operación del registro: como mucho 500 caracteres (DescripcionOperacion). */
export const MAX_DESCRIPCION_OPERACION = 500;

/** Límite general de una simplificada (art. 4.1.a del RD 1619/2012): 400 € con IVA. */
export const LIMITE_SIMPLIFICADA_GENERAL = 400;

/** Tipos de operación que admiten simplificada (el servidor prohíbe F2 en las demás: tiposFacturaProhibidos). */
const OPERACIONES_CON_SIMPLIFICADA = ['NACIONAL', 'EXENTA'];

/** ¿Admite simplificada este tipo de operación? Sin tipo (factura antigua), sí: el servidor lo vuelve a comprobar. */
export function operacionAdmiteSimplificada(tipoOperacion: string | null | undefined): boolean {
  return !tipoOperacion || OPERACIONES_CON_SIMPLIFICADA.includes(tipoOperacion);
}

/** Propuesta de emitirla como simplificada cuando el cliente no tiene NIF válido. */
export interface PropuestaSimplificada {
  /** Base más IVA, en euros. */
  total: number;
  /** Pasa de 400 €: solo vale en las actividades que llegan a 3.000 €. */
  soloAlgunasActividades: boolean;
}

/**
 * Si una factura completa (F1) que la AEAT rechaza porque el cliente no tiene
 * NIF válido cabe como simplificada (F2): empresa española, sin ser
 * rectificativa, con un tipo de operación que la admite y hasta 3.000 € de base
 * más IVA. null si no cabe.
 */
export function propuestaSimplificada(
  error: ErrorVerifactu | null,
  f: { tipoFactura: string; esRect: boolean; espanola: boolean; f2Prohibida: boolean; totalConIva: number | null; limite: number },
): PropuestaSimplificada | null {
  if (!error || error.codigo !== 'VERIFACTU_CLIENTE_SIN_NIF') return null;
  if (f.tipoFactura !== 'F1' || f.esRect || !f.espanola || f.f2Prohibida) return null;
  if (f.totalConIva === null || !Number.isFinite(f.totalConIva) || f.totalConIva <= 0 || f.totalConIva > f.limite) return null;
  return { total: f.totalConIva, soloAlgunasActividades: f.totalConIva > LIMITE_SIMPLIFICADA_GENERAL };
}
