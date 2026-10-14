/**
 * Calculo de una factura en su moneda y su contravalor en la moneda de la
 * contabilidad, COPIA del backend (src/domain/importesFactura.ts) para enseñar
 * el contravalor antes de guardar. Lo que se ve despues de guardar es siempre
 * lo que devuelve el servidor.
 */
import { redondear2, redondear4 } from './moneda';

export interface LineaCalculo {
  cantidad: number;
  /** En la moneda de la factura. */
  precioUnitario: number;
  descuentoPorcentaje: number;
  tipoIva: number;
  tipoRetencion: number;
  /** Plantilla A: IEEPNR de la línea, ya calculado (lib/plantillasFactura). Va dentro de la base. */
  ieepnr?: number;
}

/**
 * Opciones del cálculo: `simetrico`, solo en las rectificativas; `cuotaPorTipo`
 * (plantilla A), la cuota de cada tipo de IVA sobre la suma de sus bases,
 * repartida entre sus líneas.
 */
export interface OpcionesCalculo {
  simetrico?: boolean;
  cuotaPorTipo?: boolean;
}

export interface Importes {
  baseLine: number;
  ivaImporte: number;
  retencionImporte: number;
  descuentoImporte: number;
  precioUnitario: number;
}

export interface Totales {
  base: number;
  iva: number;
  retencion: number;
  total: number;
  /** Base y cuota por tipo de IVA, de mayor a menor. */
  porTipo: Array<{ tipoIva: number; base: number; cuota: number }>;
}

/** El redondeo de siempre de las facturas en su moneda (no tocar). */
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const cent = (n: number): number => Math.round(n * 100);
const sinCeroNegativo = (n: number): number => (n === 0 ? 0 : n);
const sumar = (valores: number[]): number => sinCeroNegativo(valores.reduce((a, v) => a + cent(v), 0) / 100);

/**
 * Redondeo de las rectificativas: el signo por el redondeo del valor absoluto
 * (-0,525 da -0,53, como 0,525 da 0,53), para que una rectificativa en negativo
 * y su original sumen cero. Las facturas en positivo no cambian.
 */
const round2Simetrico = (n: number): number => sinCeroNegativo(Math.sign(n) * round2(Math.abs(n)));

/**
 * Cuota de IVA de una base (cuotaPorTipo) en enteros, como el servidor:
 * céntimos de la base por el tipo en centésimas, al céntimo con la mitad hacia
 * arriba (con `simetrico`, el negativo como su valor absoluto).
 */
export function cuotaDeBase(base: number, tipo: number, simetrico = false): number {
  const producto = cent(base) * Math.round(tipo * 100);
  const r = simetrico && producto < 0 ? -Math.floor((-producto + 5000) / 10000) : Math.floor((producto + 5000) / 10000);
  return sinCeroNegativo(r / 100);
}

/**
 * Lado documento, como el servidor: por línea; con `cuotaPorTipo` (plantilla
 * A), la cuota de cada tipo sobre la suma de sus bases, repartida entre sus
 * líneas. El IEEPNR de la línea (plantilla A) va dentro de su base.
 * `simetrico`: solo en rectificativas.
 */
export function lineasDoc(lineas: LineaCalculo[], { simetrico = false, cuotaPorTipo = false }: OpcionesCalculo = {}): Importes[] {
  const r = simetrico ? round2Simetrico : round2;
  const out = lineas.map((l) => {
    const pvp = r(l.cantidad * l.precioUnitario);
    const descuentoImporte = r((pvp * l.descuentoPorcentaje) / 100);
    const baseArticulo = r(pvp - descuentoImporte);
    const ieepnr = Number(l.ieepnr ?? 0);
    const baseLine = ieepnr ? r(baseArticulo + r(ieepnr)) : baseArticulo;
    return {
      precioUnitario: l.precioUnitario,
      baseLine,
      descuentoImporte,
      ivaImporte: r((baseLine * l.tipoIva) / 100),
      retencionImporte: r((baseLine * l.tipoRetencion) / 100),
    };
  });
  if (cuotaPorTipo) {
    for (const [t, idx] of Array.from(agrupar(lineas.map((l) => l.tipoIva)))) {
      const objetivo = cuotaDeBase(sumar(idx.map((i) => out[i].baseLine)), t, simetrico);
      const cuotas = repartirCentimos(objetivo, idx.map((i) => (out[i].baseLine * t) / 100));
      idx.forEach((i, k) => (out[i].ivaImporte = cuotas[k]));
    }
  }
  return out;
}

/** Reparto al centimo en proporcion a los brutos (determinista). */
export function repartirCentimos(objetivo: number, brutos: number[]): number[] {
  if (brutos.length === 0) return [];
  const centimos = brutos.map((b) => cent(redondear2(b)));
  let d = cent(redondear2(objetivo)) - centimos.reduce((a, c) => a + c, 0);
  if (d !== 0) {
    const clave = brutos.map((b, i) => (d < 0 ? centimos[i] / 100 - b : b - centimos[i] / 100));
    const orden = brutos.map((_, i) => i).sort((a, b) => clave[b] - clave[a] || a - b);
    const paso = d < 0 ? -1 : 1;
    for (let k = 0; d !== 0; k++) {
      centimos[orden[k % orden.length]] += paso;
      d -= paso;
    }
  }
  return centimos.map((c) => sinCeroNegativo(c / 100));
}

function agrupar(valores: number[]): Map<number, number[]> {
  const grupos = new Map<number, number[]>();
  valores.forEach((v, i) => grupos.set(v, [...(grupos.get(v) ?? []), i]));
  return grupos;
}

/** Convierte a la moneda de cuenta (base por tipo de IVA, cuota sobre la base convertida). */
export function convertirLineas(lineas: LineaCalculo[], doc: Importes[], tipoCambio: number): Importes[] {
  const n = lineas.length;
  const base = new Array<number>(n).fill(0);
  const iva = new Array<number>(n).fill(0);
  const ret = new Array<number>(n).fill(0);
  for (const [t, idx] of Array.from(agrupar(lineas.map((l) => l.tipoIva)))) {
    const sumaDoc = sumar(idx.map((i) => doc[i].baseLine));
    const bases = repartirCentimos(redondear2(sumaDoc / tipoCambio), idx.map((i) => doc[i].baseLine / tipoCambio));
    idx.forEach((i, k) => (base[i] = bases[k]));
    const cuotas = repartirCentimos(redondear2((sumar(bases) * t) / 100), idx.map((i) => (base[i] * t) / 100));
    idx.forEach((i, k) => (iva[i] = cuotas[k]));
  }
  for (const [rt, idx] of Array.from(agrupar(lineas.map((l) => l.tipoRetencion)))) {
    const objetivo = redondear2((sumar(idx.map((i) => base[i])) * rt) / 100);
    const r = repartirCentimos(objetivo, idx.map((i) => (base[i] * rt) / 100));
    idx.forEach((i, k) => (ret[i] = r[k]));
  }
  return doc.map((d, i) => ({
    precioUnitario: redondear4(d.precioUnitario / tipoCambio),
    baseLine: base[i],
    descuentoImporte: redondear2(d.descuentoImporte / tipoCambio),
    ivaImporte: iva[i],
    retencionImporte: ret[i],
  }));
}

export function totales(lineas: LineaCalculo[], importes: Importes[]): Totales {
  const porTipo = new Map<number, { base: number; cuota: number }>();
  importes.forEach((imp, i) => {
    const t = porTipo.get(lineas[i].tipoIva) ?? { base: 0, cuota: 0 };
    porTipo.set(lineas[i].tipoIva, { base: sumar([t.base, imp.baseLine]), cuota: sumar([t.cuota, imp.ivaImporte]) });
  });
  const base = sumar(importes.map((l) => l.baseLine));
  const iva = sumar(importes.map((l) => l.ivaImporte));
  const retencion = sumar(importes.map((l) => l.retencionImporte));
  return {
    base,
    iva,
    retencion,
    total: sumar([base, iva, -retencion]),
    porTipo: Array.from(porTipo.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([tipoIva, v]) => ({ tipoIva, ...v })),
  };
}

/**
 * Totales en la moneda de la factura y, si hay tipo y la moneda no es la de la
 * contabilidad, su contravalor (null si aun no hay tipo). `simetrico`: el
 * redondeo de las rectificativas; `cuotaPorTipo`: el IVA de la plantilla A (lineasDoc).
 */
export function calcularFactura(
  lineas: LineaCalculo[],
  { tipoCambio, mismaMoneda, simetrico = false, cuotaPorTipo = false }: { tipoCambio: number | null; mismaMoneda: boolean } & OpcionesCalculo,
): { doc: Totales; cuenta: Totales | null } {
  const doc = lineasDoc(lineas, { simetrico, cuotaPorTipo });
  const totDoc = totales(lineas, doc);
  if (mismaMoneda) return { doc: totDoc, cuenta: totDoc };
  if (!tipoCambio || !(tipoCambio > 0)) return { doc: totDoc, cuenta: null };
  return { doc: totDoc, cuenta: totales(lineas, convertirLineas(lineas, doc, tipoCambio)) };
}
