/**
 * Lector de ventas: «Corregir los datos» y «Rellenarla a mano» (spec
 * lector-editable). Sin React: lo usan components/lector/CorreccionVenta.tsx y
 * la pagina ventas/lector-ingresos.
 *
 * La persona corrige el numero, las fechas, el concepto, las lineas (base,
 * tipo de IVA y cuenta), la retencion y el total. Al registrar se manda el
 * bloque `correcciones` de POST /ingresos-extractor/confirmar solo con lo
 * cambiado; el servidor lo vuelve a validar como una lectura y decide.
 *
 * El cuadre de la pantalla usa el MISMO calculo que el servidor
 * (correcciones-venta.ts, cuotasFijasPorTipo, y comprobarTotales): la cuota de
 * cada tipo de IVA se calcula sobre la suma de sus bases y se reparte al
 * centimo entre sus lineas; la retencion, linea a linea. Si no coinciden, el
 * servidor da 400 NO_CUADRA, que es quien manda.
 */
import { repartirCentimos } from './divisas';
import { parseImporte, redondear2 } from './moneda';
import { claveTexto, euros, fechaLegible, porcentaje, type CampoId, type EstadoCampo, type IngresoExtraido, type InfoLectura, type NivelValidacion } from './lecturas';

/** Tipos de IVA que se pueden poner en una venta leida (los mismos que admite el servidor). */
export const TIPOS_IVA_VENTA = [21, 10, 5, 4, 0];
const MAX_LINEAS = 50;

export interface LineaCorreccion {
  /** Para seguir la linea aunque se quiten o se anadan otras. */
  clave: number;
  descripcion: string;
  /** Tal como se escribe ('1.210,50'). */
  base: string;
  tipoIva: number;
  /** Cuenta de ingresos elegida con «Cambiar cuenta»; null: la de por defecto. */
  cuenta: string | null;
}

export interface EstadoCorreccion {
  numero: string;
  /** AAAA-MM-DD o vacio. */
  fechaEmision: string;
  /** AAAA-MM-DD; vacio: la de por defecto. */
  fechaVencimiento: string;
  concepto: string;
  lineas: LineaCorreccion[];
  /** Porcentaje de retencion de IRPF, tal como se escribe ('15'); una sola para toda la factura. */
  tipoRetencion: string;
  /** Total a cobrar, tal como se escribe. */
  total: string;
}

let siguienteClave = 1;

/** 1210.5 -> '1210,5' (para un campo que se lee con parseImporte). */
export const aTexto = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? '' : String(n).replace('.', ','));

export function lineaVacia(tipoIva = 21): LineaCorreccion {
  return { clave: siguienteClave++, descripcion: '', base: '', tipoIva, cuenta: null };
}

const esFecha = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const texto = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');

/**
 * Porcentaje de retencion leido: el de la lectura o, si solo se leyo el
 * importe, importe / base en entero. Es el mismo que usa el servidor
 * (tipoRetencionLeido) cuando no se le manda otro: asi el cuadre de aqui y el
 * suyo dan lo mismo.
 */
function retencionLeida(ingreso: IngresoExtraido, info: InfoLectura): number {
  const tipo = info.campos['retencion.tipo']?.valorLeido;
  if (typeof tipo === 'number' && Number.isFinite(tipo) && tipo > 0) return tipo;
  const importe = Math.abs(Number(ingreso.retencion) || 0);
  const base = Math.abs(Number(ingreso.base) || 0);
  return importe > 0 && base > 0 ? Math.round((importe / base) * 100) : 0;
}

/**
 * Lo leido, en la forma del formulario. `cuentas`: las elegidas con «Cambiar
 * cuenta» antes de abrirlo (sin ellas, todas las de por defecto).
 */
export function estadoInicial(ingreso: IngresoExtraido, info: InfoLectura, cuentas: Array<string | null> = []): EstadoCorreccion {
  const numero = info.campos.numero?.valorLeido;
  return {
    numero: typeof numero === 'string' && numero.trim() ? numero.trim() : (ingreso.numeroFactura ?? ''),
    fechaEmision: esFecha(ingreso.fecha) ? ingreso.fecha : '',
    fechaVencimiento: esFecha(info.campos.fechaVencimiento?.valorLeido) ? (info.campos.fechaVencimiento!.valorLeido as string) : '',
    concepto: texto(info.campos.concepto?.valorLeido).trim(),
    lineas: (ingreso.lineas ?? []).map((l, i) => ({ clave: siguienteClave++, descripcion: l.descripcion ?? '', base: aTexto(l.base), tipoIva: l.tipoIva, cuenta: cuentas[i] ?? null })),
    tipoRetencion: aTexto(retencionLeida(ingreso, info)),
    total: aTexto(ingreso.total),
  };
}

/** El formulario vacio de «Rellenarla a mano»: una linea al 21 % (sin IVA en una empresa de fuera de España). */
export function estadoVacio(espanola = true): EstadoCorreccion {
  return { numero: '', fechaEmision: '', fechaVencimiento: '', concepto: '', lineas: [lineaVacia(espanola ? 21 : 0)], tipoRetencion: '0', total: '' };
}

/**
 * «Volver a lo leído»: lo leido con las cuentas de por defecto. Cada linea
 * conserva su clave: las marcas de la lectura van por la clave de la linea
 * leida (marcasDeLaLectura) y con otra no se verian.
 */
export function copiaDe(e: EstadoCorreccion): EstadoCorreccion {
  return { ...e, lineas: e.lineas.map((l) => ({ ...l, cuenta: null })) };
}

/** Lo leido con las cuentas ya elegidas con «Cambiar cuenta», con las mismas claves de linea (por las marcas). */
export function conCuentas(e: EstadoCorreccion, cuentas: Array<string | null>): EstadoCorreccion {
  return { ...e, lineas: e.lineas.map((l, i) => ({ ...l, cuenta: cuentas[i] ?? null })) };
}

// ---------------------------------------------------------------------------
// Cuadre (el mismo calculo que el servidor)
// ---------------------------------------------------------------------------

/** Euros -> centimos enteros (mitad lejos de cero), como aCentimos del servidor. */
const aCentimos = (n: number) => (n < 0 ? -1 : 1) * Math.round(Math.abs(n) * 100 + Number.EPSILON * 100);
const sumaCentimos = (xs: number[]) => xs.reduce((a, x) => a + aCentimos(x), 0) / 100;
/** El redondeo de comprobarTotales del servidor: el del valor absoluto con Math.round. */
const redondeoServidor = (n: number) => (n < 0 ? -Math.round(-n * 100) / 100 : Math.round(n * 100) / 100);

/**
 * Cuota de IVA de cada linea: la del tipo sobre la suma de sus bases,
 * repartida al centimo (cuotasFijasPorTipo del servidor). Con todas las bases
 * del tipo en negativo (rectificativa), el reparto se hace en positivo y se le
 * cambia el signo.
 */
export function cuotasPorTipo(lineas: Array<{ base: number; tipoIva: number }>): number[] {
  const cuotas = new Array<number>(lineas.length).fill(0);
  const tipos = new Map<number, number[]>();
  lineas.forEach((l, i) => tipos.set(l.tipoIva, [...(tipos.get(l.tipoIva) ?? []), i]));
  for (const [t, idx] of Array.from(tipos.entries())) {
    if (t === 0) continue;
    const negativo = idx.every((i) => aCentimos(lineas[i].base) <= 0) && idx.some((i) => aCentimos(lineas[i].base) < 0);
    const s = negativo ? -1 : 1;
    const bases = idx.map((i) => s * lineas[i].base);
    const reparto = repartirCentimos(redondear2((sumaCentimos(bases) * t) / 100), bases.map((b) => (b * t) / 100));
    idx.forEach((i, k) => (cuotas[i] = s * reparto[k] || 0));
  }
  return cuotas;
}

/** Un importe con dos decimales como mucho (NaN si no es un numero). */
export function leerImporte(v: string): number {
  const n = parseImporte(v);
  return Number.isFinite(n) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6 ? n : NaN;
}

export interface Cuadre {
  /** Todas las bases se leen como importes. */
  completo: boolean;
  base: number;
  iva: number;
  retencion: number;
  /** Lo que dan las lineas: base + IVA - retencion. */
  calculado: number;
  /** El total escrito (NaN si no se lee). */
  escrito: number;
  /** escrito - calculado, en euros (NaN si falta algo). */
  diferencia: number;
  cuadra: boolean;
  /** Base y cuota por tipo de IVA, de mayor a menor. */
  porTipo: Array<{ tipoIva: number; base: number; cuota: number }>;
}

/** Lo que dan las lineas y si cuadra con el total escrito, al centimo, como lo comprobara el servidor. */
export function cuadre(e: EstadoCorreccion): Cuadre {
  const bases = e.lineas.map((l) => leerImporte(l.base));
  const completo = e.lineas.length > 0 && bases.every((b) => Number.isFinite(b));
  const lineas = e.lineas.map((l, i) => ({ base: Number.isFinite(bases[i]) ? bases[i] : 0, tipoIva: l.tipoIva }));
  const cuotas = cuotasPorTipo(lineas);
  const tipoRet = leerImporte(e.tipoRetencion);
  const ret = Number.isFinite(tipoRet) ? tipoRet : 0;
  let base = 0;
  let iva = 0;
  let retencion = 0;
  lineas.forEach((l, i) => {
    const b = aCentimos(redondeoServidor(l.base));
    base += b;
    iva += l.tipoIva === 0 ? 0 : aCentimos(cuotas[i]);
    retencion += aCentimos(redondeoServidor((redondeoServidor(l.base) * ret) / 100));
  });
  const calculado = (base + iva - retencion) / 100;
  const escrito = leerImporte(e.total);
  const diferencia = completo && Number.isFinite(escrito) ? (aCentimos(escrito) - aCentimos(calculado)) / 100 : NaN;
  const porTipo = Array.from(new Set(lineas.map((l) => l.tipoIva)))
    .sort((a, b) => b - a)
    .map((t) => ({
      tipoIva: t,
      base: sumaCentimos(lineas.filter((l) => l.tipoIva === t).map((l) => l.base)),
      cuota: sumaCentimos(cuotas.filter((_, i) => lineas[i].tipoIva === t)),
    }));
  return { completo, base: base / 100, iva: iva / 100, retencion: retencion / 100, calculado, escrito, diferencia, cuadra: diferencia === 0, porTipo };
}

// ---------------------------------------------------------------------------
// Que se ha cambiado
// ---------------------------------------------------------------------------

const igualesImporte = (a: string, b: string) => {
  const x = parseImporte(a);
  const y = parseImporte(b);
  return Number.isFinite(x) && Number.isFinite(y) ? aCentimos(x) === aCentimos(y) : a.trim() === b.trim();
};

/** Las lineas (descripcion, base o tipo de IVA) no son las leidas. Las cuentas no cuentan: eso es «Cambiar cuenta». */
export function lineasCambiadas(leido: EstadoCorreccion, e: EstadoCorreccion): boolean {
  if (leido.lineas.length !== e.lineas.length) return true;
  return e.lineas.some((l, i) => {
    const o = leido.lineas[i];
    return l.descripcion.trim() !== o.descripcion.trim() || l.tipoIva !== o.tipoIva || !igualesImporte(l.base, o.base);
  });
}

export interface Cambios {
  numero: boolean;
  fechaEmision: boolean;
  fechaVencimiento: boolean;
  concepto: boolean;
  lineas: boolean;
  retencion: boolean;
  total: boolean;
}

export function cambios(leido: EstadoCorreccion, e: EstadoCorreccion): Cambios {
  return {
    numero: e.numero.trim() !== leido.numero.trim(),
    fechaEmision: e.fechaEmision !== leido.fechaEmision,
    fechaVencimiento: e.fechaVencimiento !== leido.fechaVencimiento,
    concepto: e.concepto.replace(/\s+/g, ' ').trim() !== leido.concepto.replace(/\s+/g, ' ').trim(),
    lineas: lineasCambiadas(leido, e),
    retencion: !igualesImporte(e.tipoRetencion || '0', leido.tipoRetencion || '0'),
    total: !igualesImporte(e.total, leido.total),
  };
}

/** Se ha cambiado algun dato (sin contar las cuentas). */
export const hayCambios = (leido: EstadoCorreccion, e: EstadoCorreccion) => Object.values(cambios(leido, e)).some(Boolean);

/** Bloque `correcciones` de POST /ingresos-extractor/confirmar. */
export interface CorreccionesCuerpo {
  numero?: string;
  fechaEmision?: string;
  fechaVencimiento?: string | null;
  concepto?: string | null;
  lineas?: Array<{ descripcion: string; base: number; tipoIva: number; cuenta: string | null }>;
  tipoRetencion?: number;
  total?: number;
}

/**
 * Lo que va en el cuerpo de /confirmar: `correcciones` solo con lo cambiado
 * (si cambia una linea, van todas y el total, que el servidor exige) y, si las
 * lineas no cambian, la cuenta de cada una aparte (`lineas`), como siempre.
 * `cuentaPorDefecto`: la que se manda para una linea sin cuenta elegida (en una
 * rectificativa de varias facturas, la que se ensena).
 */
export function cuerpoCorrecciones(
  leido: EstadoCorreccion,
  e: EstadoCorreccion,
  cuentaPorDefecto: (tipoIva: number) => string | null = () => null,
): { correcciones: CorreccionesCuerpo | null; cuentas: Array<{ cuenta: string | null }> | null } {
  const c = cambios(leido, e);
  const k: CorreccionesCuerpo = {};
  if (c.numero) k.numero = e.numero.trim();
  if (c.fechaEmision) k.fechaEmision = e.fechaEmision;
  if (c.fechaVencimiento) k.fechaVencimiento = e.fechaVencimiento || null;
  if (c.concepto) k.concepto = e.concepto.replace(/\s+/g, ' ').trim() || null;
  if (c.lineas) {
    k.lineas = e.lineas.map((l) => ({ descripcion: l.descripcion.replace(/\s+/g, ' ').trim(), base: leerImporte(l.base), tipoIva: l.tipoIva, cuenta: l.cuenta ?? cuentaPorDefecto(l.tipoIva) }));
  }
  if (c.retencion) k.tipoRetencion = Number.isFinite(leerImporte(e.tipoRetencion)) ? leerImporte(e.tipoRetencion) : 0;
  if (c.lineas || c.retencion || c.total) k.total = leerImporte(e.total);
  const cuentas = c.lineas ? null : e.lineas.map((l) => ({ cuenta: l.cuenta ?? cuentaPorDefecto(l.tipoIva) }));
  return { correcciones: Object.keys(k).length ? k : null, cuentas };
}

// ---------------------------------------------------------------------------
// Campos de la lectura y campos del formulario
// ---------------------------------------------------------------------------

/** Campos del formulario (los mismos nombres que details.campo del servidor). */
export type CampoForm =
  | 'correcciones.numero'
  | 'correcciones.fechaEmision'
  | 'correcciones.fechaVencimiento'
  | 'correcciones.concepto'
  | 'correcciones.tipoRetencion'
  | 'correcciones.total'
  | `linea:${number}.base`
  | `linea:${number}.tipoIva`;

/** El tramo de IVA de un campo desglose.N.* (el tipo del tramo si lo trae; si no, el de la linea N leida). */
function tipoDelTramo(id: string, c: EstadoCampo | undefined, leido: EstadoCorreccion): number | null {
  const m = /^desglose\.(\d+)\./.exec(id);
  if (!m) return null;
  if (typeof c?.tipoIva === 'number') return c.tipoIva;
  return leido.lineas[Number(m[1])]?.tipoIva ?? null;
}

/**
 * ¿Lo corregido sustituye a este dato de la lectura? El numero, las fechas y
 * el concepto, si se han cambiado. Los tramos de IVA, si se han cambiado las
 * lineas. Los totales, si cambian las lineas, la retencion o el total (el
 * servidor los vuelve a calcular). La retencion, si cambia ella o las lineas.
 */
export function esCorregido(id: string, c: Cambios): boolean {
  if (id === 'numero') return c.numero;
  if (id === 'fechaEmision') return c.fechaEmision;
  if (id === 'fechaVencimiento') return c.fechaVencimiento;
  if (id === 'concepto') return c.concepto;
  if (id.startsWith('desglose.')) return c.lineas;
  if (id.startsWith('retencion.')) return c.lineas || c.retencion;
  if (id.startsWith('totales.')) return c.lineas || c.retencion || c.total;
  return false;
}

/** Los datos que se pueden corregir aqui (el resto, como el emisor o la moneda, no). */
export const esCorregible = (id: string) => /^(numero|fechaEmision|fechaVencimiento|concepto|desglose\.\d+\.\w+|retencion\.\w+|totales\.\w+)$/.test(id);

/**
 * Lo que dice cada tarjeta de un dato corregido: «Corregido a mano: 1.210,00 €».
 * Solo los datos marcados (los que salen en «Comprueba estos datos»).
 */
export function valoresCorregidos(info: InfoLectura, leido: EstadoCorreccion, e: EstadoCorreccion): Record<string, string> {
  const c = cambios(leido, e);
  const q = cuadre(e);
  const fuera: Record<string, string> = {};
  for (const [id, campo] of Object.entries(info.campos)) {
    if (!campo || campo.estado === 'ok' || !esCorregido(id, c)) continue;
    fuera[id] = valorCorregido(id, campo, e, q, leido);
  }
  return fuera;
}

function valorCorregido(id: string, campo: EstadoCampo, e: EstadoCorreccion, q: Cuadre, leido: EstadoCorreccion): string {
  const importe = (n: number) => (Number.isFinite(n) ? euros(n) : 'sin escribir');
  switch (id) {
    case 'numero':
      return e.numero.trim() || 'sin escribir';
    case 'fechaEmision':
      return e.fechaEmision ? fechaLegible(e.fechaEmision) : 'sin escribir';
    case 'fechaVencimiento':
      return e.fechaVencimiento ? fechaLegible(e.fechaVencimiento) : 'la de por defecto';
    case 'concepto':
      return e.concepto.trim() || 'sin concepto';
    case 'retencion.tipo':
      return porcentaje(Number.isFinite(leerImporte(e.tipoRetencion)) ? leerImporte(e.tipoRetencion) : 0);
    case 'retencion.importe':
      return importe(q.retencion);
    case 'totales.base':
      return importe(q.base);
    case 'totales.cuotaIva':
      return importe(q.iva);
    case 'totales.totalFactura':
      return importe(q.base + q.iva);
    case 'totales.totalAPagar':
      return importe(q.escrito);
  }
  const t = tipoDelTramo(id, campo, leido);
  const tramo = q.porTipo.find((p) => p.tipoIva === t);
  if (!tramo) return 'quitado: ya no hay líneas de ese tipo';
  if (id.endsWith('.base')) return euros(tramo.base);
  if (id.endsWith('.cuota')) return euros(tramo.cuota);
  return 'sin recargo';
}

/** Nivel de un campo del formulario segun las marcas de la lectura (el peor de los datos que le tocan). */
export type MarcasCorreccion = Partial<Record<CampoForm, NivelValidacion>>;

/**
 * Las marcas de la lectura en el formulario: el numero, las fechas, el
 * concepto, la base y el IVA de la linea de cada tramo, la retencion y el
 * total. Si dos datos van al mismo campo, manda el peor. Se apagan cuando el
 * valor deja de ser el leido (marcaVigente).
 */
export function marcasDeLaLectura(info: InfoLectura, leido: EstadoCorreccion): MarcasCorreccion {
  const m: MarcasCorreccion = {};
  const poner = (campo: CampoForm, nivel: NivelValidacion) => {
    if (nivel === 'ok') return;
    if (m[campo] !== 'error') m[campo] = nivel;
  };
  const unica = leido.lineas.length === 1 ? leido.lineas[0] : null;
  for (const [id, c] of Object.entries(info.campos)) {
    if (!c || c.estado === 'ok') continue;
    if (id === 'numero' || id === 'fechaEmision' || id === 'fechaVencimiento' || id === 'concepto') poner(`correcciones.${id}`, c.estado);
    else if (id.startsWith('retencion.')) poner('correcciones.tipoRetencion', c.estado);
    else if (id === 'totales.totalAPagar' || id === 'totales.totalFactura') poner('correcciones.total', c.estado);
    else if (id === 'totales.base' && unica) poner(`linea:${unica.clave}.base`, c.estado);
    else if (id === 'totales.cuotaIva' && unica) poner(`linea:${unica.clave}.tipoIva`, c.estado);
    else if (id.startsWith('desglose.')) {
      const t = tipoDelTramo(id, c, leido);
      const parte = id.endsWith('.cuota') ? 'tipoIva' : 'base';
      for (const l of leido.lineas) if (l.tipoIva === t) poner(`linea:${l.clave}.${parte}`, c.estado);
    }
  }
  return m;
}

/** La marca de la lectura en un campo, mientras conserve el valor leido. */
export function marcaVigente(marcas: MarcasCorreccion, campo: CampoForm, leido: EstadoCorreccion, e: EstadoCorreccion): NivelValidacion | undefined {
  const nivel = marcas[campo];
  if (!nivel) return undefined;
  const linea = /^linea:(\d+)\.(base|tipoIva)$/.exec(campo);
  if (linea) {
    const clave = Number(linea[1]);
    const o = leido.lineas.find((l) => l.clave === clave);
    const a = e.lineas.find((l) => l.clave === clave);
    if (!o || !a) return undefined;
    return (linea[2] === 'base' ? igualesImporte(a.base, o.base) : a.tipoIva === o.tipoIva) ? nivel : undefined;
  }
  const c = cambios(leido, e);
  const cambiado: Record<string, boolean> = {
    'correcciones.numero': c.numero,
    'correcciones.fechaEmision': c.fechaEmision,
    'correcciones.fechaVencimiento': c.fechaVencimiento,
    'correcciones.concepto': c.concepto,
    'correcciones.tipoRetencion': c.retencion,
    'correcciones.total': c.total,
  };
  return cambiado[campo] ? undefined : nivel;
}

/** Errores que da el servidor al leer (aIngresoExtraido) sin un dato detras en la lectura, y el dato que los arregla. */
const ERRORES_SIN_CAMPO: Array<[string, (c: Cambios) => boolean]> = [
  ['No se ha podido leer el numero de la factura.', (c) => c.numero],
  ['No se ha podido leer ninguna base imponible.', (c) => c.lineas],
  ['La factura tiene varias retenciones; registrala a mano.', (c) => c.retencion || c.lineas],
];

/** Los datos de la lectura que explican un error (por su texto). */
export function camposDelError(error: string, info: InfoLectura): string[] {
  const k = claveTexto(error);
  return Object.entries(info.campos)
    .filter(([, c]) => !!c && c.motivos.some((m) => claveTexto(m) === k))
    .map(([id]) => id);
}

/**
 * Los errores de la lectura que siguen impidiendo registrarla: los de un dato
 * que no se ha corregido (o que no se puede corregir aqui). Con el dato
 * corregido, deja de bloquear: el servidor lo vuelve a comprobar.
 */
export function erroresPendientes(errores: string[], info: InfoLectura, c: Cambios | null): string[] {
  if (!c) return errores;
  return errores.filter((err) => {
    const especial = ERRORES_SIN_CAMPO.find(([t]) => claveTexto(t) === claveTexto(err));
    if (especial) return !especial[1](c);
    const ids = camposDelError(err, info);
    return !(ids.length > 0 && ids.every((id) => esCorregido(id, c)));
  });
}

/** El error se arregla corrigiendo algun dato de aqui (el numero, la fecha, las lineas...). */
export function errorCorregible(error: string, info: InfoLectura): boolean {
  if (ERRORES_SIN_CAMPO.some(([t]) => claveTexto(t) === claveTexto(error))) return true;
  const ids = camposDelError(error, info);
  return ids.length > 0 && ids.every(esCorregible);
}

// ---------------------------------------------------------------------------
// Validaciones que devuelve el servidor al registrar (400 VALIDACION_LECTURA y FALTA_REVISION)
// ---------------------------------------------------------------------------

export interface ValidacionServidor {
  codigo: string;
  nivel: NivelValidacion;
  campos: string[];
  mensaje: string;
}

/** Las validaciones de details.validaciones, si las trae. */
export function validacionesDe(detalles: unknown): ValidacionServidor[] {
  const v = detalles && typeof detalles === 'object' ? (detalles as { validaciones?: unknown }).validaciones : undefined;
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is ValidacionServidor => !!x && typeof x === 'object' && typeof (x as ValidacionServidor).mensaje === 'string')
    .map((x) => ({ codigo: String(x.codigo ?? ''), nivel: x.nivel === 'error' ? 'error' : x.nivel === 'ok' ? 'ok' : 'revisar', campos: Array.isArray(x.campos) ? x.campos.map(String) : [], mensaje: x.mensaje }));
}

const RANGO: Record<NivelValidacion, number> = { ok: 0, revisar: 1, error: 2 };

/**
 * La lectura con lo que ha dicho el servidor al registrar lo corregido: cada
 * validacion en su dato (o como aviso general si no va ligada a ninguno). Pide
 * la casilla de revision si queda algo.
 */
export function infoConValidaciones(info: InfoLectura, validaciones: ValidacionServidor[]): InfoLectura {
  if (!validaciones.length) return info;
  const campos = { ...info.campos };
  const generales = [...(info.generales ?? [])];
  for (const v of validaciones) {
    if (v.nivel === 'ok') continue;
    const ids = v.campos.filter(Boolean);
    if (!ids.length) {
      if (!generales.some((g) => claveTexto(g.mensaje) === claveTexto(v.mensaje))) generales.push({ nivel: v.nivel, mensaje: v.mensaje });
      continue;
    }
    for (const id of ids) {
      const previo = campos[id as CampoId];
      const motivos = previo ? [...previo.motivos] : [];
      if (!motivos.some((m) => claveTexto(m) === claveTexto(v.mensaje))) motivos.push(v.mensaje);
      campos[id as CampoId] = {
        estado: previo && RANGO[previo.estado] > RANGO[v.nivel] ? previo.estado : v.nivel,
        confianza: previo?.confianza ?? null,
        fuente: previo?.fuente ?? 'manual',
        valorLeido: previo?.valorLeido ?? null,
        motivos,
        codigos: [...(previo?.codigos ?? []), v.codigo],
        ...(previo?.tipoIva !== undefined ? { tipoIva: previo.tipoIva } : {}),
      };
    }
  }
  const peor = Math.max(RANGO[info.estado], ...validaciones.map((v) => RANGO[v.nivel]));
  return { ...info, campos, generales, estado: peor === 2 ? 'error' : peor === 1 ? 'revisar' : 'ok', requiereRevision: true };
}

/**
 * Las validaciones del servidor que siguen valiendo: las de un dato que no se
 * ha vuelto a tocar desde que se mandaron (`enviado`). Al cambiarlo, se quitan.
 */
export function validacionesVigentes(validaciones: ValidacionServidor[], enviado: EstadoCorreccion | null, e: EstadoCorreccion): ValidacionServidor[] {
  if (!enviado) return validaciones;
  const c = cambios(enviado, e);
  return validaciones.filter((v) => !v.campos.some((id) => esCorregido(id, c)));
}

// ---------------------------------------------------------------------------
// Comprobacion antes de mandarla
// ---------------------------------------------------------------------------

export interface ErrorCorreccion {
  /** El campo, con el nombre de details.campo del servidor: 'correcciones.total', 'correcciones.lineas.0.base'... */
  campo: string;
  mensaje: string;
}

/**
 * Lo que la persona entiende mejor aqui que como un 400 (el servidor lo repite
 * todo). `aMano`: sin nada leido, hacen falta el numero, la fecha, las lineas y
 * el total. `negativos`: la lectura es una rectificativa o un abono (solo
 * entonces puede haber bases en negativo). `espanola` false: las lineas van
 * sin IVA (la lectura puede traer un 21 % puesto por defecto).
 */
export function comprobarCorreccion(leido: EstadoCorreccion, e: EstadoCorreccion, op: { aMano: boolean; negativos: boolean; espanola?: boolean }): ErrorCorreccion | null {
  const c = cambios(leido, e);
  if (op.aMano || c.numero) {
    if (!e.numero.trim()) return { campo: 'correcciones.numero', mensaje: 'Escribe el número de la factura tal como aparece en ella.' };
    if (e.numero.trim().length > 60) return { campo: 'correcciones.numero', mensaje: 'El número no puede pasar de 60 caracteres.' };
  }
  if ((op.aMano || c.fechaEmision) && !esFecha(e.fechaEmision)) return { campo: 'correcciones.fechaEmision', mensaje: 'Escribe la fecha de la factura.' };
  if (e.fechaVencimiento && !esFecha(e.fechaVencimiento)) return { campo: 'correcciones.fechaVencimiento', mensaje: 'La fecha de vencimiento no es válida.' };
  if (e.concepto.trim().length > 500) return { campo: 'correcciones.concepto', mensaje: 'El concepto no puede pasar de 500 caracteres.' };
  const conLineas = op.aMano || c.lineas;
  if (conLineas) {
    if (e.lineas.length < 1 || e.lineas.length > MAX_LINEAS) return { campo: 'correcciones.lineas', mensaje: `Pon entre 1 y ${MAX_LINEAS} líneas.` };
    for (let i = 0; i < e.lineas.length; i++) {
      const l = e.lineas[i];
      const n = `Línea ${i + 1}`;
      if (l.descripcion.trim().length > 500) return { campo: `correcciones.lineas.${i}.descripcion`, mensaje: `${n}: la descripción no puede pasar de 500 caracteres.` };
      const b = leerImporte(l.base);
      if (!Number.isFinite(b)) return { campo: `correcciones.lineas.${i}.base`, mensaje: `${n}: escribe la base, con dos decimales como mucho.` };
      if (b < 0 && !op.negativos) {
        return {
          campo: `correcciones.lineas.${i}.base`,
          mensaje: `${n}: la base está en negativo y la factura leída no es una rectificativa. Si es un abono, créalo en Ventas → Nueva factura → «Rectificativa o abono».`,
        };
      }
      if (op.espanola === false && l.tipoIva !== 0) {
        return { campo: `correcciones.lineas.${i}.tipoIva`, mensaje: `${n}: tu empresa no está establecida en España y sus ventas no llevan IVA español. Pon «Sin IVA».` };
      }
    }
  }
  const tipoRet = e.tipoRetencion.trim() ? leerImporte(e.tipoRetencion) : 0;
  // Sin decimales, como el servidor: la línea de la factura guarda el porcentaje en entero.
  if (!Number.isInteger(tipoRet) || tipoRet < 0 || tipoRet > 50) {
    return { campo: 'correcciones.tipoRetencion', mensaje: 'La retención tiene que ser un porcentaje sin decimales entre 0 y 50 (por ejemplo, 15).' };
  }
  if (op.aMano || c.lineas || c.retencion || c.total) {
    const q = cuadre(e);
    if (!Number.isFinite(q.escrito)) return { campo: 'correcciones.total', mensaje: 'Escribe el total de la factura: con él se comprueba que las líneas cuadran.' };
    if (q.completo && !q.cuadra) {
      return {
        campo: 'correcciones.total',
        mensaje: `Los importes no cuadran: las líneas dan ${euros(q.calculado)} y el total que has escrito es ${euros(q.escrito)}. Revisa las bases, el IVA, la retención y el total.`,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// La venta tal como se registrara (para la rectificativa y los totales)
// ---------------------------------------------------------------------------

/**
 * El ingreso con lo corregido: numero, fecha, concepto, lineas y totales.
 * Sin cambios, el leido tal cual (sus importes son los de la factura).
 */
export function ingresoEfectivo(ingreso: IngresoExtraido, leido: EstadoCorreccion | null, e: EstadoCorreccion | null): IngresoExtraido {
  if (!leido || !e || !hayCambios(leido, e)) return ingreso;
  const c = cambios(leido, e);
  const q = cuadre(e);
  const conImportes = c.lineas || c.retencion || c.total;
  return {
    ...ingreso,
    numeroFactura: e.numero.trim() || ingreso.numeroFactura,
    fecha: e.fechaEmision || ingreso.fecha,
    concepto: c.concepto ? e.concepto.trim() || null : ingreso.concepto,
    ...(conImportes
      ? {
          base: q.base,
          iva: q.iva,
          retencion: q.retencion,
          total: Number.isFinite(q.escrito) ? q.escrito : q.calculado,
          lineas: e.lineas.map((l) => ({ descripcion: l.descripcion, base: Number.isFinite(leerImporte(l.base)) ? leerImporte(l.base) : 0, tipoIva: l.tipoIva })),
        }
      : {}),
  };
}

/** Algun importe en negativo (las lineas o el total): un abono. */
export function conNegativos(i: IngresoExtraido): boolean {
  return [...(i.lineas ?? []).map((l) => l.base), i.base, i.total].some((x) => typeof x === 'number' && aCentimos(x) < 0);
}
