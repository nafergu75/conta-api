/**
 * Plantillas de las facturas de venta e IEEPNR, COPIA del servidor
 * (src/domain/plantillasFactura.ts y src/domain/ieepnr.ts) para enseñar en
 * Nueva factura lo mismo que se va a guardar. Lo que se ve después de guardar
 * es siempre lo que devuelve el servidor.
 *
 *  - 'default' (Estándar): la de siempre.
 *  - 'A': envases (packs, unidades, kg de plástico e IEEPNR), como la factura
 *    NZ004_26. El IVA se calcula por tipo, no por línea, y no hay descuento.
 *  - 'B': cerámica y materiales de construcción (palets, cajas, m², piezas,
 *    formato, calidad, peso, obra, pesos neto y bruto y cargo de palets), como
 *    la factura NZ013_2026. El IVA se calcula por tipo y no hay descuento.
 *  - 'C': la estándar con otro nombre (prestaciones de servicios).
 *
 * Cada serie tiene su plantilla (Configuración > Series). La factura toma la
 * de su serie; una rectificativa de una factura de la app, la de esa factura.
 * Sin plantilla elegida: la serie A usa la A si la empresa repercute el IEEPNR
 * y la B, la B si la empresa vende cerámica (las dos casillas, en
 * Configuración > Facturación); la C, la C; el resto, la estándar. La A y la
 * B, solo en empresas españolas. Lo dice el servidor (seriesAutomaticas), y
 * cada serie trae por qué usa la suya (motivoPlantilla).
 */
import { useEffect, useState } from 'react';
import { apiFetch, companyPath, errorMessage } from './api';
import { simboloMoneda } from './moneda';

export const PLANTILLAS_VENTA = ['default', 'A', 'B', 'C'] as const;
export type PlantillaVentaId = (typeof PLANTILLAS_VENTA)[number];

/** GET /series/plantillas. */
export interface PlantillaCatalogo {
  id: PlantillaVentaId;
  nombre: string;
  descripcion: string;
  /** Lleva packs, kg de plástico, IEEPNR, texto adicional y peso bruto (la A). */
  envases: boolean;
  /** Lleva palets, cajas, m², piezas, formato, calidad, peso, obra, pesos y cargo de palets (la B). Un servidor anterior no lo manda. */
  ceramica?: boolean;
  /** Admite descuento por línea (la A y la B, no). */
  descuento?: boolean;
  /** 'linea': la cuota de IVA se redondea en cada línea. 'tipo': sobre la suma de bases de cada tipo. */
  calculoIva: 'linea' | 'tipo';
  soloEmpresaEspanola: boolean;
  /** Tiene su diseño. */
  disenada?: boolean;
  /** Se puede elegir en esta empresa (la A y la B, solo en una española). */
  disponible: boolean;
  /** Es la que usa la serie A sin plantilla elegida (la A, si la empresa repercute el IEEPNR). */
  automaticaSerieA?: boolean;
  /** Las series A, B o C que la usan sin elegirla (las demás, la estándar). */
  seriesAutomaticas?: string[];
}

/**
 * Por qué una serie usa su plantilla (GET /series, `motivoPlantilla`; un
 * servidor anterior no lo manda). Copia de motivoPlantillaSerie del servidor:
 *  - 'elegida': elegida en Configuración > Series;
 *  - 'ieepnr' / 'ceramica': la A o la B, solas en la serie A o B, porque su casilla está marcada;
 *  - 'serieC': la C, sola en la serie C;
 *  - 'sinIeepnr' / 'sinCeramica': la estándar en la serie A o B, porque su casilla está sin marcar;
 *  - 'soloEspana': la estándar, porque la A y la B solo valen en empresas españolas;
 *  - 'estandar': la estándar en las demás series.
 */
export type MotivoPlantilla = 'elegida' | 'ieepnr' | 'ceramica' | 'serieC' | 'sinIeepnr' | 'sinCeramica' | 'soloEspana' | 'estandar';

/** Las casillas de Configuración > Facturación que deciden la plantilla de las series A y B (mismo texto que la pantalla). */
export const CASILLA_IEEPNR = 'Repercuto el IEEPNR en mis facturas';
export const CASILLA_CERAMICA = 'Vendo cerámica y materiales de construcción';

/** Columnas propias de la plantilla A y de la B, para explicar en pantalla qué cambia. */
export const COLUMNAS_PLANTILLA_A = 'Packs, Uds, KG plástico, IEEPNR, Precio/uds y Total';
export const COLUMNAS_PLANTILLA_B = 'palets, cajas, m², piezas, formato, calidad, peso y precio por m² o por pieza';

/** Ruta de Configuración > Facturación, donde están las dos casillas. */
export const RUTA_AJUSTES_FACTURACION = '/dashboard/configuracion/facturacion';

/**
 * Por qué usa la serie su plantilla, en pocas palabras (va entre paréntesis
 * tras el nombre). Sin el dato (servidor anterior): «automática» o «elegida».
 */
export function textoMotivoPlantilla(motivo: MotivoPlantilla | undefined, elegida: boolean): string {
  switch (motivo) {
    case 'elegida':
      return 'elegida en la serie';
    case 'ieepnr':
      return 'automática: repercutes el IEEPNR';
    case 'ceramica':
      return 'automática: vendes cerámica';
    case 'serieC':
      return 'automática de la serie C';
    case 'sinIeepnr':
    case 'sinCeramica':
      // La casilla que falta se explica aparte (plantillaPorCasilla), con su enlace.
      return 'automática';
    case 'soloEspana':
      return 'la A y la B solo valen en empresas españolas';
    case 'estandar':
      return 'automática';
    default:
      return elegida ? 'elegida en la serie' : 'automática';
  }
}

/**
 * La serie usa la estándar porque una casilla de Configuración > Facturación
 * está sin marcar: qué plantilla tendría, qué casilla la activa y sus columnas.
 * null si no es el caso.
 */
export function plantillaPorCasilla(motivo: MotivoPlantilla | string | undefined): { plantilla: 'A' | 'B'; casilla: string; que: string; columnas: string } | null {
  if (motivo === 'sinIeepnr') return { plantilla: 'A', casilla: CASILLA_IEEPNR, que: 'envases e IEEPNR', columnas: COLUMNAS_PLANTILLA_A };
  if (motivo === 'sinCeramica') return { plantilla: 'B', casilla: CASILLA_CERAMICA, que: 'cerámica', columnas: COLUMNAS_PLANTILLA_B };
  return null;
}

/** Nombre corto para las listas, por si el servidor no manda el catálogo. */
export const NOMBRE_PLANTILLA: Record<PlantillaVentaId, string> = {
  default: 'Estándar',
  A: 'Plantilla A (envases)',
  B: 'Plantilla B (cerámica)',
  C: 'Plantilla C (servicios)',
};

export const esPlantillaVenta = (v: unknown): v is PlantillaVentaId => typeof v === 'string' && (PLANTILLAS_VENTA as readonly string[]).includes(v);

/** Un valor desconocido o vacío pasa a 'default' (como el servidor). */
export const normalizarPlantilla = (v: unknown): PlantillaVentaId => (esPlantillaVenta(v) ? v : 'default');

/** Lleva packs, kg, IEEPNR y peso bruto. Solo la A. */
export const admiteEnvases = (id: unknown): boolean => normalizarPlantilla(id) === 'A';

/** Lleva palets, cajas, m², piezas, formato, calidad, peso, obra, pesos neto y bruto y cargo de palets. Solo la B. */
export const admiteCeramica = (id: unknown): boolean => normalizarPlantilla(id) === 'B';

/** Admite descuento por línea (la estándar y la C; la A y la B, no). */
export const admiteDescuento = (id: unknown): boolean => !['A', 'B'].includes(normalizarPlantilla(id));

/** Lleva texto adicional bajo el concepto y peso bruto (la A y la B). */
export const admiteTextoAdicional = (id: unknown): boolean => ['A', 'B'].includes(normalizarPlantilla(id));

/** El IVA se calcula sobre la suma de bases de cada tipo (la A y la B). */
export const ivaPorTipo = (id: unknown): boolean => ['A', 'B'].includes(normalizarPlantilla(id));

/** Catálogo de plantillas de la empresa (Configuración > Series). null mientras carga o si el servidor no lo tiene. */
export function useCatalogoPlantillas(activo: boolean): { catalogo: PlantillaCatalogo[] | null; error: string } {
  const [catalogo, setCatalogo] = useState<PlantillaCatalogo[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    apiFetch<PlantillaCatalogo[]>(companyPath('/series/plantillas'))
      .then((c) => vivo && setCatalogo(Array.isArray(c) ? c : []))
      .catch((e) => vivo && (setCatalogo(null), setError(errorMessage(e))));
    return () => {
      vivo = false;
    };
  }, [activo]);
  return { catalogo, error };
}

// ---------------------------------------------------------------------------
// Texto adicional
// ---------------------------------------------------------------------------

/** Texto adicional bajo el concepto (del artículo o de la línea): 500 caracteres y 6 líneas como mucho. */
export const TEXTO_ADICIONAL_MAX = 500;
export const TEXTO_ADICIONAL_LINEAS_MAX = 6;

/** Problema del texto adicional (null si vale), con las mismas reglas que el servidor. */
export function problemaTextoAdicional(texto: string): string | null {
  const t = texto
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .trim();
  if (t.length > TEXTO_ADICIONAL_MAX) return `El texto adicional admite ${TEXTO_ADICIONAL_MAX} caracteres como mucho.`;
  if (t && t.split('\n').length > TEXTO_ADICIONAL_LINEAS_MAX) return `El texto adicional admite ${TEXTO_ADICIONAL_LINEAS_MAX} líneas como mucho.`;
  return null;
}

// ---------------------------------------------------------------------------
// IEEPNR (Ley 7/2022): en enteros, como el servidor
// ---------------------------------------------------------------------------

/** Tipo de la Ley 7/2022: 0,45 € por kg de plástico no reciclado. */
export const IEEPNR_POR_KG_DEFECTO = 0.45;

/** n con `decimales` cifras como entero (redondeo simétrico, sin el error binario). */
function aEntero(n: number, decimales: number): bigint {
  if (!Number.isFinite(n)) return BigInt(0);
  const abs = Math.round(Number((Math.abs(n) * 10 ** decimales).toPrecision(15)));
  return BigInt(n < 0 ? -abs : abs);
}

/** División entera redondeando hacia abajo (BigInt trunca hacia el cero). */
function divSuelo(a: bigint, b: bigint): bigint {
  const q = a / b;
  return a % b !== BigInt(0) && (a < BigInt(0)) !== (b < BigInt(0)) ? q - BigInt(1) : q;
}

const sinCeroNegativo = (n: number): number => (n === 0 ? 0 : n);

/** Kg con 3 decimales como mucho (redondeo simétrico: -0,0005 da -0,001). */
export function redondearKg(kg: number): number {
  return sinCeroNegativo(Number(aEntero(kg, 3)) / 1000);
}

/**
 * IEEPNR de una línea: kg × tipo, redondeado al céntimo con la mitad hacia
 * arriba. Con `simetrico` (rectificativas), el negativo como su valor absoluto
 * (-0,005 da -0,01). Sin kg o sin tipo, 0.
 */
export function calcularIeepnr(kg: number | null | undefined, tipo: number | null | undefined, { simetrico = false }: { simetrico?: boolean } = {}): number {
  if (!kg || !tipo) return 0;
  const producto = aEntero(kg, 3) * aEntero(tipo, 4);
  const paso = BigInt(100000);
  const mitad = BigInt(50000);
  const centimos = simetrico && producto < BigInt(0) ? -divSuelo(-producto + mitad, paso) : divSuelo(producto + mitad, paso);
  return sinCeroNegativo(Number(centimos) / 100);
}

/** Uds que se proponen: packs × unidades por pack (null si falta alguno). */
export function propuestaUds(packs: number | null, unidadesPorPack: number | null | undefined): number | null {
  if (packs === null || !Number.isFinite(packs) || !unidadesPorPack) return null;
  return sinCeroNegativo(packs * unidadesPorPack);
}

/** Kg que se proponen: uds × kg por unidad, con 3 decimales (redondeo simétrico). null si falta alguno. */
export function propuestaKg(uds: number | null, kgPorUnidad: number | null | undefined): number | null {
  if (uds === null || !Number.isFinite(uds) || kgPorUnidad === null || kgPorUnidad === undefined || !Number.isFinite(kgPorUnidad)) return null;
  // milésimas de unidad × millonésimas de kg = 1e-9 kg; se redondea a milésimas de kg.
  const producto = aEntero(uds, 3) * aEntero(kgPorUnidad, 6);
  const paso = BigInt(1000000);
  const mitad = BigInt(500000);
  const milesimas = producto < BigInt(0) ? -divSuelo(-producto + mitad, paso) : divSuelo(producto + mitad, paso);
  return sinCeroNegativo(Number(milesimas) / 1000);
}

/** Lo que suma el resumen de una línea con envases. */
export interface LineaEnvases {
  cantidad: number;
  packs?: number | null;
  kgPlastico?: number | null;
  ieepnrImporte?: number | null;
}

export interface ResumenEnvases {
  kgPlastico: number;
  packs: number;
  uds: number;
  ieepnr: number;
}

/** Totales de envases de una factura, sumados en milésimas y en céntimos (como el servidor). */
export function resumenEnvases(lineas: LineaEnvases[]): ResumenEnvases {
  let kg = BigInt(0);
  let uds = BigInt(0);
  let packs = 0;
  let ieepnr = 0;
  for (const l of lineas) {
    kg += aEntero(Number(l.kgPlastico ?? 0), 3);
    uds += aEntero(Number(l.cantidad ?? 0), 3);
    packs += Math.trunc(Number(l.packs ?? 0));
    ieepnr += Math.round(Number(l.ieepnrImporte ?? 0) * 100);
  }
  return {
    kgPlastico: sinCeroNegativo(Number(kg) / 1000),
    packs: sinCeroNegativo(packs),
    uds: sinCeroNegativo(Number(uds) / 1000),
    ieepnr: sinCeroNegativo(ieepnr / 100),
  };
}

// ---------------------------------------------------------------------------
// Lectura y formato de cantidades
// ---------------------------------------------------------------------------

/**
 * Número escrito a mano en una casilla de packs, uds o kg: coma o punto
 * decimal y sin separador de miles ('103,089' o '103.089' son 103,089 kg).
 * null si está vacío; NaN si no es un número.
 */
export function leerCantidad(texto: string): number | null {
  const t = String(texto ?? '')
    .replace(/[\s ]/g, '')
    .replace('−', '-');
  if (!t) return null;
  if (!/^-?\d+([.,]\d+)?$/.test(t)) return NaN;
  return Number(t.replace(',', '.'));
}

/** Decimales que tiene un número (0,033558 tiene 6). */
export function decimalesDe(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const s = String(Math.abs(n));
  if (s.includes('e-')) return Number(s.split('e-')[1]);
  return s.includes('.') ? s.split('.')[1].length : 0;
}

/** Cifra en español con punto de miles y hasta `max` decimales, sin ceros de más (394,992; 46.320). */
export function formatoCantidad(n: number, max = 3): string {
  const v = Number.isFinite(n) ? n : 0;
  let [ent, dec = ''] = Math.abs(v).toFixed(max).split('.');
  dec = dec.replace(/0+$/, '');
  const signo = v < 0 && Number(Math.abs(v).toFixed(max)) !== 0 ? '−' : '';
  return `${signo}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${dec ? `,${dec}` : ''}`;
}

/** Precio por unidad de la plantilla A: de 2 a 4 decimales, como en su PDF (0,162 €; 12,50 €). */
export function formatoPrecio(n: number, moneda = 'EUR'): string {
  const cifra = formatoCantidad(n, 4);
  const [ent, dec = ''] = cifra.split(',');
  return `${ent},${dec.padEnd(2, '0')} ${simboloMoneda(moneda)}`;
}

/** Valor de una casilla editable: sin miles y con coma decimal (103,089). */
export function paraEditar(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  return String(n).replace('.', ',');
}
