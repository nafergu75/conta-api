'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, FileArrowUp, WarningCircle } from '@phosphor-icons/react';
import { apiFetch, campoDelError, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import PanelLectura from '@/components/lector/PanelLectura';
import { CuentaLinea } from '@/components/contabilidad/CuentaLinea';
import { useCuentasLinea } from '@/lib/subcuentas';
import RectificativaVentaLector, { ID_ERROR_LECTOR, useRectificativaLector } from '@/components/lector/RectificativaVentaLector';
import {
  ALTA_MANUAL,
  anuncioLecturaTerminada,
  claveTexto,
  descartarLectura,
  ErrorLectura,
  esCancelada,
  euros,
  fechaLegible,
  leerFactura,
  porcentaje,
  type IngresoExtraido,
  type InfoLectura,
} from '@/lib/lecturas';
import SoltarFactura from '@/components/lector/SoltarFactura';
import AvisoTerceroNuevo, { quienEs, type TerceroEnlazado } from '@/components/lector/AvisoTerceroNuevo';
import { paisDelPrefijo } from '@/lib/compras';
import { pareceNifIvaUe } from '@/lib/fiscal';

/**
 * Lector de facturas de venta: se sube el PDF o la foto de una factura
 * emitida, el servidor la lee (Azure y, si hace falta, Claude) y valida cada
 * dato. El usuario lo revisa y, al confirmar, el servidor registra la factura
 * con los datos que leyo (no con lo que reenvia el navegador).
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
}

function Dato({ etiqueta, children, mono }: { etiqueta: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-slate-500">{etiqueta}</dt>
      <dd className={`mt-0.5 break-words font-semibold text-slate-900 ${mono ? 'font-mono text-sm' : ''}`}>{children}</dd>
    </div>
  );
}

/** Cuenta de ingresos de una linea sin cuenta propia: la que pone el servidor (700). */
const POR_DEFECTO = { codigo: '700', texto: 'la de ventas' };

/** Sin NIF del cliente leido (el servidor lo deja de exigir si se elige un cliente dado de alta). */
const FALTA_NIF_CLIENTE = 'Falta el NIF del cliente: es obligatorio en una factura de ingreso.';

/**
 * Errores de la lectura que dependen del NIF leido del cliente (que falte o
 * este mal). Ya no impiden registrar desde el lector: la factura se registra
 * con el cliente dado de alta o elegido (y el servidor deja de exigirlos).
 */
function erroresDelNifCliente(info: InfoLectura | null): Set<string> {
  const c = info?.campos['receptor.nif'];
  const delCampo = c && (!c.codigos || c.codigos.includes('NIF_RECEPTOR')) ? c.motivos : [];
  return new Set([FALTA_NIF_CLIENTE, ...delCampo].map(claveTexto));
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
  // Rectificativa o abono leido: factura que rectifica, motivo, signo y forma (se reinicia con cada lectura).
  const rv = useRectificativaLector(ingreso);
  const catalogo = useCuentasLinea('venta', !!ingreso, { rectificativa: rv.activa });
  const puedeCrearCuenta = tieneAlgunPermiso(getUser(), ['ventas:write', 'contabilidad:write']);
  // Cliente dado de alta o elegido en esta lectura (sin el no se registra; el aviso pasa a verde).
  const [clienteResuelto, setClienteResuelto] = useState<TerceroEnlazado | null>(null);
  const puedeAltaCliente = tieneAlgunPermiso(getUser(), ['ventas:write']);
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
    setCuentas([]);
    setCuentaMal(null);
    setError('');
    setErrorGuardar('');
    setAlternativa(null);
    setLeyendo(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const leer = async (f: File) => {
    setError('');
    setErrorGuardar('');
    setAlternativa(null);
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
    setLeyendo(true);
    try {
      const r = await leerFactura('ventas', f, {
        signal: cortar.signal,
        alEmpezar: (id) => {
          lecturaIdRef.current = id;
        },
      });
      if (cortar.signal.aborted) return;
      setIngreso(r.ingreso);
      setInfo(r.lectura);
      setCuentas((r.ingreso.lineas ?? []).map(() => null));
      setCuentaMal(null);
    } catch (err) {
      if (esCancelada(err) || cortar.signal.aborted) return;
      setError(errorMessage(err));
      if (err instanceof ErrorLectura && err.alternativa) setAlternativa(err.alternativa);
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
    clienteResuelto ?? (existente ? { id: existente.id, nombre: existente.nombreFiscal, nif: existente.nifCif, pais: 'ES', como: 'elegido' } : null);
  // Una rectificativa de una factura de la app se registra con el cliente de esa factura.
  const cliente = rv.clienteOriginal ?? clienteLeido;
  // Cliente elegido aqui o el de la original: el NIF leido ya no impide registrarla.
  const clienteEnlazado = rv.clienteOriginal ?? clienteResuelto;
  const faltaCliente = !!ingreso && !cliente;
  const nifLeido = (ingreso?.nifCliente ?? '').trim();

  const confirmar = async () => {
    if (!ingreso) return;
    // Rectificativa: lo que falta se dice junto a su campo, antes de enviarla.
    const falta = rv.comprobar();
    if (falta) {
      setErrorGuardar(falta.mensaje);
      rv.mostrarError(falta);
      return;
    }
    setGuardando(true);
    setErrorGuardar('');
    setCuentaMal(null);
    try {
      // El id y la cuenta de cada linea: el servidor registra la factura con los datos que leyo.
      const r = await apiFetch<Registrada>(companyPath('/ingresos-extractor/confirmar'), {
        method: 'POST',
        body: JSON.stringify({
          documentId: ingreso.documentId,
          ...(cliente ? { clienteId: cliente.id } : {}),
          revisado,
          // Rectificativa de varias facturas: sin cuenta elegida, la que se enseña (la de la original con más base).
          lineas: cuentas.map((cuenta, i) => ({ cuenta: cuenta ?? (ingreso.lineas?.[i] ? rv.cuentaParaEnviar(ingreso.lineas[i].tipoIva) : null) })),
          ...rv.cuerpo(),
        }),
      });
      setRegistrada(r);
    } catch (err) {
      setErrorGuardar(errorMessage(err));
      const campoRect = campoDelError(err);
      if (campoRect && rv.esCampoSuyo(campoRect)) rv.mostrarError({ campo: campoRect, mensaje: errorMessage(err) });
      // Una cuenta que el servidor no admite: se marca su linea y el foco va a su «Cambiar cuenta».
      const m = /^lineas\.(\d+)\.cuenta$/.exec(campoDelError(err) ?? '');
      if (m) {
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
  // Los errores que ya explica el panel no se repiten.
  const yaExplicados = new Set(
    info ? [...Object.values(info.campos).flatMap((c) => (c ? c.motivos.map(claveTexto) : [])), ...(info.generales ?? []).map((g) => claveTexto(g.mensaje)), claveTexto(info.qr.texto)] : [],
  );
  // Que falte o este mal el NIF leido del cliente ya no bloquea: lo resuelve el cliente dado de alta o elegido.
  const delNif = erroresDelNifCliente(info);
  const errores = ingreso ? ingreso.errores.filter((e) => !delNif.has(claveTexto(e)) && !rv.noBloquea(e)) : [];
  const erroresSueltos = errores.filter((e) => !yaExplicados.has(claveTexto(e)));
  const bloqueada = errores.length > 0;
  const faltaRevision = !!info?.requiereRevision && !revisado;
  const anuncio = leyendo
    ? segundos < 10
      ? 'Leyendo la factura. Tarda unos segundos.'
      : 'Sigue leyendo; las facturas largas tardan un poco más.'
    : info && !registrada
      ? anuncioLecturaTerminada(info)
      : '';

  // Al terminar la lectura, el foco va a los datos leidos (sin mover la pantalla).
  const lecturaLista = info?.lecturaId ?? null;
  useEffect(() => {
    if (lecturaLista) panelRef.current?.focus({ preventScroll: true });
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
                {registrada.esRectificativa ? 'Rectificativa' : 'Factura'} {registrada.numeroCompleto} registrada por {euros(registrada.total)}.
                {registrada.contabilizada === true &&
                  (registrada.asientoEnBorrador
                    ? ' Su asiento está en borrador: revísalo y apruébalo en el Motor contable. Hasta entonces no cuenta en el saldo del cliente ni en los informes.'
                    : ' Ya está contabilizada.')}
              </span>
            </p>
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
              <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                <WarningCircle size={18} className="mt-0.5 shrink-0" />
                <span>
                  {error}
                  {alternativa && (
                    <>
                      {' '}
                      <Link href={alternativa.ruta} className="font-semibold underline">
                        {alternativa.texto}
                      </Link>
                    </>
                  )}
                </span>
              </p>
            )}
            <p className="mt-4 text-sm text-slate-500">
              Verás los datos leídos y lo que haya que comprobar antes de registrarla. La factura se registra con lo que se ha leído: si algo está mal, créala a mano.
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
              <PanelLectura info={rv.ajustarInfo(clienteEnlazado ? conClienteElegido(info, clienteEnlazado) : info)} lector="ventas" revisado={revisado} onRevisado={setRevisado} conCasilla={!bloqueada} />

              {/* Rectificativa o abono: que factura rectifica, motivo, signo y forma. */}
              <RectificativaVentaLector rv={rv} ingreso={ingreso} clienteLeidoId={clienteLeido?.id ?? null} disabled={guardando} />

              {/* Cliente sin dar de alta: «Dar de alta este cliente» o «Es uno que ya tengo». */}
              {(!existente || clienteResuelto) && !rv.clienteOriginal && (
                <AvisoTerceroNuevo
                  id="lv-aviso-cliente"
                  tipo="cliente"
                  datos={{ nombreFiscal: ingreso.cliente ?? '', nifCif: nifLeido, pais: pareceNifIvaUe(nifLeido) ? (paisDelPrefijo(nifLeido) ?? 'ES') : 'ES' }}
                  nifLeido={nifLeido}
                  enlazado={clienteResuelto}
                  puedeDarDeAlta={puedeAltaCliente}
                  onEnlazar={(t) => {
                    setClienteResuelto(t);
                    setErrorGuardar('');
                  }}
                  onCambiar={() => setClienteResuelto(null)}
                />
              )}

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h2 className="mb-3 font-semibold text-slate-900">Datos leídos</h2>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Dato etiqueta="Cliente">{cliente?.nombre || ingreso.cliente || 'sin leer'}</Dato>
                  <Dato etiqueta="NIF del cliente" mono>
                    {cliente?.nif || ingreso.nifCliente || 'sin leer'}
                    {/* «Es uno que ya tengo» corrige el NIF mal leido: se ve tambien el que se leyo. */}
                    {cliente && nifLeido && nifComparable(cliente.nif) !== nifComparable(nifLeido) && (
                      <span className="mt-0.5 block font-sans text-xs font-normal text-slate-500">En la factura se leyó {nifLeido}.</span>
                    )}
                  </Dato>
                  <Dato etiqueta="Número de factura">{ingreso.numeroFactura || 'sin leer'}</Dato>
                  <Dato etiqueta="Fecha">{ingreso.fecha ? fechaLegible(ingreso.fecha) : 'sin leer'}</Dato>
                  <Dato etiqueta="Concepto">{ingreso.concepto || 'sin leer'}</Dato>
                  <Dato etiqueta="Base imponible">{importe(ingreso.base)}</Dato>
                  <Dato etiqueta="IVA">{importe(ingreso.iva)}</Dato>
                  {(ingreso.retencion ?? 0) > 0 && <Dato etiqueta="Retención de IRPF">− {importe(ingreso.retencion)}</Dato>}
                  <Dato etiqueta="Total">{importe(ingreso.total)}</Dato>
                </dl>
              </div>

              {/* Lineas con que se registrara, cada una con su cuenta de ingresos. */}
              {(ingreso.lineas?.length ?? 0) > 0 && (
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

              {bloqueada && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
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

              {!bloqueada && info.requiereRevision && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <p>
                    Aquí solo se puede cambiar la cuenta de cada línea. Si algún otro dato está mal, no la registres desde el lector:{' '}
                    <Link href={ALTA_MANUAL.ventas.ruta} className="font-semibold underline">
                      {ALTA_MANUAL.ventas.texto}
                    </Link>
                    .
                  </p>
                  {faltaRevision && <p className="mt-1">Si todo está bien, marca la casilla de arriba para poder registrarla.</p>}
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
                  aria-describedby={faltaCliente && !bloqueada ? 'lv-motivo-cliente' : undefined}
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
