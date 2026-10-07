/**
 * Importes con su moneda y tipos de cambio, igual que el backend
 * (src/domain/divisas.ts).
 *
 * Convencion del tipo de cambio (la del BCE): unidades de la moneda de la
 * factura por 1 de la moneda de la contabilidad. "1 EUR = 1,1490 USD" -> 1.149.
 * Para pasar a la moneda de la contabilidad solo se divide.
 */

/** Monedas en las que se puede facturar (el backend manda; esto es la ayuda del formulario). */
export const MONEDAS_FACTURA_ACTIVAS = ['EUR', 'USD'] as const;

export const NOMBRE_MONEDA: Record<string, string> = {
  EUR: 'Euro',
  USD: 'Dólar estadounidense',
};

/** Simbolo corto que no se confunde con otra moneda: € y US$. */
export function simboloMoneda(moneda: string): string {
  const m = (moneda || 'EUR').toUpperCase();
  if (m === 'EUR') return '€';
  if (m === 'USD') return 'US$';
  return m;
}

export type Idioma = 'es' | 'en';

const formatos = new Map<string, Intl.NumberFormat>();
function formateador(idioma: Idioma, moneda: string): Intl.NumberFormat {
  const clave = `${idioma}|${moneda}`;
  let f = formatos.get(clave);
  if (!f) {
    try {
      f = new Intl.NumberFormat(idioma === 'es' ? 'es-ES' : 'en-US', {
        style: 'currency',
        currency: moneda,
        currencyDisplay: 'symbol',
      });
    } catch {
      // Codigo que el navegador no conoce: cifra y codigo.
      f = new Intl.NumberFormat(idioma === 'es' ? 'es-ES' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    formatos.set(clave, f);
  }
  return f;
}

/**
 * 1234.5 -> '1.234,50 €' / '1.234,50 US$' (es) o '€1,234.50' / '$1,234.50' (en).
 * En espanol, los miles de 4 cifras tambien se separan (Intl no lo hace en
 * es-ES: '1234,50 €'). `sinSimbolo`: solo la cifra.
 */
export function formatoImporte(n: number, moneda = 'EUR', opciones: { idioma?: Idioma; sinSimbolo?: boolean } = {}): string {
  const idioma = opciones.idioma ?? 'es';
  const mon = (moneda || 'EUR').toUpperCase();
  const valor = Number.isFinite(n) ? n : 0;
  if (idioma === 'en') {
    const s = formateador('en', mon).format(valor);
    return opciones.sinSimbolo ? s.replace(/[^\d.,\-−]/g, '') : s;
  }
  const signo = valor < 0 ? '−' : '';
  const [ent, dec] = Math.abs(valor).toFixed(2).split('.');
  const cifra = `${signo}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
  if (opciones.sinSimbolo) return cifra;
  return `${cifra} ${simboloMoneda(mon)}`;
}

/** Tipo con 4 decimales: 1.149 -> '1,1490'. */
export function formatoTipo(tipoCambio: number): string {
  return tipoCambio.toFixed(4).replace('.', ',');
}

/** Texto unico del tipo: '1 EUR = 1,1490 USD'. */
export function textoTipo(monedaCuenta: string, moneda: string, tipoCambio: number): string {
  return `1 ${monedaCuenta} = ${formatoTipo(tipoCambio)} ${moneda}`;
}

/** Redondeo simetrico a 2 decimales (mitad lejos de cero), el de la conversion. */
export function redondear2(n: number): number {
  if (!Number.isFinite(n)) return n;
  const r = Math.round(Number((Math.abs(n) * 100).toPrecision(15))) / 100;
  return n < 0 && r !== 0 ? -r : r;
}

export function redondear4(n: number): number {
  if (!Number.isFinite(n)) return n;
  const r = Math.round(Number((Math.abs(n) * 10000).toPrecision(15))) / 10000;
  return n < 0 && r !== 0 ? -r : r;
}

/**
 * Lee un importe escrito a mano: '1.210,50', '1210.50', '1,210.50', '1 210,50 €',
 * '$1,210.50', 'USD 1210'. NaN si no es un numero.
 */
export function parseImporte(texto: string): number {
  let s = String(texto ?? '')
    .replace(/[€$]|US\$|EUR|USD/gi, '')
    .replace(/[\s  ]/g, '')
    .replace('−', '-');
  if (!s) return NaN;
  const coma = s.lastIndexOf(',');
  const punto = s.lastIndexOf('.');
  if (coma >= 0 && punto >= 0) {
    // El ultimo separador es el decimal.
    s = coma > punto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (coma >= 0) {
    s = s.replace(',', '.');
  } else if (punto >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
    // '1.210' con punto de miles y sin decimales.
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Validacion del tipo manual frente al del BCE (la misma del backend): un tipo
 * casi igual al inverso del BCE esta escrito al reves (0,87 en vez de 1,149).
 */
export function pareceInvertido(manual: number, bce: number): boolean {
  return Math.abs(manual * bce - 1) < 0.03 && Math.abs(bce - 1) > 0.05;
}

/** Desviacion relativa del tipo manual respecto del BCE (0,006 = 0,6 %). */
export function desviacion(manual: number, bce: number): number {
  return Math.abs(manual / bce - 1);
}

export const DESVIACION_AVISO = 0.005;
