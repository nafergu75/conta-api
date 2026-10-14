/**
 * Plantilla B (cerámica y materiales de construcción), COPIA del servidor
 * (src/domain/ceramica.ts) más las propuestas de Nueva factura. Lo que se ve
 * después de guardar es siempre lo que devuelve el servidor.
 *
 * Cada línea lleva palets, cajas, m², piezas, formato, calidad, peso y la
 * unidad de su precio: el importe es la cantidad de esa unidad por el precio
 * (5,04 m² × 12,25 = 61,74; 20 piezas × 26,50 = 530,00). Con M2, la cantidad
 * son los m²; con PIEZA o UNIDAD, las piezas (que en el PDF salen en su
 * columna).
 *
 * El cargo de palets de madera («PALETS DE MADERA TRATADA», 1 × 9,00) es una
 * línea más, marcada como cargo, con su cuenta y su IVA: suma en la base, va en
 * el pie del PDF y no cuenta en los totales de palets, cajas, m² ni piezas.
 *
 * Las cajas, los m² y las piezas se proponen unas desde otras con los datos del
 * artículo (m² y piezas por caja), y el peso desde la cantidad (kg por m², por
 * pieza o por unidad), mientras no se escriban a mano.
 */

export const UNIDADES_PRECIO = ['M2', 'PIEZA', 'UNIDAD'] as const;
export type UnidadPrecio = (typeof UNIDADES_PRECIO)[number];

export const esUnidadPrecio = (v: unknown): v is UnidadPrecio => typeof v === 'string' && (UNIDADES_PRECIO as readonly string[]).includes(v);

/** «por m²», «por pieza», «por unidad». */
export const NOMBRE_UNIDAD_PRECIO: Record<UnidadPrecio, string> = { M2: 'm²', PIEZA: 'pieza', UNIDAD: 'unidad' };

export const FORMATO_MAX = 40;
export const CALIDAD_MAX = 10;
export const OBRA_MAX = 200;
export const TEXTO_CARGO_PALETS = 'PALETS DE MADERA TRATADA';

const sinCeroNegativo = (n: number): number => (n === 0 ? 0 : n);

/** n con `decimales` cifras como entero (redondeo simétrico, sin el error binario). */
function aEntero(n: number, decimales: number): number {
  if (!Number.isFinite(n)) return 0;
  const abs = Math.round(Number((Math.abs(n) * 10 ** decimales).toPrecision(15)));
  return n < 0 ? -abs : abs;
}

/** n con 3 decimales como mucho (redondeo simétrico: -0,0005 da -0,001). */
export function redondear3(n: number): number {
  return sinCeroNegativo(aEntero(n, 3) / 1000);
}

/** Lo que suma el resumen de una línea de la plantilla B. */
export interface LineaCeramica {
  cantidad: number;
  palets?: number | null;
  cajas?: number | null;
  metros2?: number | null;
  piezas?: number | null;
  pesoKg?: number | null;
  cargoPalets?: boolean;
  /** Base de la línea (para el importe del cargo de palets). */
  baseLine?: number | null;
}

export interface ResumenCeramica {
  palets: number;
  cajas: number;
  metros2: number;
  piezas: number;
  /** Suma de los pesos escritos en las líneas (el neto y el bruto van aparte, a mano). */
  pesoKg: number;
  cargoPalets: { cantidad: number; importe: number };
}

/** Totales del pie, en enteros (como el servidor): el cargo de palets aparte. */
export function resumenCeramica(lineas: LineaCeramica[]): ResumenCeramica {
  let palets = 0;
  let cajas = 0;
  let m2 = 0;
  let piezas = 0;
  let peso = 0;
  let cargo = 0;
  let importe = 0;
  for (const l of lineas) {
    if (l.cargoPalets) {
      cargo += aEntero(Number(l.cantidad ?? 0), 3);
      importe += aEntero(Number(l.baseLine ?? 0), 2);
      continue;
    }
    palets += Math.trunc(Number(l.palets ?? 0)) || 0;
    cajas += Math.trunc(Number(l.cajas ?? 0)) || 0;
    m2 += aEntero(Number(l.metros2 ?? 0), 3);
    piezas += aEntero(Number(l.piezas ?? 0), 3);
    peso += aEntero(Number(l.pesoKg ?? 0), 3);
  }
  return {
    palets: sinCeroNegativo(palets),
    cajas: sinCeroNegativo(cajas),
    metros2: sinCeroNegativo(m2 / 1000),
    piezas: sinCeroNegativo(piezas / 1000),
    pesoKg: sinCeroNegativo(peso / 1000),
    cargoPalets: { cantidad: sinCeroNegativo(cargo / 1000), importe: sinCeroNegativo(importe / 100) },
  };
}

/** Datos del artículo que sirven para proponer (GET /productos). */
export interface ArticuloCeramica {
  metros2PorCaja?: number | null;
  piezasPorCaja?: number | null;
  unidadPrecio?: string | null;
  pesoKgPorUnidad?: number | null;
}

/** m² que se proponen: cajas × m² por caja, con 3 decimales. null si falta alguno. */
export function propuestaM2(cajas: number | null, a: ArticuloCeramica | undefined): number | null {
  if (cajas === null || !Number.isFinite(cajas) || !a?.metros2PorCaja) return null;
  return sinCeroNegativo(Math.round(aEntero(cajas, 0) * aEntero(a.metros2PorCaja, 4) / 10) / 1000);
}

/** Piezas que se proponen: cajas × piezas por caja. null si falta alguno. */
export function propuestaPiezas(cajas: number | null, a: ArticuloCeramica | undefined): number | null {
  if (cajas === null || !Number.isFinite(cajas) || !a?.piezasPorCaja) return null;
  return sinCeroNegativo(Math.trunc(cajas) * a.piezasPorCaja);
}

/**
 * Cajas que se proponen desde los m² (o las piezas): las cajas enteras que
 * hacen falta (hacia arriba; en negativo, simétrico). null si no hay dato.
 */
export function propuestaCajas(valor: number | null, porCaja: number | null | undefined): number | null {
  if (valor === null || !Number.isFinite(valor) || !porCaja) return null;
  const n = Math.ceil(Number((Math.abs(valor) / porCaja).toPrecision(12)));
  return sinCeroNegativo(valor < 0 ? -n : n);
}

/** Peso que se propone: cantidad × kg por unidad del precio, con 3 decimales. null si falta. */
export function propuestaPeso(cantidad: number | null, a: ArticuloCeramica | undefined): number | null {
  if (cantidad === null || !Number.isFinite(cantidad) || a?.pesoKgPorUnidad === null || a?.pesoKgPorUnidad === undefined) return null;
  return redondear3(cantidad * a.pesoKgPorUnidad);
}

/** La cantidad que se cobra según la unidad del precio: los m² o las piezas. */
export function cantidadDeUnidad(unidad: UnidadPrecio, l: { metros2: number | null; piezas: number | null }): number | null {
  return unidad === 'M2' ? l.metros2 : l.piezas;
}
