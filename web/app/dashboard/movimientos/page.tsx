'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowClockwise, CaretLeft, CaretRight, FilePdf, FileXls, FunnelSimple, MagnifyingGlass, X } from '@phosphor-icons/react';
import MargenPagina from '@/components/MargenPagina';
import SelectorAnio from '@/components/SelectorAnio';
import { Tooltip } from '@/app/dashboard/components/Tooltip';
import { BuscadorCuenta } from '@/components/contabilidad/BuscadorCuenta';
import { BuscadorTercero } from '@/components/contabilidad/BuscadorTercero';
import { mensajeSinAcceso, PantallaSinAcceso } from '@/components/dashboard/SinAcceso';
import { apiDownload, apiFetch, companyPath, errorMessage } from '@/lib/api';
import { anioDeTexto, anioEspana } from '@/lib/anios';
import { useAniosEmpresa } from '@/lib/useAniosEmpresa';
import { ponerEnUrl } from '@/lib/urlEstado';
import { motivoDescarga, nombreDescarga } from '@/lib/descargaInforme';
import { fecha, importe } from '@/app/dashboard/informes/TablaInforme';
import {
  filtrosDeUrl,
  filtrosParaUrl,
  hayFiltros,
  importeNormalizado,
  parametrosApuntes,
  partesNombreDescarga,
  PERIODOS,
  POR_PAGINA,
  rangoPeriodo,
  textoPeriodo,
  type Apunte,
  type EstadoFiltro,
  type FiltrosApuntes,
  type RespuestaApuntes,
} from '@/lib/apuntes';

/**
 * Contabilidad > Movimientos: los apuntes de los asientos, es decir, cada cargo
 * y abono de la contabilidad (los asientos aprobados y los que están en
 * borrador, marcados; la regularización y el cierre del ejercicio, solo si se
 * piden, como en el libro diario). Antes leía solo los movimientos anotados a mano (tabla
 * Movement), que ya no se crean, y salía vacía: esos siguen en «Movimientos
 * antiguos» si la empresa tiene alguno.
 */

export default function MovimientosPage() {
  // useSearchParams necesita un Suspense para generar la página.
  return (
    <Suspense fallback={<p className="p-6 text-slate-500">Cargando…</p>}>
      <Movimientos />
    </Suspense>
  );
}

const CAMPO = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
const ETIQUETA = 'block text-xs font-medium text-slate-600';

/** Importe con su moneda, sin partirse en dos líneas. */
const euros = (n: number) => `${importe(n)}\u00a0€`;
const miles = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

/** Filtros puestos aparte del año y el periodo (para el botón «Más filtros» del móvil). */
const filtrosActivos = (f: FiltrosApuntes) =>
  [f.desde || f.hasta, f.cuenta, f.tercero, f.texto.trim(), f.estado !== 'todos', f.importeMin.trim() || f.importeMax.trim(), f.incluirCierre].filter(Boolean).length;

function Movimientos() {
  const sp = useSearchParams();
  const anios = useAniosEmpresa();
  // Año de la URL (al volver de un asiento o una factura) o el año en curso en España.
  const inicial = useRef(filtrosDeUrl(sp, anioDeTexto(sp?.get('ejercicio')) ?? anioEspana()));
  const [form, setForm] = useState<FiltrosApuntes>(inicial.current.filtros);
  const [aplicados, setAplicados] = useState<FiltrosApuntes>(inicial.current.filtros);
  const [pagina, setPagina] = useState(inicial.current.pagina);
  const [datos, setDatos] = useState<RespuestaApuntes | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [sinAcceso, setSinAcceso] = useState<string | null>(null);
  const [descargando, setDescargando] = useState<'' | 'pdf' | 'xlsx'>('');
  const [errorDescarga, setErrorDescarga] = useState('');
  /** Importes mal escritos: el campo se marca y no se busca hasta corregirlo. */
  const [errorImporte, setErrorImporte] = useState<{ min?: string; max?: string }>({});
  const [reintento, setReintento] = useState(0);
  // En el móvil y la tableta, los filtros aparte del año y el periodo se abren con «Más filtros» (abiertos si la URL ya trae alguno).
  const [masFiltros, setMasFiltros] = useState(() => hayFiltros(inicial.current.filtros));
  const resultados = useRef<HTMLElement>(null);

  // Se pide la página de los filtros aplicados; una respuesta que llega tarde (otro filtro ya pedido) no se pinta.
  const peticion = useRef(0);
  useEffect(() => {
    const n = ++peticion.current;
    const p = parametrosApuntes(aplicados);
    p.set('pagina', String(pagina));
    p.set('porPagina', String(POR_PAGINA));
    setCargando(true);
    setError('');
    apiFetch<RespuestaApuntes>(companyPath(`/informes-contables/apuntes?${p}`))
      .then((r) => {
        if (n !== peticion.current) return;
        // Página que ya no existe (p. ej. al volver tras aprobar borradores): a la última que haya.
        if (!r.apuntes.length && r.totales.apuntes > 0 && r.pagina > r.paginas) {
          peticion.current++;
          setPagina(r.paginas);
          ponerEnUrl({ pagina: r.paginas > 1 ? String(r.paginas) : null });
          return;
        }
        setDatos(r);
        setSinAcceso(null);
      })
      .catch((e) => {
        if (n !== peticion.current) return;
        const sinPermiso = mensajeSinAcceso(e);
        if (sinPermiso) setSinAcceso(sinPermiso);
        else setError(errorMessage(e));
        // Lo de antes no se deja a la vista: no es de los filtros pedidos.
        setDatos(null);
      })
      .finally(() => n === peticion.current && setCargando(false));
  }, [aplicados, pagina, reintento]);

  /** Busca con estos filtros desde la primera página y los deja en la URL. */
  const aplicar = useCallback((f: FiltrosApuntes) => {
    const min = importeNormalizado(f.importeMin);
    const max = importeNormalizado(f.importeMax);
    const errores = {
      ...(min === null ? { min: 'Escribe un importe, por ejemplo 1250,50.' } : {}),
      ...(max === null ? { max: 'Escribe un importe, por ejemplo 1250,50.' } : {}),
    };
    if (!errores.min && !errores.max && min && max && Number(min) > Number(max)) errores.min = 'El mínimo es mayor que el máximo.';
    setErrorImporte(errores);
    setForm(f);
    if (errores.min || errores.max) return;
    setAplicados(f);
    setPagina(1);
    setErrorDescarga('');
    ponerEnUrl(filtrosParaUrl(f, 1));
  }, []);

  /** Cambios que se aplican al momento (año, periodo, estado, cliente o proveedor). */
  const cambiarYAplicar = (cambios: Partial<FiltrosApuntes>) => aplicar({ ...form, ...cambios });

  const irAPagina = (n: number) => {
    setPagina(n);
    ponerEnUrl({ pagina: n > 1 ? String(n) : null });
    // Al cambiar de página, al principio de la lista.
    resultados.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const quitarFiltros = () =>
    aplicar({ ...form, desde: '', hasta: '', cuenta: '', tercero: null, texto: '', estado: 'todos', importeMin: '', importeMax: '', incluirCierre: false });

  const descargar = async (formato: 'pdf' | 'xlsx') => {
    // Lo que se está viendo: los filtros aplicados, todas las páginas.
    const p = parametrosApuntes(aplicados);
    p.set('formato', formato);
    const nombre = nombreDescarga(partesNombreDescarga(aplicados, datos?.filtro.tercero?.nombre ?? ''), formato);
    setDescargando(formato);
    setErrorDescarga('');
    try {
      await apiDownload(companyPath(`/informes-contables/apuntes?${p}`), nombre);
    } catch (e) {
      setErrorDescarga(motivoDescarga(e, formato));
    } finally {
      setDescargando('');
    }
  };

  if (sinAcceso) return <PantallaSinAcceso titulo="Movimientos" mensaje={sinAcceso} />;

  const rango = rangoPeriodo(form.ejercicio, form.periodo);
  const totales = datos?.totales;
  const hayApuntes = !!totales && totales.apuntes > 0;
  const conFiltros = hayFiltros(aplicados);
  const puedeDescargar = !!datos && !cargando && !descargando && hayApuntes;
  // Abierto con un enlace (?tercero=): el nombre del cliente o proveedor llega con la respuesta.
  const leido = datos?.filtro.tercero;
  const terceroVisto = form.tercero && !form.tercero.nombre && leido?.id === form.tercero.id ? leido : form.tercero;
  const antiguos = datos?.movimientosAntiguos ?? 0;
  // Apuntes de la regularización y el cierre: fuera por defecto (se avisa y se pueden incluir) o dentro, marcados.
  const deCierre = datos?.totales.deCierre ?? 0;
  const conCierre = !!datos?.filtro.incluirCierre;
  const desdeN = datos ? (datos.pagina - 1) * datos.porPagina + 1 : 0;
  const hastaN = datos ? Math.min(datos.pagina * datos.porPagina, datos.totales.apuntes) : 0;

  return (
    <MargenPagina>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Movimientos</h1>
            <Tooltip text="Cada cargo y abono de los asientos, por fecha. Salen los asientos aprobados y los que están en borrador (marcados); los anulados no salen. La regularización y el cierre del ejercicio solo salen si los incluyes, como en el libro diario. Los asientos se crean al contabilizar facturas, cobros, pagos o nóminas." />
          </div>
          <p className="mt-2 text-slate-600">Apuntes de los asientos: cada cargo y abono de la contabilidad, con filtros y descarga.</p>
          {antiguos > 0 && (
            <p className="mt-1 text-sm text-slate-500">
              <Link href="/dashboard/movimientos/antiguos" className="inline-flex min-h-[44px] items-center underline hover:text-slate-700 lg:min-h-0">
                Movimientos antiguos ({antiguos === 1 ? '1 anotado a mano' : `${miles(antiguos)} anotados a mano`})
              </Link>
            </p>
          )}
        </div>

        {/* Filtros */}
        <form
          role="search"
          aria-label="Filtros de los apuntes"
          onSubmit={(e) => {
            e.preventDefault();
            aplicar(form);
          }}
          className="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
        >
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
            <SelectorAnio
              id="mov-anio"
              etiqueta="Año"
              valor={form.ejercicio}
              anios={anios.anios([form.ejercicio])}
              onChange={(a) => {
                // Al cambiar de año, unas fechas del otro año ya no valen.
                if (a !== null) cambiarYAplicar({ ejercicio: a, desde: '', hasta: '' });
              }}
              className={CAMPO}
              claseEtiqueta={ETIQUETA}
            />
            <div>
              <label htmlFor="mov-periodo" className={ETIQUETA}>
                Periodo
              </label>
              <select id="mov-periodo" value={form.periodo} onChange={(e) => cambiarYAplicar({ periodo: e.target.value, desde: '', hasta: '' })} className={CAMPO}>
                <option value="">Todo el año</option>
                {PERIODOS.map((g) => (
                  <optgroup key={g.grupo} label={g.grupo}>
                    {g.opciones.map((o) => (
                      <option key={o.valor} value={o.valor}>
                        {o.texto}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div id="mov-mas-filtros" className={masFiltros ? 'contents' : 'hidden lg:contents'}>
              <div>
                <label htmlFor="mov-desde" className={ETIQUETA}>
                  Desde
                </label>
                <input id="mov-desde" type="date" min={rango.desde} max={rango.hasta} value={form.desde} onChange={(e) => setForm({ ...form, desde: e.target.value })} className={CAMPO} />
              </div>
              <div>
                <label htmlFor="mov-hasta" className={ETIQUETA}>
                  Hasta
                </label>
                <input id="mov-hasta" type="date" min={form.desde || rango.desde} max={rango.hasta} value={form.hasta} onChange={(e) => setForm({ ...form, hasta: e.target.value })} className={CAMPO} />
              </div>
              <div>
                <label htmlFor="mov-cuenta" className={ETIQUETA}>
                  Cuenta
                </label>
                <BuscadorCuenta id="mov-cuenta" valor={form.cuenta} onCambiar={(v) => setForm((f) => ({ ...f, cuenta: v }))} placeholder="572 o banco" />
              </div>
              <div>
                <label htmlFor="mov-estado" className={ETIQUETA}>
                  Estado
                </label>
                <select id="mov-estado" value={form.estado} onChange={(e) => cambiarYAplicar({ estado: e.target.value as EstadoFiltro })} className={CAMPO}>
                  <option value="todos">Todos</option>
                  <option value="aprobados">Solo aprobados</option>
                  <option value="borradores">Solo borradores</option>
                </select>
              </div>
              <div className="col-span-2">
                <label htmlFor={terceroVisto ? undefined : 'mov-tercero'} className={ETIQUETA}>
                  Cliente o proveedor
                </label>
                <BuscadorTercero id="mov-tercero" elegido={terceroVisto} onElegir={(t) => cambiarYAplicar({ tercero: t })} />
                {terceroVisto && (
                  <p className="mt-1 text-xs text-slate-500">
                    Salen los apuntes de su cuenta: sus facturas y lo cobrado o pagado. Las líneas de ventas, compras o IVA de sus facturas no salen.
                  </p>
                )}
              </div>
              <div className="col-span-2">
                <label htmlFor="mov-texto" className={ETIQUETA}>
                  Texto
                </label>
                <div className="relative">
                  <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 mt-0.5 -translate-y-1/2 text-slate-400" aria-hidden />
                  <input
                    id="mov-texto"
                    type="search"
                    value={form.texto}
                    maxLength={100}
                    onChange={(e) => setForm({ ...form, texto: e.target.value })}
                    placeholder="Concepto, asiento o factura"
                    className={`${CAMPO} pl-9`}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="mov-min" className={ETIQUETA}>
                  Importe desde
                </label>
                <input
                  id="mov-min"
                  inputMode="decimal"
                  autoComplete="off"
                  value={form.importeMin}
                  onChange={(e) => setForm({ ...form, importeMin: e.target.value })}
                  placeholder="0,00"
                  aria-invalid={!!errorImporte.min}
                  aria-describedby={errorImporte.min ? 'mov-min-error' : undefined}
                  className={`${CAMPO} text-right font-mono ${errorImporte.min ? 'border-red-500 bg-red-50' : ''}`}
                />
                {errorImporte.min && (
                  <p id="mov-min-error" className="mt-1 text-xs text-red-700">
                    {errorImporte.min}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="mov-max" className={ETIQUETA}>
                  Importe hasta
                </label>
                <input
                  id="mov-max"
                  inputMode="decimal"
                  autoComplete="off"
                  value={form.importeMax}
                  onChange={(e) => setForm({ ...form, importeMax: e.target.value })}
                  placeholder="Sin límite"
                  aria-invalid={!!errorImporte.max}
                  aria-describedby={errorImporte.max ? 'mov-max-error' : undefined}
                  className={`${CAMPO} text-right font-mono ${errorImporte.max ? 'border-red-500 bg-red-50' : ''}`}
                />
                {errorImporte.max && (
                  <p id="mov-max-error" className="mt-1 text-xs text-red-700">
                    {errorImporte.max}
                  </p>
                )}
              </div>
              <div className="col-span-2 lg:col-span-4 xl:col-span-6">
                <label htmlFor="mov-cierre" className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-slate-700 lg:min-h-0">
                  <input
                    id="mov-cierre"
                    type="checkbox"
                    checked={form.incluirCierre}
                    onChange={(e) => cambiarYAplicar({ incluirCierre: e.target.checked })}
                    aria-describedby="mov-cierre-ayuda"
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Incluir la regularización y el cierre del ejercicio
                </label>
                <p id="mov-cierre-ayuda" className="text-xs text-slate-500">
                  Dejan las cuentas a cero el 31 de diciembre. Sin ellos, como en el libro diario, la diferencia de una cuenta o de un cliente es su saldo.
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            aria-expanded={masFiltros}
            aria-controls="mov-mas-filtros"
            onClick={() => setMasFiltros((v) => !v)}
            className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 lg:hidden"
          >
            <FunnelSimple size={16} aria-hidden />
            {masFiltros ? 'Menos filtros' : 'Más filtros'}
            {!masFiltros && filtrosActivos(form) > 0 && <span className="text-slate-500">({filtrosActivos(form)} puesto{filtrosActivos(form) === 1 ? '' : 's'})</span>}
          </button>

          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 lg:flex-row lg:flex-wrap lg:items-center">
            <button type="submit" className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 lg:min-h-0">
              <MagnifyingGlass size={16} aria-hidden /> Buscar
            </button>
            {hayFiltros(form) && (
              <button
                type="button"
                onClick={quitarFiltros}
                className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 lg:min-h-0"
              >
                <X size={14} aria-hidden /> Quitar filtros
              </button>
            )}
            <p className="text-xs text-slate-500 lg:flex-1">El año, el periodo, el estado, el cliente o proveedor y la casilla del cierre se aplican al elegirlos; lo escrito, al pulsar Buscar.</p>
            <div className="grid grid-cols-2 gap-2 lg:flex">
              <button
                type="button"
                disabled={!puedeDescargar}
                onClick={() => descargar('pdf')}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 lg:min-h-0"
              >
                <FilePdf size={16} aria-hidden /> {descargando === 'pdf' ? 'Preparando…' : 'PDF'}
              </button>
              <button
                type="button"
                disabled={!puedeDescargar}
                onClick={() => descargar('xlsx')}
                className="flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 lg:min-h-0"
              >
                <FileXls size={16} aria-hidden /> {descargando === 'xlsx' ? 'Preparando…' : 'Excel'}
              </button>
            </div>
          </div>
        </form>

        {errorDescarga && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {errorDescarga}
          </p>
        )}

        {error && (
          <div role="alert" className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
            <span>No se han podido cargar los apuntes: {error}</span>
            <button
              type="button"
              onClick={() => setReintento((n) => n + 1)}
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 self-start rounded-lg border border-red-200 bg-white px-3 py-1.5 font-medium text-red-700 hover:bg-red-50 lg:min-h-0"
            >
              <ArrowClockwise size={14} aria-hidden /> Reintentar
            </button>
          </div>
        )}

        {/* La regularización y el cierre: cuántos se han dejado fuera, o que salen y la diferencia ya no es el saldo. */}
        {datos && hayApuntes && deCierre > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 sm:flex-row sm:items-center sm:justify-between">
            <p>
              {conCierre
                ? `Incluye ${deCierre === 1 ? 'un apunte' : `${miles(deCierre)} apuntes`} de la regularización y el cierre del ejercicio, ${deCierre === 1 ? 'marcado' : 'marcados'}. Dejan las cuentas a cero, así que la diferencia ya no es el saldo.`
                : `${deCierre === 1 ? 'No sale un apunte' : `No salen ${miles(deCierre)} apuntes`} de la regularización y el cierre del ejercicio, como en el libro diario: dejan las cuentas a cero el 31 de diciembre.`}
            </p>
            <button
              type="button"
              onClick={() => cambiarYAplicar({ incluirCierre: !conCierre })}
              className="inline-flex min-h-[44px] shrink-0 items-center self-start font-semibold text-blue-700 underline hover:text-blue-800 sm:self-auto lg:min-h-0"
            >
              {conCierre ? 'Quitarlos' : 'Incluirlos'}
            </button>
          </div>
        )}

        {/* Totales del filtro (de todas las páginas) */}
        {totales && hayApuntes && (
          <section aria-label="Totales del filtro">
            {/* En el móvil y la tableta, una fila por total (etiqueta a la izquierda, cifra a la derecha); desde 1024 px, tres tarjetas. */}
            <dl className="grid grid-cols-1 gap-2 lg:grid-cols-3 lg:gap-3">
              <div className="flex items-baseline justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 lg:block lg:p-4">
                <dt className="text-sm text-slate-500">Debe</dt>
                <dd className="font-mono text-lg font-semibold tabular-nums text-slate-900 lg:text-xl">{euros(totales.debe)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 lg:block lg:p-4">
                <dt className="text-sm text-slate-500">Haber</dt>
                <dd className="font-mono text-lg font-semibold tabular-nums text-slate-900 lg:text-xl">{euros(totales.haber)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 lg:block lg:p-4">
                <dt className="text-sm text-slate-600">Diferencia (Debe − Haber)</dt>
                <dd className="text-right lg:text-left">
                  <span className="block font-mono text-lg font-semibold tabular-nums text-slate-900 lg:text-xl">{euros(totales.diferencia)}</span>
                  <span className="block text-xs text-slate-600">
                    {totales.diferencia > 0 ? 'Saldo deudor' : totales.diferencia < 0 ? 'Saldo acreedor' : conFiltros ? 'Sin saldo' : 'Cuadra'}
                  </span>
                </dd>
              </div>
            </dl>
          </section>
        )}

        <section ref={resultados} aria-labelledby="mov-resultados" aria-busy={cargando} className={`scroll-mt-4 space-y-3 ${error && !datos && !cargando ? 'hidden' : ''}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="mov-resultados" className="text-lg font-semibold text-slate-900">
              Apuntes
            </h2>
            <p aria-live="polite" className="text-sm text-slate-500">
              {cargando && !datos
                ? 'Cargando apuntes…'
                : totales && hayApuntes
                  ? `${miles(desdeN)}-${miles(hastaN)} de ${miles(totales.apuntes)} ${totales.apuntes === 1 ? 'apunte' : 'apuntes'}${totales.enBorrador ? ` · ${miles(totales.enBorrador)} en borrador` : ''}${cargando ? ' · actualizando…' : ''}`
                  : ''}
            </p>
          </div>

          {cargando && !datos ? (
            <div className="space-y-2" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100" />
              ))}
            </div>
          ) : datos && !hayApuntes ? (
            <EstadoVacio
              filtros={aplicados}
              conFiltros={conFiltros}
              onQuitar={quitarFiltros}
              deCierre={conCierre ? 0 : deCierre}
              onIncluirCierre={() => cambiarYAplicar({ incluirCierre: true })}
            />
          ) : datos ? (
            <>
              <TablaApuntes apuntes={datos.apuntes} atenuada={cargando} />
              <ListaApuntes apuntes={datos.apuntes} atenuada={cargando} />
              {datos.paginas > 1 && (
                <nav aria-label="Páginas de apuntes" className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={datos.pagina <= 1 || cargando}
                    onClick={() => irAPagina(datos.pagina - 1)}
                    className="flex min-h-[44px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <CaretLeft size={14} aria-hidden /> Anterior
                  </button>
                  <span className="text-sm text-slate-600">
                    Página {miles(datos.pagina)} de {miles(datos.paginas)}
                  </span>
                  <button
                    type="button"
                    disabled={datos.pagina >= datos.paginas || cargando}
                    onClick={() => irAPagina(datos.pagina + 1)}
                    className="flex min-h-[44px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Siguiente <CaretRight size={14} aria-hidden />
                  </button>
                </nav>
              )}
              <p className="text-xs text-slate-500">
                Por fecha de asiento. Los asientos en borrador aún no cuentan en el mayor ni en los informes: se aprueban en el Motor contable. Pulsa el número de
                asiento para verlo y el documento para abrir la factura, el cobro o la nómina.
              </p>
            </>
          ) : null}
        </section>
      </div>
    </MargenPagina>
  );
}

function EstadoVacio({
  filtros,
  conFiltros,
  onQuitar,
  deCierre,
  onIncluirCierre,
}: {
  filtros: FiltrosApuntes;
  conFiltros: boolean;
  onQuitar: () => void;
  /** Apuntes de la regularización y el cierre que se han dejado fuera. */
  deCierre: number;
  onIncluirCierre: () => void;
}) {
  if (deCierre > 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
        <p className="font-medium text-slate-700">
          En {textoPeriodo(filtros.ejercicio, filtros.periodo)} solo {deCierre === 1 ? 'hay un apunte' : `hay ${miles(deCierre)} apuntes`} de la regularización y el cierre del ejercicio.
        </p>
        <p className="mt-1 text-sm text-slate-500">No salen salvo que los incluyas, como en el libro diario: dejan las cuentas a cero el 31 de diciembre.</p>
        <button type="button" onClick={onIncluirCierre} className="mt-3 inline-flex min-h-[44px] items-center text-sm font-semibold text-accent-600 hover:text-accent-700">
          Incluirlos
        </button>
      </div>
    );
  }
  if (conFiltros) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
        <p className="font-medium text-slate-700">Ningún apunte coincide con estos filtros en {textoPeriodo(filtros.ejercicio, filtros.periodo)}.</p>
        <p className="mt-1 text-sm text-slate-500">Prueba con otra cuenta, otro texto o un periodo más amplio.</p>
        <button type="button" onClick={onQuitar} className="mt-3 inline-flex min-h-[44px] items-center text-sm font-semibold text-accent-600 hover:text-accent-700">
          Quitar filtros
        </button>
      </div>
    );
  }
  const cuando = filtros.periodo ? textoPeriodo(filtros.ejercicio, filtros.periodo) : String(filtros.ejercicio);
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
      <p className="font-medium text-slate-700">Todavía no hay asientos en {cuando}.</p>
      <p className="mt-1 text-sm text-slate-500">Se crean al contabilizar facturas, cobros o nóminas.</p>
    </div>
  );
}

/** Insignia de un asiento que aún no está aprobado. */
function Borrador() {
  return <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">Borrador</span>;
}

/** Insignia de un apunte de la regularización o del cierre del ejercicio (solo salen si se piden). */
function TipoCierre({ a }: { a: Apunte }) {
  if (a.tipoAsiento !== 'REGULARIZACION' && a.tipoAsiento !== 'CIERRE') return null;
  return (
    <span className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
      {a.tipoAsiento === 'REGULARIZACION' ? 'Regularización' : 'Cierre'}
    </span>
  );
}

/** Documento de origen (con su enlace si lo tiene) y cliente o proveedor. */
function OrigenApunte({ a }: { a: Apunte }) {
  if (!a.documento && !a.tercero) return null;
  return (
    <span className="text-xs text-slate-500">
      {a.documento &&
        (a.documento.enlace ? (
          <Link href={a.documento.enlace} className="font-medium text-blue-600 hover:underline">
            {a.documento.texto}
          </Link>
        ) : (
          a.documento.texto
        ))}
      {a.documento && a.tercero && ' · '}
      {a.tercero && <span>{a.tercero.nombre || (a.tercero.tipo === 'cliente' ? 'Cliente' : 'Proveedor')}</span>}
    </span>
  );
}

const enlaceAsiento = (a: Apunte) => (
  <Link href={a.enlaceAsiento} className="whitespace-nowrap font-mono text-blue-600 hover:underline" aria-label={`Ver el asiento ${a.asiento}${a.estado === 'BORRADOR' ? ' (en borrador)' : ''}${a.tipoAsiento === 'REGULARIZACION' ? ' (regularización)' : a.tipoAsiento === 'CIERRE' ? ' (cierre)' : ''}`}>
    {a.asiento}
  </Link>
);

/** Escritorio (1024 px o más): tabla. */
function TablaApuntes({ apuntes, atenuada }: { apuntes: Apunte[]; atenuada: boolean }) {
  return (
    <div className={`hidden overflow-x-auto rounded-lg border border-slate-200 bg-white lg:block ${atenuada ? 'opacity-60' : ''}`}>
      <table className="w-full min-w-[760px] text-sm">
        <caption className="sr-only">Apuntes de los asientos: fecha, asiento, cuenta, concepto con su documento y su cliente o proveedor, Debe y Haber.</caption>
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-3 py-3 font-medium">Fecha</th>
            <th scope="col" className="px-3 py-3 font-medium">Asiento</th>
            <th scope="col" className="px-3 py-3 font-medium">Cuenta</th>
            <th scope="col" className="px-3 py-3 font-medium">Concepto</th>
            <th scope="col" className="px-3 py-3 text-right font-medium">Debe</th>
            <th scope="col" className="px-3 py-3 text-right font-medium">Haber</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {apuntes.map((a) => (
            <tr key={a.id} className={`align-top ${a.estado === 'BORRADOR' ? 'bg-amber-50' : ''}`}>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">{fecha(a.fecha)}</td>
              <td className="px-3 py-2">
                <div className="flex flex-col items-start gap-1">
                  {enlaceAsiento(a)}
                  {a.estado === 'BORRADOR' && <Borrador />}
                  <TipoCierre a={a} />
                </div>
              </td>
              <td className="max-w-[220px] px-3 py-2">
                <div className="font-mono text-slate-900">{a.cuenta}</div>
                {a.nombreCuenta && <div className="truncate text-xs text-slate-500" title={a.nombreCuenta}>{a.nombreCuenta}</div>}
              </td>
              <td className="px-3 py-2">
                <div className="text-slate-900">{a.concepto}</div>
                <OrigenApunte a={a} />
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-slate-900">{a.debe ? importe(a.debe) : ''}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums text-slate-900">{a.haber ? importe(a.haber) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Móvil y tableta: una tarjeta por apunte. */
function ListaApuntes({ apuntes, atenuada }: { apuntes: Apunte[]; atenuada: boolean }) {
  return (
    <ul className={`space-y-2 lg:hidden ${atenuada ? 'opacity-60' : ''}`}>
      {apuntes.map((a) => (
        <li key={a.id} className={`rounded-lg border p-3 ${a.estado === 'BORRADOR' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="tabular-nums text-slate-600">{fecha(a.fecha)}</span>
            <span aria-hidden className="text-slate-400">·</span>
            {enlaceAsiento(a)}
            {a.estado === 'BORRADOR' && <Borrador />}
            <TipoCierre a={a} />
          </div>
          <div className="mt-1.5 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-slate-900">
                <span className="font-mono">{a.cuenta}</span>
                {a.nombreCuenta && <span className="text-slate-600"> · {a.nombreCuenta}</span>}
              </div>
              <div className="mt-0.5 break-words text-sm text-slate-700">{a.concepto}</div>
              <OrigenApunte a={a} />
            </div>
            <dl className="shrink-0 text-right">
              {a.debe !== 0 && (
                <div>
                  <dt className="text-xs text-slate-500">Debe</dt>
                  <dd className="font-mono text-base font-semibold tabular-nums text-slate-900">{importe(a.debe)}</dd>
                </div>
              )}
              {a.haber !== 0 && (
                <div>
                  <dt className="text-xs text-slate-500">Haber</dt>
                  <dd className="font-mono text-base font-semibold tabular-nums text-slate-900">{importe(a.haber)}</dd>
                </div>
              )}
            </dl>
          </div>
        </li>
      ))}
    </ul>
  );
}
