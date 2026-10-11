'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, FileArrowUp, WarningCircle } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import PanelLectura from '@/components/lector/PanelLectura';
import { anuncioLecturaTerminada, descartarLectura, descripcionNeutraTramo, ErrorLectura, esCancelada, euros, leerFactura, porcentaje, type InfoLectura, type TramoGasto } from '@/lib/lecturas';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { pareceNifIvaUe } from '@/lib/fiscal';
import FormFacturaGasto, { type FormInicial } from '@/components/compras/FormFacturaGasto';
import { calcularLinea, hoyIso, paisDelPrefijo, TIPO_GASTO_INFO, tipoIvaMasCercano, type GastoExtraido, type GastoRegistrado } from '@/lib/compras';

/**
 * Lector de gastos: se sube el PDF o la foto de una factura de proveedor, el
 * servidor la lee (Azure y, si hace falta, Claude) y valida cada dato; el
 * usuario revisa y corrige todos los datos y, al registrarla, se crea la
 * factura de gasto con su asiento en borrador (se aprueba en el Motor
 * contable). El archivo se lee en el servidor; aqui solo se ve la vista previa.
 */

const MAX_BYTES = 4 * 1024 * 1024;
const TIPOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MOTIVO_FECHA_HOY = 'No se ha leído la fecha: se ha puesto la de hoy; cámbiala si no es la de la factura.';

/** Si no se leyo la fecha, el formulario pone la de hoy: el panel lo dice y la marca para corregir. */
function conFechaDeHoy(info: InfoLectura, g: GastoExtraido): InfoLectura {
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

/** Tramos con base y tipo numericos. */
const tramosValidos = (g: GastoExtraido & { tramos?: TramoGasto[] }): TramoGasto[] =>
  (g.tramos ?? []).filter((t) => Number.isFinite(Number(t.base)) && Number.isFinite(Number(t.tipoIva)));

const centimos = (n: number) => Math.round(n * 100);

/**
 * El motivo de la comprobacion CUOTA_TIPO del servidor (validaciones.ts):
 * "El IVA del 21 % no corresponde a su base (sale ... y pone ...)." o, al 0 %,
 * "La base exenta no lleva IVA y pone ...".
 */
const esMotivoCuotaTipo = (m: string) => /^El IVA del .+ no corresponde a su base/.test(m) || /^La base exenta no lleva IVA/.test(m);

/**
 * Tramos cuyo IVA leido no coincide al centimo con el de la linea que se
 * propone al abrir el formulario (la de su tipo): solo diferencias de hasta
 * 5 centimos, las del redondeo. Se compara con la propuesta inicial: el
 * formulario no avisa de los cambios del usuario.
 *
 * El servidor marca el IVA de un tramo (CUOTA_TIPO) cuando se aparta de
 * base x tipo en mas de un centimo por partida de ese tipo, sea cual sea la
 * diferencia. Ese tramo ya sale en "Comprueba estos datos" con una tarjeta que
 * dice cuanto sale y cuanto pone, asi que aqui no se repite. Solo se quita el
 * aviso por ese motivo: si el IVA del tramo esta marcado por otra cosa (poca
 * seguridad al leerlo, calculado a partir de la base...), su tarjeta no habla
 * del descuadre y el aviso sigue saliendo.
 */
function cuotasDescuadradas(
  g: GastoExtraido & { tramos?: TramoGasto[] },
  lineas: FormInicial['lineas'],
  campos: InfoLectura['campos'],
): Array<{ tipoIva: number; leida: number; linea: number }> {
  const conTarjeta = new Set(
    Object.entries(campos)
      .filter(([id, c]) => /^desglose\.\d+\.cuota$/.test(id) && c && c.estado !== 'ok' && typeof c.tipoIva === 'number' && c.motivos.some(esMotivoCuotaTipo))
      .map(([, c]) => c!.tipoIva as number),
  );
  return tramosValidos(g).flatMap((t) => {
    const tipo = Number(t.tipoIva);
    const leida = Number(t.cuota);
    // Con un tipo que no es de los de la app, la linea lleva otro: no se compara.
    if (!Number.isFinite(leida) || tipoIvaMasCercano(tipo) !== tipo || conTarjeta.has(tipo)) return [];
    const suyas = (lineas ?? []).filter((l) => l.tipoIva === tipo);
    if (suyas.length !== 1) return [];
    const linea = calcularLinea({ cantidad: suyas[0].cantidad, precioUnitario: suyas[0].precioUnitario, tipoIva: tipo }).iva;
    const diferencia = Math.abs(centimos(linea) - centimos(leida));
    return diferencia > 0 && diferencia <= 5 ? [{ tipoIva: tipo, leida, linea }] : [];
  });
}

/** Las partidas del unico tramo; vacio si no lo hay o si solo trae el texto neutro. */
function descripcionUnTipo(t: TramoGasto | undefined): string {
  const d = t?.descripcion?.trim() ?? '';
  return d && d !== descripcionNeutraTramo(Number(t!.tipoIva)) ? d : '';
}

/**
 * Lo leido, en la forma del formulario. Con varios tipos de IVA, una linea por
 * tipo con su base (si no, el formulario las juntaria al tipo mayor). De
 * descripcion, las partidas del tramo que manda el servidor. Con un solo tipo,
 * si el servidor solo trae el texto neutro ("Base al 21 %"), el concepto de la
 * factura: la lectura con IA no saca partidas y se perderia ("material de
 * imprenta"); sin concepto, el texto neutro. La cuenta leida va para toda la factura;
 * sin ella, cada linea lleva la cuenta habitual del proveedor.
 */
function inicialDe(g: GastoExtraido & { tramos?: TramoGasto[] }, paisExistente: string | null): FormInicial {
  const tipo = g.tipoGastoSugerido && TIPO_GASTO_INFO[g.tipoGastoSugerido] ? g.tipoGastoSugerido : 'SUMINISTROS';
  const base = Number(g.base) || 0;
  const tipoIva = g.tipoIva !== null && g.tipoIva !== undefined ? tipoIvaMasCercano(g.tipoIva) : base > 0 ? tipoIvaMasCercano(((Number(g.iva) || 0) / base) * 100) : 21;
  const ret = Number(g.tipoRetencion) || 0;
  const nif = (g.nifProveedor ?? '').trim();
  let proveedor: FormInicial['proveedor'] = null;
  if (g.proveedorExistente) {
    proveedor = { tipo: 'existente', id: g.proveedorExistente.id, nombre: g.proveedorExistente.nombreFiscal, nif: g.proveedorExistente.nifCif, pais: paisExistente || 'ES' };
  } else if (g.proveedor || nif) {
    const pais = pareceNifIvaUe(nif) ? (paisDelPrefijo(nif) ?? 'ES') : 'ES';
    proveedor = { tipo: 'nuevo', nombreFiscal: g.proveedor ?? '', nifCif: nif, pais, direccion: '', cp: '', municipio: '', provincia: '' };
  }
  const fecha = g.fecha && /^\d{4}-\d{2}-\d{2}$/.test(g.fecha) ? g.fecha : hoyIso();
  const cuentaLeida = g.cuentaContableBase && /^6\d{2,9}$/.test(g.cuentaContableBase) ? g.cuentaContableBase : null;
  // Sin cuenta leida, cada linea va a la cuenta habitual del proveedor (se puede cambiar con «Cambiar cuenta»).
  const habitual = !cuentaLeida && g.cuentaHabitual ? g.cuentaHabitual.codigo : null;
  const concepto = g.conceptoGasto?.trim() || 'Gasto';
  const tipoRetencion = TIPO_GASTO_INFO[tipo].retenciones.includes(ret) ? ret : 0;
  const tramos = tramosValidos(g);
  const lineas: FormInicial['lineas'] =
    tramos.length > 1
      ? tramos.map((t) => ({
          descripcion: t.descripcion?.trim() || descripcionNeutraTramo(Number(t.tipoIva)),
          cantidad: 1,
          precioUnitario: Number(t.base),
          tipoIva: tipoIvaMasCercano(Number(t.tipoIva)),
          tipoRetencion,
          cuenta: habitual,
        }))
      : [{ descripcion: descripcionUnTipo(tramos[0]) || g.conceptoGasto?.trim() || tramos[0]?.descripcion?.trim() || concepto, cantidad: 1, precioUnitario: base, tipoIva, tipoRetencion, cuenta: habitual }];
  return {
    proveedor,
    numeroFacturaProveedor: g.numeroFactura ?? '',
    fechaEmision: fecha,
    tipoGasto: tipo,
    cuentaGasto: cuentaLeida,
    lineas,
    totalDocumento: Number.isFinite(Number(g.total)) && Number(g.total) !== 0 ? Number(g.total) : undefined,
  };
}

export default function LectorGastosPage() {
  const puedeEscribir = tieneAlgunPermiso(getUser(), ['compras:write']);
  const inputRef = useRef<HTMLInputElement>(null);

  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState('');
  const [leido, setLeido] = useState<GastoExtraido | null>(null);
  const [inicial, setInicial] = useState<FormInicial | null>(null);
  const [tipoDocumento, setTipoDocumento] = useState<GastoExtraido['tipoDocumento']>('factura');
  const [registrado, setRegistrado] = useState<GastoRegistrado | null>(null);
  const [lectura, setLectura] = useState(0);
  const [info, setInfo] = useState<InfoLectura | null>(null);
  const [revisado, setRevisado] = useState(false);
  const [alternativa, setAlternativa] = useState<{ ruta: string; texto: string } | null>(null);
  const [segundos, setSegundos] = useState(0);
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
    setLeyendo(true);
    try {
      const r = await leerFactura('gastos', f, {
        signal: cortar.signal,
        alEmpezar: (id) => {
          lecturaIdRef.current = id;
        },
      });
      const g = r.gasto;
      // El pais del proveedor ya dado de alta (un proveedor extranjero no lleva IVA español).
      let pais: string | null = null;
      if (g.proveedorExistente) {
        pais = await apiFetch<{ pais?: string }>(companyPath(`/proveedores/${encodeURIComponent(g.proveedorExistente.id)}`))
          .then((p) => p.pais ?? null)
          .catch(() => null);
      }
      if (cortar.signal.aborted) return;
      setLeido(g);
      setInfo(conFechaDeHoy(r.lectura, g));
      setTipoDocumento(g.tipoDocumento ?? 'factura');
      setInicial(inicialDe(g, pais));
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

  const alSoltar = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const f = e.dataTransfer.files?.[0];
    if (f) leer(f);
  };

  const noEsFactura = tipoDocumento === 'nomina' || tipoDocumento === 'seguros_sociales';
  const leidaComoNoFactura = leido?.tipoDocumento === 'nomina' || leido?.tipoDocumento === 'seguros_sociales';
  const infoPanel = info && leidaComoNoFactura ? sinTipoDocumento(info) : info;
  // Una rectificativa no se puede registrar como un gasto normal (sumaria en vez de restar).
  const rectificativa = info?.campos.tipoDocumento?.estado === 'error';
  const faltaRevision = !!infoPanel?.requiereRevision && !revisado;
  // Si lo unico marcado era el tipo de documento, "es una factura de gasto" ya es la revision.
  const revisadoEnviado = !!info?.requiereRevision && !infoPanel?.requiereRevision ? !noEsFactura : revisado;
  const esImagen = archivo?.type.startsWith('image/');
  const descuadres = leido && inicial && info ? cuotasDescuadradas(leido, inicial.lineas, info.campos) : [];
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

        {!puedeEscribir ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Para registrar facturas de gasto hace falta el permiso de escritura en Compras.</p>
        ) : registrado ? (
          <div role="status" className="mx-auto flex max-w-2xl flex-col gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-800">
            <p className="flex items-start gap-2 font-medium">
              <CheckCircle size={22} weight="fill" className="mt-0.5 shrink-0" />
              <span>
                Factura registrada (registro {registrado.factura.numeroCompleto}). Su asiento está en borrador: revísalo y apruébalo en el Motor contable.
                {registrado.proveedorCreado && ' El proveedor se ha dado de alta.'}
              </span>
            </p>
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
        ) : !leido || !inicial || !info || !infoPanel ? (
          <div className="mx-auto max-w-2xl">
            {/* Zona para soltar el archivo; con el teclado se usa el boton "Seleccionar archivo". */}
            <div
              onClick={abrirSelector}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={alSoltar}
              className={`rounded-xl border-2 border-dashed border-emerald-200 bg-white p-8 text-center transition-colors md:p-12 ${leyendo ? '' : 'cursor-pointer hover:border-emerald-400'}`}
            >
              <FileArrowUp size={48} weight="duotone" className="mx-auto mb-4 text-accent-600" />
              <h2 className="mb-2 text-lg font-semibold text-slate-900">{leyendo ? 'Leyendo la factura…' : 'Sube el PDF o la foto de la factura'}</h2>
              <p className="mb-6 text-sm text-slate-600">
                {leyendo
                  ? segundos < 10
                    ? 'Tarda unos segundos.'
                    : 'Sigue leyendo; las facturas largas tardan un poco más.'
                  : 'Arrástrala aquí o pulsa para elegirla. PDF, JPG, PNG o WEBP de hasta 4 MB. En el móvil puedes hacer la foto directamente.'}
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
            {/* Vista previa */}
            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 break-all text-sm text-slate-600">{archivo?.name}</p>
                <button type="button" onClick={reiniciar} className="text-sm font-semibold text-blue-600 hover:underline">
                  Leer otra
                </button>
              </div>
              {vista &&
                (esImagen ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={vista} alt="Factura subida" className="max-h-[70vh] w-full rounded-lg border border-slate-200 bg-white object-contain" />
                ) : (
                  <iframe src={vista} title="Factura subida" className="h-[50vh] w-full rounded-lg border border-slate-200 bg-white lg:h-[75vh]" />
                ))}
            </section>

            {/* Datos leidos, editables */}
            <section ref={panelRef} tabIndex={-1} aria-label="Datos leídos" className="flex min-w-0 flex-col gap-4 focus:outline-none">
              <PanelLectura
                info={infoPanel}
                lector="gastos"
                revisado={revisado}
                onRevisado={setRevisado}
                conCasilla={!rectificativa && !leido.duplicada}
                sinArreglo={[...(rectificativa ? ['tipoDocumento'] : []), ...(leido.duplicada ? ['numero'] : [])]}
              />
              {leido.cuentaContableBase && (
                <p className="text-sm text-slate-600">
                  Cuenta sugerida: <span className="font-mono">{leido.cuentaContableBase}</span>
                  {leido.cuentaContableNombre && ` (${leido.cuentaContableNombre})`}
                </p>
              )}
              {!leido.cuentaContableBase && leido.cuentaHabitual && (
                <p className="text-sm text-slate-600">
                  Cuenta habitual de este proveedor: <span className="font-mono">{leido.cuentaHabitual.codigo}</span> {leido.cuentaHabitual.nombre}. La hemos puesto en cada línea; puedes
                  cambiarla con «Cambiar cuenta».
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
                key={lectura}
                modo="lector"
                inicial={inicial}
                extra={{ tipoDocumento, confianza: leido.confianza, lecturaId: info.lecturaId, revisado: revisadoEnviado }}
                bloqueado={
                  rectificativa
                    ? 'Las facturas rectificativas todavía no se pueden registrar con el lector: no la registres como un gasto normal.'
                    : leido.duplicada
                    ? `Ya registraste esta factura (${leido.duplicada.numeroCompleto}): no se registra dos veces.`
                    : noEsFactura
                      ? 'Confirma antes si es una factura de gasto (aviso de arriba).'
                      : faltaRevision
                        ? 'Marca que has revisado los datos señalados (arriba) antes de registrar.'
                        : undefined
                }
                avisoProveedor="No está dado de alta: se creará al registrar la factura."
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
