'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, FileArrowUp, PencilSimple, Warning, WarningCircle } from '@phosphor-icons/react';
import { ApiError, apiFetch, campoDelError, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import PanelLectura from '@/components/lector/PanelLectura';
import CorreccionVenta from '@/components/lector/CorreccionVenta';
import { CuentaLinea } from '@/components/contabilidad/CuentaLinea';
import { useCuentasLinea } from '@/lib/subcuentas';
import RectificativaVentaLector, { ID_ERROR_LECTOR, useRectificativaLector } from '@/components/lector/RectificativaVentaLector';
import {
  ALTA_MANUAL,
  anuncioLecturaTerminada,
  cambiarOrigenLectura,
  claveTexto,
  descartarLectura,
  ErrorLectura,
  esCancelada,
  esMuyIncompleta,
  euros,
  fechaLegible,
  leerFactura,
  porcentaje,
  rellenarAMano,
  type EleccionOrigen,
  type IngresoExtraido,
  type InfoLectura,
} from '@/lib/lecturas';
import {
  cambios,
  comprobarCorreccion,
  copiaDe,
  cuerpoCorrecciones,
  errorCorregible,
  erroresPendientes,
  estadoInicial,
  estadoVacio,
  infoConValidaciones,
  ingresoEfectivo,
  marcasDeLaLectura,
  validacionesDe,
  validacionesVigentes,
  valoresCorregidos,
  type ErrorCorreccion,
  type EstadoCorreccion,
  type ValidacionServidor,
} from '@/lib/correccionVenta';
import SoltarFactura from '@/components/lector/SoltarFactura';
import AvisoTerceroNuevo, { camposDudosos, quienEs, type TerceroEnlazado } from '@/components/lector/AvisoTerceroNuevo';
import OrigenTercero, {
  eleccionRecordada,
  ORIGEN_POR_DEFECTO,
  origenPorDefecto,
  OrigenTerceroDeLaFicha,
  OrigenTerceroLeido,
  recordarEleccion,
} from '@/components/lector/OrigenTercero';
import { paisDelPrefijo } from '@/lib/compras';
import { conDevengoFuera, esPaisEmpresaEspanola, nombreNumeroFiscal, nombrePais, pareceNifIvaUe, usePaisEmpresa } from '@/lib/fiscal';

/**
 * Lector de facturas de venta: se sube el PDF o la foto de una factura
 * emitida, el servidor la lee (Azure y, si hace falta, Claude) y valida cada
 * dato. El usuario lo revisa y, al confirmar, el servidor registra la factura
 * con los datos que leyo mas lo que se haya corregido a mano.
 *
 * «Corregir los datos» (CorreccionVenta, lib/correccionVenta): numero, fechas,
 * concepto, lineas, retencion y total, con el cuadre al momento. Se manda solo
 * lo cambiado (`correcciones`) y el servidor lo vuelve a validar como una
 * lectura. Si la lectura falla, tarda demasiado o sale muy incompleta,
 * «Rellenarla a mano» abre el mismo formulario vacio con el archivo ya subido.
 * Sigue siendo una venta leida: su numero, sin VERI*FACTU y nunca en la serie
 * A o B.
 *
 * Una rectificativa o un abono (o importes en negativo) se registra como
 * rectificativa: ver RectificativaVentaLector.
 */

const MAX_BYTES = 4 * 1024 * 1024;
const TIPOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

interface Registrada {
  facturaId: string;
  numeroCompleto: string;
  total: number;
  /** Lo que ha pasado con su asiento (el servidor la contabiliza al registrarla). */
  contabilizada?: boolean;
  asientoId?: string;
  asientoEnBorrador?: boolean;
  motivoSinAsiento?: string | null;
  /** Rectificativa o abono: se registró como rectificativa. */
  esRectificativa?: boolean;
  /** Avisos que no impiden registrarla (plazos, modelo 952, serie...). */
  avisos?: string[];
  /** Se registró con los datos corregidos a mano (un servidor anterior no lo dice). */
  corregida?: boolean;
  /** Se registró rellenada a mano, sin nada leído. */
  aMano?: boolean;
  /** Se mandaron correcciones y el servidor no dice que las aplicara (no tiene esta versión): se registró lo leído. */
  sinCorregir?: boolean;
}

/**
 * «Corregir los datos» abierto: lo leído (con lo que se compara qué ha
 * cambiado) y lo que hay ahora. Va ligado al documento: cambiar de dónde es el
 * cliente no lo borra.
 */
interface Correccion {
  doc: string;
  leido: EstadoCorreccion;
  estado: EstadoCorreccion;
}

function Dato({ etiqueta, children, mono, ancho }: { etiqueta: string; children: React.ReactNode; mono?: boolean; ancho?: boolean }) {
  return (
    <div className={`min-w-0 ${ancho ? 'sm:col-span-2' : ''}`}>
      <dt className="text-xs font-medium text-slate-500">{etiqueta}</dt>
      <dd className={`mt-0.5 break-words font-semibold text-slate-900 ${mono ? 'font-mono text-sm' : ''}`}>{children}</dd>
    </div>
  );
}

/** Cuenta de ingresos de una linea sin cuenta propia: la que pone el servidor (700). */
const POR_DEFECTO = { codigo: '700', texto: 'la de ventas' };

/**
 * Sin NIF de un cliente de España (el servidor lo deja de exigir si se elige
 * un cliente dado de alta). Con un cliente de otro pais de la UE o de fuera,
 * que falte su numero fiscal no es un error: el servidor lo deja en
 * «revisar», con su explicacion en el panel. Si se dijo «De España», el texto
 * sigue con como cambiarlo: se reconoce por el principio.
 */
const FALTA_NIF_CLIENTE = 'Falta el NIF del cliente: es obligatorio en una factura de ingreso.';

/**
 * Errores de la lectura que dependen del NIF leido del cliente (que falte o
 * este mal). No impiden registrar desde el lector: la factura se registra con
 * el cliente dado de alta o elegido (y el servidor deja de exigirlos).
 */
function erroresDelNifCliente(info: InfoLectura | null): (error: string) => boolean {
  const c = info?.campos['receptor.nif'];
  const delCampo = new Set((c && (!c.codigos || c.codigos.includes('NIF_RECEPTOR')) ? c.motivos : []).map(claveTexto));
  const falta = claveTexto(FALTA_NIF_CLIENTE);
  return (e) => {
    const k = claveTexto(e);
    return delCampo.has(k) || k.startsWith(falta);
  };
}

/**
 * Con un cliente dado de alta o elegido, el NIF leido del cliente ya no impide
 * registrarla: en el panel pasa de «impide registrarla» a «comprobar», con el
 * cliente con que se registra. Sigue pidiendo la casilla de revision.
 */
function conClienteElegido(info: InfoLectura, c: TerceroEnlazado): InfoLectura {
  const campo = info.campos['receptor.nif'];
  if (!campo || campo.estado !== 'error') return info;
  const campos = {
    ...info.campos,
    'receptor.nif': { ...campo, estado: 'revisar' as const, motivos: [...campo.motivos, `Se registra con el cliente elegido: ${quienEs(c.nombre, c.nif)}.`] },
  };
  const otroError = Object.values(campos).some((x) => x?.estado === 'error') || (info.generales ?? []).some((g) => g.nivel === 'error');
  return { ...info, campos, estado: otroError ? 'error' : 'revisar' };
}

/**
 * La rectificativa va al cliente de la factura que rectifica: el NIF leído ya
 * no decide nada y de dónde es el cliente lo dice su ficha. Los textos que
 * mandan a «¿De dónde es el cliente?» se quitan, porque aquí no se pregunta.
 */
function conClienteDeLaOriginal(info: InfoLectura, c: TerceroEnlazado): InfoLectura {
  const campo = info.campos['receptor.nif'];
  if (!campo || campo.estado === 'ok') return info;
  const motivos = campo.motivos.filter((m) => !m.includes('«¿De dónde es el cliente?»'));
  const campos = {
    ...info.campos,
    'receptor.nif': { ...campo, estado: 'revisar' as const, motivos: [...motivos, `Se registra con el cliente de la factura que rectifica: ${quienEs(c.nombre, c.nif)}.`] },
  };
  const otroError = Object.values(campos).some((x) => x?.estado === 'error') || (info.generales ?? []).some((g) => g.nivel === 'error');
  return { ...info, campos, estado: otroError ? 'error' : 'revisar' };
}

/** NIF sin espacios, puntos ni guiones, para comparar. */
const nifComparable = (n: string) => n.replace(/[\s.\-]/g, '').toUpperCase();

const importe = (n: number | null) => (n === null || n === undefined || !Number.isFinite(Number(n)) ? 'sin leer' : euros(Number(n)));

export default function LectorIngresosPage() {
  const puedeEscribir = tieneAlgunPermiso(getUser(), ['ventas:write']);
  const inputRef = useRef<HTMLInputElement>(null);

  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [error, setError] = useState('');
  const [alternativa, setAlternativa] = useState<{ ruta: string; texto: string } | null>(null);
  const [ingreso, setIngreso] = useState<IngresoExtraido | null>(null);
  const [info, setInfo] = useState<InfoLectura | null>(null);
  const [revisado, setRevisado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState('');
  const [registrada, setRegistrada] = useState<Registrada | null>(null);
  // «Cambiar cuenta»: la cuenta elegida para cada linea (null = la de por defecto) y la que rechazo el servidor.
  const [cuentas, setCuentas] = useState<Array<string | null>>([]);
  const [cuentaMal, setCuentaMal] = useState<number | null>(null);
  // «Corregir los datos» (o «Rellenarla a mano»): null mientras no se abre.
  const [corrGuardada, setCorr] = useState<Correccion | null>(null);
  const corr = corrGuardada && ingreso && corrGuardada.doc === ingreso.documentId ? corrGuardada : null;
  // El error de un dato corregido (de la comprobación o del servidor) y lo que dijo el servidor al registrarla.
  const [errorCorr, setErrorCorr] = useState<ErrorCorreccion | null>(null);
  const [intentoCorr, setIntentoCorr] = useState(0);
  const [validacionesServidor, setValidacionesServidor] = useState<{ lista: ValidacionServidor[]; enviado: EstadoCorreccion | null }>({ lista: [], enviado: null });
  // «Rellenarla a mano»: la lectura fallida o lenta que se puede terminar a mano, y si se está pasando.
  const [aManoId, setAManoId] = useState<string | null>(null);
  const [pasandoAMano, setPasandoAMano] = useState(false);
  const [errorAMano, setErrorAMano] = useState('');
  // La venta tal como se registrará (con lo corregido): la rectificativa y los totales siguen a lo corregido.
  const ingresoEf = ingreso ? ingresoEfectivo(ingreso, corr?.leido ?? null, corr?.estado ?? null) : null;
  // Rectificativa o abono leido: factura que rectifica, motivo, signo y forma (se reinicia con cada lectura).
  const rv = useRectificativaLector(ingresoEf);
  const catalogo = useCuentasLinea('venta', !!ingreso, { rectificativa: rv.activa });
  const puedeCrearCuenta = tieneAlgunPermiso(getUser(), ['ventas:write', 'contabilidad:write']);
  // Cliente dado de alta o elegido en esta lectura (sin el no se registra; el aviso pasa a verde).
  const [clienteResuelto, setClienteResuelto] = useState<TerceroEnlazado | null>(null);
  const puedeAltaCliente = tieneAlgunPermiso(getUser(), ['ventas:write']);
  // «¿De dónde es el cliente?»: antes de subir la factura (se recuerda la última) y, después, en el panel.
  const [origen, setOrigen] = useState<EleccionOrigen>(ORIGEN_POR_DEFECTO);
  const [cambiandoOrigen, setCambiandoOrigen] = useState(false);
  const [errorOrigen, setErrorOrigen] = useState('');
  const lecturaIdRef = useRef<string | null>(null);
  const cortarRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!archivo) {
      setVista(null);
      return;
    }
    const url = URL.createObjectURL(archivo);
    setVista(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);

  useEffect(() => {
    if (!leyendo) return;
    setSegundos(0);
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [leyendo]);

  useEffect(() => () => cortarRef.current?.abort(), []);

  // La última elección de este lector y esta empresa (en el navegador). Sin ella, De España; en una
  // empresa de fuera (EE. UU., Hong Kong), De fuera de la UE. Lo que ya se haya elegido aquí no se pisa.
  const paisEmpresa = usePaisEmpresa();
  // Una empresa de fuera de España vende sin IVA español (mientras carga, como española: lo corrige el servidor).
  const espanola = paisEmpresa === null || esPaisEmpresaEspanola(paisEmpresa);
  const origenElegidoRef = useRef(false);
  useEffect(() => {
    if (!origenElegidoRef.current) setOrigen(eleccionRecordada('ventas', origenPorDefecto(paisEmpresa)));
  }, [paisEmpresa]);

  const elegirOrigen = (e: EleccionOrigen) => {
    origenElegidoRef.current = true;
    setOrigen(e);
    recordarEleccion('ventas', e);
  };

  /** Cambiada después de leer: el servidor vuelve a comprobar lo leído (sin leer otra vez la factura). */
  const cambiarOrigen = async (e: EleccionOrigen) => {
    if (!info || cambiandoOrigen) return;
    setCambiandoOrigen(true);
    setErrorOrigen('');
    setErrorGuardar('');
    try {
      const r = await cambiarOrigenLectura('ventas', info.lecturaId, e);
      setIngreso(r.ingreso);
      setInfo(r.lectura);
      // Lo marcado puede ser otra cosa: hay que volver a revisarlo.
      setRevisado(false);
      elegirOrigen(e);
    } catch (err) {
      setErrorOrigen(errorMessage(err));
    } finally {
      setCambiandoOrigen(false);
    }
  };

  const abrirSelector = () => {
    if (!leyendo) inputRef.current?.click();
  };

  const soltarLectura = () => {
    cortarRef.current?.abort();
    cortarRef.current = null;
    const id = lecturaIdRef.current;
    lecturaIdRef.current = null;
    if (id) void descartarLectura('ventas', id);
  };

  const reiniciar = () => {
    if (!registrada) soltarLectura();
    lecturaIdRef.current = null;
    setArchivo(null);
    setIngreso(null);
    setInfo(null);
    setRevisado(false);
    setRegistrada(null);
    setClienteResuelto(null);
    setErrorOrigen('');
    setCuentas([]);
    setCuentaMal(null);
    limpiarCorreccion();
    setError('');
    setErrorGuardar('');
    setAlternativa(null);
    setLeyendo(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  /** Sin «Corregir los datos» ni nada de lo que dijo el servidor sobre lo corregido. */
  const limpiarCorreccion = () => {
    setCorr(null);
    setErrorCorr(null);
    setValidacionesServidor({ lista: [], enviado: null });
    setAManoId(null);
    setErrorAMano('');
  };

  /**
   * Una lectura lista: lo leído y, si se rellena a mano o ha salido muy
   * incompleta, «Corregir los datos» ya abierto (vacío o con lo leído).
   */
  const ponerLectura = (ing: IngresoExtraido, inf: InfoLectura) => {
    setIngreso(ing);
    setInfo(inf);
    setCuentas((ing.lineas ?? []).map(() => null));
    setCuentaMal(null);
    setErrorCorr(null);
    setValidacionesServidor({ lista: [], enviado: null });
    if (inf.origen === 'MANUAL') {
      const vacio = estadoVacio(espanola);
      setCorr({ doc: ing.documentId, leido: vacio, estado: { ...vacio, lineas: vacio.lineas.map((l) => ({ ...l })) } });
    } else if (esMuyIncompleta(inf)) {
      const leido = estadoInicial(ing, inf);
      setCorr({ doc: ing.documentId, leido, estado: copiaDe(leido) });
    } else setCorr(null);
  };

  /** «Corregir los datos»: el formulario con lo leído (y las cuentas ya elegidas). */
  const abrirCorreccion = (foco = true) => {
    if (!ingreso || !info) return null;
    const leido = estadoInicial(ingreso, info);
    const c: Correccion = { doc: ingreso.documentId, leido, estado: estadoInicial(ingreso, info, cuentas) };
    setCorr(c);
    setErrorGuardar('');
    if (foco) requestAnimationFrame(() => document.getElementById('cv-numero')?.focus());
    return c;
  };

  /** «Volver a lo leído»: lo que se leyó, con las cuentas de por defecto. */
  const volverALoLeido = () => {
    if (!corr) return;
    setCorr({ ...corr, estado: copiaDe(corr.leido) });
    setCuentas((cs) => cs.map(() => null));
    setErrorCorr(null);
    setValidacionesServidor({ lista: [], enviado: null });
    setErrorGuardar('');
  };

  /**
   * «Rellenarla a mano»: la lectura fallida, lenta o muy incompleta pasa a vacía
   * con el archivo ya subido, y se abre el formulario sin nada leído.
   */
  const pasarAMano = async (lecturaId: string) => {
    if (pasandoAMano) return;
    setPasandoAMano(true);
    setErrorAMano('');
    setErrorGuardar('');
    try {
      const r = await rellenarAMano('ventas', lecturaId);
      lecturaIdRef.current = r.lecturaId;
      setError('');
      setAlternativa(null);
      setAManoId(null);
      setRevisado(false);
      setClienteResuelto(null);
      ponerLectura(r.ingreso, r.lectura);
    } catch (err) {
      setErrorAMano(errorMessage(err));
      // Sin archivo o ya cerrada: ya no se puede rellenar a mano (hay que volver a subirla).
      if (err instanceof ApiError && err.status < 500) setAManoId(null);
    } finally {
      setPasandoAMano(false);
    }
  };

  const leer = async (f: File) => {
    setError('');
    setErrorGuardar('');
    setAlternativa(null);
    setAManoId(null);
    setErrorAMano('');
    setRegistrada(null);
    if (!TIPOS.includes(f.type)) {
      setError('Solo se pueden leer PDF e imágenes (JPG, PNG o WEBP).');
      return;
    }
    if (f.size > MAX_BYTES) {
      setError('El archivo pesa más de 4 MB: redúcelo o haz la foto con menos resolución.');
      return;
    }
    soltarLectura();
    const cortar = new AbortController();
    cortarRef.current = cortar;
    setArchivo(f);
    setIngreso(null);
    setInfo(null);
    setRevisado(false);
    setClienteResuelto(null);
    limpiarCorreccion();
    setLeyendo(true);
    try {
      const r = await leerFactura('ventas', f, {
        origen,
        signal: cortar.signal,
        alEmpezar: (id) => {
          lecturaIdRef.current = id;
        },
      });
      if (cortar.signal.aborted) return;
      ponerLectura(r.ingreso, r.lectura);
    } catch (err) {
      if (esCancelada(err) || cortar.signal.aborted) return;
      setError(errorMessage(err));
      if (err instanceof ErrorLectura && err.alternativa) setAlternativa(err.alternativa);
      // Ha fallado (con el archivo guardado) o tarda demasiado: se puede terminar a mano.
      if (err instanceof ErrorLectura && err.aMano) setAManoId(err.aMano.lecturaId);
    } finally {
      if (cortarRef.current === cortar) {
        cortarRef.current = null;
        setLeyendo(false);
      }
    }
  };

  // El cliente con que se registra: el que encontro el lector por su NIF, o el dado de alta o elegido aqui.
  const existente = ingreso?.clienteExistente ?? null;
  const clienteLeido: TerceroEnlazado | null =
    clienteResuelto ?? (existente ? { id: existente.id, nombre: existente.nombreFiscal, nif: existente.nifCif, pais: existente.pais || 'ES', como: 'elegido' } : null);
  // Una rectificativa de una factura de la app se registra con el cliente de esa factura.
  const cliente = rv.clienteOriginal ?? clienteLeido;
  const faltaCliente = !!ingreso && !cliente;
  const nifLeido = (ingreso?.nifCliente ?? '').trim();
  // Direccion del cliente leida en la factura: va en «Datos leidos» y rellena la ficha del alta.
  const direccion = ingreso?.direccionCliente ?? null;
  const lineasDireccion = direccion
    ? [direccion.calle, [direccion.cp, direccion.municipio].filter(Boolean).join(' '), direccion.provincia, direccion.pais ? nombrePais(direccion.pais) : null]
        .map((l) => (l ?? '').trim())
        .filter(Boolean)
    : [];
  // De dónde es el cliente según el servidor (lo elegido o, si no, lo deducido de la factura).
  const tercero = info?.tercero;
  // Pais de la ficha: el que dice la factura si contradice lo elegido (con «De España» por defecto, un
  // cliente dominicano no se da de alta como español); si no, el elegido o deducido; si no, el leido en la
  // direccion o el del prefijo del NIF-IVA (FR..., PT...); si no, España, salvo que se haya dicho que es de
  // fuera (entonces la ficha lo pide).
  const paisCliente = (
    tercero?.contradiccion?.pais ||
    tercero?.pais ||
    direccion?.pais ||
    (pareceNifIvaUe(nifLeido) ? paisDelPrefijo(nifLeido) : null) ||
    (tercero?.origen && tercero.origen !== 'ES' ? '' : 'ES')
  ).toUpperCase();
  // Como se llama el numero fiscal del cliente: el de su ficha si ya lo tenemos; si no, el de su pais.
  const numeroFiscal = cliente ? nombreNumeroFiscal(cliente.pais) : (tercero?.numeroFiscal ?? 'NIF');

  const confirmar = async () => {
    if (!ingreso || !info) return;
    // Lo corregido a mano: lo que falta o no cuadra se dice junto a su campo, antes de enviarlo.
    if (corr) {
      const mal = comprobarCorreccion(corr.leido, corr.estado, { aMano: info.origen === 'MANUAL', negativos: !!ingreso.rectificativa });
      if (mal) {
        setErrorCorr(mal);
        setIntentoCorr((n) => n + 1);
        setErrorGuardar(mal.mensaje);
        return;
      }
    }
    // Rectificativa: lo que falta se dice junto a su campo, antes de enviarla.
    const falta = rv.comprobar();
    if (falta) {
      setErrorGuardar(falta.mensaje);
      rv.mostrarError(falta);
      return;
    }
    setGuardando(true);
    setErrorGuardar('');
    setErrorCorr(null);
    setCuentaMal(null);
    // Rectificativa de varias facturas: sin cuenta elegida, la que se enseña (la de la original con más base).
    const cuentaPorDefecto = (tipoIva: number) => rv.cuentaParaEnviar(tipoIva);
    // Solo lo cambiado; si cambian las líneas, la cuenta va dentro de cada una.
    const { correcciones, cuentas: cuentasCorr } = corr ? cuerpoCorrecciones(corr.leido, corr.estado, cuentaPorDefecto) : { correcciones: null, cuentas: null };
    const enviado = corr?.estado ?? null;
    try {
      // El id, la cuenta de cada linea y lo corregido: el servidor registra la factura con lo que leyo más las
      // correcciones, que vuelve a comprobar. Una rectificativa que sube el IVA de un periodo de la gestoría o de un
      // 303 ya presentado (409 DEVENGO_FUERA_APP) se registra si se confirma; el aviso vuelve en `avisos`.
      const r = await conDevengoFuera(
        (extra) =>
          apiFetch<Registrada>(companyPath('/ingresos-extractor/confirmar'), {
            method: 'POST',
            body: JSON.stringify({
              documentId: ingreso.documentId,
              ...(cliente ? { clienteId: cliente.id } : {}),
              revisado,
              ...(correcciones ? { correcciones } : {}),
              ...(correcciones?.lineas
                ? {}
                : { lineas: cuentasCorr ?? cuentas.map((cuenta, i) => ({ cuenta: cuenta ?? (ingreso.lineas?.[i] ? cuentaPorDefecto(ingreso.lineas[i].tipoIva) : null) })) }),
              ...rv.cuerpo(),
              ...extra,
            }),
          }),
        '¿La registras igualmente?',
      );
      // Un servidor sin esta versión no conoce `correcciones` y registra lo leído: se avisa (corregida no llega).
      if (r) setRegistrada({ ...r.r, ...(correcciones && r.r.corregida !== true ? { sinCorregir: true } : {}) });
      else setErrorGuardar('No se ha registrado. La lectura sigue aquí: puedes revisarla y volver a intentarlo.');
    } catch (err) {
      setErrorGuardar(errorMessage(err));
      const campoErr = campoDelError(err);
      // Lo que el servidor ve en lo corregido: cada validación en su dato y el error junto a su campo.
      const validaciones = validacionesDe(err instanceof ApiError ? err.detalles : undefined);
      if (validaciones.length) setValidacionesServidor({ lista: validaciones, enviado });
      if (campoErr && (campoErr === 'correcciones' || campoErr.startsWith('correcciones.') || campoErr === 'serie')) {
        // El número de una serie de la app (409) o un dato corregido: al formulario, abierto si no lo estaba.
        if (!corr) abrirCorreccion(false);
        setErrorCorr({ campo: campoErr === 'serie' ? 'correcciones.numero' : campoErr, mensaje: errorMessage(err) });
        setIntentoCorr((n) => n + 1);
      }
      const campoRect = campoErr;
      if (campoRect && rv.esCampoSuyo(campoRect)) rv.mostrarError({ campo: campoRect, mensaje: errorMessage(err) });
      // Una cuenta que el servidor no admite: se marca su linea y el foco va a su «Cambiar cuenta»
      // (con «Corregir los datos» abierto, la de su línea del formulario).
      const m = /^lineas\.(\d+)\.cuenta$/.exec(campoErr ?? '');
      if (m && corr) {
        setErrorCorr({ campo: m[0], mensaje: errorMessage(err) });
        setIntentoCorr((n) => n + 1);
      } else if (m) {
        const i = Number(m[1]);
        setCuentaMal(i);
        requestAnimationFrame(() => document.getElementById(`li-cuenta-${i}`)?.focus());
      }
    } finally {
      setGuardando(false);
    }
  };

  const alElegir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) leer(f);
  };

  const esImagen = archivo?.type.startsWith('image/');
  // Rellenada a mano: no hay nada leído (ni cliente, ni importes).
  const aMano = info?.origen === 'MANUAL';
  const camb = corr ? cambios(corr.leido, corr.estado) : null;
  // Los errores que ya explica el panel no se repiten.
  const yaExplicados = new Set(
    info ? [...Object.values(info.campos).flatMap((c) => (c ? c.motivos.map(claveTexto) : [])), ...(info.generales ?? []).map((g) => claveTexto(g.mensaje)), claveTexto(info.qr.texto)] : [],
  );
  // Que falte o este mal el NIF leido del cliente ya no bloquea: lo resuelve el cliente dado de alta o elegido.
  const esDelNif = erroresDelNifCliente(info);
  const erroresLeidos = ingreso ? ingreso.errores.filter((e) => !esDelNif(e) && !rv.noBloquea(e)) : [];
  // Con «Corregir los datos», un error de un dato ya corregido deja de bloquear (el servidor lo vuelve a comprobar).
  const errores = info ? erroresPendientes(erroresLeidos, info, camb) : erroresLeidos;
  // Los que se arreglan corrigiendo algún dato de aquí y los que no (emisor, moneda, tipo de documento...).
  const corregibles = info ? errores.filter((e) => errorCorregible(e, info)) : [];
  const noCorregibles = errores.filter((e) => !corregibles.includes(e));
  const erroresSueltos = noCorregibles.filter((e) => !yaExplicados.has(claveTexto(e)));
  const bloqueada = errores.length > 0;
  // Lo que dijo el servidor de lo corregido y sigue valiendo (de los datos que no se han vuelto a tocar).
  const vigentes = corr ? validacionesVigentes(validacionesServidor.lista, validacionesServidor.enviado, corr.estado) : validacionesServidor.lista;
  const infoBase = info
    ? rv.ajustarInfo(rv.clienteOriginal ? conClienteDeLaOriginal(info, rv.clienteOriginal) : clienteResuelto ? conClienteElegido(info, clienteResuelto) : info)
    : null;
  const infoPanel = infoBase ? infoConValidaciones(infoBase, vigentes) : null;
  // Los datos marcados ya corregidos (en verde en el panel), salvo los que el servidor ha vuelto a marcar.
  const conAvisoServidor = new Set(vigentes.flatMap((v) => v.campos));
  const corregidos =
    corr && infoBase ? Object.fromEntries(Object.entries(valoresCorregidos(infoBase, corr.leido, corr.estado)).filter(([id]) => !conAvisoServidor.has(id))) : {};
  const faltaRevision = !!infoPanel?.requiereRevision && !revisado;
  const muyIncompleta = !!info && !aMano && esMuyIncompleta(info);
  const anuncio = leyendo
    ? segundos < 10
      ? 'Leyendo la factura. Tarda unos segundos.'
      : 'Sigue leyendo; las facturas largas tardan un poco más.'
    : info && !registrada
      ? anuncioLecturaTerminada(info)
      : '';

  // Al terminar la lectura, el foco va a los datos leidos (sin mover la pantalla); rellenada a mano, al primer campo.
  const lecturaLista = info ? `${info.lecturaId}:${info.origen}` : null;
  useEffect(() => {
    if (!lecturaLista) return;
    if (lecturaLista.endsWith(':MANUAL')) document.getElementById('cv-numero')?.focus();
    else panelRef.current?.focus({ preventScroll: true });
  }, [lecturaLista]);

  return (
    <div>
      <header className="sticky top-0 z-40 h-16 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-full max-w-7xl items-center gap-3 px-4 md:px-8">
          <Link href="/dashboard/facturas" className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900" aria-label="Volver a Facturas">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="font-semibold text-slate-900">Lector de facturas de venta</h1>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-6 pb-24 md:px-8 md:py-8">
        {/* Siempre en la pagina: el lector de pantalla anuncia la espera y el final de la lectura. */}
        <p role="status" className="sr-only">
          {anuncio}
        </p>
        <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={alElegir} className="hidden" tabIndex={-1} aria-hidden="true" />
        {/* El archivo se puede soltar en cualquier parte de la pagina, no solo en la zona de subida. */}
        <SoltarFactura
          activo={puedeEscribir}
          hayLectura={leyendo || (!!ingreso && !registrada)}
          onArchivo={(f) => {
            if (registrada) reiniciar();
            leer(f);
          }}
        />

        {!puedeEscribir ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Para registrar facturas de venta hace falta el permiso de escritura en Ventas.</p>
        ) : registrada ? (
          <div role="status" className="mx-auto flex max-w-2xl flex-col gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-800">
            <p className="flex items-start gap-2 font-medium">
              <CheckCircle size={22} weight="fill" className="mt-0.5 shrink-0" />
              <span>
                {registrada.esRectificativa ? 'Rectificativa' : 'Factura'} {registrada.numeroCompleto} registrada por {euros(registrada.total)}
                {registrada.aMano ? ' con los datos que has escrito' : registrada.corregida ? ' con los datos corregidos a mano' : ''}.
                {registrada.contabilizada === true &&
                  (registrada.asientoEnBorrador
                    ? ' Su asiento está en borrador: revísalo y apruébalo en el Motor contable. Hasta entonces no cuenta en el saldo del cliente ni en los informes.'
                    : ' Ya está contabilizada.')}
              </span>
            </p>
            {registrada.sinCorregir && (
              <p role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                <WarningCircle size={18} className="mt-0.5 shrink-0" />
                <span>
                  Ojo: el servidor no ha aplicado tus correcciones y la ha registrado con lo que se leyó. Abre la factura y compruébala; si está mal, anúlala y vuelve a
                  leerla más tarde.
                </span>
              </p>
            )}
            {registrada.contabilizada === false && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <WarningCircle size={18} className="mt-0.5 shrink-0" />
                <span>
                  No se ha podido crear su asiento{registrada.motivoSinAsiento ? `: ${registrada.motivoSinAsiento}` : '.'} Puedes contabilizarla desde la ficha de la factura.
                </span>
              </p>
            )}
            {(registrada.avisos?.length ?? 0) > 0 && (
              <ul className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {registrada.avisos!.map((a, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <WarningCircle size={18} className="mt-0.5 shrink-0" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-3 text-sm">
              <Link href={`/dashboard/facturas/${registrada.facturaId}`} className="rounded-lg border border-emerald-200 bg-white px-4 py-2 font-semibold text-emerald-700 hover:bg-emerald-50">
                Ver la factura
              </Link>
              {registrada.asientoId && tieneAlgunPermiso(getUser(), ['contabilidad:read', 'contabilidad:write']) && (
                <Link href={`/dashboard/motor-contable/${registrada.asientoId}`} className="rounded-lg border border-emerald-200 bg-white px-4 py-2 font-semibold text-emerald-700 hover:bg-emerald-50">
                  Ver el asiento
                </Link>
              )}
              <button type="button" onClick={reiniciar} className="rounded-lg bg-accent-600 px-4 py-2 font-semibold text-white hover:bg-accent-700">
                Leer otra
              </button>
            </div>
          </div>
        ) : !ingreso || !info ? (
          <div className="mx-auto max-w-2xl">
            {/* Antes de subirla: de dónde es el cliente (manda en las comprobaciones del NIF). */}
            <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
              <OrigenTercero tipo="cliente" valor={origen} onCambiar={elegirOrigen} disabled={leyendo} />
            </div>
            {/* Zona de subida (el archivo se puede soltar en toda la pagina: SoltarFactura); con el teclado, el boton "Seleccionar archivo". */}
            <div
              onClick={abrirSelector}
              className={`rounded-xl border-2 border-dashed border-emerald-200 bg-white p-8 text-center transition-colors md:p-12 ${leyendo ? '' : 'cursor-pointer hover:border-emerald-400'}`}
            >
              <FileArrowUp size={48} weight="duotone" className="mx-auto mb-4 text-accent-600" />
              <h2 className="mb-2 text-lg font-semibold text-slate-900">{leyendo ? 'Leyendo la factura…' : 'Sube el PDF o la foto de una factura emitida'}</h2>
              <p className="mb-6 text-sm text-slate-600">
                {leyendo
                  ? segundos < 10
                    ? 'Tarda unos segundos.'
                    : 'Sigue leyendo; las facturas largas tardan un poco más.'
                  : 'Arrástrala a cualquier parte de la página o pulsa para elegirla. PDF, JPG, PNG o WEBP de hasta 4 MB.'}
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  abrirSelector();
                }}
                disabled={leyendo}
                className="inline-flex items-center gap-2 rounded-lg bg-accent-600 px-6 py-3 font-semibold text-white transition-all hover:bg-accent-700 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
              >
                {leyendo ? 'Leyendo…' : 'Seleccionar archivo'}
              </button>
              {leyendo && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    reiniciar();
                  }}
                  className="mt-3 block w-full text-sm font-semibold text-slate-600 hover:underline sm:mx-auto sm:w-auto"
                >
                  Cancelar
                </button>
              )}
              {archivo && (
                <p className="mt-4 break-all text-sm text-slate-600">
                  {archivo.name} ({(archivo.size / 1024 / 1024).toFixed(2).replace('.', ',')} MB)
                </p>
              )}
            </div>
            {error && (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                <p role="alert" className="flex items-start gap-2">
                  <WarningCircle size={18} className="mt-0.5 shrink-0" />
                  <span>
                    {error}
                    {alternativa && !aManoId && (
                      <>
                        {' '}
                        <Link href={alternativa.ruta} className="font-semibold underline">
                          {alternativa.texto}
                        </Link>
                      </>
                    )}
                  </span>
                </p>
                {/* Con el archivo ya subido, se puede terminar a mano sin volver a subirlo. */}
                {aManoId && !leyendo && (
                  <div className="mt-3 flex flex-col gap-2 pl-[26px]">
                    <p className="text-slate-700">Puedes escribir tú los datos mirando el archivo que has subido. Se guarda con la factura, igual que una leída.</p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                      <button
                        type="button"
                        onClick={() => void pasarAMano(aManoId)}
                        disabled={pasandoAMano}
                        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-accent-600 px-4 py-2 font-semibold text-white hover:bg-accent-700 disabled:opacity-60 sm:min-h-0"
                      >
                        <PencilSimple size={16} aria-hidden="true" /> {pasandoAMano ? 'Abriendo…' : 'Rellenarla a mano'}
                      </button>
                      {alternativa && (
                        <Link href={alternativa.ruta} className="font-semibold underline">
                          {alternativa.texto}
                        </Link>
                      )}
                    </div>
                  </div>
                )}
                {errorAMano && (
                  <p role="alert" className="mt-2 pl-[26px] font-medium">
                    {errorAMano}
                  </p>
                )}
              </div>
            )}
            <p className="mt-4 text-sm text-slate-500">
              Verás los datos leídos y lo que haya que comprobar antes de registrarla. Si algo se ha leído mal, podrás corregirlo antes de registrarla.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Vista previa: a partir de lg se queda fija al bajar por el formulario, como en el lector de gastos. */}
            <section className="flex flex-col gap-3 lg:sticky lg:top-4 lg:self-start">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 break-all text-sm text-slate-600">{archivo?.name}</p>
                <button type="button" onClick={reiniciar} className="text-sm font-semibold text-blue-600 hover:underline">
                  Leer otra
                </button>
              </div>
              {vista &&
                (esImagen ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={vista} alt="Factura subida" className="max-h-[70vh] w-full rounded-lg border border-slate-200 bg-white object-contain lg:max-h-[calc(100dvh-6rem)]" />
                ) : (
                  <iframe src={vista} title="Factura subida" className="h-[50vh] w-full rounded-lg border border-slate-200 bg-white lg:h-[calc(100dvh-6rem)]" />
                ))}
            </section>

            {/* Lo leido y la confirmacion */}
            <section ref={panelRef} tabIndex={-1} aria-label="Datos leídos" className="flex min-w-0 flex-col gap-4 focus:outline-none">
              {/* De dónde es el cliente: se puede cambiar y se vuelve a comprobar sin leer otra vez. Con el
                  cliente de la factura que rectifica, lo dice su ficha y no se pregunta. */}
              {rv.clienteOriginal ? (
                <OrigenTerceroDeLaFicha tipo="cliente" pais={rv.clienteOriginal.pais} nombre={rv.clienteOriginal.nombre} />
              ) : (
                <OrigenTerceroLeido
                  tipo="cliente"
                  tercero={tercero}
                  valor={tercero?.eleccion ?? origen}
                  onCambiar={cambiarOrigen}
                  cambiando={cambiandoOrigen}
                  error={errorOrigen}
                />
              )}
              <PanelLectura
                info={infoPanel ?? info}
                lector="ventas"
                revisado={revisado}
                onRevisado={setRevisado}
                conCasilla={!bloqueada}
                editable={!!corr}
                corregidos={corregidos}
              />

              {/* Muy incompleta: el formulario ya está abierto con lo leído; también se puede empezar de cero. */}
              {muyIncompleta && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <p>
                    La lectura ha salido muy incompleta. Completa abajo lo que falta o, si te resulta más fácil, empieza de cero y escribe tú todos los datos mirando el
                    archivo.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Se quita todo lo leído y se abre el formulario vacío, con el archivo que has subido. ¿Seguir?')) void pasarAMano(info.lecturaId);
                    }}
                    disabled={pasandoAMano || guardando}
                    className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-amber-900 underline hover:no-underline disabled:opacity-60 sm:min-h-0"
                  >
                    <PencilSimple size={16} aria-hidden="true" /> {pasandoAMano ? 'Abriendo…' : 'Rellenarla a mano'}
                  </button>
                  {errorAMano && (
                    <p role="alert" className="mt-1 font-medium text-rose-700">
                      {errorAMano}
                    </p>
                  )}
                </div>
              )}

              {/* Rectificativa o abono: que factura rectifica, motivo, signo y forma (con lo corregido, si lo hay). */}
              <RectificativaVentaLector rv={rv} ingreso={ingresoEf ?? ingreso} clienteLeidoId={clienteLeido?.id ?? null} disabled={guardando} />

              {/* Cliente sin dar de alta: «Dar de alta este cliente» o «Es uno que ya tengo». */}
              {(!existente || clienteResuelto) && !rv.clienteOriginal && (
                <AvisoTerceroNuevo
                  id="lv-aviso-cliente"
                  tipo="cliente"
                  datos={{
                    nombreFiscal: ingreso.cliente ?? '',
                    // El NIF-IVA leído sin prefijo va ya con el de su país (FR...).
                    nifCif: tercero?.nifPropuesto ?? nifLeido,
                    pais: paisCliente,
                    origen: tercero?.contradiccion?.origen ?? tercero?.origen ?? null,
                    direccion: direccion?.calle ?? '',
                    cp: direccion?.cp ?? '',
                    municipio: direccion?.municipio ?? '',
                    provincia: direccion?.provincia ?? '',
                    dudosos: camposDudosos(direccion),
                  }}
                  nifLeido={nifLeido}
                  nombreLeido={ingreso.cliente ?? ''}
                  enlazado={clienteResuelto}
                  puedeDarDeAlta={puedeAltaCliente}
                  onEnlazar={(t) => {
                    setClienteResuelto(t);
                    setErrorGuardar('');
                  }}
                  onCambiar={() => setClienteResuelto(null)}
                />
              )}

              {/* Rellenada a mano no hay nada leído: el cliente se elige o se da de alta en el aviso de arriba. */}
              {!aMano && (
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <h2 className="font-semibold text-slate-900">{corr ? 'Cliente leído' : 'Datos leídos'}</h2>
                    {!corr && (
                      <button
                        type="button"
                        onClick={() => abrirCorreccion()}
                        disabled={guardando}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 sm:min-h-0"
                      >
                        <PencilSimple size={16} aria-hidden="true" /> Corregir los datos
                      </button>
                    )}
                  </div>
                  <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Dato etiqueta="Cliente">{cliente?.nombre || ingreso.cliente || 'sin leer'}</Dato>
                    <Dato etiqueta={`${numeroFiscal} del cliente`} mono>
                      {cliente?.nif || ingreso.nifCliente || 'sin leer'}
                      {/* «Es uno que ya tengo» corrige el NIF mal leido: se ve tambien el que se leyo. */}
                      {cliente && nifLeido && nifComparable(cliente.nif) !== nifComparable(nifLeido) && (
                        <span className="mt-0.5 block font-sans text-xs font-normal text-slate-500">En la factura se leyó {nifLeido}.</span>
                      )}
                    </Dato>
                    {/* Un servidor anterior no la manda: entonces no se enseña. Tampoco si la rectificativa va al
                        cliente de la factura que rectifica: se registra con su ficha, no con lo leído. */}
                    {ingreso.direccionCliente !== undefined && !rv.clienteOriginal && (
                      <Dato etiqueta="Dirección del cliente" ancho>
                        {lineasDireccion.length > 0
                          ? lineasDireccion.map((l, i) => (
                              <span key={i} className="block">
                                {l}
                              </span>
                            ))
                          : 'sin leer'}
                        {direccion?.revisar && lineasDireccion.length > 0 && (
                          <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
                            <Warning size={14} weight="fill" aria-hidden="true" />
                            Leída con poca seguridad: compruébala con la factura
                          </span>
                        )}
                      </Dato>
                    )}
                    {/* Con «Corregir los datos» abierto, la factura se ve (y se corrige) en el formulario de abajo. */}
                    {!corr && (
                      <>
                        <Dato etiqueta="Número de factura">{ingreso.numeroFactura || 'sin leer'}</Dato>
                        <Dato etiqueta="Fecha">{ingreso.fecha ? fechaLegible(ingreso.fecha) : 'sin leer'}</Dato>
                        <Dato etiqueta="Concepto">{ingreso.concepto || 'sin leer'}</Dato>
                        <Dato etiqueta="Base imponible">{importe(ingreso.base)}</Dato>
                        <Dato etiqueta="IVA">{importe(ingreso.iva)}</Dato>
                        {(ingreso.retencion ?? 0) > 0 && <Dato etiqueta="Retención de IRPF">− {importe(ingreso.retencion)}</Dato>}
                        <Dato etiqueta="Total">{importe(ingreso.total)}</Dato>
                      </>
                    )}
                  </dl>
                </div>
              )}

              {/* «Corregir los datos» o «Rellenarla a mano»: número, fechas, concepto, líneas con su cuenta, retención y total. */}
              {corr && (
                <CorreccionVenta
                  leido={corr.leido}
                  valor={corr.estado}
                  onCambio={(estado) => {
                    setCorr({ ...corr, estado });
                    // El error de un campo se quita al cambiarlo (la comprobación vuelve a mirar al registrar).
                    if (errorCorr) setErrorCorr(null);
                    if (errorGuardar) setErrorGuardar('');
                  }}
                  marcas={aMano ? {} : marcasDeLaLectura(info, corr.leido)}
                  aMano={aMano}
                  espanola={espanola}
                  negativos={!!ingreso.rectificativa}
                  catalogo={catalogo}
                  puedeCrearCuenta={puedeCrearCuenta}
                  cuentaPorDefecto={(tipoIva) => rv.cuentaDeLinea(tipoIva) ?? POR_DEFECTO}
                  error={errorCorr}
                  intento={intentoCorr}
                  onVolver={volverALoLeido}
                  disabled={guardando}
                />
              )}

              {/* Lineas con que se registrara, cada una con su cuenta de ingresos. */}
              {!corr && (ingreso.lineas?.length ?? 0) > 0 && (
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <h2 className="font-semibold text-slate-900">{ingreso.lineas!.length === 1 ? 'Línea de la factura' : 'Líneas de la factura'}</h2>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {rv.activa
                      ? rv.textoLineas(ingreso.lineas!.length)
                      : `${ingreso.lineas!.length === 1 ? 'Se registra' : 'Se registran'} con la cuenta de ventas. Si va a otra (por ejemplo, la 705 de servicios), cámbiala aquí.`}
                  </p>
                  <ul className="mt-3 flex flex-col divide-y divide-slate-100">
                    {ingreso.lineas!.map((l, i) => (
                      <li key={i} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
                        <p className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                          <span className="min-w-0 break-words text-slate-800">{l.descripcion}</span>
                          <span className="font-mono text-slate-900">
                            {euros(l.base * rv.signo)} <span className="font-sans text-slate-500">· {l.tipoIva === 0 ? 'exenta' : `IVA ${porcentaje(l.tipoIva)}`}</span>
                          </span>
                        </p>
                        <CuentaLinea
                          tipo="venta"
                          catalogo={catalogo}
                          valor={cuentas[i]}
                          onCambiar={(codigo) => {
                            setCuentas((cs) => cs.map((c, j) => (j === i ? codigo : c)));
                            if (cuentaMal === i) setCuentaMal(null);
                          }}
                          porDefecto={rv.cuentaDeLinea(l.tipoIva) ?? POR_DEFECTO}
                          linea={i + 1}
                          id={`li-cuenta-${i}`}
                          puedeCrear={puedeCrearCuenta}
                          invalido={cuentaMal === i}
                          disabled={guardando}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Lo que no se arregla aquí (empresa emisora, moneda, tipo de documento...): a Nueva factura. */}
              {noCorregibles.length > 0 && (
                <div id="lv-bloqueo" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  <p className="font-semibold">Esta factura no se puede registrar desde el lector.</p>
                  {erroresSueltos.length > 0 && (
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {erroresSueltos.map((e, i) => (
                        <li key={i} className="break-words">
                          {e}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2">
                    {erroresSueltos.length === 0 && 'Mira los datos marcados arriba. '}
                    <Link href={ALTA_MANUAL.ventas.ruta} className="font-semibold underline">
                      {ALTA_MANUAL.ventas.texto}
                    </Link>
                  </p>
                </div>
              )}

              {/* Datos mal leídos que se arreglan corrigiéndolos aquí. */}
              {noCorregibles.length === 0 && corregibles.length > 0 && (
                <div id="lv-bloqueo" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  {corr ? (
                    <p>Corrige los datos marcados en rojo para poder registrarla.</p>
                  ) : (
                    <>
                      <p>Hay datos mal leídos que impiden registrarla (los tienes marcados arriba). Corrígelos y podrás registrarla.</p>
                      <button
                        type="button"
                        onClick={() => abrirCorreccion()}
                        disabled={guardando}
                        className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 font-semibold underline hover:no-underline disabled:opacity-60 sm:min-h-0"
                      >
                        <PencilSimple size={16} aria-hidden="true" /> Corregir los datos
                      </button>
                    </>
                  )}
                </div>
              )}

              {!bloqueada && infoPanel?.requiereRevision && (!corr || faltaRevision) && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  {!corr && <p>Si algún dato está mal, pulsa «Corregir los datos» y cámbialo antes de registrarla.</p>}
                  {faltaRevision && (
                    <p className={corr ? '' : 'mt-1'}>
                      {corr ? 'Cuando lo hayas comprobado todo, marca la casilla de arriba para poder registrarla.' : 'Si todo está bien, marca la casilla de arriba para poder registrarla.'}
                    </p>
                  )}
                </div>
              )}

              {errorGuardar && (
                <p id={ID_ERROR_LECTOR} role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                  <WarningCircle size={18} className="mt-0.5 shrink-0" />
                  {errorGuardar}
                </p>
              )}

              {faltaCliente && !bloqueada && (
                <p id="lv-motivo-cliente" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Antes, da de alta el cliente o elige uno que ya tengas (aviso de arriba).
                </p>
              )}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
                <button type="button" onClick={reiniciar} className="rounded-lg border border-slate-300 px-4 py-2.5 font-semibold text-slate-700 transition-colors hover:bg-slate-50">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmar}
                  disabled={guardando || bloqueada || faltaRevision || faltaCliente}
                  aria-describedby={bloqueada ? 'lv-bloqueo' : faltaCliente ? 'lv-motivo-cliente' : undefined}
                  className="rounded-lg bg-accent-600 px-5 py-2.5 font-semibold text-white transition-all hover:bg-accent-700 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
                >
                  {guardando ? 'Registrando…' : rv.activa ? 'Registrar la rectificativa' : 'Registrar la factura de venta'}
                </button>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
