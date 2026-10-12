/**
 * Abonos y facturas rectificativas de proveedor en el formulario de Compras:
 * el estado del bloque «Rectificación», como se rellena (desde la factura
 * original, desde una rectificativa guardada o desde el lector) y el bloque
 * `rectificativa` que se manda al servidor. Sin React.
 *
 * El servidor decide (backend: schemas/factura-gasto.schemas.ts y
 * domain/rectificativa-gasto.model.ts); aqui solo se prepara lo que se envia
 * y se avisa de lo que falta antes de enviarlo.
 */
import { parseImporte } from './moneda';
import {
  CAUSA_INFO,
  type CandidataOriginal,
  type CausaRectificacion,
  type DatosParaRectificar,
  esCausaRectificacion,
  type GastoDetalle,
  type TipoRectificativa,
} from './compras';
import type { RectificativaLeida } from './lecturas';

/** Una factura que rectifica: elegida de las de la app o escrita a mano (de fuera de la app). */
export interface OriginalForm {
  clave: number;
  origen: 'app' | 'fuera';
  /** Solo en las de la app. */
  id?: string;
  numeroCompleto?: string;
  /** Numero que puso el proveedor. */
  numero: string;
  /** Fecha de la factura (AAAA-MM-DD). */
  fecha: string;
  /** Total de la original (de la app), para avisar de un aumento muy grande. */
  total?: number;
  /** Reparto entre varias facturas (opcional; vacio = lo reparte la app). En positivo, como las lineas. */
  base: string;
  cuota: string;
}

/** Linea de la factura original de una sustitucion. */
export interface LineaOriginal {
  clave: number;
  descripcion: string;
  cantidad: string;
  precio: string;
  tipoIva: number;
  tipoRetencion: number;
}

export type Sentido = 'REDUCE' | 'AUMENTA';

export interface EstadoRectificacion {
  tipo: TipoRectificativa | null;
  causa: CausaRectificacion | '';
  motivo: string;
  /** Solo por diferencias: si el abono baja el importe (lo normal) o lo sube. */
  sentido: Sentido | null;
  /** Que rectifica: facturas concretas o un periodo (rappel o descuento por volumen). */
  que: 'facturas' | 'periodo';
  originales: OriginalForm[];
  periodo: { desde: string; hasta: string };
  /** Con una original de fuera de la app: ¿ya se le pago? (false = se descuenta de lo que se le debe). */
  yaPagada: boolean | null;
  /** Sustitucion: lineas de la factura original. */
  lineasOriginal: LineaOriginal[];
  /** Las lineas de la original vienen de la app (solo lectura). */
  lineasOriginalDeApp: boolean;
}

let clave = 1;
export const nuevaClave = () => clave++;

const texto = (n: number | null | undefined) => (n === undefined || n === null || !Number.isFinite(n) ? '' : String(n).replace('.', ','));

export function estadoVacio(): EstadoRectificacion {
  return { tipo: 'I', causa: '', motivo: '', sentido: 'REDUCE', que: 'facturas', originales: [], periodo: { desde: '', hasta: '' }, yaPagada: null, lineasOriginal: [], lineasOriginalDeApp: false };
}

/** Una original de la app a partir de una candidata de la busqueda. */
export function originalDeCandidata(c: CandidataOriginal): OriginalForm {
  return { clave: nuevaClave(), origen: 'app', id: c.id, numeroCompleto: c.numeroCompleto, numero: c.numero ?? '', fecha: c.fecha, total: c.total, base: '', cuota: '' };
}

/** Una original de fuera de la app (numero y fecha a mano). */
export function originalDeFuera(numero = '', fecha = ''): OriginalForm {
  return { clave: nuevaClave(), origen: 'fuera', numero, fecha, base: '', cuota: '' };
}

/** Lineas de la original de la app, para la sustitucion (solo lectura). */
export function lineasDeDatos(d: DatosParaRectificar): LineaOriginal[] {
  return d.lineas.map((l) => ({
    clave: nuevaClave(),
    descripcion: l.descripcion,
    cantidad: texto(l.cantidad),
    precio: texto(l.precioUnitario),
    tipoIva: l.tipoIva,
    tipoRetencion: l.tipoRetencion,
  }));
}

/** Abono de una factura de la app (Compras › la factura › Registrar abono o rectificativa). */
export function estadoDesdeDatos(d: DatosParaRectificar): EstadoRectificacion {
  return {
    ...estadoVacio(),
    originales: [
      {
        clave: nuevaClave(),
        origen: 'app',
        id: d.original.id,
        numeroCompleto: d.original.numeroCompleto,
        numero: d.original.numero ?? '',
        fecha: d.original.fechaEmision,
        total: d.original.totalFactura,
        base: '',
        cuota: '',
      },
    ],
    lineasOriginal: lineasDeDatos(d),
    lineasOriginalDeApp: true,
  };
}

/**
 * Una rectificativa guardada, para corregirla. Las lineas guardadas llevan su
 * signo: el formulario las ensena en positivo con «Reduce el importe» si el
 * total es negativo (las que van al reves, con el signo menos).
 */
export function estadoDesdeFicha(g: GastoDetalle): EstadoRectificacion | null {
  const r = g.rectificativa;
  if (!r) return null;
  const varias = r.originales.length > 1;
  return {
    ...estadoVacio(),
    tipo: r.tipo === 'S' ? 'S' : 'I',
    causa: esCausaRectificacion(r.causa) ? r.causa : '',
    motivo: r.motivo ?? '',
    sentido: g.totalFactura < 0 ? 'REDUCE' : 'AUMENTA',
    que: r.periodo ? 'periodo' : 'facturas',
    periodo: r.periodo ?? { desde: '', hasta: '' },
    originales: r.originales.map((o) => ({
      clave: nuevaClave(),
      origen: o.id ? 'app' : 'fuera',
      ...(o.id ? { id: o.id, numeroCompleto: o.numeroCompleto ?? undefined } : {}),
      numero: o.numero ?? '',
      fecha: o.fecha ?? '',
      // El reparto guardado va con signo; en el formulario, en positivo como las lineas.
      base: varias && o.base !== null ? texto(Math.abs(o.base)) : '',
      cuota: varias && o.cuota !== null ? texto(Math.abs(o.cuota)) : '',
    })),
  };
}

/**
 * Lo que propone el lector (seccion 12 de la especificacion):
 *  - importes en negativo: por diferencias y «Reduce el importe»;
 *  - en positivo: por sustitucion si el servidor lo propone (pasa del 50 % de
 *    la original); si no, sin elegir (hay que decir si es I o S);
 *  - la original propuesta (de la app) o, sin proveedor en la app, una «de
 *    fuera» con el numero leido.
 */
export function estadoDesdeLectura(r: RectificativaLeida): EstadoRectificacion {
  const original = r.propuesta?.original ?? null;
  const originales: OriginalForm[] = original
    ? [originalDeCandidata(original)]
    : !r.propuesta && r.numeroRectificada
      ? [originalDeFuera(r.numeroRectificada)]
      : [];
  return {
    ...estadoVacio(),
    tipo: r.tipoPropuesto,
    causa: r.causaPropuesta ?? '',
    motivo: r.motivo ?? '',
    sentido: r.sentido === 'REDUCE' ? 'REDUCE' : null,
    originales,
  };
}

/** Signo de las lineas: -1 si el abono reduce el importe. */
export const signoDe = (e: EstadoRectificacion): 1 | -1 => (e.tipo === 'S' || e.sentido !== 'REDUCE' ? 1 : -1);

/** La causa solo admite bajar el importe. */
export const soloBaja = (e: EstadoRectificacion) => !!e.causa && CAUSA_INFO[e.causa].soloBaja;

/** Hay alguna original de fuera de la app. */
export const conOriginalDeFuera = (e: EstadoRectificacion) => e.que === 'facturas' && e.originales.some((o) => o.origen === 'fuera');

/** Lo primero que falta en el bloque, con el id del control que lo arregla. null si esta completo. */
export function faltaEnBloque(e: EstadoRectificacion, abono: boolean): { mensaje: string; campo: string } | null {
  if (!e.tipo) return { mensaje: 'Elige si la rectificativa es por diferencias o por sustitución.', campo: 'rectificativa.tipo' };
  if (!e.causa) return { mensaje: 'Elige la causa de la rectificación.', campo: 'rectificativa.causa' };
  if (e.tipo === 'I' && !e.sentido) return { mensaje: 'Indica si la rectificativa reduce el importe (abono) o lo aumenta.', campo: 'rectificativa.sentido' };
  if (e.que === 'periodo') {
    if (!e.periodo.desde || !e.periodo.hasta) return { mensaje: 'Indica el periodo del rappel o del descuento: desde y hasta.', campo: 'rectificativa.periodo' };
    return null;
  }
  if (!e.originales.length) return { mensaje: 'Indica qué factura rectifica, o el periodo si es un descuento por volumen.', campo: 'rectificativa.originales' };
  for (let i = 0; i < e.originales.length; i++) {
    const o = e.originales[i];
    if (o.origen === 'fuera' && !o.numero.trim()) return { mensaje: 'Escribe el número de la factura que rectifica.', campo: `rectificativa.originales.${i}.numero` };
    if (o.origen === 'fuera' && !o.fecha) return { mensaje: 'Indica la fecha de la factura que rectifica.', campo: `rectificativa.originales.${i}.fecha` };
  }
  if (e.tipo === 'S' && e.originales.length !== 1) return { mensaje: 'Una rectificativa por sustitución corrige una sola factura.', campo: 'rectificativa.originales' };
  if (e.tipo === 'S' && !e.lineasOriginal.length) return { mensaje: 'Escribe las líneas de la factura original para calcular la diferencia.', campo: 'rectificativa.importesOriginales' };
  if (abono && conOriginalDeFuera(e) && e.yaPagada === null) {
    return { mensaje: 'Indica si ya has pagado la factura que rectifica.', campo: 'rectificativa.yaPagada' };
  }
  return null;
}

/** Linea completa como la espera el servidor. */
export interface LineaCuerpo {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuentoPorcentaje?: number;
  tipoIva: number;
  tipoRetencion: number;
  cuenta?: string;
}

/**
 * Bloque `rectificativa` del cuerpo. `lineasCorregidas`: en una sustitucion,
 * las lineas de la factura corregida (las del formulario). `signo`: el de los
 * repartos entre varias facturas (los de las lineas los pone el formulario).
 */
export function bloqueParaEnviar(
  e: EstadoRectificacion,
  opciones: { lineasCorregidas?: LineaCuerpo[]; abono: boolean; confirmaRectificar303?: boolean },
): Record<string, unknown> {
  const signo = signoDe(e);
  const varias = e.originales.length > 1;
  const reparto = (v: string) => {
    const n = parseImporte(v);
    return v.trim() && Number.isFinite(n) ? signo * Math.abs(n) : undefined;
  };
  const originales =
    e.que === 'facturas'
      ? e.originales.map((o) => {
          const base = varias ? reparto(o.base) : undefined;
          const cuota = varias ? reparto(o.cuota) : undefined;
          return {
            ...(o.origen === 'app' && o.id ? { id: o.id } : { numero: o.numero.trim(), fecha: o.fecha }),
            ...(base !== undefined ? { base } : {}),
            ...(cuota !== undefined ? { cuota } : {}),
          };
        })
      : [];
  const sustitucion = e.tipo === 'S';
  const originalDeFuera = sustitucion && e.originales[0]?.origen === 'fuera';
  return {
    tipo: e.tipo,
    causa: e.causa,
    ...(e.motivo.trim() ? { motivo: e.motivo.trim() } : {}),
    originales,
    ...(e.que === 'periodo' ? { periodo: { desde: e.periodo.desde, hasta: e.periodo.hasta } } : {}),
    ...(sustitucion && opciones.lineasCorregidas ? { corregida: { lineas: opciones.lineasCorregidas } } : {}),
    ...(originalDeFuera
      ? {
          importesOriginales: {
            lineas: e.lineasOriginal.map((l) => ({
              descripcion: l.descripcion.trim() || 'Factura original',
              cantidad: parseImporte(l.cantidad),
              precioUnitario: parseImporte(l.precio),
              tipoIva: l.tipoIva,
              tipoRetencion: l.tipoRetencion,
            })),
          },
        }
      : {}),
    ...(opciones.abono && conOriginalDeFuera(e) && e.yaPagada !== null ? { yaPagada: e.yaPagada } : {}),
    ...(opciones.confirmaRectificar303 ? { confirmaRectificar303: true } : {}),
  };
}
