'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { CaretDown, CaretRight, MagnifyingGlass, Plus, Trash, WarningCircle, X } from '@phosphor-icons/react';
import { ApiError, apiFetch, campoDelError, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { useCuentasLinea } from '@/lib/subcuentas';
import { CuentaLinea } from '@/components/contabilidad/CuentaLinea';
import { useAvisoPlanAnterior } from '@/components/contabilidad/AvisoPlanAnterior';
import { formatoImporte, parseImporte } from '@/lib/moneda';
import { PAISES, pareceNifIvaUe, useEmpresaEspanola } from '@/lib/fiscal';
import {
  calcularTotales,
  conflictoGasto,
  type ConflictoGasto,
  CUENTAS_GASTO_HABITUALES,
  cuentaPropuesta,
  type DatosParaRectificar,
  type GastoDetalle,
  type GastoRegistrado,
  paisDelPrefijo,
  sumarDias,
  textoPeriodoModelo,
  TIPO_GASTO_INFO,
  TIPOS_GASTO,
  TIPOS_IVA_GASTO,
  textoTipoIva,
  type TipoGasto,
} from '@/lib/compras';
import { bloqueParaEnviar, type EstadoRectificacion, faltaEnBloque, type LineaCuerpo, signoDe } from '@/lib/rectificativasGasto';
import BloqueRectificacion, { LineasOriginal } from './BloqueRectificacion';
import { CONCEPTOS } from './disenoConceptos';

/**
 * Formulario de una factura de gasto: alta (Compras > Nueva factura de gasto),
 * edicion (Modificar) y revision de lo leido por el lector de gastos.
 *
 * - alta: POST /expense-invoices. La factura y su asiento quedan en firme.
 * - editar: PUT /expense-invoices/:id. El servidor rehace el asiento y el libro de IVA.
 * - lector: POST /gastos-extractor/confirmar. La factura y su asiento quedan en
 *   borrador hasta que se aprueba el asiento en el Motor contable.
 *
 * Los totales se calculan con el mismo redondeo que el servidor. Los errores
 * del servidor marcan el campo (details.campo).
 *
 * Con `inicial.rectificativa` es un abono o una rectificativa del proveedor:
 * añade el bloque «Rectificación» y las líneas se escriben en positivo (el
 * signo lo pone «Reduce el importe»). Por sustitución, las líneas son las de
 * la factura corregida y se enseña la diferencia que se registra.
 */

export type ProveedorElegido =
  | { tipo: 'existente'; id: string; nombre: string; nif: string; pais: string }
  | {
      tipo: 'nuevo';
      nombreFiscal: string;
      nifCif: string;
      pais: string;
      direccion: string;
      cp: string;
      municipio: string;
      provincia: string;
    };

export interface LineaInicial {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuentoPorcentaje?: number;
  tipoIva: number;
  tipoRetencion: number;
  cuenta?: string | null;
  /** Abono: cuenta de la línea de la factura original (de ahí sale la que se propone por causa). */
  cuentaOriginal?: string | null;
}

export interface FormInicial {
  proveedor?: ProveedorElegido | null;
  numeroFacturaProveedor?: string;
  fechaEmision?: string;
  fechaVencimiento?: string;
  fechaRegistro?: string | null;
  tipoGasto?: TipoGasto;
  cuentaGasto?: string | null;
  /** De donde sale cuentaGasto (lector): 'habitual' = la que mas usan las facturas de ese proveedor. */
  origenCuentaGasto?: 'habitual' | 'sugerida';
  lineas?: LineaInicial[];
  observaciones?: string;
  /** Lector: total que pone la factura (se cruza con el calculado). */
  totalDocumento?: number;
  /** Abono o rectificativa: el bloque «Rectificación» ya rellenado. Sin él, una factura normal. */
  rectificativa?: EstadoRectificacion;
  /** Abono de una factura de la app: sus datos (GET /:id/rectificar), si ya se han pedido. */
  datosOriginal?: DatosParaRectificar | null;
}

/**
 * Lector (P6): datos que el lector dejo en «revisar» o en «error», con el nombre
 * del campo del formulario (el mismo que usan los errores del servidor):
 * 'proveedor', 'proveedor.nifCif', 'numeroFacturaProveedor', 'fechaEmision',
 * 'totalDocumento', 'lineas.0.precioUnitario'... El numero de linea es el de
 * inicial.lineas.
 */
export type NivelMarca = 'revisar' | 'error';
export type MarcasLector = Partial<Record<string, NivelMarca>>;

/** Lo que devuelve marca(): aria-invalid y, con la marca del lector, data-lector. */
type PropsMarca = { 'aria-invalid': boolean; 'aria-describedby': string | undefined; 'data-lector'?: NivelMarca };

interface Props {
  modo: 'alta' | 'editar' | 'lector';
  inicial?: FormInicial;
  /** editar: la factura que se corrige. */
  facturaId?: string;
  /** editar: tiene asiento en firme (se rehace al guardar). */
  asientoEnFirme?: boolean;
  /** lector: campos que van tal cual en el cuerpo (tipoDocumento, confianza). */
  extra?: Record<string, unknown>;
  /** Si viene, el boton de guardar queda desactivado y se lee este motivo. */
  bloqueado?: string;
  /** Aviso bajo el proveedor (lector: «se creará al registrar la factura»). */
  avisoProveedor?: string;
  /** Moneda de la contabilidad para los totales. */
  monedaCuenta?: string;
  /**
   * Campo que hay que corregir nada mas abrir (p. ej. 'fechaRegistro' cuando el
   * Motor contable no deja aprobar el borrador): se despliega, se marca y recibe el foco.
   */
  campoInicial?: 'fechaRegistro';
  /** Por que hay que corregirlo; sale en el cuadro de error. */
  avisoInicial?: string;
  /** lector: los datos que el lector ha marcado, para colorearlos dentro del formulario. */
  marcas?: MarcasLector;
  /**
   * lector: el proveedor tiene que estar dado de alta (o elegido de los que ya
   * hay) para registrar. Mientras no lo este, el boton queda desactivado con
   * `motivo`; `aviso` va encima del bloque del proveedor (AvisoTerceroNuevo) y
   * con `enlazar` deja el formulario a nombre del proveedor dado de alta o elegido.
   */
  proveedorDeAlta?: {
    motivo: string;
    aviso: (proveedor: ProveedorElegido | null, enlazar: (p: ProveedorElegido) => void) => React.ReactNode;
  };
  /** lector: número de la factura que rectifica, tal como se leyó (para buscarla). */
  numeroRectificadaLeida?: string | null;
  onGuardado: (r: GastoRegistrado) => void;
  onCancelar?: () => void;
}

interface LineaForm {
  clave: number;
  descripcion: string;
  cantidad: string;
  precio: string;
  descuento: number;
  tipoIva: number;
  tipoRetencion: number;
  /** Cuenta propia de la linea («Cambiar cuenta»); sin ella, la de la factura o la del tipo de gasto. */
  cuenta?: string;
  /** Abono: cuenta de la línea original (la propuesta por causa sale de ella). */
  cuentaOriginal?: string;
}

interface ProveedorBuscado {
  id: string;
  nombre: string;
  nif: string;
  pais?: string;
  activo?: boolean;
}

/** 12.5 -> '12,5' (para un campo de texto que se lee con parseImporte). */
const numeroATexto = (n: number | undefined | null) => (n === undefined || n === null || !Number.isFinite(n) ? '' : String(n).replace('.', ','));

const campoBase =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600 focus:border-accent-600 disabled:bg-slate-100 disabled:cursor-not-allowed aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50 data-[lector=revisar]:border-amber-500 data-[lector=revisar]:bg-amber-50 data-[lector=error]:border-red-500 data-[lector=error]:bg-red-50';
const etiqueta = 'block text-sm font-medium text-slate-700 mb-1';
const ayuda = 'mt-1 text-xs text-slate-500';

/**
 * Pie del formulario (nota y botones): tambien segun el ancho del formulario.
 * En estrecho la nota va encima y los botones debajo, en fila a la derecha (si
 * el formulario es muy estrecho, «Registrar factura» baja a otra fila). Solo en
 * un movil (pantalla de menos de 640 px) van uno sobre otro y a todo lo ancho:
 * el lector en un portatil de 1024 px deja el formulario casi tan estrecho como
 * un movil y ahi no tiene sentido apilarlos. Los botones no se parten en dos lineas. El margen de
 * abajo deja sitio a los botones flotantes (Carmen y, en el movil, el menu) para
 * que no tapen «Registrar factura» al llegar al final de la pagina.
 */
const PIE = {
  formulario: 'flex flex-col gap-6 [container-name:fgform] [container-type:inline-size]',
  pie: 'mb-12 flex flex-col gap-3 [@container_fgform_(min-width:40rem)]:flex-row [@container_fgform_(min-width:40rem)]:items-center [@container_fgform_(min-width:40rem)]:justify-end',
  nota: 'min-w-0 text-sm text-slate-500 [@container_fgform_(min-width:40rem)]:mr-auto',
  botones: 'flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:justify-end [@container_fgform_(min-width:40rem)]:shrink-0',
  boton: 'whitespace-nowrap',
};

let siguienteClave = 1;
const lineaVacia = (tipoIva = 21): LineaForm => ({ clave: siguienteClave++, descripcion: '', cantidad: '1', precio: '', descuento: 0, tipoIva, tipoRetencion: 0 });

/** Las líneas de la factura que se rectifica, en positivo y con su cuenta (para proponer la de la causa). */
const copiaDeOriginal = (d: DatosParaRectificar): LineaForm[] =>
  d.lineas.map((l) => ({
    clave: siguienteClave++,
    descripcion: l.descripcion,
    cantidad: numeroATexto(l.cantidad),
    precio: numeroATexto(Math.abs(l.precioUnitario)),
    descuento: l.descuentoPorcentaje ?? 0,
    tipoIva: l.tipoIva,
    tipoRetencion: l.tipoRetencion,
    cuentaOriginal: l.cuenta,
  }));

const esEspana = (pais: string) => {
  const p = (pais || 'ES').trim().toUpperCase();
  return p === 'ES' || p === 'ESP';
};

export default function FormFacturaGasto({
  modo,
  inicial,
  facturaId,
  asientoEnFirme,
  extra,
  bloqueado,
  avisoProveedor,
  monedaCuenta = 'EUR',
  campoInicial,
  avisoInicial,
  marcas,
  proveedorDeAlta,
  numeroRectificadaLeida,
  onGuardado,
  onCancelar,
}: Props) {
  // Abono o rectificativa del proveedor: el bloque «Rectificación» y los datos de la original de la app.
  const [rect, setRect] = useState<EstadoRectificacion | null>(inicial?.rectificativa ?? null);
  const [datosOriginal, setDatosOriginal] = useState<DatosParaRectificar | null>(inicial?.datosOriginal ?? null);
  const [proveedor, setProveedor] = useState<ProveedorElegido | null>(inicial?.proveedor ?? null);
  const [numero, setNumero] = useState(inicial?.numeroFacturaProveedor ?? '');
  const [fechaEmision, setFechaEmision] = useState(inicial?.fechaEmision ?? '');
  const [fechaVencimiento, setFechaVencimiento] = useState(inicial?.fechaVencimiento ?? (inicial?.fechaEmision ? sumarDias(inicial.fechaEmision, 30) : ''));
  // En una factura ya guardada el vencimiento no se mueve solo al cambiar la fecha.
  const [vencTocado, setVencTocado] = useState(modo === 'editar' || !!inicial?.fechaVencimiento);
  const [mostrarRegistro, setMostrarRegistro] = useState(!!inicial?.fechaRegistro || campoInicial === 'fechaRegistro');
  const [fechaRegistro, setFechaRegistro] = useState(inicial?.fechaRegistro ?? '');
  // Un abono sin factura de la app suele ser de compras de mercaderías (devolución, descuento, rappel).
  const [tipoGasto, setTipoGasto] = useState<TipoGasto>(inicial?.tipoGasto ?? (inicial?.rectificativa ? 'COMPRA' : 'SUMINISTROS'));
  const [cuenta, setCuenta] = useState(inicial?.cuentaGasto ?? '');
  const [mostrarCuenta, setMostrarCuenta] = useState(!!inicial?.cuentaGasto && inicial.cuentaGasto !== TIPO_GASTO_INFO[inicial?.tipoGasto ?? 'SUMINISTROS'].cuenta);
  const [lineas, setLineas] = useState<LineaForm[]>(() =>
    inicial?.lineas?.length
      ? inicial.lineas.map((l) => ({
          clave: siguienteClave++,
          descripcion: l.descripcion,
          cantidad: numeroATexto(l.cantidad),
          precio: numeroATexto(l.precioUnitario),
          descuento: l.descuentoPorcentaje ?? 0,
          tipoIva: l.tipoIva,
          tipoRetencion: l.tipoRetencion,
          cuenta: l.cuenta ?? undefined,
          cuentaOriginal: l.cuentaOriginal ?? undefined,
        }))
      : [lineaVacia()],
  );
  const [observaciones, setObservaciones] = useState(inicial?.observaciones ?? '');

  // Lector (P6): cada dato marcado se colorea mientras conserve el valor leido; al cambiarlo,
  // la marca se quita (ya se ha corregido o comprobado). Las lineas se siguen por su clave.
  const [valoresLeidos] = useState<Record<string, unknown>>(() => {
    const v: Record<string, unknown> = {
      proveedor: inicial?.proveedor ?? null,
      numeroFacturaProveedor: numero,
      fechaEmision,
      totalDocumento: numeroATexto(inicial?.totalDocumento),
    };
    if (inicial?.proveedor?.tipo === 'nuevo') {
      v['proveedor.nifCif'] = inicial.proveedor.nifCif;
      v['proveedor.nombreFiscal'] = inicial.proveedor.nombreFiscal;
    }
    lineas.forEach((l, i) => {
      v[`lineas.${i}`] = l.clave;
      v[`linea:${l.clave}.descripcion`] = l.descripcion;
      v[`linea:${l.clave}.precioUnitario`] = l.precio;
      v[`linea:${l.clave}.tipoIva`] = l.tipoIva;
      v[`linea:${l.clave}.tipoRetencion`] = l.tipoRetencion;
    });
    return v;
  });
  /** Nivel de la marca del lector en un campo, si sigue con el valor leido. En las lineas se pasa su clave. */
  const marcaLeida = (campo: string, actual: unknown, clave?: number): NivelMarca | undefined => {
    if (modo !== 'lector' || !marcas) return undefined;
    let nivel = marcas[campo];
    let id = campo;
    if (clave !== undefined) {
      // La marca es de la linea N de la propuesta: se busca por su clave, aunque se borren o anadan lineas.
      const n = Object.keys(valoresLeidos).find((k) => /^lineas\.\d+$/.test(k) && valoresLeidos[k] === clave);
      const parte = campo.split('.').pop();
      nivel = n ? marcas[`${n}.${parte}`] : undefined;
      id = `linea:${clave}.${parte}`;
    }
    return nivel && Object.is(valoresLeidos[id], actual) ? nivel : undefined;
  };
  // Cuentas de gasto del plan para el «Cambiar cuenta» de cada linea (una sola peticion).
  const catalogo = useCuentasLinea('gasto');
  const puedeCrearCuenta = tieneAlgunPermiso(getUser(), ['compras:write', 'contabilidad:write']);
  const [totalDocumento, setTotalDocumento] = useState(numeroATexto(inicial?.totalDocumento));

  const [guardando, setGuardando] = useState(false);
  const avisoPlan = useAvisoPlanAnterior();
  const [error, setError] = useState(campoInicial ? (avisoInicial ?? '') : '');
  const [campoError, setCampoError] = useState<string | undefined>(campoInicial);
  const [facturaRepetidaId, setFacturaRepetidaId] = useState<string | null>(null);
  const [proveedorRepetidoId, setProveedorRepetidoId] = useState<string | null>(null);
  // 409 que piden otra cosa: contabilizarla antes o volver a abrirla.
  const [conflicto, setConflicto] = useState<ConflictoGasto | null>(null);
  /** Sube en cada intento fallido de guardar: lleva la pantalla y el foco al campo que falla. */
  const [intentoFallido, setIntentoFallido] = useState(0);

  // Se abre para corregir un campo concreto: el foco va a el, como tras un error.
  useEffect(() => {
    if (campoInicial) setIntentoFallido(1);
    // Solo al abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paisProveedor = proveedor?.pais ?? 'ES';
  const proveedorExtranjero = !esEspana(paisProveedor);
  // La empresa, con la misma regla que Configuracion y el servidor (pais de /legal-config).
  // null mientras carga: no se cambia nada hasta saberlo.
  const empresaExtranjera = useEmpresaEspanola() === false;
  /** Sin IVA español ni retención: proveedor de fuera de España o empresa no establecida en España. */
  const extranjero = proveedorExtranjero || empresaExtranjera;
  const retenciones = TIPO_GASTO_INFO[tipoGasto].retenciones;
  // La cuenta de la factura no es la del tipo de gasto marcado (p. ej. 629 con
  // «Profesionales independientes (623)»): se avisa debajo del tipo, para que el
  // numero del boton no engane.
  const cuentaFactura = cuenta.trim();
  const cuentaDelTipo = TIPO_GASTO_INFO[tipoGasto].cuenta;
  const cuentaDistintaDelTipo = cuentaFactura.length >= 3 && !cuentaFactura.startsWith(cuentaDelTipo) ? cuentaFactura : null;
  const cuentaEsHabitual = !!cuentaDistintaDelTipo && inicial?.origenCuentaGasto === 'habitual' && cuentaDistintaDelTipo === inicial.cuentaGasto;
  // Una retencion que el tipo no admite solo llega del lector (1 o 2 %): se ve, para que se cambie.
  const retencionNoAdmitida = lineas.some((l) => l.tipoRetencion !== 0 && !retenciones.includes(l.tipoRetencion));
  const conRetencion = (retenciones.length > 1 || retencionNoAdmitida) && !extranjero;

  // Sin IVA español ni retención (proveedor o empresa de fuera de España): se ponen a 0.
  useEffect(() => {
    if (extranjero) setLineas((ls) => (ls.some((l) => l.tipoIva !== 0 || l.tipoRetencion !== 0) ? ls.map((l) => ({ ...l, tipoIva: 0, tipoRetencion: 0 })) : ls));
  }, [extranjero]);

  // Al cambiar el tipo de gasto, las retenciones que ese tipo no admite vuelven a 0. Al abrir no:
  // la que trae el lector se conserva (si no, se perderia sin avisar y el total no cuadraria).
  const tipoAnterior = useRef(tipoGasto);
  useEffect(() => {
    if (tipoAnterior.current === tipoGasto) return;
    tipoAnterior.current = tipoGasto;
    setLineas((ls) => (ls.some((l) => !retenciones.includes(l.tipoRetencion)) ? ls.map((l) => (retenciones.includes(l.tipoRetencion) ? l : { ...l, tipoRetencion: 0 })) : ls));
  }, [tipoGasto, retenciones]);

  // En un abono por diferencias las lineas se escriben en positivo y «Reduce el importe» les pone el signo menos.
  const signo = rect ? signoDe(rect) : 1;
  const sustitucion = rect?.tipo === 'S';
  const valores = useMemo(
    () =>
      lineas.map((l) => ({
        cantidad: parseImporte(l.cantidad),
        // NaN si el precio no se lee (se avisa al guardar); 0 sin signo menos.
        precioUnitario: signo * parseImporte(l.precio) + 0,
        descuentoPorcentaje: l.descuento,
        tipoIva: l.tipoIva,
        tipoRetencion: conRetencion ? l.tipoRetencion : 0,
      })),
    [lineas, conRetencion, signo],
  );
  const totales = useMemo(() => calcularTotales(valores), [valores]);
  // Sustitucion: la diferencia entre la corregida (las lineas) y la original.
  const totalesOriginal = useMemo(() => {
    if (!sustitucion || !rect) return null;
    const vs = rect.lineasOriginal.map((l) => ({ cantidad: parseImporte(l.cantidad), precioUnitario: parseImporte(l.precio), tipoIva: l.tipoIva, tipoRetencion: l.tipoRetencion }));
    return vs.length && vs.every((v) => Number.isFinite(v.cantidad) && Number.isFinite(v.precioUnitario)) ? calcularTotales(vs) : null;
  }, [sustitucion, rect]);
  const diferencia = totalesOriginal
    ? {
        base: (Math.round(totales.base * 100) - Math.round(totalesOriginal.base * 100)) / 100,
        iva: (Math.round(totales.iva * 100) - Math.round(totalesOriginal.iva * 100)) / 100,
        retencion: (Math.round(totales.retencion * 100) - Math.round(totalesOriginal.retencion * 100)) / 100,
        total: (Math.round(totales.total * 100) - Math.round(totalesOriginal.total * 100)) / 100,
      }
    : null;
  /** Lo que se registra resta (abono): por diferencias, el total; por sustitucion, la diferencia. */
  const esAbono = !!rect && (sustitucion ? (diferencia?.total ?? 0) < 0 : totales.total < 0);
  /** Lector con importes en positivo: aún no se ha dicho si es por diferencias (y si resta o suma) o por sustitución. */
  const sinSentido = !!rect && (!rect.tipo || (rect.tipo === 'I' && !rect.sentido));
  /** Cuenta de una linea si no tiene una propia: en un abono, la que toca por la causa. */
  const cuentaPorDefecto = (l: LineaForm): { codigo: string; texto: string } => {
    const base = l.cuentaOriginal || cuenta.trim() || TIPO_GASTO_INFO[tipoGasto].cuenta;
    // Por sustitución, la corregida va a las cuentas de la original: el servidor resta línea a línea
    // por cuenta, y con otra cuenta saldrían dos líneas (una que abona la 600 y otra que carga la 608).
    if (sustitucion) return l.cuentaOriginal ? { codigo: l.cuentaOriginal, texto: 'la de la factura original' } : { codigo: cuenta.trim() || TIPO_GASTO_INFO[tipoGasto].cuenta, texto: cuenta.trim() ? 'la de la factura' : 'la del tipo de gasto' };
    if (rect?.causa) {
      const propuesta = cuentaPropuesta(rect.causa, base, rect.que === 'periodo');
      if (propuesta && propuesta !== base) return { codigo: propuesta, texto: 'la que corresponde a la causa' };
      if (l.cuentaOriginal) return { codigo: l.cuentaOriginal, texto: 'la de la factura original' };
    }
    return { codigo: cuenta.trim() || TIPO_GASTO_INFO[tipoGasto].cuenta, texto: cuenta.trim() ? 'la de la factura' : 'la del tipo de gasto' };
  };
  const totalDoc = parseImporte(totalDocumento);
  const totalNoCuadra = modo === 'lector' && Number.isFinite(totalDoc) && Math.abs(totalDoc - totales.total) > 0.02;
  const marcaTotal = marcaLeida('totalDocumento', totalDocumento);

  const inv = (campo: string) => !!campoError && (campoError === campo || campoError.startsWith(`${campo}.`));
  /** aria-invalid y, si hay mensaje, aria-describedby al cuadro del error: el lector de pantalla lee el motivo. */
  const marca = (...campos: string[]): PropsMarca => {
    const mal = campos.some(inv);
    return { 'aria-invalid': mal, 'aria-describedby': mal && error ? 'fg-error' : undefined };
  };
  /**
   * marca() mas la del lector: data-lector colorea el campo (ambar o rojo) y
   * aria-describedby lee la explicacion de las marcas. Un error del servidor manda.
   */
  const marcaCon = (nivel: NivelMarca | undefined, ...campos: string[]): PropsMarca => {
    const m = marca(...campos);
    if (!nivel || m['aria-invalid']) return m;
    return { ...m, 'data-lector': nivel, 'aria-describedby': 'fg-marcas-lector' };
  };

  // Tras un error, el campo que falla se pone a la vista y recibe el foco (en el movil
  // el aviso queda junto al boton y el campo, muy arriba). Si no se sabe cual es, el aviso.
  useEffect(() => {
    if (!intentoFallido) return;
    const id = idDelCampo(campoError, lineas, rect);
    const el = (id && document.getElementById(id)) || document.getElementById('fg-error');
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus({ preventScroll: true });
    // Solo al fallar un intento, no cada vez que cambian las lineas o el campo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentoFallido]);
  const fmt = (n: number) => formatoImporte(n, monedaCuenta);

  // Lector: sin un proveedor dado de alta no se registra (el servidor tambien lo exige).
  const faltaAltaProveedor = proveedorDeAlta && proveedor?.tipo !== 'existente' ? proveedorDeAlta.motivo : undefined;
  const motivoBloqueo = bloqueado ?? faltaAltaProveedor;
  const cambiarProveedor = (p: ProveedorElegido | null) => {
    setProveedor(p);
    if (campoError?.startsWith('proveedor')) {
      setError('');
      setCampoError(undefined);
    }
  };

  const cambiarLinea = (clave: number, cambios: Partial<LineaForm>) => setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));

  const cambiarFecha = (v: string) => {
    setFechaEmision(v);
    if (!vencTocado) setFechaVencimiento(v ? sumarDias(v, 30) : '');
  };

  /**
   * Abono de una factura de la app elegida en el bloque: hereda su tipo de
   * gasto y, si aún no hay líneas escritas, se rellenan con las suyas (en
   * positivo, con su cuenta para proponer la de la causa).
   */
  const alLlegarDatosOriginal = (d: DatosParaRectificar | null) => {
    setDatosOriginal(d);
    if (!d) return;
    setTipoGasto(d.tipoGasto);
    // Lector: la cuenta que sugirio (la habitual del proveedor) no es la de la original.
    if (modo === 'lector') {
      setCuenta('');
      setMostrarCuenta(false);
    }
    setLineas((ls) => {
      const enBlanco = ls.every((l) => !l.descripcion.trim() && !l.precio.trim());
      if (!enBlanco) {
        // Lineas ya escritas (o leidas): cada una toma la cuenta de la original (la unica, o la de
        // la linea con su mismo IVA), para proponer la de la causa o restar cuenta a cuenta.
        const cuentas = Array.from(new Set(d.lineas.map((x) => x.cuenta).filter((c): c is string => !!c)));
        const cuentaDe = (tipoIva: number) => (cuentas.length === 1 ? cuentas[0] : (d.lineas.find((x) => x.tipoIva === tipoIva)?.cuenta ?? d.lineas[0]?.cuenta ?? undefined));
        return ls.map((l) => ({ ...l, cuentaOriginal: cuentaDe(l.tipoIva) ?? undefined, ...(modo === 'lector' ? { cuenta: undefined } : {}) }));
      }
      return copiaDeOriginal(d);
    });
  };

  // Descuento, rappel o pronto pago de una factura de la app: el proveedor manda un solo importe.
  // Si las líneas siguen siendo la copia de la original, se cambian por una por tipo de IVA (cantidad 1,
  // precio vacío): con la cantidad copiada, el importe escrito se multiplicaba.
  // Si después se elige otra causa o se pasa a sustitución sin haber escrito ningún importe en esas
  // líneas, vuelven las de la original: la factura corregida (o la devolución) sale de ellas.
  const causaAnterior = useRef(`${rect?.causa ?? ''}|${rect?.tipo ?? ''}`);
  /** Claves de las líneas de un solo importe que puso la causa, mientras sigan sin tocar. */
  const lineasDeLaCausa = useRef<number[]>([]);
  useEffect(() => {
    const causa = rect?.causa ?? '';
    const clave = `${causa}|${rect?.tipo ?? ''}`;
    if (causaAnterior.current === clave) return;
    causaAnterior.current = clave;
    const d = datosOriginal;
    if (!rect || !d) return;
    const puestas = lineasDeLaCausa.current;
    const sinTocar = puestas.length > 0 && lineas.length === puestas.length && lineas.every((l, i) => l.clave === puestas[i] && !l.precio.trim());
    const unSoloImporte = rect.tipo === 'I' && (causa === 'DESCUENTO' || causa === 'RAPPEL' || causa === 'PRONTO_PAGO');
    if (!unSoloImporte) {
      if (sinTocar) {
        lineasDeLaCausa.current = [];
        setLineas(copiaDeOriginal(d));
      }
      return;
    }
    const copia =
      lineas.length === d.lineas.length &&
      lineas.every((l, i) => l.descripcion === d.lineas[i].descripcion && parseImporte(l.cantidad) === d.lineas[i].cantidad && parseImporte(l.precio) === Math.abs(d.lineas[i].precioUnitario));
    if (!copia && !sinTocar) return;
    const que = causa === 'RAPPEL' ? 'Rappel' : causa === 'PRONTO_PAGO' ? 'Descuento por pronto pago' : 'Descuento';
    const numeroOriginal = d.original.numero ?? d.original.numeroCompleto;
    const grupos = new Map<string, (typeof d.lineas)[number]>();
    for (const l of d.lineas) {
      const k = `${l.tipoIva}|${l.tipoRetencion}|${l.cuenta}`;
      if (!grupos.has(k)) grupos.set(k, l);
    }
    const varios = grupos.size > 1;
    const nuevas: LineaForm[] = Array.from(grupos.values()).map((l) => ({
      clave: siguienteClave++,
      descripcion: `${que} sobre la ${numeroOriginal}${varios ? ` (IVA ${l.tipoIva} %)` : ''}`,
      cantidad: '1',
      precio: '',
      descuento: 0,
      tipoIva: l.tipoIva,
      tipoRetencion: l.tipoRetencion,
      cuentaOriginal: l.cuenta,
    }));
    lineasDeLaCausa.current = nuevas.map((l) => l.clave);
    setLineas(nuevas);
    // Solo al cambiar la causa o el tipo (diferencias o sustitución).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rect?.causa, rect?.tipo]);

  // Al cambiar a otro proveedor, las facturas de la app elegidas (del anterior) ya no valen.
  const proveedorIdActual = proveedor?.tipo === 'existente' ? proveedor.id : null;
  const proveedorPrevio = useRef(proveedorIdActual);
  useEffect(() => {
    if (proveedorPrevio.current === proveedorIdActual) return;
    proveedorPrevio.current = proveedorIdActual;
    setRect((r) => (r && r.originales.some((o) => o.origen === 'app') ? { ...r, originales: r.originales.filter((o) => o.origen !== 'app'), lineasOriginal: r.lineasOriginalDeApp ? [] : r.lineasOriginal, lineasOriginalDeApp: false } : r));
  }, [proveedorIdActual]);

  const guardar = async (e?: React.FormEvent, opciones: { confirmar303?: boolean } = {}) => {
    e?.preventDefault();
    setError('');
    setCampoError(undefined);
    setFacturaRepetidaId(null);
    setProveedorRepetidoId(null);
    setConflicto(null);

    // Comprobaciones que el usuario entiende mejor aqui (el servidor repite todas).
    const falta = (mensaje: string, campo: string) => {
      setError(mensaje);
      setCampoError(campo);
      setIntentoFallido((n) => n + 1);
    };
    if (!proveedor) return falta('Elige el proveedor de la factura o da de alta uno nuevo.', 'proveedor');
    if (proveedor.tipo === 'nuevo' && !proveedor.nombreFiscal.trim()) return falta('Escribe el nombre del proveedor.', 'proveedor.nombreFiscal');
    if (proveedor.tipo === 'nuevo' && !proveedor.nifCif.trim()) return falta('Escribe el NIF del proveedor.', 'proveedor.nifCif');
    if (!numero.trim()) return falta('Escribe el número que puso el proveedor en su factura.', 'numeroFacturaProveedor');
    if (!fechaEmision) return falta('Falta la fecha de la factura.', 'fechaEmision');
    if (rect) {
      const f = faltaEnBloque(rect, esAbono);
      if (f) return falta(f.mensaje, f.campo);
    }
    for (let i = 0; i < lineas.length; i++) {
      if (!lineas[i].descripcion.trim()) return falta(`Falta la descripción de la línea ${i + 1}.`, `lineas.${i}.descripcion`);
      if (!Number.isFinite(valores[i].cantidad) || valores[i].cantidad <= 0) return falta(`Revisa la cantidad de la línea ${i + 1}.`, `lineas.${i}.cantidad`);
      if (!Number.isFinite(valores[i].precioUnitario)) return falta(`Revisa el precio de la línea ${i + 1}.`, `lineas.${i}.precioUnitario`);
    }
    if (rect && sustitucion) {
      const i = rect.lineasOriginal.findIndex((l) => !Number.isFinite(parseImporte(l.precio)) || !(parseImporte(l.cantidad) > 0));
      if (i >= 0) return falta(`Revisa la línea ${i + 1} de la factura original.`, `rectificativa.importesOriginales.lineas.${i}.precioUnitario`);
    }
    // Un aumento de más de la mitad de la original suele ser una sustitución tomada por diferencias.
    const totalOriginal = rect?.originales.length === 1 ? rect.originales[0].total : undefined;
    if (rect?.tipo === 'I' && rect.sentido === 'AUMENTA' && totalOriginal && totalOriginal > 0 && totales.total > totalOriginal * 0.5 && !opciones.confirmar303) {
      const ok = window.confirm(
        `¿Seguro que es un aumento de ${fmt(totales.total)} sobre una factura de ${fmt(totalOriginal)}?\n\nSi la rectificativa trae la factura corregida entera, elige «Por sustitución».`,
      );
      if (!ok) return;
    }

    const cuentaGlobal = cuenta.trim();
    // Lineas con su signo y, en un abono, la cuenta que toca por la causa.
    const lineasCuerpo: LineaCuerpo[] = lineas.map((l, i) => {
      const porDefecto = rect ? cuentaPorDefecto(l).codigo : null;
      const cuentaLinea = l.cuenta ?? (porDefecto && porDefecto !== (cuentaGlobal || TIPO_GASTO_INFO[tipoGasto].cuenta) ? porDefecto : undefined);
      return {
        descripcion: l.descripcion.trim(),
        cantidad: valores[i].cantidad,
        precioUnitario: valores[i].precioUnitario,
        descuentoPorcentaje: l.descuento,
        tipoIva: l.tipoIva,
        tipoRetencion: valores[i].tipoRetencion,
        // La cuenta propia de la linea manda sobre la de la factura.
        ...(cuentaLinea ? { cuenta: cuentaLinea } : {}),
      };
    });
    const cuerpo: Record<string, unknown> = {
      proveedor:
        proveedor.tipo === 'existente'
          ? { id: proveedor.id }
          : {
              nuevo: {
                nombreFiscal: proveedor.nombreFiscal.trim(),
                nifCif: proveedor.nifCif.trim(),
                pais: proveedor.pais,
                ...(proveedor.direccion.trim() ? { direccion: proveedor.direccion.trim() } : {}),
                ...(proveedor.cp.trim() ? { cp: proveedor.cp.trim() } : {}),
                ...(proveedor.municipio.trim() ? { municipio: proveedor.municipio.trim() } : {}),
                ...(proveedor.provincia.trim() ? { provincia: proveedor.provincia.trim() } : {}),
              },
            },
      numeroFacturaProveedor: numero.trim(),
      fechaEmision,
      ...(fechaVencimiento ? { fechaVencimiento } : {}),
      ...(mostrarRegistro && fechaRegistro ? { fechaRegistro } : {}),
      tipoGasto,
      ...(cuentaGlobal ? { cuentaGasto: cuentaGlobal } : {}),
      lineas: lineasCuerpo,
      ...(observaciones.trim() ? { observaciones: observaciones.trim() } : {}),
      ...(modo === 'lector' && Number.isFinite(totalDoc) ? { totalDocumento: totalDoc } : {}),
      ...(extra ?? {}),
      // Por sustitucion, las lineas son las de la factura corregida (el servidor calcula la diferencia).
      ...(rect ? { rectificativa: bloqueParaEnviar(rect, { lineasCorregidas: sustitucion ? lineasCuerpo : undefined, abono: esAbono, confirmaRectificar303: opciones.confirmar303 }) } : {}),
    };

    setGuardando(true);
    try {
      if (modo === 'lector') {
        // El lector no da de alta al proveedor (eso se hace antes, desde su aviso): aquí no hay aviso del plan anterior.
        onGuardado(await apiFetch<GastoRegistrado>(companyPath('/gastos-extractor/confirmar'), { method: 'POST', body: JSON.stringify(cuerpo) }));
      } else if (modo === 'editar' && facturaId) {
        const factura = await apiFetch<GastoDetalle>(companyPath(`/expense-invoices/${encodeURIComponent(facturaId)}`), { method: 'PUT', body: JSON.stringify(cuerpo) });
        onGuardado({ factura });
      } else {
        const factura = await avisoPlan.intentar((extra) =>
          apiFetch<GastoDetalle>(companyPath('/expense-invoices'), { method: 'POST', body: JSON.stringify({ ...cuerpo, ...extra }) }),
        );
        if (factura) onGuardado({ factura });
      }
    } catch (err) {
      const c = conflictoGasto(err);
      // Con rectificar_303 no hay nada que corregir: se lleva la vista al aviso y a su botón, no a un campo.
      const campo = c?.rectificar303 ? undefined : normalizarCampo(campoDelError(err));
      setError(errorMessage(err));
      setCampoError(campo);
      setConflicto(c);
      // Campos plegados: se despliegan para poder marcarlos.
      if (campo === 'fechaRegistro') setMostrarRegistro(true);
      if (campo === 'cuentaGasto') setMostrarCuenta(true);
      setIntentoFallido((n) => n + 1);
      if (err instanceof ApiError && err.status === 409 && err.detalles && typeof err.detalles === 'object') {
        const d = err.detalles as { facturaId?: unknown; proveedorId?: unknown };
        if (typeof d.facturaId === 'string') setFacturaRepetidaId(d.facturaId);
        if (typeof d.proveedorId === 'string') setProveedorRepetidoId(d.proveedorId);
      }
      // Lector: 400 TERCERO_NO_DADO_DE_ALTA con uno que ya tiene ese NIF: se ofrece usarlo.
      if (err instanceof ApiError && err.status === 400 && err.detalles && typeof err.detalles === 'object') {
        const existente = (err.detalles as { existente?: { id?: unknown } }).existente;
        if (existente && typeof existente.id === 'string') setProveedorRepetidoId(existente.id);
      }
    } finally {
      setGuardando(false);
    }
  };

  /** 409 «Ya existe un proveedor con ese NIF»: se elige el que ya esta dado de alta. */
  const usarProveedorExistente = async () => {
    if (!proveedorRepetidoId) return;
    try {
      const p = await apiFetch<{ id: string; nombreFiscal: string; nifCif: string; pais?: string }>(companyPath(`/proveedores/${encodeURIComponent(proveedorRepetidoId)}`));
      setProveedor({ tipo: 'existente', id: p.id, nombre: p.nombreFiscal, nif: p.nifCif, pais: p.pais || 'ES' });
      setError('');
      setCampoError(undefined);
      setProveedorRepetidoId(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const textoBoton = modo === 'editar' ? 'Guardar cambios' : rect ? (modo === 'lector' ? 'Registrar abono' : 'Guardar abono') : modo === 'lector' ? 'Registrar factura' : 'Guardar factura';
  /**
   * Rejillas de los datos de la factura. En el lector el formulario ocupa media
   * pantalla, pero estas rejillas cambian con el ancho de la ventana: a 1280 px
   * la fecha se cortaba. Ahi van siempre en dos columnas.
   * (Los conceptos y el pie no dependen de esto: miran el ancho del propio
   * formulario: ver CONCEPTOS, en disenoConceptos.ts, y PIE, al principio del fichero.)
   */
  const R =
    modo === 'lector'
      ? { datos: 'grid grid-cols-1 gap-4 sm:grid-cols-2', datosAncho: 'sm:col-span-2' }
      : { datos: 'grid grid-cols-1 gap-4 lg:grid-cols-3', datosAncho: 'lg:col-span-3' };
  const L = conRetencion ? CONCEPTOS.conIrpf : CONCEPTOS.sinIrpf;
  /** Explicacion bajo «Conceptos» en un abono (en una factura normal no hace falta). */
  const textoConceptos = sustitucion
    ? 'Las líneas de la factura corregida que manda el proveedor, con sus importes completos y en positivo.'
    : rect && sinSentido
      ? 'Elige arriba cómo viene la rectificativa: según eso, estos importes restan o sustituyen a los de la original.'
      : rect
        ? `Lo que rectifica, en positivo: ${signo < 0 ? 'se registra restando' : 'se registra sumando'}. Las cuentas se proponen según la causa.`
        : '';
  const nota =
    modo === 'lector'
      ? 'Quedará pendiente de revisar: su asiento se aprueba en el Motor contable.'
      : modo === 'alta'
        ? 'Al guardar se anota en la contabilidad y en el libro de IVA.'
        : null;

  return (
    <form onSubmit={guardar} noValidate className={PIE.formulario}>
      {avisoPlan.dialogo}
      {modo === 'lector' && marcas && Object.values(marcas).some(Boolean) && (
        <p id="fg-marcas-lector" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Los datos que el lector no ha podido confirmar van marcados en el formulario: en ámbar, los que conviene comprobar con la factura; en rojo, los que faltan o no
          cuadran. La marca se quita cuando cambias el dato.
        </p>
      )}
      {/* 1. Proveedor */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Proveedor</h2>
        {proveedorDeAlta && <div className="mb-4">{proveedorDeAlta.aviso(proveedor, cambiarProveedor)}</div>}
        <SelectorProveedor
          valor={proveedor}
          textoNuevo={avisoProveedor}
          sinBuscarOtro={!!proveedorDeAlta}
          marcaLector={(campo, actual) => marcaLeida(campo, actual)}
          marcaCon={marcaCon}
          onCambio={cambiarProveedor}
          marca={marca}
        />
        {empresaExtranjera ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Tu empresa no está establecida en España: sus gastos van sin IVA español y sin retención de IRPF.
          </p>
        ) : (
          proveedorExtranjero && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Proveedor de fuera de España: la factura va sin IVA español y sin retención.
            </p>
          )
        )}
      </section>

      {/* 1b. Rectificacion (abono o rectificativa) */}
      {rect && (
        <BloqueRectificacion
          valor={rect}
          onCambio={setRect}
          proveedorId={proveedorIdActual}
          esAbono={esAbono}
          datos={datosOriginal}
          onDatos={alLlegarDatosOriginal}
          marca={marca}
          monedaCuenta={monedaCuenta}
          numeroLeido={numeroRectificadaLeida}
        />
      )}

      {/* 2. Datos de la factura */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">{rect ? 'Datos de la rectificativa' : 'Datos de la factura'}</h2>
        <div className={R.datos}>
          <div className={R.datosAncho}>
            <label htmlFor="fg-numero" className={etiqueta}>
              Nº de factura del proveedor *
            </label>
            <input
              id="fg-numero"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              maxLength={60}
              {...marcaCon(marcaLeida('numeroFacturaProveedor', numero), 'numeroFacturaProveedor')}
              className={campoBase}
              autoComplete="off"
            />
            <p className={ayuda}>El número que aparece en la factura. Si es un ticket sin número, escribe el número del ticket o la fecha y la hora que aparecen.</p>
          </div>
          <div>
            <label htmlFor="fg-fecha" className={etiqueta}>
              Fecha de la factura *
            </label>
            <input id="fg-fecha" type="date" value={fechaEmision} onChange={(e) => cambiarFecha(e.target.value)} {...marcaCon(marcaLeida('fechaEmision', fechaEmision), 'fechaEmision')} className={campoBase} />
          </div>
          {/* Un abono no se paga ni vence: no se pregunta el vencimiento (se guarda el de por defecto). */}
          <div className={esAbono ? 'hidden' : ''}>
            <label htmlFor="fg-venc" className={etiqueta}>
              Vencimiento
            </label>
            <input
              id="fg-venc"
              type="date"
              value={fechaVencimiento}
              onChange={(e) => {
                setFechaVencimiento(e.target.value);
                setVencTocado(true);
              }}
              {...marca('fechaVencimiento')}
              className={campoBase}
            />
            {!vencTocado && <p className={ayuda}>A 30 días de la fecha de la factura.</p>}
          </div>
          <div className="flex items-end">
            {!mostrarRegistro ? (
              <button type="button" onClick={() => setMostrarRegistro(true)} className="inline-flex items-center gap-1 py-2 text-sm font-medium text-blue-600 hover:underline">
                <CaretRight size={14} /> ¿La recibiste más tarde?
              </button>
            ) : (
              <div className="w-full">
                <label htmlFor="fg-registro" className={etiqueta}>
                  Fecha de registro
                </label>
                <input id="fg-registro" type="date" value={fechaRegistro} onChange={(e) => setFechaRegistro(e.target.value)} {...marca('fechaRegistro')} className={campoBase} />
              </div>
            )}
          </div>
          {mostrarRegistro && (
            <p className={`${R.datosAncho} -mt-2 text-xs text-slate-500`}>
              El IVA se deduce en el trimestre de esta fecha. Déjala vacía si la anotas en el mismo trimestre que la fecha de la factura.{' '}
              <button
                type="button"
                className="font-medium text-blue-600 hover:underline"
                onClick={() => {
                  setMostrarRegistro(false);
                  setFechaRegistro('');
                }}
              >
                Quitar
              </button>
            </p>
          )}
        </div>

        <fieldset id="fg-tipo" tabIndex={-1} className="mt-5 focus:outline-none" {...marca('tipoGasto')}>
          <legend className={etiqueta}>Tipo de gasto *</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TIPOS_GASTO.map((t) => (
              <label
                key={t}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${tipoGasto === t ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
              >
                <input type="radio" name="fg-tipo" value={t} checked={tipoGasto === t} onChange={() => setTipoGasto(t)} className="accent-emerald-600" />
                <span>
                  {TIPO_GASTO_INFO[t].texto} <span className="text-slate-500">({TIPO_GASTO_INFO[t].cuenta})</span>
                </span>
              </label>
            ))}
          </div>
          {tipoGasto === 'ALQUILER' && !extranjero && (
            <p className={ayuda}>El alquiler de un local suele llevar una retención del 19 % (modelo 115), salvo que el arrendador te diga que está exento.</p>
          )}
          {tipoGasto === 'SERVICIO_PROFESIONAL' && !extranjero && <p className={ayuda}>Si el profesional te descuenta IRPF en la factura, ponlo en la columna IRPF (va al modelo 111).</p>}
          {cuentaDistintaDelTipo && (
            <div role="note" className="mt-2 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
              <p className="min-w-0">
                Esta factura irá a la cuenta {cuentaDistintaDelTipo}
                {catalogo.nombreDe(cuentaDistintaDelTipo) ? ` ${catalogo.nombreDe(cuentaDistintaDelTipo)}` : ''}
                {cuentaEsHabitual ? ' (la habitual de este proveedor)' : ''}, no a la {cuentaDelTipo} del tipo de gasto. El tipo marcado decide el modelo de la retención; la cuenta, dónde se anota el gasto.
              </p>
              <button
                type="button"
                onClick={() => setCuenta('')}
                className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold text-amber-800 hover:bg-amber-100"
              >
                Usar la {cuentaDelTipo}
              </button>
            </div>
          )}
        </fieldset>

        <div className="mt-4">
          <button type="button" onClick={() => setMostrarCuenta((v) => !v)} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
            {mostrarCuenta ? <CaretDown size={14} /> : <CaretRight size={14} />} Cuenta contable
            {!mostrarCuenta && <span className="font-normal text-slate-500">: {cuenta.trim() || TIPO_GASTO_INFO[tipoGasto].cuenta}</span>}
          </button>
          {mostrarCuenta && (
            <div className="mt-2 max-w-md">
              <label htmlFor="fg-cuenta" className={etiqueta}>
                Cuenta de gasto
              </label>
              <input
                id="fg-cuenta"
                list="fg-cuentas"
                inputMode="numeric"
                value={cuenta}
                placeholder={`${TIPO_GASTO_INFO[tipoGasto].cuenta} (la del tipo de gasto)`}
                onChange={(e) => setCuenta(e.target.value.replace(/[^\d]/g, ''))}
                {...marca('cuentaGasto')}
                className={campoBase}
              />
              <datalist id="fg-cuentas">
                {CUENTAS_GASTO_HABITUALES.map(([c, n]) => (
                  <option key={c} value={c}>
                    {n}
                  </option>
                ))}
              </datalist>
              <p className={ayuda}>
                Vacía, se usa la del tipo de gasto. Tiene que ser una cuenta del grupo 6 de tu plan contable (por ejemplo, 629 Otros servicios). Vale para las líneas que no
                tienen una cuenta propia: cada línea se puede llevar a otra con «Cambiar cuenta».
              </p>
            </div>
          )}
        </div>
      </section>

      {/* 2b. Sustitucion: la factura original (de la app, de solo lectura; de fuera, se escribe) */}
      {rect && sustitucion && rect.originales.length === 1 && (
        <LineasOriginal
          lineas={rect.lineasOriginal}
          deApp={rect.lineasOriginalDeApp}
          onCambio={(ls) => setRect({ ...rect, lineasOriginal: ls })}
          marca={marca}
          monedaCuenta={monedaCuenta}
          extranjero={extranjero}
          numero={rect.originales[0].numero || rect.originales[0].numeroCompleto || ''}
        />
      )}

      {/* 3. Lineas */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-6">
        <h2 className={`${textoConceptos ? 'mb-1' : 'mb-4'} text-base font-semibold text-slate-900`}>{sustitucion ? 'Factura corregida' : 'Conceptos'}</h2>
        {textoConceptos && <p className="mb-4 text-sm text-slate-600">{textoConceptos}</p>}
        <div className={L.contenedor}>
          {/* Cabeceras de la tabla (solo en ancho y sin IRPF). Cada campo lleva ademas su etiqueta para el lector de pantalla. */}
          <div aria-hidden="true" className={`${L.cabecera} items-end gap-x-3`}>
            <span className={CONCEPTOS.titulo}>Descripción</span>
            <span className={`${CONCEPTOS.titulo} text-right`}>Cantidad</span>
            <span className={`${CONCEPTOS.titulo} text-right`}>Precio (sin IVA)</span>
            <span className={CONCEPTOS.titulo}>IVA</span>
            <span className={`${CONCEPTOS.titulo} text-right`}>Base</span>
            <span />
          </div>
          {lineas.map((l, i) => {
            const c = `lineas.${i}`;
            return (
              <div key={l.clave} className={`${CONCEPTOS.fila} ${L.linea}`}>
                <div className={CONCEPTOS.descripcion}>
                  <label htmlFor={`fg-desc-${l.clave}`} className={CONCEPTOS.etiqueta}>
                    Descripción
                  </label>
                  <input
                    id={`fg-desc-${l.clave}`}
                    value={l.descripcion}
                    onChange={(e) => cambiarLinea(l.clave, { descripcion: e.target.value })}
                    {...marcaCon(marcaLeida(`${c}.descripcion`, l.descripcion, l.clave), `${c}.descripcion`)}
                    className={campoBase}
                  />
                </div>
                <div>
                  <label htmlFor={`fg-cant-${l.clave}`} className={CONCEPTOS.etiqueta}>
                    Cantidad
                  </label>
                  <input
                    id={`fg-cant-${l.clave}`}
                    inputMode="decimal"
                    value={l.cantidad}
                    onChange={(e) => cambiarLinea(l.clave, { cantidad: e.target.value })}
                    {...marca(`${c}.cantidad`)}
                    className={`${campoBase} text-right`}
                  />
                </div>
                <div>
                  <label htmlFor={`fg-precio-${l.clave}`} className={CONCEPTOS.etiqueta}>
                    Precio (sin IVA)
                  </label>
                  <input
                    id={`fg-precio-${l.clave}`}
                    inputMode="decimal"
                    value={l.precio}
                    placeholder="0,00"
                    onChange={(e) => cambiarLinea(l.clave, { precio: e.target.value })}
                    {...marcaCon(marcaLeida(`${c}.precioUnitario`, l.precio, l.clave), `${c}.precioUnitario`)}
                    className={`${campoBase} text-right`}
                  />
                </div>
                <div>
                  <label htmlFor={`fg-iva-${l.clave}`} className={CONCEPTOS.etiqueta}>
                    IVA
                  </label>
                  <select
                    id={`fg-iva-${l.clave}`}
                    value={l.tipoIva}
                    disabled={extranjero}
                    onChange={(e) => cambiarLinea(l.clave, { tipoIva: Number(e.target.value) })}
                    {...marcaCon(marcaLeida(`${c}.tipoIva`, l.tipoIva, l.clave), `${c}.tipoIva`)}
                    className={campoBase}
                  >
                    {TIPOS_IVA_GASTO.map((t) => (
                      <option key={t} value={t}>
                        {textoTipoIva(t, extranjero)}
                      </option>
                    ))}
                  </select>
                </div>
                {conRetencion && (
                  <div className={L.irpf}>
                    <label htmlFor={`fg-irpf-${l.clave}`} className={CONCEPTOS.etiqueta}>
                      IRPF
                    </label>
                    <select
                      id={`fg-irpf-${l.clave}`}
                      value={l.tipoRetencion}
                      onChange={(e) => cambiarLinea(l.clave, { tipoRetencion: Number(e.target.value) })}
                      {...marcaCon(marcaLeida(`${c}.tipoRetencion`, l.tipoRetencion, l.clave), `${c}.tipoRetencion`)}
                      className={campoBase}
                    >
                      {retenciones.map((t) => (
                        <option key={t} value={t}>
                          {t} %
                        </option>
                      ))}
                      {!retenciones.includes(l.tipoRetencion) && (
                        <option value={l.tipoRetencion}>{String(l.tipoRetencion).replace('.', ',')} % (la de la factura; no se puede registrar)</option>
                      )}
                    </select>
                  </div>
                )}
                <div className={CONCEPTOS.pie}>
                  <span className={CONCEPTOS.base}>
                    <span className={CONCEPTOS.palabraBase}>Base </span>
                    {fmt(Number.isFinite(valores[i].cantidad) && Number.isFinite(valores[i].precioUnitario) ? calcularTotales([valores[i]]).base : 0)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setLineas((ls) => (ls.length > 1 ? ls.filter((x) => x.clave !== l.clave) : ls))}
                    disabled={lineas.length === 1}
                    className={CONCEPTOS.papelera}
                    aria-label={`Quitar la línea ${i + 1}`}
                    title="Quitar la línea"
                  >
                    <Trash size={18} />
                  </button>
                </div>
                <div className="col-span-full">
                  <CuentaLinea
                    tipo="gasto"
                    catalogo={catalogo}
                    valor={l.cuenta}
                    onCambiar={(codigo) => cambiarLinea(l.clave, { cuenta: codigo ?? undefined })}
                    porDefecto={cuentaPorDefecto(l)}
                    linea={i + 1}
                    id={`fg-lcuenta-${l.clave}`}
                    puedeCrear={puedeCrearCuenta}
                    invalido={inv(`${c}.cuenta`)}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setLineas((ls) => [...ls, lineaVacia(extranjero ? 0 : ls[ls.length - 1]?.tipoIva ?? 21)])}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-600 hover:text-accent-700"
        >
          <Plus size={16} /> Añadir línea
        </button>

        {/* Totales */}
        <dl className="mt-5 ml-auto flex w-full max-w-sm flex-col gap-1 border-t border-slate-200 pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-600">Base imponible</dt>
            <dd className="font-mono text-slate-900">{fmt(totales.base)}</dd>
          </div>
          {totales.ivaPorTipo.map((t) => (
            <div key={t.tipo} className="flex justify-between">
              {/* La parte al 0 % es exenta (o, con un proveedor o una empresa de fuera, va sin IVA español). */}
              <dt className="text-slate-600">{t.tipo !== 0 ? `IVA ${t.tipo} %` : extranjero ? 'Sin IVA español' : 'Exento'}</dt>
              <dd className="font-mono text-slate-900">{fmt(t.cuota)}</dd>
            </div>
          ))}
          {totales.retencion !== 0 && (
            <div className="flex justify-between">
              <dt className="text-slate-600">Retención IRPF</dt>
              <dd className="font-mono text-slate-900">{fmt(-totales.retencion)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
            <dt className="text-slate-900">{sustitucion ? 'Total de la corregida' : rect && sinSentido ? 'Total leído' : rect && (totales.total < 0 || (totales.total === 0 && signo < 0)) ? 'Total del abono' : 'Total a pagar'}</dt>
            <dd className={`font-mono ${rect && totales.total < 0 ? 'text-rose-700' : 'text-slate-900'}`}>{fmt(totales.total)}</dd>
          </div>
          {rect && !sustitucion && totales.total < 0 && <p className="text-xs text-slate-500">En negativo: resta de lo que le debes al proveedor y del IVA soportado.</p>}
        </dl>

        {/* Sustitucion: lo que se registra es la diferencia con la original. */}
        {sustitucion && (
          <div className="mt-4 ml-auto w-full max-w-sm rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm">
            <p className="mb-2 font-semibold text-slate-900">Diferencia que se registra</p>
            {diferencia ? (
              <dl className="flex flex-col gap-1">
                {(
                  [
                    ['Base imponible', diferencia.base],
                    ['IVA', diferencia.iva],
                    ...(diferencia.retencion ? ([['Retención IRPF', -diferencia.retencion]] as Array<[string, number]>) : []),
                  ] as Array<[string, number]>
                ).map(([t, v]) => (
                  <div key={t} className="flex justify-between">
                    <dt className="text-slate-600">{t}</dt>
                    <dd className={`font-mono ${v < 0 ? 'text-rose-700' : 'text-slate-900'}`}>{fmt(v)}</dd>
                  </div>
                ))}
                <div className="flex justify-between border-t border-violet-200 pt-1 font-semibold">
                  <dt className="text-slate-900">Total</dt>
                  <dd className={`font-mono ${diferencia.total < 0 ? 'text-rose-700' : 'text-slate-900'}`}>{fmt(diferencia.total)}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-slate-600">Se calcula cuando estén las líneas de la factura original.</p>
            )}
            <p className="mt-2 text-xs text-slate-500">El IVA de la diferencia se calcula por tipo con los totales de las dos facturas.</p>
          </div>
        )}

        {modo === 'lector' && (
          <div className="mt-4 max-w-sm ml-auto">
            <label htmlFor="fg-totaldoc" className={etiqueta}>
              Total que pone la factura
            </label>
            <input
              id="fg-totaldoc"
              inputMode="decimal"
              value={totalDocumento}
              onChange={(e) => setTotalDocumento(e.target.value)}
              aria-invalid={inv('totalDocumento') || totalNoCuadra}
              aria-describedby={inv('totalDocumento') && error ? 'fg-error' : marcaTotal ? 'fg-marcas-lector' : undefined}
              data-lector={inv('totalDocumento') || totalNoCuadra ? undefined : marcaTotal}
              className={`${campoBase} text-right`}
            />
            {totalNoCuadra ? (
              <p className="mt-1 text-xs text-amber-700">No coincide con el total calculado ({fmt(totales.total)}): revisa las bases, el IVA y la retención, o corrige este total.</p>
            ) : (
              <p className={ayuda}>Se compara con el total calculado para detectar errores de lectura. Déjalo vacío si no quieres comprobarlo.</p>
            )}
          </div>
        )}
      </section>

      {/* 4. Observaciones */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-6">
        <label htmlFor="fg-obs" className={etiqueta}>
          Observaciones
        </label>
        <textarea id="fg-obs" rows={2} maxLength={2000} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} {...marca('observaciones')} className={campoBase} />
      </section>

      {/* 5. Errores y boton */}
      {error && (
        <div id="fg-error" role="alert" tabIndex={-1} className="flex flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 focus:outline-none">
          <p className="flex items-start gap-2">
            <WarningCircle size={18} className="mt-0.5 shrink-0" />
            {/* El servidor ya lo explica («Esta factura ya está registrada: ...», «Ya existe un proveedor con ese NIF: ...»). */}
            <span>{error}</span>
          </p>
          {facturaRepetidaId && (
            <Link href={`/dashboard/compras/${facturaRepetidaId}`} className="font-semibold underline">
              Ver la factura
            </Link>
          )}
          {proveedorRepetidoId && (
            <button type="button" onClick={usarProveedorExistente} className="self-start font-semibold underline">
              Usar el existente
            </button>
          )}
          {conflicto?.rectificar303 && (
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                type="button"
                disabled={guardando}
                onClick={() => guardar(undefined, { confirmar303: true })}
                className="self-start rounded-lg bg-rose-600 px-3 py-2 font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
              >
                Registrar y avisarme de rectificar el 303
              </button>
              {/* Por el art. 80 cuenta la fecha en que llegó: si llegó más tarde, se pone esa (está plegada en «¿La recibiste más tarde?»). */}
              {conflicto.rectificar303.campo === 'fechaRegistro' && (
                <button
                  type="button"
                  onClick={() => {
                    setMostrarRegistro(true);
                    setConflicto(null);
                    setError('');
                    // El campo aparece al desplegarse: se enfoca en el siguiente pintado.
                    window.setTimeout(() => {
                      const el = document.getElementById('fg-registro');
                      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                      el?.focus({ preventScroll: true });
                    }, 0);
                  }}
                  className="self-start rounded-lg border border-rose-300 bg-white px-3 py-2 font-semibold text-rose-700 hover:bg-rose-50"
                >
                  Me llegó más tarde: poner la fecha de recepción
                </button>
              )}
              {conflicto.rectificar303.enlace && (
                <Link href={conflicto.rectificar303.enlace} className="self-start font-semibold underline">
                  Ver el 303{conflicto.rectificar303.periodo ? ` del ${textoPeriodoModelo(conflicto.rectificar303.ejercicio, conflicto.rectificar303.periodo)}` : ''}
                </Link>
              )}
            </div>
          )}
          {conflicto?.contabilizar && facturaId && (
            <Link href={`/dashboard/compras/${encodeURIComponent(facturaId)}`} className="self-start font-semibold underline">
              Volver a la factura para contabilizarla
            </Link>
          )}
          {conflicto?.cambiada && (
            // Recarga la pantalla con los datos de ahora (lo escrito aqui se pierde, y se avisa).
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Se vuelve a abrir la factura como está ahora y se pierde lo que has cambiado aquí. ¿Seguir?')) window.location.reload();
              }}
              className="self-start font-semibold underline"
            >
              Volver a abrirla
            </button>
          )}
        </div>
      )}

      {modo === 'editar' && asientoEnFirme && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Al guardar se rehace su asiento y su anotación en el libro de IVA.</p>
      )}
      {motivoBloqueo && (
        <p id="fg-motivo-bloqueo" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {motivoBloqueo}
        </p>
      )}

      <div className={PIE.pie}>
        {nota && <p className={PIE.nota}>{nota}</p>}
        <div className={PIE.botones}>
          {onCancelar && (
            <button
              type="button"
              onClick={onCancelar}
              className={`${PIE.boton} rounded-lg border border-slate-300 px-4 py-2.5 font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600`}
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            disabled={guardando || !!motivoBloqueo}
            aria-describedby={motivoBloqueo ? 'fg-motivo-bloqueo' : undefined}
            className={`${PIE.boton} rounded-lg bg-accent-600 px-5 py-2.5 font-semibold text-white transition-all hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-black active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60`}
          >
            {guardando ? 'Guardando...' : textoBoton}
          </button>
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Proveedor: buscador de los activos o alta de uno nuevo
// ---------------------------------------------------------------------------

function SelectorProveedor({
  valor,
  textoNuevo,
  sinBuscarOtro,
  onCambio,
  marca,
  marcaLector,
  marcaCon,
}: {
  valor: ProveedorElegido | null;
  /** Texto sobre el proveedor nuevo (el lector: «No está dado de alta: se creará al registrar la factura.»). */
  textoNuevo?: string;
  /** Sin el enlace «Buscar uno existente» en la ficha nueva (el lector ya lo ofrece en su aviso: «Es uno que ya tengo»). */
  sinBuscarOtro?: boolean;
  onCambio: (p: ProveedorElegido | null) => void;
  marca: (...campos: string[]) => PropsMarca;
  /** Marca del lector en un dato del proveedor, si sigue con el valor leido. */
  marcaLector: (campo: string, actual: unknown) => NivelMarca | undefined;
  marcaCon: (nivel: NivelMarca | undefined, ...campos: string[]) => PropsMarca;
}) {
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<ProveedorBuscado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState('');
  const peticion = useRef(0);

  useEffect(() => {
    if (valor) return;
    const n = ++peticion.current;
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await apiFetch<ProveedorBuscado[]>(companyPath(`/proveedores/buscar?activos=true&limit=8&q=${encodeURIComponent(q.trim())}`));
        if (n === peticion.current) {
          setResultados(Array.isArray(r) ? r : []);
          setErrorBusqueda('');
        }
      } catch (err) {
        if (n === peticion.current) setErrorBusqueda(errorMessage(err));
      } finally {
        if (n === peticion.current) setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, valor]);

  if (valor?.tipo === 'existente') {
    // El proveedor que encontro el lector por su NIF: si el NIF o el nombre leidos estan marcados, la ficha tambien.
    const nivel = marcaLector('proveedor', valor);
    return (
      <div
        data-lector={nivel}
        aria-describedby={nivel ? 'fg-marcas-lector' : undefined}
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 data-[lector=error]:border-red-500 data-[lector=error]:bg-red-50 data-[lector=revisar]:border-amber-500 data-[lector=revisar]:bg-amber-50"
      >
        <div className="min-w-0">
          <p className="font-medium text-slate-900 break-words">{valor.nombre}</p>
          <p className="font-mono text-sm text-slate-500">
            {valor.nif}
            {!esEspana(valor.pais) && <span className="ml-2 font-sans">· {PAISES.find(([c]) => c === valor.pais)?.[1] ?? valor.pais}</span>}
          </p>
        </div>
        <button type="button" onClick={() => onCambio(null)} className="text-sm font-semibold text-blue-600 hover:underline">
          Cambiar
        </button>
      </div>
    );
  }

  if (valor?.tipo === 'nuevo') {
    const set = (campo: keyof Omit<Extract<ProveedorElegido, { tipo: 'nuevo' }>, 'tipo'>) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const v = e.target.value;
      const sig = { ...valor, [campo]: v };
      // NIF-IVA de otro pais de la UE (FR..., DE...): el pais sale del prefijo.
      if (campo === 'nifCif' && esEspana(valor.pais) && pareceNifIvaUe(v)) {
        const p = paisDelPrefijo(v);
        if (p && p !== 'ES') sig.pais = p;
      }
      onCambio(sig);
    };
    const es = esEspana(valor.pais);
    const ue = !es && pareceNifIvaUe(valor.nifCif);
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className={`text-sm font-medium ${textoNuevo ? 'rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-blue-800' : 'text-slate-700'}`}>
            {textoNuevo ?? 'Proveedor nuevo: se dará de alta al guardar la factura.'}
          </p>
          {!sinBuscarOtro && (
            <button type="button" onClick={() => onCambio(null)} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline">
              <X size={14} /> Buscar uno existente
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label htmlFor="fg-pnombre" className={etiqueta}>
              Nombre fiscal *
            </label>
            <input
              id="fg-pnombre"
              value={valor.nombreFiscal}
              onChange={set('nombreFiscal')}
              {...marcaCon(marcaLector('proveedor.nombreFiscal', valor.nombreFiscal), 'proveedor.nombreFiscal')}
              className={campoBase}
            />
          </div>
          <div>
            <label htmlFor="fg-ppais" className={etiqueta}>
              País
            </label>
            <select id="fg-ppais" value={valor.pais} onChange={set('pais')} {...marca('proveedor.pais')} className={campoBase}>
              {PAISES.map(([c, n]) => (
                <option key={c} value={c}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="fg-pnif" className={etiqueta}>
              {es ? 'NIF/CIF *' : ue ? 'NIF-IVA (con el prefijo del país) *' : 'Identificación fiscal (Tax ID) *'}
            </label>
            <input
              id="fg-pnif"
              value={valor.nifCif}
              onChange={set('nifCif')}
              {...marcaCon(marcaLector('proveedor.nifCif', valor.nifCif), 'proveedor.nifCif', 'proveedor.nuevo')}
              className={`${campoBase} font-mono`}
              autoComplete="off"
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="fg-pdir" className={etiqueta}>
              Dirección
            </label>
            <input id="fg-pdir" value={valor.direccion} onChange={set('direccion')} {...marca('proveedor.direccion')} className={campoBase} />
          </div>
          <div>
            <label htmlFor="fg-pcp" className={etiqueta}>
              Código postal
            </label>
            <input id="fg-pcp" inputMode={es ? 'numeric' : 'text'} value={valor.cp} onChange={set('cp')} {...marca('proveedor.cp')} className={campoBase} />
          </div>
          <div>
            <label htmlFor="fg-pmun" className={etiqueta}>
              Municipio
            </label>
            <input id="fg-pmun" value={valor.municipio} onChange={set('municipio')} {...marca('proveedor.municipio')} className={campoBase} />
          </div>
          <div>
            <label htmlFor="fg-pprov" className={etiqueta}>
              {es ? 'Provincia' : 'Región o estado'}
            </label>
            <input id="fg-pprov" value={valor.provincia} onChange={set('provincia')} {...marca('proveedor.provincia')} className={campoBase} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="fg-buscar" className={etiqueta}>
        Busca el proveedor *
      </label>
      <div className="relative">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          id="fg-buscar"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nombre o NIF"
          {...marca('proveedor')}
          className={`${campoBase} pl-9`}
          autoComplete="off"
        />
      </div>
      {errorBusqueda && <p className="text-sm text-rose-700">{errorBusqueda}</p>}
      <ul className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200">
        {buscando && resultados.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Buscando...</li>}
        {!buscando && resultados.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">{q.trim() ? 'No hay ningún proveedor activo con ese nombre o NIF.' : 'Aún no tienes proveedores dados de alta.'}</li>}
        {resultados.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onCambio({ tipo: 'existente', id: p.id, nombre: p.nombre, nif: p.nif, pais: p.pais || 'ES' })}
              className="flex w-full flex-wrap items-baseline justify-between gap-x-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span className="font-medium text-slate-900 break-words">{p.nombre}</span>
              <span className="font-mono text-xs text-slate-500">{p.nif}</span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => {
          const t = q.trim();
          const pareceNif = /\d/.test(t) && !/\s/.test(t);
          onCambio({
            tipo: 'nuevo',
            nombreFiscal: pareceNif ? '' : t,
            nifCif: pareceNif ? t : '',
            pais: pareceNif && pareceNifIvaUe(t) ? (paisDelPrefijo(t) ?? 'ES') : 'ES',
            direccion: '',
            cp: '',
            municipio: '',
            provincia: '',
          });
        }}
        className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-accent-600 hover:text-accent-700"
      >
        <Plus size={16} /> Crear proveedor nuevo
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Del campo de un error (details.campo) al control de la pantalla
// ---------------------------------------------------------------------------

/** Zod devuelve proveedor.nuevo.nifCif; la pantalla usa proveedor.nifCif. */
function normalizarCampo(campo: string | undefined): string | undefined {
  return campo?.replace(/^proveedor\.nuevo\./, 'proveedor.');
}

const ID_CAMPO: Record<string, string> = {
  proveedor: 'fg-buscar',
  'proveedor.nombreFiscal': 'fg-pnombre',
  'proveedor.nifCif': 'fg-pnif',
  'proveedor.nuevo': 'fg-pnif',
  'proveedor.pais': 'fg-ppais',
  'proveedor.direccion': 'fg-pdir',
  'proveedor.cp': 'fg-pcp',
  'proveedor.municipio': 'fg-pmun',
  'proveedor.provincia': 'fg-pprov',
  numeroFacturaProveedor: 'fg-numero',
  fechaEmision: 'fg-fecha',
  fechaVencimiento: 'fg-venc',
  fechaRegistro: 'fg-registro',
  tipoGasto: 'fg-tipo',
  cuentaGasto: 'fg-cuenta',
  observaciones: 'fg-obs',
  totalDocumento: 'fg-totaldoc',
};

const ID_LINEA: Record<string, string> = {
  descripcion: 'fg-desc',
  cantidad: 'fg-cant',
  precioUnitario: 'fg-precio',
  descuentoPorcentaje: 'fg-precio',
  tipoIva: 'fg-iva',
  tipoRetencion: 'fg-irpf',
};

/** Bloque «Rectificación»: del campo del error al control (las facturas que rectifica, por su clave). */
function idCampoRectificativa(campo: string, rect: EstadoRectificacion | null): string {
  const o = /^rectificativa\.originales\.(\d+)\.(\w+)/.exec(campo);
  if (o) {
    const original = rect?.originales[Number(o[1])];
    if (!original) return 'fr-que';
    if (o[2] === 'numero') return `fr-onum-${original.clave}`;
    if (o[2] === 'fecha') return `fr-ofecha-${original.clave}`;
    if (o[2] === 'base') return `fr-obase-${original.clave}`;
    if (o[2] === 'cuota') return `fr-ocuota-${original.clave}`;
    return 'fr-que';
  }
  const l = /^rectificativa\.importesOriginales\.lineas\.(\d+)/.exec(campo);
  if (l) {
    const linea = rect?.lineasOriginal[Number(l[1])];
    return linea && !rect?.lineasOriginalDeApp ? `fr-lprecio-${linea.clave}` : 'fr-lorig';
  }
  if (campo.startsWith('rectificativa.tipo')) return 'fr-tipo-I';
  if (campo.startsWith('rectificativa.causa')) return 'fr-causa';
  if (campo.startsWith('rectificativa.motivo')) return 'fr-motivo';
  if (campo.startsWith('rectificativa.sentido')) return 'fr-sentido';
  if (campo === 'rectificativa.periodo.hasta') return 'fr-hasta';
  if (campo.startsWith('rectificativa.periodo')) return rect?.que === 'periodo' ? 'fr-desde' : 'fr-que';
  if (campo.startsWith('rectificativa.originales')) return 'fr-que';
  if (campo.startsWith('rectificativa.yaPagada')) return 'fr-yapagada';
  if (campo.startsWith('rectificativa.importesOriginales')) return 'fr-lorig';
  return 'fr-bloque';
}

/** Id del control que corresponde a un campo de error (lineas.N.x usa la clave de la linea N). */
function idDelCampo(campo: string | undefined, lineas: Array<{ clave: number }>, rect: EstadoRectificacion | null = null): string | undefined {
  if (!campo) return undefined;
  if (ID_CAMPO[campo]) return ID_CAMPO[campo];
  if (campo === 'rectificativa' || campo.startsWith('rectificativa.')) {
    // Por sustitucion, las lineas de la corregida son las del formulario.
    if (campo.startsWith('rectificativa.corregida')) return lineas[0] ? `fg-precio-${lineas[0].clave}` : undefined;
    return idCampoRectificativa(campo, rect);
  }
  if (campo === 'lineas') return lineas[0] ? `fg-precio-${lineas[0].clave}` : undefined;
  const m = /^lineas\.(\d+)\.(\w+)/.exec(campo);
  if (m) {
    const linea = lineas[Number(m[1])];
    if (m[2] === 'cuenta') return linea ? `fg-lcuenta-${linea.clave}` : 'fg-cuenta';
    return linea ? `${ID_LINEA[m[2]] ?? 'fg-desc'}-${linea.clave}` : undefined;
  }
  // Otro dato del proveedor nuevo: al menos se lleva la vista a su bloque.
  if (campo.startsWith('proveedor.')) return 'fg-pnombre';
  return undefined;
}
