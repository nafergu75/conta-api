'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, FileArrowUp, WarningCircle } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import PanelLectura from '@/components/lector/PanelLectura';
import {
  anuncioLecturaTerminada,
  cambiarOrigenLectura,
  descartarLectura,
  ErrorLectura,
  esCancelada,
  euros,
  leerFactura,
  porcentaje,
  type EleccionOrigen,
  type GastoLeido,
  type InfoLectura,
} from '@/lib/lecturas';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import FormFacturaGasto, { type FormInicial } from '@/components/compras/FormFacturaGasto';
import { fechaCorta, type GastoRegistrado } from '@/lib/compras';
import { centimos, cuotasDescuadradas, inicialComoAbono, inicialDe, marcasDelFormulario, marcasDireccion, retencionSinTipo } from '@/lib/lectorGastos';
import SoltarFactura from '@/components/lector/SoltarFactura';
import AvisoTerceroNuevo, { camposDudosos, type TerceroEnlazado } from '@/components/lector/AvisoTerceroNuevo';
import { usePaisEmpresa } from '@/lib/fiscal';
import OrigenTercero, { eleccionRecordada, ORIGEN_POR_DEFECTO, origenPorDefecto, OrigenTerceroLeido, recordarEleccion } from '@/components/lector/OrigenTercero';

/**
 * Lector de gastos: se sube el PDF o la foto de una factura de proveedor, el
 * servidor la lee (Azure y, si hace falta, Claude) y valida cada dato; el
 * usuario revisa y corrige todos los datos y, al registrarla, se crea la
 * factura de gasto con su asiento en borrador (se aprueba en el Motor
 * contable). El archivo se lee en el servidor; aqui solo se ve la vista previa.
 *
 * Una rectificativa o un abono (V19 en «revisar») se registra como abono: el
 * formulario se abre con el bloque «Rectificación» y la factura original que
 * propone el servidor. Si no lo es, «Registrarla como factura normal» manda
 * noEsRectificativa (queda en el registro de auditoría).
 */

const MAX_BYTES = 4 * 1024 * 1024;
const TIPOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MOTIVO_FECHA_HOY = 'No se ha leído la fecha: se ha puesto la de hoy; cámbiala si no es la de la factura.';

/** Si no se leyo la fecha, el formulario pone la de hoy: el panel lo dice y la marca para corregir. */
function conFechaDeHoy(info: InfoLectura, g: GastoLeido): InfoLectura {
  if (g.fecha && /^\d{4}-\d{2}-\d{2}$/.test(g.fecha)) return info;
  const previo = info.campos.fechaEmision;
  const motivos = [MOTIVO_FECHA_HOY, ...(previo?.motivos ?? []).filter((m) => m !== MOTIVO_FECHA_HOY)];
  return {
    ...info,
    estado: 'error',
    requiereRevision: true,
    campos: { ...info.campos, fechaEmision: { estado: 'error', confianza: null, fuente: previo?.fuente ?? 'calculado', valorLeido: null, motivos } },
  };
}

const RANGO: Record<InfoLectura['estado'], number> = { ok: 0, revisar: 1, error: 2 };

/** Pais de España (o sin pais, que en el formulario cuenta como España). */
const esEspana = (pais: string | null | undefined) => ['', 'ES', 'ESP'].includes((pais ?? '').trim().toUpperCase());

/**
 * Sin la tarjeta del tipo de documento: la nomina o los seguros sociales los
 * explica el recuadro azul de la pagina (con su matiz) y, si el usuario dice
 * que es una factura de gasto, ese dato ya esta revisado. La casilla solo
 * sigue haciendo falta si queda algo mas marcado.
 */
function sinTipoDocumento(info: InfoLectura): InfoLectura {
  const { tipoDocumento: _quitado, ...campos } = info.campos;
  const resto = Object.values(campos).filter((c) => !!c);
  const peorCampo = Math.max(0, ...resto.map((c) => RANGO[c.estado]));
  const peorTodos = Math.max(peorCampo, _quitado ? RANGO[_quitado.estado] : 0);
  // Algo marcado sin campo (QR ilegible, archivo repetido) pesa mas que todos los campos juntos.
  const sinCampo = RANGO[info.estado] > peorTodos || (info.generales ?? []).length > 0 || info.qr.estado === 'ILEGIBLE' || info.qr.estado === 'NO_COINCIDE';
  const requiereRevision = info.requiereRevision && (peorCampo > 0 || sinCampo);
  return { ...info, campos, requiereRevision };
}

export default function LectorGastosPage() {
  const puedeEscribir = tieneAlgunPermiso(getUser(), ['compras:write']);
  const inputRef = useRef<HTMLInputElement>(null);

  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState('');
  const [leido, setLeido] = useState<GastoLeido | null>(null);
  const [inicial, setInicial] = useState<FormInicial | null>(null);
  const [tipoDocumento, setTipoDocumento] = useState<GastoLeido['tipoDocumento']>('factura');
  const [registrado, setRegistrado] = useState<GastoRegistrado | null>(null);
  const [lectura, setLectura] = useState(0);
  const [info, setInfo] = useState<InfoLectura | null>(null);
  const [revisado, setRevisado] = useState(false);
  // Rectificativa leida: se registra como abono salvo que la persona diga que no lo es.
  const [comoAbono, setComoAbono] = useState(true);
  const [alternativa, setAlternativa] = useState<{ ruta: string; texto: string } | null>(null);
  const [segundos, setSegundos] = useState(0);
  // Proveedor dado de alta o elegido en esta lectura (el aviso pasa a verde).
  const [proveedorResuelto, setProveedorResuelto] = useState<TerceroEnlazado | null>(null);
  // Sin permiso de alta en la sesion, o el servidor lo ha negado (403) en esta pagina.
  const [altaDenegada, setAltaDenegada] = useState(false);
  const puedeAltaProveedor = tieneAlgunPermiso(getUser(), ['compras:write']) && !altaDenegada;
  // «¿De dónde es el proveedor?»: antes de subir la factura (se recuerda la última) y, después, en el panel.
  const [origen, setOrigen] = useState<EleccionOrigen>(ORIGEN_POR_DEFECTO);
  const [cambiandoOrigen, setCambiandoOrigen] = useState(false);
  const [errorOrigen, setErrorOrigen] = useState('');
  // Lectura en curso o sin registrar: "Leer otra" corta la espera y la descarta.
  const lecturaIdRef = useRef<string | null>(null);
  const cortarRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLElement>(null);

  // La vista previa usa una URL local del archivo: se libera al cambiar de archivo.
  useEffect(() => {
    if (!archivo) {
      setVista(null);
      return;
    }
    const url = URL.createObjectURL(archivo);
    setVista(url);
    return () => URL.revokeObjectURL(url);
  }, [archivo]);

  // Segundos que lleva leyendo, para el texto de espera.
  useEffect(() => {
    if (!leyendo) return;
    setSegundos(0);
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [leyendo]);

  // Al salir de la pantalla se corta la espera (la lectura sin registrar se purga sola).
  useEffect(() => () => cortarRef.current?.abort(), []);

  // La última elección de este lector y esta empresa (en el navegador). Sin ella, De España; en una
  // empresa de fuera (EE. UU., Hong Kong), De fuera de la UE. Lo que ya se haya elegido aquí no se pisa.
  const paisEmpresa = usePaisEmpresa();
  const origenElegidoRef = useRef(false);
  useEffect(() => {
    if (!origenElegidoRef.current) setOrigen(eleccionRecordada('gastos', origenPorDefecto(paisEmpresa)));
  }, [paisEmpresa]);

  const elegirOrigen = (e: EleccionOrigen) => {
    origenElegidoRef.current = true;
    setOrigen(e);
    recordarEleccion('gastos', e);
  };

  /**
   * Cambiada después de leer: el servidor vuelve a comprobar lo leído (sin leer
   * otra vez la factura). El formulario no se toca: lo que ya se haya corregido sigue.
   */
  const cambiarOrigen = async (e: EleccionOrigen) => {
    if (!info || !leido || cambiandoOrigen) return;
    setCambiandoOrigen(true);
    setErrorOrigen('');
    try {
      const r = await cambiarOrigenLectura('gastos', info.lecturaId, e);
      setInfo(conFechaDeHoy(r.lectura, leido));
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

  /** Corta la lectura en curso y descarta la que no se ha registrado. */
  const soltarLectura = () => {
    cortarRef.current?.abort();
    cortarRef.current = null;
    const id = lecturaIdRef.current;
    lecturaIdRef.current = null;
    if (id) void descartarLectura('gastos', id);
  };

  const reiniciar = () => {
    if (!registrado) soltarLectura();
    lecturaIdRef.current = null;
    setArchivo(null);
    setLeido(null);
    setInicial(null);
    setInfo(null);
    setRevisado(false);
    setRegistrado(null);
    setProveedorResuelto(null);
    setErrorOrigen('');
    setError('');
    setAlternativa(null);
    setLeyendo(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const leer = async (f: File) => {
    setError('');
    setAlternativa(null);
    setRegistrado(null);
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
    setLeido(null);
    setInicial(null);
    setInfo(null);
    setRevisado(false);
    setProveedorResuelto(null);
    setComoAbono(true);
    setLeyendo(true);
    try {
      const r = await leerFactura('gastos', f, {
        origen,
        signal: cortar.signal,
        alEmpezar: (id) => {
          lecturaIdRef.current = id;
        },
      });
      const g = r.gasto;
      // El pais del proveedor ya dado de alta (un proveedor extranjero no lleva IVA español).
      let pais: string | null = g.proveedorExistente?.pais ?? null;
      if (g.proveedorExistente && !pais) {
        pais = await apiFetch<{ pais?: string }>(companyPath(`/proveedores/${encodeURIComponent(g.proveedorExistente.id)}`))
          .then((p) => p.pais ?? null)
          .catch(() => null);
      }
      if (cortar.signal.aborted) return;
      setLeido(g);
      setInfo(conFechaDeHoy(r.lectura, g));
      setTipoDocumento(g.tipoDocumento ?? 'factura');
      setInicial(inicialDe(g, pais, r.lectura.tercero));
      setLectura((n) => n + 1);
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

  const alElegir = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) leer(f);
  };

  const noEsFactura = tipoDocumento === 'nomina' || tipoDocumento === 'seguros_sociales';
  const leidaComoNoFactura = leido?.tipoDocumento === 'nomina' || leido?.tipoDocumento === 'seguros_sociales';
  const infoPanel = info && leidaComoNoFactura ? sinTipoDocumento(info) : info;
  // Rectificativa o abono: se registra como abono (con el bloque «Rectificación»).
  const leidaRect = leido?.rectificativa ?? null;
  const abono = !!leidaRect && comoAbono;
  const inicialLeido = useMemo(() => (inicial && leidaRect && comoAbono ? inicialComoAbono(inicial, leidaRect) : inicial), [inicial, leidaRect, comoAbono]);
  // El proveedor dado de alta o elegido aqui se conserva si el formulario se vuelve a montar
  // (al pasar de abono a factura normal o al reves): no hay que darlo de alta otra vez.
  const inicialForm = useMemo<FormInicial | null>(
    () =>
      inicialLeido && proveedorResuelto
        ? { ...inicialLeido, proveedor: { tipo: 'existente', id: proveedorResuelto.id, nombre: proveedorResuelto.nombre, nif: proveedorResuelto.nif, pais: proveedorResuelto.pais } }
        : inicialLeido,
    [inicialLeido, proveedorResuelto],
  );
  const propuesta = leidaRect?.propuesta ?? null;
  const faltaRevision = !!infoPanel?.requiereRevision && !revisado;
  // Si lo unico marcado era el tipo de documento, "es una factura de gasto" ya es la revision.
  const revisadoEnviado = !!info?.requiereRevision && !infoPanel?.requiereRevision ? !noEsFactura : revisado;
  const esImagen = archivo?.type.startsWith('image/');
  const descuadres = leido && inicial && info ? cuotasDescuadradas(leido, inicial.lineas, info.campos) : [];
  const retencionRara = leido ? retencionSinTipo(leido) : null;
  const anuncio = leyendo
    ? segundos < 10
      ? 'Leyendo la factura. Tarda unos segundos.'
      : 'Sigue leyendo; las facturas largas tardan un poco más.'
    : infoPanel && !registrado
      ? anuncioLecturaTerminada(infoPanel)
      : '';

  // Al terminar la lectura, el foco va a los datos leidos (sin mover la pantalla).
  const lecturaLista = infoPanel?.lecturaId ?? null;
  useEffect(() => {
    if (lecturaLista) panelRef.current?.focus({ preventScroll: true });
  }, [lecturaLista]);

  return (
    <div>
      <header className="sticky top-0 z-40 h-16 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-full max-w-7xl items-center gap-3 px-4 md:px-8">
          <Link href="/dashboard/compras" className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900" aria-label="Volver a Compras">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="font-semibold text-slate-900">Lector de gastos</h1>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-6 pb-24 md:px-8 md:py-8">
        {/* El input esta fuera de cualquier <label>: el boton y la zona lo abren con el ref. */}
        {/* Siempre en la pagina: el lector de pantalla anuncia la espera y el final de la lectura. */}
        <p role="status" className="sr-only">
          {anuncio}
        </p>
        <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={alElegir} className="hidden" tabIndex={-1} aria-hidden="true" />
        {/* El archivo se puede soltar en cualquier parte de la pagina, no solo en la zona de subida. */}
        <SoltarFactura
          activo={puedeEscribir}
          hayLectura={leyendo || (!!leido && !registrado)}
          onArchivo={(f) => {
            if (registrado) reiniciar();
            leer(f);
          }}
        />

        {!puedeEscribir ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Para registrar facturas de gasto hace falta el permiso de escritura en Compras.</p>
        ) : registrado ? (
          <div role="status" className="mx-auto flex max-w-2xl flex-col gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-800">
            <p className="flex items-start gap-2 font-medium">
              <CheckCircle size={22} weight="fill" className="mt-0.5 shrink-0" />
              <span>
                {registrado.factura.esRectificativa ? 'Abono registrado' : 'Factura registrada'} (registro {registrado.factura.numeroCompleto}). Su asiento está en borrador: revísalo y
                apruébalo en el Motor contable.
                {registrado.factura.esRectificativa && ' Al aprobarlo se descontará de la factura que rectifica.'}
                {registrado.proveedorCreado && ' El proveedor se ha dado de alta.'}
              </span>
            </p>
            {!!registrado.factura.avisos?.length && (
              <ul className="flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {registrado.factura.avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-3 text-sm">
              <Link href={`/dashboard/compras/${registrado.factura.id}`} className="rounded-lg border border-emerald-200 bg-white px-4 py-2 font-semibold text-emerald-700 hover:bg-emerald-50">
                Ver la factura
              </Link>
              {registrado.asientoId && tieneAlgunPermiso(getUser(), ['contabilidad:read', 'contabilidad:write']) && (
                <Link href={`/dashboard/motor-contable/${registrado.asientoId}`} className="rounded-lg border border-emerald-200 bg-white px-4 py-2 font-semibold text-emerald-700 hover:bg-emerald-50">
                  Ver el asiento
                </Link>
              )}
              <button type="button" onClick={reiniciar} className="rounded-lg bg-accent-600 px-4 py-2 font-semibold text-white hover:bg-accent-700">
                Leer otra
              </button>
            </div>
          </div>
        ) : !leido || !inicial || !inicialForm || !info || !infoPanel ? (
          <div className="mx-auto max-w-2xl">
            {/* Antes de subirla: de dónde es el proveedor (manda en las comprobaciones del NIF). */}
            <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
              <OrigenTercero tipo="proveedor" valor={origen} onCambiar={elegirOrigen} disabled={leyendo} />
            </div>
            {/* Zona de subida (el archivo se puede soltar en toda la pagina: SoltarFactura); con el teclado, el boton "Seleccionar archivo". */}
            <div
              onClick={abrirSelector}
              className={`rounded-xl border-2 border-dashed border-emerald-200 bg-white p-8 text-center transition-colors md:p-12 ${leyendo ? '' : 'cursor-pointer hover:border-emerald-400'}`}
            >
              <FileArrowUp size={48} weight="duotone" className="mx-auto mb-4 text-accent-600" />
              <h2 className="mb-2 text-lg font-semibold text-slate-900">{leyendo ? 'Leyendo la factura…' : 'Sube el PDF o la foto de la factura'}</h2>
              <p className="mb-6 text-sm text-slate-600">
                {leyendo
                  ? segundos < 10
                    ? 'Tarda unos segundos.'
                    : 'Sigue leyendo; las facturas largas tardan un poco más.'
                  : 'Arrástrala a cualquier parte de la página o pulsa para elegirla. PDF, JPG, PNG o WEBP de hasta 4 MB. En el móvil puedes hacer la foto directamente.'}
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
              Revisarás y podrás corregir todos los datos antes de registrarla. La factura quedará pendiente de revisar hasta que apruebes su asiento en el Motor contable.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Vista previa: a partir de lg se queda fija al bajar por el formulario, para comparar cada campo con la factura. */}
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

            {/* Datos leidos, editables */}
            <section ref={panelRef} tabIndex={-1} aria-label="Datos leídos" className="flex min-w-0 flex-col gap-4 focus:outline-none">
              {/* De dónde es el proveedor: se puede cambiar y se vuelve a comprobar sin leer otra vez. */}
              <OrigenTerceroLeido
                tipo="proveedor"
                tercero={info.tercero}
                valor={info.tercero?.eleccion ?? origen}
                onCambiar={cambiarOrigen}
                cambiando={cambiandoOrigen}
                error={errorOrigen}
              />
              <PanelLectura
                info={infoPanel}
                lector="gastos"
                revisado={revisado}
                onRevisado={setRevisado}
                conCasilla={!leido.duplicada}
                sinArreglo={leido.duplicada ? ['numero'] : []}
              />
              {/* Rectificativa o abono: que factura rectifica (la propuesta del servidor) y la salida si no lo es. */}
              {leidaRect && (
                <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm text-slate-800">
                  {abono ? (
                    <>
                      <p className="font-semibold">Es una rectificativa o un abono: se registrará como abono.</p>
                      <p>
                        {propuesta?.original ? (
                          <>
                            Rectifica la {propuesta.original.numero ?? propuesta.original.numeroCompleto} del {fechaCorta(propuesta.original.fecha)} (registro {propuesta.original.numeroCompleto}).{' '}
                            {propuesta.coincidencia === 'EXACTA' ? 'Coincide con el número leído.' : 'El número se parece al leído: compruébalo.'}
                          </>
                        ) : !propuesta && leidaRect.numeroRectificada ? (
                          <>
                            El proveedor no está en la app: la factura que rectifica ({leidaRect.numeroRectificada}) va como «de fuera» (pon su fecha). Si el NIF se leyó mal y eliges un
                            proveedor que ya tienes, puedes buscarla entre sus facturas en «Rectificación».
                          </>
                        ) : (
                          <>
                            Elige la factura que rectifica en «Rectificación»
                            {leidaRect.numeroRectificada ? ` (se ha leído el número ${leidaRect.numeroRectificada})` : ''}.
                          </>
                        )}
                      </p>
                      {!leidaRect.tipoPropuesto && (
                        <p className="text-amber-800">
                          Los importes vienen en positivo: elige si la rectificativa es por diferencias (trae solo lo que cambia) o por sustitución (trae la factura corregida entera).
                        </p>
                      )}
                      <button type="button" onClick={() => setComoAbono(false)} className="text-left font-semibold text-blue-600 hover:underline">
                        No es una rectificativa: registrarla como factura normal
                      </button>
                    </>
                  ) : (
                    <>
                      <p>Se registrará como una factura normal, no como abono. Queda anotado que lo has indicado tú.</p>
                      <button type="button" onClick={() => setComoAbono(true)} className="text-left font-semibold text-blue-600 hover:underline">
                        Volver a registrarla como abono
                      </button>
                    </>
                  )}
                </div>
              )}
              {/* De donde sale la cuenta de la factura (inicialDe): la habitual del proveedor o la sugerida por el concepto. */}
              {leido.cuentaHabitual && inicial.cuentaGasto === leido.cuentaHabitual.codigo ? (
                <p className="text-sm text-slate-600">
                  Cuenta habitual de este proveedor: <span className="font-mono">{leido.cuentaHabitual.codigo}</span> {leido.cuentaHabitual.nombre}. La hemos puesto en la factura; cada
                  línea se puede llevar a otra con «Cambiar cuenta».
                </p>
              ) : (
                leido.cuentaContableBase &&
                inicial.cuentaGasto === leido.cuentaContableBase && (
                  <p className="text-sm text-slate-600">
                    Cuenta sugerida por el concepto: <span className="font-mono">{leido.cuentaContableBase}</span>
                    {leido.cuentaContableNombre && ` ${leido.cuentaContableNombre}`}. Cada línea se puede llevar a otra con «Cambiar cuenta».
                  </p>
                )
              )}
              {retencionRara !== null && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  La factura lleva una retención de IRPF del {porcentaje(retencionRara)}. En las facturas de gasto la app solo registra la del 7, el 15 o el 19 % (profesionales y
                  alquileres). La hemos dejado en las líneas para que veas que el total cuadra, pero tienes que cambiarla antes de registrar la factura. Si no sabes cuál poner,
                  pregúntale a tu asesor.
                </p>
              )}

              {leido.duplicada && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  Ya registraste esta factura ({leido.duplicada.numeroCompleto}).{' '}
                  <Link href={`/dashboard/compras/${leido.duplicada.facturaId}`} className="font-semibold underline">
                    Ver la factura
                  </Link>
                </p>
              )}

              {noEsFactura && (
                <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                  <p>
                    {tipoDocumento === 'nomina' ? 'Parece una nómina' : 'Parecen unos seguros sociales'}: si la empresa lleva sus nóminas en la app, no se registra como factura de gasto.{' '}
                    <Link href="/dashboard/nominas" className="font-semibold underline">
                      Ve a Nóminas
                    </Link>
                    , importa el Excel de la gestoría y guarda allí este PDF.
                  </p>
                  <p>
                    Si no lo es (por ejemplo, la cuota de autónomos del administrador, o una empresa sin trabajadores),{' '}
                    <button type="button" onClick={() => setTipoDocumento('factura')} className="font-semibold underline">
                      es una factura de gasto
                    </button>
                    .
                  </p>
                </div>
              )}

              {descuadres.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <p className="font-semibold">En la propuesta inicial, el IVA de la factura y el de {descuadres.length === 1 ? 'la línea' : 'las líneas'} no coinciden al céntimo</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {descuadres.map((d) => {
                      const dif = Math.abs(centimos(d.linea) - centimos(d.leida));
                      return (
                        <li key={d.tipoIva} className="break-words">
                          {d.tipoIva === 0 ? 'Parte exenta' : `IVA del ${porcentaje(d.tipoIva)}`}: la factura pone {euros(d.leida)} y la línea da {euros(d.linea)} ({dif === 1 ? 'un céntimo' : `${dif} céntimos`} de diferencia).
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mt-1">Suele ser el redondeo. Se apuntará el IVA que dé la línea: compruébalo con la factura antes de registrarla.</p>
                </div>
              )}

              <FormFacturaGasto
                key={`${lectura}-${abono ? 'abono' : 'factura'}`}
                modo="lector"
                inicial={inicialForm}
                marcas={{ ...marcasDireccion(leido, inicialForm), ...marcasDelFormulario(infoPanel.campos, inicialForm) }}
                numeroRectificadaLeida={leidaRect?.numeroRectificada ?? null}
                extra={{
                  tipoDocumento,
                  confianza: leido.confianza,
                  lecturaId: info.lecturaId,
                  revisado: revisadoEnviado,
                  // Leida como rectificativa y registrada como factura normal: lo ha dicho la persona.
                  ...(leidaRect && !abono ? { noEsRectificativa: true } : {}),
                }}
                bloqueado={
                  leido.duplicada
                    ? `Ya registraste esta factura (${leido.duplicada.numeroCompleto}): no se registra dos veces.`
                    : noEsFactura
                      ? 'Confirma antes si es una factura de gasto (aviso de arriba).'
                      : faltaRevision
                        ? 'Marca que has revisado los datos señalados (arriba) antes de registrar.'
                        : undefined
                }
                avisoProveedor={
                  puedeAltaProveedor
                    ? 'Datos del proveedor leídos de la factura. Corrígelos aquí si hace falta: con ellos se rellena la ficha del alta.'
                    : 'Datos del proveedor leídos de la factura, para que puedas comprobar cuál es.'
                }
                proveedorDeAlta={{
                  motivo: 'Antes, da de alta el proveedor o elige uno que ya tengas (aviso del bloque «Proveedor», arriba).',
                  aviso: (p, enlazar) => {
                    const alEnlazar = (t: TerceroEnlazado) => {
                      setProveedorResuelto(t);
                      enlazar({ tipo: 'existente', id: t.id, nombre: t.nombre, nif: t.nif, pais: t.pais });
                    };
                    if (p?.tipo === 'nuevo') {
                      // La ficha del alta sale de lo que hay ahora en el bloque «Proveedor» (lo leido y lo corregido),
                      // con la direccion dudosa en ambar mientras siga como se leyo.
                      return (
                        <AvisoTerceroNuevo
                          tipo="proveedor"
                          datos={{
                            nombreFiscal: p.nombreFiscal,
                            nifCif: p.nifCif,
                            // Si se ha dicho (después de leer) que es de fuera de España y el bloque sigue en España, el de la lectura (o se pide).
                            pais: esEspana(p.pais) && info.tercero?.origen && info.tercero.origen !== 'ES' ? (info.tercero.pais ?? '') : p.pais,
                            origen: info.tercero?.contradiccion?.origen ?? info.tercero?.origen ?? null,
                            direccion: p.direccion,
                            cp: p.cp,
                            municipio: p.municipio,
                            provincia: p.provincia,
                            dudosos: camposDudosos(leido.direccionProveedor, p),
                          }}
                          nifLeido={leido.nifProveedor ?? ''}
                          nombreLeido={leido.proveedor ?? ''}
                          enlazado={null}
                          puedeDarDeAlta={puedeAltaProveedor}
                          onEnlazar={alEnlazar}
                          onSinPermiso={() => setAltaDenegada(true)}
                        />
                      );
                    }
                    // Dado de alta o elegido aqui: en verde. El que encontro el lector por su NIF no necesita aviso.
                    if (p?.tipo === 'existente' && proveedorResuelto?.id === p.id) {
                      return <AvisoTerceroNuevo tipo="proveedor" datos={{ nombreFiscal: p.nombre, nifCif: p.nif }} enlazado={proveedorResuelto} puedeDarDeAlta={puedeAltaProveedor} onEnlazar={alEnlazar} />;
                    }
                    return null;
                  },
                }}
                onGuardado={(r) => setRegistrado(r)}
                onCancelar={reiniciar}
              />
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
