'use client';

import { useEffect, useMemo, useState } from 'react';
import { WarningCircle } from '@phosphor-icons/react';
import BloqueRectificativaVenta from '@/components/ventas/BloqueRectificativaVenta';
import { quienEs, type TerceroEnlazado } from '@/components/lector/AvisoTerceroNuevo';
import { euros, fechaLegible, porcentaje, type EstadoCampo, type IngresoExtraido, type InfoLectura } from '@/lib/lecturas';
import { lineasDoc } from '@/lib/divisas';
import { parseImporte } from '@/lib/moneda';
import { numeroFiscalEnFrase } from '@/lib/fiscal';
import {
  bloqueParaEnviar,
  cuentaDeOriginales,
  type DatosParaRectificarVenta,
  estadoVacio,
  type EstadoRectificativaVenta,
  faltaEnBloque,
  faltaEnReparto,
  type FormaRectificacion,
  infoMotivo,
  type MotivoInfoVenta,
  type MotivoVenta,
  type OpcionesRectificativa,
  originalDeCandidata,
  originalDePartida,
  type OriginalParaEnviar,
  type RectificativaVentaLeida,
  repartoConSigno,
  useDatosOriginales,
  useOpcionesRectificativa,
} from '@/lib/rectificativasVenta';

/**
 * Lector de ventas con una rectificativa o un abono (V19/V20 en «revisar»).
 *
 * La página se abre en modo rectificativa cuando la lectura lo es o trae
 * importes en negativo (`ingreso.rectificativa`):
 *  - aviso arriba con la factura que rectifica, propuesta por el número leído
 *    (o una partida de 2026 de la carga que coincide);
 *  - el bloque «¿Qué rectificas?» compacto: otra factura, varias, un periodo o
 *    una que no está en la app; el motivo propuesto y la explicación;
 *  - con importes en positivo, la pregunta del signo: restan (abono), suman o
 *    es la factura corregida entera (por sustitución, que sin original en la
 *    app pide sus importes);
 *  - «No es una rectificativa», solo con importes en positivo (queda en el
 *    registro de auditoría del servidor).
 *
 * Con una original de la app, el cliente es el suyo y cada línea propone su
 * cuenta (cuentaPorTipoIva). El servidor registra con lo que leyó más lo
 * corregido a mano («Corregir los datos»): del cuerpo toma la cuenta de cada
 * línea, las correcciones, el signo y el bloque `rectificativa`. Con importes
 * corregidos, el signo y los importes de la original siguen a lo corregido.
 *
 * useRectificativaLector guarda el estado (se reinicia con cada lectura) y da a
 * la página lo que necesita: cliente, cuentas por defecto, signo de las líneas,
 * comprobación previa, cuerpo de /confirmar y a qué campo va cada error.
 */

export type SignoLeido = 'resta' | 'suma';

/** Base de la original para un tipo de IVA. Su IVA no se escribe: sale de la base (ver cuotaDe). */
export interface ImporteOriginalForm {
  tipoIva: number;
  base: string;
  /** Tipo que no trae la factura corregida y se añade a mano (por ejemplo, la original iba al 10 %): se puede quitar. */
  anadido?: boolean;
}

/** Tipos de IVA que se pueden añadir a los importes de la original. */
const TIPOS_IVA = [21, 10, 5, 4, 0];

/**
 * IVA de la original para una base: el servidor registra la original como una
 * línea en negativo con esa base y calcula su IVA con el tipo, así que es el
 * IVA que se descuenta de verdad (NaN si la base no es un número).
 */
const cuotaDe = (base: number, tipoIva: number): number =>
  Number.isFinite(base) ? lineasDoc([{ cantidad: 1, precioUnitario: base, descuentoPorcentaje: 0, tipoIva, tipoRetencion: 0 }], { simetrico: true })[0].ivaImporte : NaN;

export interface EstadoLectorRect {
  /** «No es una rectificativa»: se registra como una factura normal. */
  noEs: boolean;
  /** Importes leídos en positivo: si restan (se registran en negativo) o suman. */
  signo: SignoLeido | null;
  rect: EstadoRectificativaVenta;
  /** Por sustitución sin original en la app: base e IVA de la original, por tipo de IVA. */
  importesOriginales: ImporteOriginalForm[];
}

export interface ErrorCampoLector {
  campo: string;
  mensaje: string;
}

/** Bloque `rectificativa` de POST /ingresos-extractor/confirmar. */
export interface BloqueConfirmarVenta {
  forma: FormaRectificacion;
  motivo: MotivoVenta;
  explicacion?: string;
  cambiarSigno?: boolean;
  originales?: OriginalParaEnviar[];
  periodo?: { desde: string; hasta: string };
  importesOriginales?: Array<{ tipoIva: number; base: number; cuota: number }>;
}

export type CuerpoRectificativaLector = { noEsRectificativa: true } | { rectificativa: BloqueConfirmarVenta } | Record<string, never>;

const CAMPO_SIGNO = 'rectificativa.cambiarSigno';
const CAMPO_IMPORTES = 'rectificativa.importesOriginales';

/** Texto de V19/V20 en ventas desde que se pueden registrar (y el que se enseña en lecturas antiguas). */
const TEXTO_REVISAR = 'Es una rectificativa o un abono: se registrará como rectificativa. Comprueba la factura que rectifica.';
const TEXTO_NO_ES = 'Has indicado que no es una rectificativa: se registra como una factura normal.';

const esTextoDeRectificativa = (m: string) => /rectificativa|abono|importes son negativos/i.test(m);
/** V19/V20 de una lectura hecha antes de poder registrarlas («Todavía no se puede registrar con el lector»). */
const esTextoAntiguo = (m: string) => /no se puede registrar con el lector/i.test(m) && esTextoDeRectificativa(m);
const esCampoDeRectificativa = (id: string, c: EstadoCampo) => (c.codigos ? c.codigos.includes('RECTIFICATIVA') : id === 'tipoDocumento' || id === 'totales.totalAPagar');

const nifComparable = (n: string) => n.replace(/[\s.\-]/g, '').toUpperCase();
const valor = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);
const cent = (n: number) => Math.round(n * 100);
const fechaCorta = (iso: string | null | undefined) => (iso ? fechaLegible(iso.slice(0, 10)) : '');

/** Tipos de IVA de las líneas leídas, sin repetir. */
function tiposDe(lineas: IngresoExtraido['lineas']): number[] {
  return Array.from(new Set((lineas ?? []).map((l) => l.tipoIva))).sort((a, b) => b - a);
}

/**
 * Las filas de los importes de la original con las líneas de ahora (quizá
 * corregidas a mano): un tipo nuevo de las líneas tiene su fila, y el que ya no
 * llevan se puede quitar (como uno añadido a mano).
 */
function filasConLasLineas(filas: ImporteOriginalForm[], lineas: IngresoExtraido['lineas']): ImporteOriginalForm[] {
  const tipos = tiposDe(lineas);
  const nuevas = tipos.filter((t) => !filas.some((f) => f.tipoIva === t)).map((tipoIva) => ({ tipoIva, base: '' }));
  return [...filas.map((f) => (tipos.includes(f.tipoIva) || f.anadido ? f : { ...f, anadido: true })), ...nuevas].sort((a, b) => b.tipoIva - a.tipoIva);
}

/** Algún importe en negativo (líneas, base o total): un abono. */
const conNegativos = (i: IngresoExtraido | null) =>
  !!i && [...(i.lineas ?? []).map((l) => l.base), i.base, i.total].some((x) => typeof x === 'number' && Math.round(x * 100) < 0);

function estadoInicial(leida: RectificativaVentaLeida | null, lineas: IngresoExtraido['lineas']): EstadoLectorRect {
  const rect = estadoVacio();
  if (leida) {
    rect.motivo = leida.motivoPropuesto ?? '';
    rect.explicacion = leida.motivoLeido?.trim() ?? '';
    // La factura que propone el servidor por el número leído; si no hay, la partida de 2026 que coincide.
    const original = leida.propuesta?.original;
    const exactas = (leida.partidasFuera ?? []).filter((p) => p.exacta);
    if (original?.rectificable) rect.originales = [originalDeCandidata(original)];
    else if (exactas.length === 1) rect.originales = [originalDePartida(exactas[0])];
  }
  return { noEs: false, signo: null, rect, importesOriginales: tiposDe(lineas).map((tipoIva) => ({ tipoIva, base: '' })) };
}

/** Por qué no se puede rectificar por sustitución en el lector ('' si se puede). */
function porqueNoSustituir(r: EstadoRectificativaVenta, datos: Record<string, DatosParaRectificarVenta>, info: MotivoInfoVenta | null): string {
  if (info?.soloDiferencias) return 'Un impago o un concurso solo se rectifican por diferencias.';
  if (r.que === 'periodo') return 'Un periodo solo se rectifica por diferencias.';
  if (r.originales.length === 0) return 'Para elegir esta opción, indica antes la factura que rectifica.';
  if (r.originales.length > 1) return 'Por sustitución se corrige una sola factura.';
  const o = r.originales[0];
  const d = o.id ? datos[o.id] : undefined;
  if (d && !d.admiteSustitucion) return `La ${d.original.numeroCompleto} ya tiene alguna rectificativa: ahora solo se puede rectificar por diferencias.`;
  return '';
}

/** Elemento al que va el foco cuando un error señala un campo del bloque. */
function idDelCampo(c: string): string {
  if (c === CAMPO_SIGNO || c === 'lineas' || c === 'rectificativa.forma') return 'rvl-signo';
  if (c.startsWith(CAMPO_IMPORTES)) return 'rvl-importes';
  if (c === 'tipoFactura' || c === 'rectificativa.motivo') return 'rv-motivo';
  if (c === 'rectificativa.explicacion') return 'rv-explicacion';
  if (c.startsWith('rectificativa.periodo')) return c.endsWith('hasta') ? 'rv-hasta' : 'rv-desde';
  const o = /^rectificativa\.originales\.(\d+)(?:\.(numero|fecha|base|cuota|retencion))?/.exec(c);
  if (o) return o[2] ? `rv-original-${o[1]}-${o[2]}` : `rv-original-${o[1]}`;
  if (c.startsWith('rectificativa.originales')) return 'rv-originales';
  return 'rvl-aviso';
}

interface Interno {
  doc: string | null;
  e: EstadoLectorRect;
  error: ErrorCampoLector | null;
  /** Sube con cada error que hay que enseñar: el foco va a su campo. */
  intento: number;
}

export interface RectificativaLector {
  leida: RectificativaVentaLeida | null;
  /** Se registra como rectificativa (es una y no se ha dicho que no lo sea). */
  activa: boolean;
  estado: EstadoLectorRect;
  setEstado: (e: EstadoLectorRect) => void;
  opciones: OpcionesRectificativa | null;
  errorOpciones: string;
  recargarOpciones: () => void;
  datos: Record<string, DatosParaRectificarVenta>;
  erroresDatos: Record<string, string>;
  /** La factura que rectifica es un ticket (F2): será una R5. */
  ticket: boolean;
  /** Con una original de la app: su cliente (no se cambia). */
  clienteOriginal: TerceroEnlazado | null;
  /** El NIF leído no es el del cliente de la original. */
  clienteDistinto: boolean;
  /** -1 si los importes leídos en positivo se registran en negativo. */
  signo: 1 | -1;
  /** Hay que preguntar si los importes (en positivo) restan, suman o son la factura corregida entera. */
  pideSigno: boolean;
  /** Los importes de ahora (leídos o corregidos) van en negativo: es un abono. */
  importesNegativos: boolean;
  /** Las filas de los importes de la original, con los tipos de IVA de las líneas de ahora. */
  importesOriginales: ImporteOriginalForm[];
  /** Lo que se registra, con su signo. */
  totales: { base: number; iva: number; retencion: number; total: number };
  resta: boolean;
  /** Por sustitución, la original de la app (para enseñar la diferencia). */
  originalSustituida: DatosParaRectificarVenta | null;
  sustituible: boolean;
  porqueNoSustituir: string;
  error: ErrorCampoLector | null;
  intento: number;
  marca: (...campos: string[]) => { 'aria-invalid': boolean; 'aria-describedby'?: string };
  /** Cuenta que se propone para una línea de ese tipo de IVA (la de la original), o null: la de siempre. */
  cuentaDeLinea: (tipoIva: number) => { codigo: string; texto: string } | null;
  /**
   * Cuenta que se envía para una línea sin cuenta elegida: con varias originales de la app, la que
   * se enseña (así se registra la misma que ve el usuario); con una o ninguna, null (decide el servidor).
   */
  cuentaParaEnviar: (tipoIva: number) => string | null;
  textoLineas: (n: number) => string;
  /** La lectura, con V19/V20 en «revisar» (lecturas antiguas) o con el texto de «no es una rectificativa». */
  ajustarInfo: (info: InfoLectura) => InfoLectura;
  /** Error de la lectura que ya no impide registrarla (V19/V20 antiguos, con el bloque). */
  noBloquea: (error: string) => boolean;
  comprobar: () => ErrorCampoLector | null;
  cuerpo: () => CuerpoRectificativaLector;
  /** El error de /confirmar señala un campo de este bloque. */
  esCampoSuyo: (campo: string | undefined) => boolean;
  mostrarError: (e: ErrorCampoLector) => void;
}

/** id del aviso de error de la página (lo leen los campos marcados con aria-describedby). */
export const ID_ERROR_LECTOR = 'lv-error';

/**
 * `ingreso`: la venta tal como se registrará (con lo corregido a mano, si lo
 * hay: ver lib/correccionVenta, ingresoEfectivo). El estado va ligado al
 * documento: corregir los datos o cambiar de dónde es el cliente no lo reinicia.
 */
export function useRectificativaLector(ingreso: IngresoExtraido | null): RectificativaLector {
  const leida = ingreso?.rectificativa ?? null;
  const doc = ingreso?.documentId ?? null;
  // Estado de cada lectura: al llegar otra, vuelve a la propuesta del servidor.
  const inicial = useMemo(
    () => estadoInicial(leida, ingreso?.lineas),
    // Solo cambia con la lectura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc],
  );
  const [s, setS] = useState<Interno>({ doc: null, e: estadoInicial(null, []), error: null, intento: 0 });
  const deEsta = (p: Interno): Interno => (p.doc === doc ? p : { doc, e: inicial, error: null, intento: 0 });
  const actual = deEsta(s);
  const estado = actual.e;
  const r = estado.rect;
  const activa = !!leida && !estado.noEs;

  const { opciones, error: errorOpciones, recargar: recargarOpciones } = useOpcionesRectificativa(activa);
  const deApp = activa && r.que === 'facturas' ? r.originales.filter((o) => o.origen === 'app' && o.id) : [];
  const idsApp = deApp.map((o) => o.id as string);
  const { datos, errores: erroresDatos } = useDatosOriginales(idsApp);

  const info = infoMotivo(opciones, r.motivo);
  const ticket = idsApp.some((id) => datos[id]?.ticket);
  // Con los importes de ahora: una rectificativa en positivo pregunta el signo; en negativo, ya resta. Es el
  // criterio del servidor (por diferencias y sin importes en negativo pide cambiarSigno): tambien un abono leido
  // en negativo y corregido a positivo, aunque no se leyera como rectificativa.
  const importesNegativos = conNegativos(ingreso);
  const pideSigno = activa && !importesNegativos;
  const filasOriginales = filasConLasLineas(estado.importesOriginales, ingreso?.lineas);
  const signo: 1 | -1 = pideSigno && r.forma === 'I' && estado.signo === 'resta' ? -1 : 1;

  // Cliente: el de la primera original de la app (todas son del mismo).
  const primera = deApp[0];
  const dPrimera = primera?.id ? datos[primera.id] : undefined;
  const deLaPropuesta = !!primera && primera.id === leida?.propuesta?.original?.id;
  const clienteOriginal: TerceroEnlazado | null = dPrimera
    ? {
        id: dPrimera.original.cliente.id || dPrimera.original.customerId,
        nombre: dPrimera.original.cliente.nombreFiscal,
        nif: dPrimera.original.cliente.nifCif ?? '',
        pais: dPrimera.original.cliente.pais ?? 'ES',
        como: 'elegido',
      }
    : primera?.customerId
      ? {
          id: primera.customerId,
          nombre: primera.cliente ?? '',
          nif: (deLaPropuesta && leida?.clienteDeLaOriginal?.id === primera.customerId ? leida.clienteDeLaOriginal.nifCif : '') ?? '',
          // El país de la ficha de su cliente: viene con la candidata o, en la propuesta, con su cliente.
          pais: primera.paisCliente || (deLaPropuesta && leida?.clienteDeLaOriginal?.id === primera.customerId ? leida.clienteDeLaOriginal.pais : null) || 'ES',
          como: 'elegido',
        }
      : null;
  const nifLeido = (ingreso?.nifCliente ?? '').trim();
  const clienteDistinto = !!clienteOriginal && (clienteOriginal.nif && nifLeido ? nifComparable(clienteOriginal.nif) !== nifComparable(nifLeido) : deLaPropuesta && !!leida?.clienteDistinto);

  // Lo que se registra, con su signo. La retención va con el signo de la base.
  const base = signo * valor(ingreso?.base);
  const iva = signo * valor(ingreso?.iva);
  const total = signo * valor(ingreso?.total);
  const resta = base < 0 || (base === 0 && total < 0);
  const retencion = (resta ? -1 : 1) * Math.abs(valor(ingreso?.retencion));
  const totales = { base, iva, retencion, total };

  const motivoNo = porqueNoSustituir(r, datos, info);
  const sustituible = !motivoNo;
  const hayApp = deApp.length > 0;
  const originalSustituida = r.forma === 'S' && dPrimera ? dPrimera : null;

  /** Con un abono, la parte de cada factura va en negativo aunque se escriba sin signo. */
  const rectEnviar = repartoConSigno(r, resta);

  const setEstado = (e: EstadoLectorRect) => setS({ doc, e, error: null, intento: actual.intento });
  const mostrarError = (e: ErrorCampoLector) =>
    setS((p) => {
      const b = deEsta(p);
      return { ...b, error: e, intento: b.intento + 1 };
    });

  const marca = (...campos: string[]) => {
    const mal = !!actual.error && campos.includes(actual.error.campo);
    return { 'aria-invalid': mal, ...(mal ? { 'aria-describedby': ID_ERROR_LECTOR } : {}) };
  };

  // Con varias originales, la de la que tiene más base a ese tipo de IVA (con una, la suya).
  const datosApp = idsApp.map((id) => datos[id]).filter((d): d is DatosParaRectificarVenta => !!d);
  const cuentaDeLinea = (tipoIva: number) => {
    if (!activa) return null;
    const c = cuentaDeOriginales(datosApp, tipoIva);
    return c ? { codigo: c.codigo, texto: `la de la ${c.numero}` } : null;
  };
  const cuentaParaEnviar = (tipoIva: number) => (idsApp.length > 1 ? cuentaDeLinea(tipoIva)?.codigo ?? null : null);

  const textoLineas = (n: number) => {
    const las = n === 1 ? 'la' : 'las';
    const dondeVa = hayApp
      ? n === 1
        ? 'Va a la cuenta que usó la factura que rectifica.'
        : 'Cada una va a la cuenta que usó la factura que rectifica.'
      : n === 1
        ? 'Se registra con la cuenta de ventas.'
        : 'Se registran con la cuenta de ventas.';
    return `${dondeVa} Si es una devolución, un rappel o un descuento por pronto pago, puedes llevar${las} a la 708, la 709 o la 706 con «Cambiar cuenta».`;
  };

  const ajustarInfo = (inf: InfoLectura): InfoLectura => {
    if (!leida) return inf;
    let cambiado = false;
    const campos = { ...inf.campos };
    for (const [id, c] of Object.entries(inf.campos)) {
      if (!c || !esCampoDeRectificativa(id, c)) continue;
      const motivos = Array.from(
        new Set(
          c.motivos.map((m) => {
            if (!esTextoDeRectificativa(m)) return m;
            if (estado.noEs) return TEXTO_NO_ES;
            return esTextoAntiguo(m) ? TEXTO_REVISAR : m;
          }),
        ),
      );
      // Con el bloque (o con «No es una rectificativa»), V19/V20 guardados como error en una lectura antigua ya no la impiden.
      const soloDeRectificativa = c.codigos ? c.codigos.every((k) => k === 'RECTIFICATIVA') : c.motivos.every(esTextoDeRectificativa);
      const nivel = c.estado === 'error' && soloDeRectificativa ? 'revisar' : c.estado;
      if (nivel === c.estado && motivos.join('\n') === c.motivos.join('\n')) continue;
      campos[id as keyof typeof campos] = { ...c, estado: nivel, motivos };
      cambiado = true;
    }
    if (!cambiado) return inf;
    const hayError = Object.values(campos).some((x) => x?.estado === 'error') || (inf.generales ?? []).some((g) => g.nivel === 'error');
    return { ...inf, campos, estado: hayError ? 'error' : 'revisar', requiereRevision: true };
  };

  // También con «No es una rectificativa»: el servidor ya no la trata como rectificativa y la deja registrar.
  const noBloquea = (texto: string) => !!leida && esTextoAntiguo(texto);

  // El IVA de cada tipo es el que sale de la base (el que registra el servidor), no uno escrito aparte.
  const importesOriginales = () =>
    filasOriginales.map((f) => {
      const b = parseImporte(f.base);
      return { tipoIva: f.tipoIva, base: b, cuota: cuotaDe(b, f.tipoIva) };
    });

  const comprobar = (): ErrorCampoLector | null => {
    if (!activa || !leida || !ingreso) return null;
    if (pideSigno && r.forma === 'I' && !estado.signo) {
      return { campo: CAMPO_SIGNO, mensaje: 'Los importes vienen en positivo: indica si restan (es un abono), si suman o si es la factura corregida entera.' };
    }
    const falta = faltaEnBloque(r, { emitir: !leida.motivoLeido?.trim(), fechaEmision: ingreso.fecha ?? '' });
    if (falta) {
      return falta.campo === 'rectificativa.explicacion'
        ? { campo: falta.campo, mensaje: 'Explica en una frase por qué se rectifica la factura: queda guardado con la rectificativa.' }
        : falta;
    }
    if (info && !info.disponible) {
      return { campo: 'rectificativa.motivo', mensaje: `«${info.texto}» todavía no se puede registrar.${info.aviso ? ` ${info.aviso}` : ''}` };
    }
    if (info?.soloResta && r.forma === 'I' && !resta) {
      return {
        campo: pideSigno ? CAMPO_SIGNO : 'rectificativa.motivo',
        mensaje: `Con el motivo «${info.texto}» los importes tienen que restar${pideSigno ? ': elige «Restan: es un abono»' : ''}.`,
      };
    }
    if (r.forma === 'S') {
      if (!hayApp) {
        const imp = importesOriginales();
        if (!imp.length || imp.some((f) => !Number.isFinite(f.base))) {
          return { campo: CAMPO_IMPORTES, mensaje: 'Escribe la base de cada tipo de IVA de la factura original: hace falta para registrar solo la diferencia.' };
        }
        const baseOriginal = imp.reduce((a, f) => a + cent(f.base), 0);
        if (info?.soloResta && cent(valor(ingreso.base)) >= baseOriginal) {
          return { campo: CAMPO_IMPORTES, mensaje: `Con el motivo «${info.texto}» la factura corregida tiene que tener menos base que la original.` };
        }
      } else if (originalSustituida && info?.soloResta && cent(valor(ingreso.base)) >= cent(originalSustituida.original.baseTotal)) {
        return {
          campo: CAMPO_SIGNO,
          mensaje: `Con el motivo «${info.texto}» la factura corregida tiene que tener menos base que la ${originalSustituida.original.numeroCompleto}.`,
        };
      }
    }
    return faltaEnReparto(rectEnviar, undefined, { base, iva, retencion });
  };

  const cuerpo = (): CuerpoRectificativaLector => {
    if (!leida) return {};
    if (estado.noEs) return { noEsRectificativa: true };
    const b = bloqueParaEnviar(rectEnviar, { ticket });
    return {
      rectificativa: {
        forma: b.forma,
        motivo: b.motivo,
        // Sin explicación, el servidor pone el motivo leído.
        ...(b.explicacion ? { explicacion: b.explicacion } : {}),
        ...(pideSigno && b.forma === 'I' ? { cambiarSigno: estado.signo === 'resta' } : {}),
        ...(b.originales ? { originales: b.originales } : {}),
        ...(b.periodo ? { periodo: b.periodo } : {}),
        ...(b.forma === 'S' && !hayApp ? { importesOriginales: importesOriginales() } : {}),
      },
    };
  };

  const esCampoSuyo = (campo: string | undefined) =>
    !!campo &&
    activa &&
    (campo === 'rectificativa' || campo.startsWith('rectificativa.') || campo === 'tipoFactura' || (campo === 'clienteId' && !!clienteOriginal) || (campo === 'lineas' && pideSigno));

  return {
    leida,
    activa,
    estado,
    setEstado,
    opciones,
    errorOpciones,
    recargarOpciones,
    datos,
    erroresDatos,
    ticket,
    clienteOriginal,
    clienteDistinto,
    signo,
    pideSigno,
    importesNegativos,
    importesOriginales: filasOriginales,
    totales,
    resta,
    originalSustituida,
    sustituible,
    porqueNoSustituir: motivoNo,
    error: actual.error,
    intento: actual.intento,
    marca,
    cuentaDeLinea,
    cuentaParaEnviar,
    textoLineas,
    ajustarInfo,
    noBloquea,
    comprobar,
    cuerpo,
    esCampoSuyo,
    mostrarError,
  };
}

const campo =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50';
const opcion = (activa: boolean, desactivada = false) =>
  `flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${desactivada ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${
    activa ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
  }`;
const recuadro = 'rounded-lg border border-slate-200 bg-white p-4 focus:outline-none focus:ring-2 focus:ring-blue-500';

interface Props {
  rv: RectificativaLector;
  ingreso: IngresoExtraido;
  /** Cliente leído (encontrado por su NIF, dado de alta o elegido): para sus facturas de 2026 pendientes. */
  clienteLeidoId: string | null;
  /** País del cliente según lo leído (lectura.tercero.pais), para nombrar el número leído. null: no se sabe. */
  paisLeido?: string | null;
  disabled?: boolean;
}

/** Aviso, pregunta del signo, bloque «¿Qué rectificas?» e importes de la original, debajo de lo leído. */
export default function RectificativaVentaLector({ rv, ingreso, clienteLeidoId, paisLeido, disabled }: Props) {
  const { leida, estado, error } = rv;
  const r = estado.rect;

  // Tras un error, su campo se pone a la vista y recibe el foco.
  useEffect(() => {
    if (!rv.intento || !rv.error) return;
    // La forma va en la pregunta del signo o, si no la hay, en el bloque («Por diferencias»).
    const el =
      document.getElementById(idDelCampo(rv.error.campo)) ??
      (rv.error.campo === 'rectificativa.forma' ? document.getElementById('rv-forma-I') : null) ??
      document.getElementById('rvl-aviso');
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus({ preventScroll: true });
    // Solo con cada error nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rv.intento]);

  if (!leida) return null;

  /** El mensaje del error junto a su campo (el campo ya apunta al aviso de la página con aria-describedby). */
  const mensaje = (...campos: string[]) =>
    error && campos.includes(error.campo) ? (
      <p aria-hidden="true" className="mt-2 text-sm text-red-700">
        {error.mensaje}
      </p>
    ) : null;

  const cambiar = (c: Partial<EstadoLectorRect>) => rv.setEstado({ ...estado, ...c });
  const info = infoMotivo(rv.opciones, r.motivo);
  const nifLeido = (ingreso.nifCliente ?? '').trim();

  // Qué rectifica, según lo elegido ahora (la propuesta del servidor se puede quitar).
  const propuesta = leida.propuesta?.original ?? null;
  const elegidas = r.que === 'facturas' ? r.originales : [];
  const conPropuesta = !!propuesta && elegidas.length === 1 && elegidas[0].id === propuesta.id;
  const partidaExacta =
    elegidas.length === 1 && elegidas[0].partidaId && (leida.partidasFuera ?? []).some((p) => p.exacta && p.partidaId === elegidas[0].partidaId) ? elegidas[0] : null;
  let queRectifica: string;
  if (r.que === 'periodo') {
    queRectifica =
      r.periodo.desde && r.periodo.hasta
        ? `Rectifica las ventas del ${fechaCorta(r.periodo.desde)} al ${fechaCorta(r.periodo.hasta)}.`
        : 'Rectifica las ventas de un periodo: indica abajo las fechas.';
  } else if (conPropuesta && propuesta) {
    queRectifica = `Rectifica la ${propuesta.numeroCompleto} del ${fechaCorta(propuesta.fechaEmision)}. ${
      leida.propuesta.coincidencia === 'EXACTA'
        ? 'Coincide con el número leído.'
        : `El número se parece al leído${leida.numeroRectificada ? ` (${leida.numeroRectificada})` : ''}: compruébalo.`
    }`;
  } else if (partidaExacta) {
    queRectifica = `Rectifica la ${partidaExacta.numero}, una factura de 2026 que trajo la carga. Coincide con el número leído.`;
  } else if (elegidas.length === 1) {
    const o = elegidas[0];
    queRectifica = `Rectifica la ${o.numero.trim() || 'factura elegida abajo'}${o.fecha ? ` del ${fechaCorta(o.fecha)}` : ''}.`;
  } else if (elegidas.length > 1) {
    queRectifica = `Rectifica ${elegidas.length} facturas: ${elegidas.map((o) => o.numero.trim() || '(sin número)').join(', ')}.`;
  } else if (leida.numeroRectificada) {
    queRectifica = `La factura cita la ${leida.numeroRectificada}${propuesta ? '' : ' y no la hemos encontrado en la app'}. Elige abajo la que rectifica o, si la emitiste fuera de la app, añádela con «No está en la app».`;
  } else {
    queRectifica = 'No se ha leído qué factura rectifica: elígela abajo.';
  }

  const seleccion: 'resta' | 'suma' | 'S' | null = r.forma === 'S' ? 'S' : estado.signo;
  const totalLeido = valor(ingreso.total);
  const sinSigno = Math.abs(totalLeido);
  const deFueraSustituida = r.forma === 'S' && !rv.originalSustituida && r.originales.length === 1 && r.originales[0].origen === 'fuera';

  // Por sustitución sin original en la app: la diferencia con lo escrito (el IVA de cada tipo sale de su base).
  const imp = rv.importesOriginales.map((f) => {
    const b = parseImporte(f.base);
    return { base: b, cuota: cuotaDe(b, f.tipoIva) };
  });
  const importesCompletos = imp.length > 0 && imp.every((f) => Number.isFinite(f.base));
  const difBase = importesCompletos ? (cent(valor(ingreso.base)) - imp.reduce((a, f) => a + cent(f.base), 0)) / 100 : 0;
  const difIva = importesCompletos ? (cent(valor(ingreso.iva)) - imp.reduce((a, f) => a + cent(f.cuota), 0)) / 100 : 0;

  /** Con el error de los importes de la original, se marca cada campo vacío o que no es un número. */
  const mal = (v: string) => (error?.campo.startsWith(CAMPO_IMPORTES) && !Number.isFinite(parseImporte(v)) ? rv.marca(error.campo) : {});
  // La original puede tener tipos de IVA que la corregida ya no lleva (p. ej., iba al 10 % y se corrige al 21 %).
  const tiposLibres = TIPOS_IVA.filter((t) => !rv.importesOriginales.some((f) => f.tipoIva === t));
  // Con algún tipo añadido, todas las filas dejan sitio a «Quitar» (así los campos quedan alineados).
  const conQuitar = rv.importesOriginales.some((f) => f.anadido);
  const anadirTipo = (t: number) =>
    cambiar({ importesOriginales: [...rv.importesOriginales, { tipoIva: t, base: '', anadido: true }].sort((a, b) => b.tipoIva - a.tipoIva) });

  const t = rv.totales;
  const textoReparto = `Escribe cuánto le toca a cada factura${rv.resta ? ' (sin signo: se restan, como el abono)' : ''}. Entre todas tienen que sumar lo mismo que la rectificativa: base ${euros(
    t.base,
  )} e IVA ${euros(t.iva)}${t.retencion ? `, retención ${euros(t.retencion)}` : ''}.`;

  return (
    <>
      <section
        id="rvl-aviso"
        tabIndex={-1}
        aria-labelledby="rvl-titulo"
        className="space-y-2 rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <h2 id="rvl-titulo" className="font-semibold text-slate-900">
          {rv.activa ? 'Es una rectificativa o un abono' : 'Se registrará como una factura normal'}
        </h2>
        {rv.activa ? (
          <>
            <p>{queRectifica}</p>
            {leida.motivoLeido && <p>Motivo que trae la factura: «{leida.motivoLeido}».</p>}
            {rv.importesNegativos && <p>Los importes vienen en negativo: se registra por diferencias y resta de la factura que rectifica.</p>}
            {rv.clienteOriginal && (
              <p>
                Cliente: <span className="font-semibold">{quienEs(rv.clienteOriginal.nombre, rv.clienteOriginal.nif)}</span>, el de la factura que rectifica. No se puede cambiar.
              </p>
            )}
            {rv.clienteDistinto && (
              <p className="flex gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-900">
                <WarningCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  En la factura se leyó el {paisLeido ? numeroFiscalEnFrase(paisLeido) : 'número fiscal'} {nifLeido || 'de otro cliente'}, que no es el de este cliente. Comprueba que la factura que rectifica es la buena.
                </span>
              </p>
            )}
          </>
        ) : (
          <p>Has indicado que no es una rectificativa. Queda anotado al registrarla.</p>
        )}
        {(!rv.importesNegativos || estado.noEs) && (
          <label className="flex items-start gap-2 pt-1">
            <input type="checkbox" className="mt-0.5" checked={estado.noEs} disabled={disabled} onChange={(e) => cambiar({ noEs: e.target.checked })} />
            <span>No es una rectificativa: registrarla como una factura normal</span>
          </label>
        )}
        {mensaje('rectificativa', 'clienteId')}
      </section>

      {rv.activa && rv.pideSigno && (
        <div id="rvl-signo" tabIndex={-1} className={recuadro}>
          <fieldset {...rv.marca(CAMPO_SIGNO, 'lineas', 'rectificativa.forma')}>
            <legend className="font-semibold text-slate-900">Los importes vienen en positivo. ¿Qué son?</legend>
            <p className="mt-0.5 text-sm text-slate-600">Algunos programas imprimen los abonos sin signo. Elige cómo se registra.</p>
            <div className="mt-3 grid grid-cols-1 gap-2">
              <label className={opcion(seleccion === 'resta')}>
                <input type="radio" name="rvl-signo" className="mt-0.5" checked={seleccion === 'resta'} disabled={disabled} onChange={() => cambiar({ signo: 'resta', rect: { ...r, forma: 'I' } })} />
                <span>
                  <span className="font-medium">Restan: es un abono</span>
                  <span className="block text-xs text-slate-500">Se registra en negativo, por {euros(-sinSigno)}.</span>
                </span>
              </label>
              <label className={opcion(seleccion === 'suma')}>
                <input type="radio" name="rvl-signo" className="mt-0.5" checked={seleccion === 'suma'} disabled={disabled} onChange={() => cambiar({ signo: 'suma', rect: { ...r, forma: 'I' } })} />
                <span>
                  <span className="font-medium">Suman: sube el importe</span>
                  <span className="block text-xs text-slate-500">Se registra en positivo, por {euros(sinSigno)}: el cliente te debe más.</span>
                </span>
              </label>
              <label className={opcion(seleccion === 'S', !rv.sustituible)}>
                <input
                  type="radio"
                  name="rvl-signo"
                  className="mt-0.5"
                  checked={seleccion === 'S'}
                  disabled={disabled || !rv.sustituible}
                  onChange={() => cambiar({ rect: { ...r, forma: 'S' } })}
                  aria-describedby={!rv.sustituible ? 'rvl-signo-porque' : undefined}
                />
                <span>
                  <span className="font-medium">Es la factura corregida entera (por sustitución)</span>
                  <span className="block text-xs text-slate-500">Sustituye a la original. Se registra solo la diferencia entre las dos.</span>
                </span>
              </label>
            </div>
            {!rv.sustituible && rv.porqueNoSustituir && (
              <p id="rvl-signo-porque" className="mt-1 text-xs text-slate-500">
                {rv.porqueNoSustituir}
              </p>
            )}
            {info?.soloResta && seleccion === 'suma' && (
              <p className="mt-2 flex gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                <WarningCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> Con el motivo «{info.texto}» los importes tienen que restar.
              </p>
            )}
            {mensaje(CAMPO_SIGNO, 'lineas', 'rectificativa.forma')}
          </fieldset>
        </div>
      )}

      {rv.activa && (
        <BloqueRectificativaVenta
          valor={r}
          onCambio={(rect) => cambiar({ rect })}
          opciones={rv.opciones}
          errorOpciones={rv.errorOpciones}
          onReintentarOpciones={rv.recargarOpciones}
          ticket={rv.ticket}
          clienteId={clienteLeidoId}
          datos={rv.datos}
          erroresDatos={rv.erroresDatos}
          conRetencion={valor(ingreso.retencion) !== 0}
          monedaCuenta="EUR"
          marca={rv.marca}
          compacto
          numeroLeido={leida.numeroRectificada}
          sustitucionDeFuera
          error={error}
          sinForma={rv.pideSigno || rv.importesNegativos}
          buscarEnTodas
          textoReparto={textoReparto}
          repartoSinSigno
          disabled={disabled}
        />
      )}

      {rv.activa && rv.originalSustituida && (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
          La factura corregida suma {euros(totalLeido)} y la {rv.originalSustituida.original.numeroCompleto} sumaba {euros(rv.originalSustituida.original.totalFacturaDoc)}. Se
          registra la diferencia:{' '}
          <span className="font-semibold text-slate-900">{euros((cent(totalLeido) - cent(rv.originalSustituida.original.totalFacturaDoc)) / 100)}</span>.
        </p>
      )}

      {rv.activa && deFueraSustituida && (
        <div id="rvl-importes" tabIndex={-1} className={recuadro}>
          <fieldset {...rv.marca(CAMPO_IMPORTES)}>
            <legend className="font-semibold text-slate-900">Importes de la factura original</legend>
            <p className="mt-0.5 text-sm text-slate-600">
              No está en la app: escribe su base de cada tipo de IVA. El IVA se calcula con la base, igual que al registrarla. Así se registra solo la diferencia con la
              factura corregida. Si la original tenía un tipo de IVA que la corregida ya no lleva, añádelo abajo.
              {/* El servidor toma para la original el mismo porcentaje de IRPF que la factura leída. */}
              {valor(ingreso.retencion) !== 0 && ' La original se toma con el mismo porcentaje de retención de IRPF que la factura corregida.'}
            </p>
            <div className="mt-3 space-y-3">
              {rv.importesOriginales.map((f, i) => (
                <div key={f.tipoIva} className={`grid items-end gap-3 sm:max-w-lg ${conQuitar ? 'grid-cols-[1fr_1fr_4.5rem]' : 'grid-cols-2'}`}>
                  <div>
                    <label htmlFor={`rvl-importe-${i}-base`} className="mb-1 block text-xs font-medium text-slate-600">
                      {f.tipoIva === 0 ? 'Base exenta' : `Base del ${porcentaje(f.tipoIva)}`}
                    </label>
                    <input
                      id={`rvl-importe-${i}-base`}
                      inputMode="decimal"
                      autoComplete="off"
                      className={`${campo} text-right font-mono`}
                      value={f.base}
                      disabled={disabled}
                      {...mal(f.base)}
                      onChange={(e) => cambiar({ importesOriginales: rv.importesOriginales.map((x, j) => (j === i ? { ...x, base: e.target.value } : x)) })}
                    />
                  </div>
                  {f.tipoIva !== 0 ? (
                    <div>
                      <p className="mb-1 block text-xs font-medium text-slate-600">IVA del {porcentaje(f.tipoIva)}</p>
                      <p className={`${campo} bg-slate-50 text-right font-mono text-slate-700`}>{Number.isFinite(imp[i]?.cuota) ? euros(imp[i].cuota) : '—'}</p>
                    </div>
                  ) : (
                    <div />
                  )}
                  {f.anadido && (
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => cambiar({ importesOriginales: rv.importesOriginales.filter((_, j) => j !== i) })}
                      className="rounded-lg px-2 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Quitar<span className="sr-only"> {f.tipoIva === 0 ? 'la base exenta' : `el ${porcentaje(f.tipoIva)}`}</span>
                    </button>
                  )}
                  {!f.anadido && conQuitar && <div />}
                </div>
              ))}
            </div>
            {tiposLibres.length > 0 && (
              <div className="mt-3 sm:max-w-xs">
                <label htmlFor="rvl-importe-otro" className="mb-1 block text-xs font-medium text-slate-600">
                  Añadir otro tipo de IVA de la original
                </label>
                <select
                  id="rvl-importe-otro"
                  className={campo}
                  value=""
                  disabled={disabled}
                  onChange={(e) => e.target.value !== '' && anadirTipo(Number(e.target.value))}
                >
                  <option value="">Elige el tipo…</option>
                  {tiposLibres.map((t) => (
                    <option key={t} value={t}>
                      {t === 0 ? 'Exenta (0 %)' : porcentaje(t)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {importesCompletos && (
              <p className="mt-3 text-sm text-slate-700">
                Se registra la diferencia: base <span className="font-semibold text-slate-900">{euros(difBase)}</span> e IVA{' '}
                <span className="font-semibold text-slate-900">{euros(difIva)}</span>.
              </p>
            )}
            {mensaje(CAMPO_IMPORTES)}
          </fieldset>
        </div>
      )}
    </>
  );
}
