'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  ArrowSquareOut,
  ArrowsClockwise,
  CaretDown,
  CaretRight,
  DownloadSimple,
  FileZip,
  FolderOpen,
  Paperclip,
  UploadSimple,
  X,
} from '@phosphor-icons/react';
import { apiDownload, apiFetch, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';

/**
 * Archivo de facturas por año y trimestre: todo el historial de ventas y
 * gastos, ordenado como lo pide Hacienda. Cada factura emitida o registrada se
 * guarda sola en su carpeta; aquí se consulta, se descarga y se completa.
 */

interface Resumen {
  n: number;
  total: number;
}

interface TrimestreArbol {
  trimestre: number;
  ventas: Resumen;
  gastos: Resumen;
}

interface AnioArbol {
  anio: number;
  ventas: Resumen;
  gastos: Resumen;
  trimestres: TrimestreArbol[];
}

interface Elemento {
  facturaId: string | null;
  numero: string | null;
  fecha: string;
  tercero: string | null;
  nif: string | null;
  base: number;
  iva: number;
  total: number;
  documentoId: string | null;
  archivoNombre: string | null;
  tieneArchivo: boolean;
  descargable: boolean;
  origen: string | null;
}

interface Listado {
  anio: number;
  trimestre: number;
  ventas: Elemento[];
  gastos: Elemento[];
}

interface Seleccion {
  anio: number;
  trimestre: number;
}

type Pestana = 'ventas' | 'gastos';

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const fechaEs = (f: string) => (/^\d{4}-\d{2}-\d{2}/.test(f) ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : f);
const NOMBRE_T = ['', 'Enero – marzo', 'Abril – junio', 'Julio – septiembre', 'Octubre – diciembre'];

/** Trimestre de hoy: es el que se abre al entrar si tiene algo. */
function trimestreActual(): Seleccion {
  const hoy = new Date();
  return { anio: hoy.getFullYear(), trimestre: Math.floor(hoy.getMonth() / 3) + 1 };
}

export default function ArchivoPage() {
  const puedeEditar = tieneAlgunPermiso(getUser(), ['contabilidad:write']);
  const [arbol, setArbol] = useState<AnioArbol[]>([]);
  const [cargandoArbol, setCargandoArbol] = useState(true);
  const [errorArbol, setErrorArbol] = useState(false);
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());
  const [sel, setSel] = useState<Seleccion | null>(null);
  const [listado, setListado] = useState<Listado | null>(null);
  const [cargandoListado, setCargandoListado] = useState(false);
  const [pestana, setPestana] = useState<Pestana>('ventas');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [subiendo, setSubiendo] = useState<{ tipo: Pestana; adjuntarA?: Elemento } | null>(null);
  const [regenerando, setRegenerando] = useState(false);
  const [descargandoZip, setDescargandoZip] = useState(false);

  const cargarArbol = useCallback(async () => {
    try {
      const datos = await apiFetch<AnioArbol[]>(companyPath('/archivo/arbol'));
      setArbol(datos);
      setErrorArbol(false);
      return datos;
    } catch (e) {
      setErrorArbol(true);
      setError(`No se pudo cargar el archivo: ${errorMessage(e)}`);
      return null;
    } finally {
      setCargandoArbol(false);
    }
  }, []);

  const cargarListado = useCallback(async (s: Seleccion) => {
    setCargandoListado(true);
    try {
      setListado(await apiFetch<Listado>(companyPath(`/archivo/trimestre?anio=${s.anio}&trimestre=${s.trimestre}`)));
    } catch (e) {
      setListado(null);
      setError(errorMessage(e));
    } finally {
      setCargandoListado(false);
    }
  }, []);

  // Al entrar: árbol, y se abre el trimestre actual (o el último con facturas).
  useEffect(() => {
    (async () => {
      const datos = await cargarArbol();
      if (!datos || datos.length === 0) return;
      const actual = trimestreActual();
      let inicial: Seleccion = actual;
      const conAlgo = datos.flatMap((a) => [...a.trimestres].reverse().filter((t) => t.ventas.n + t.gastos.n > 0).map((t) => ({ anio: a.anio, trimestre: t.trimestre })));
      const actualTiene = conAlgo.some((s) => s.anio === actual.anio && s.trimestre === actual.trimestre);
      if (!actualTiene && conAlgo.length > 0) inicial = conAlgo[0];
      setAbiertos(new Set([inicial.anio]));
      setSel(inicial);
    })();
  }, [cargarArbol]);

  useEffect(() => {
    if (sel) cargarListado(sel);
  }, [sel, cargarListado]);

  const recargarTodo = async () => {
    await cargarArbol();
    if (sel) await cargarListado(sel);
  };

  const elegir = (s: Seleccion) => {
    setError('');
    setAviso('');
    setSel(s);
  };

  const alternarAnio = (anio: number) => {
    setAbiertos((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(anio)) nuevo.delete(anio);
      else nuevo.add(anio);
      return nuevo;
    });
  };

  const descargarZip = async () => {
    if (!sel) return;
    setDescargandoZip(true);
    setError('');
    try {
      await apiDownload(companyPath(`/archivo/trimestre/zip?anio=${sel.anio}&trimestre=${sel.trimestre}`), `facturas_${sel.anio}_${sel.trimestre}T.zip`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDescargandoZip(false);
    }
  };

  const completarHistorial = async () => {
    setRegenerando(true);
    setError('');
    setAviso('');
    try {
      let ventas = 0;
      let gastos = 0;
      let errores = 0;
      // El servidor archiva por tandas: se repite mientras queden pendientes.
      for (let vuelta = 0; vuelta < 20; vuelta++) {
        const r = await apiFetch<{ ventas: number; gastos: number; errores: number; pendientes: number }>(companyPath('/archivo/regenerar'), {
          method: 'POST',
          body: JSON.stringify({}),
        });
        ventas += r.ventas;
        gastos += r.gastos;
        errores += r.errores;
        if (r.pendientes === 0 || r.ventas + r.gastos === 0) break;
      }
      setAviso(
        ventas + gastos === 0
          ? 'El historial ya estaba completo: todas las facturas tienen su sitio en el archivo.'
          : `Historial completado: ${ventas} ${ventas === 1 ? 'venta' : 'ventas'} y ${gastos} ${gastos === 1 ? 'gasto' : 'gastos'} archivados en su trimestre.` +
              (errores ? ` ${errores} no se ${errores === 1 ? 'ha' : 'han'} podido archivar; vuelve a intentarlo más tarde.` : ''),
      );
      await recargarTodo();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRegenerando(false);
    }
  };

  const descargar = async (e: Elemento, tipo: Pestana) => {
    setError('');
    const nombre = `${e.fecha}_${(e.numero ?? 'factura').replace(/[^\w.-]+/g, '-')}`;
    try {
      if (e.documentoId && (tipo === 'gastos' || !e.facturaId)) {
        await apiDownload(companyPath(`/archivo/${e.documentoId}/descargar`), e.archivoNombre || nombre);
      } else if (tipo === 'ventas' && e.facturaId) {
        await apiDownload(companyPath(`/archivo/ventas/${e.facturaId}/pdf`), `${nombre}.pdf`);
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const datosSel = sel ? arbol.find((a) => a.anio === sel.anio)?.trimestres[sel.trimestre - 1] : undefined;
  const filas = listado ? listado[pestana] : [];
  const sumas = filas.reduce((s, f) => ({ base: s.base + f.base, iva: s.iva + f.iva, total: s.total + f.total }), { base: 0, iva: 0, total: 0 });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold text-slate-900">
            <Archive size={30} weight="duotone" className="text-emerald-600" /> Archivo
          </h1>
          <p className="mt-2 text-slate-600">Todas tus facturas de ventas y gastos, ordenadas por año y trimestre. Cada factura nueva se guarda sola en su carpeta.</p>
        </div>
        {puedeEditar && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={completarHistorial}
              disabled={regenerando}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              title="Archiva las facturas antiguas que todavía no tienen copia en el archivo"
            >
              <ArrowsClockwise size={18} className={regenerando ? 'animate-spin' : ''} />
              {regenerando ? 'Completando…' : 'Completar historial'}
            </button>
            <button
              onClick={() => setSubiendo({ tipo: pestana })}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              <UploadSimple size={18} /> Subir factura
            </button>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {aviso && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {aviso}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        {/* Árbol Año ▸ trimestres */}
        <nav aria-label="Años y trimestres" className="rounded-lg border border-slate-200 bg-white p-2 lg:self-start">
          {cargandoArbol && <p className="p-3 text-sm text-slate-500">Cargando archivo…</p>}
          {!cargandoArbol && errorArbol && (
            <div className="p-3 text-sm text-slate-500">
              <p>No se ha podido leer el archivo.</p>
              <button onClick={() => { setError(''); setCargandoArbol(true); cargarArbol(); }} className="mt-2 font-medium text-emerald-700 hover:underline">
                Reintentar
              </button>
            </div>
          )}
          {!cargandoArbol && !errorArbol && arbol.length === 0 && <p className="p-3 text-sm text-slate-500">Todavía no hay facturas en el archivo.</p>}
          <ul className="space-y-1">
            {arbol.map((a) => {
              const abierto = abiertos.has(a.anio);
              return (
                <li key={a.anio}>
                  <button
                    onClick={() => alternarAnio(a.anio)}
                    aria-expanded={abierto}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50"
                  >
                    {abierto ? <CaretDown size={14} /> : <CaretRight size={14} />}
                    <FolderOpen size={18} className="text-amber-500" weight={abierto ? 'fill' : 'regular'} />
                    <span className="flex-1">{a.anio}</span>
                    <span className="text-xs font-normal text-slate-500">
                      {a.ventas.n + a.gastos.n} {a.ventas.n + a.gastos.n === 1 ? 'factura' : 'facturas'}
                    </span>
                  </button>
                  {abierto && (
                    <ul className="mb-1 ml-5 grid grid-cols-2 gap-1 border-l border-slate-100 pl-2 sm:grid-cols-4 lg:grid-cols-1">
                      {a.trimestres.map((t) => {
                        const activo = sel?.anio === a.anio && sel?.trimestre === t.trimestre;
                        const vacio = t.ventas.n + t.gastos.n === 0;
                        return (
                          <li key={t.trimestre}>
                            <button
                              onClick={() => elegir({ anio: a.anio, trimestre: t.trimestre })}
                              aria-current={activo ? 'true' : undefined}
                              className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${
                                activo ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : vacio ? 'text-slate-400 hover:bg-slate-50' : 'text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              <span className="font-medium">{t.trimestre}T</span>
                              <span className="ml-2 inline-flex gap-1.5 text-xs">
                                <span title="Facturas de venta" className="rounded bg-blue-50 px-1.5 text-blue-700">
                                  {t.ventas.n} V
                                </span>
                                <span title="Facturas de gasto" className="rounded bg-orange-50 px-1.5 text-orange-700">
                                  {t.gastos.n} G
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Trimestre elegido */}
        <section className="min-w-0 space-y-4">
          {!sel && !cargandoArbol && !errorArbol && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">Elige un año y un trimestre para ver sus facturas.</div>
          )}

          {sel && (
            <>
              <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">
                    {sel.trimestre}.º trimestre de {sel.anio}
                  </h2>
                  <p className="text-sm text-slate-500">{NOMBRE_T[sel.trimestre]}</p>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <div>
                    <p className="text-slate-500">Ventas</p>
                    <p className="font-semibold text-blue-700">{eur.format(datosSel?.ventas.total ?? 0)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Gastos</p>
                    <p className="font-semibold text-orange-700">{eur.format(datosSel?.gastos.total ?? 0)}</p>
                  </div>
                  <button
                    onClick={descargarZip}
                    disabled={descargandoZip || !datosSel || datosSel.ventas.n + datosSel.gastos.n === 0}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    <FileZip size={18} /> {descargandoZip ? 'Preparando…' : 'Descargar trimestre (ZIP)'}
                  </button>
                </div>
              </div>

              <div className="flex gap-2 border-b border-slate-200" role="tablist">
                {(['ventas', 'gastos'] as Pestana[]).map((p) => (
                  <button
                    key={p}
                    role="tab"
                    aria-selected={pestana === p}
                    onClick={() => setPestana(p)}
                    className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${pestana === p ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                  >
                    {p === 'ventas' ? 'Ventas' : 'Gastos'} <span className="ml-1 text-xs text-slate-400">{listado ? listado[p].length : ''}</span>
                  </button>
                ))}
              </div>

              {cargandoListado && <p className="text-sm text-slate-500">Cargando facturas…</p>}

              {!cargandoListado && listado && filas.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
                  <p className="text-slate-600">No hay facturas de {pestana === 'ventas' ? 'venta' : 'gasto'} en este trimestre.</p>
                  {puedeEditar && (
                    <button onClick={() => setSubiendo({ tipo: pestana })} className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-emerald-700 hover:underline">
                      <UploadSimple size={16} /> Subir una factura
                    </button>
                  )}
                </div>
              )}

              {!cargandoListado && filas.length > 0 && (
                <>
                  {/* Móvil: tarjetas */}
                  <ul className="space-y-2 md:hidden">
                    {filas.map((f, i) => (
                      <li key={f.facturaId ?? f.documentoId ?? i} className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900">{f.tercero || 'Sin nombre'}</p>
                            <p className="text-xs text-slate-500">
                              {fechaEs(f.fecha)} ·{' '}
                              {pestana === 'ventas' && f.facturaId ? (
                                <Link href={`/dashboard/facturas/${f.facturaId}`} className="text-blue-700 underline">
                                  {f.numero || 'ver factura'}
                                </Link>
                              ) : (
                                f.numero || 'sin número'
                              )}{' '}
                              {f.nif ? `· ${f.nif}` : ''}
                            </p>
                          </div>
                          <p className="whitespace-nowrap font-semibold text-slate-900">{eur.format(f.total)}</p>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                          <span>
                            Base {eur.format(f.base)} · IVA {eur.format(f.iva)}
                          </span>
                          <Acciones f={f} tipo={pestana} puedeEditar={puedeEditar} onDescargar={descargar} onAdjuntar={(el) => setSubiendo({ tipo: pestana, adjuntarA: el })} />
                        </div>
                      </li>
                    ))}
                  </ul>

                  {/* Escritorio: tabla */}
                  <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white md:block">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Fecha</th>
                          <th className="px-3 py-2">Número</th>
                          <th className="px-3 py-2">{pestana === 'ventas' ? 'Cliente' : 'Proveedor'}</th>
                          <th className="px-3 py-2">NIF</th>
                          <th className="px-3 py-2 text-right">Base</th>
                          <th className="px-3 py-2 text-right">IVA</th>
                          <th className="px-3 py-2 text-right">Total</th>
                          <th className="px-3 py-2 text-right">
                            <span className="sr-only">Acciones</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filas.map((f, i) => (
                          <tr key={f.facturaId ?? f.documentoId ?? i} className="hover:bg-slate-50">
                            <td className="whitespace-nowrap px-3 py-2 text-slate-600">{fechaEs(f.fecha)}</td>
                            <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">
                              {pestana === 'ventas' && f.facturaId ? (
                                <Link href={`/dashboard/facturas/${f.facturaId}`} className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                                  {f.numero || 'Ver'} <ArrowSquareOut size={12} />
                                </Link>
                              ) : (
                                f.numero || <span className="text-slate-400">—</span>
                              )}
                              {!f.facturaId && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal text-slate-500">subida</span>}
                            </td>
                            <td className="max-w-[16rem] truncate px-3 py-2 text-slate-700">{f.tercero || <span className="text-slate-400">—</span>}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-slate-600">{f.nif || <span className="text-slate-400">—</span>}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{eur.format(f.base)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{eur.format(f.iva)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums">{eur.format(f.total)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right">
                              <Acciones f={f} tipo={pestana} puedeEditar={puedeEditar} onDescargar={descargar} onAdjuntar={(el) => setSubiendo({ tipo: pestana, adjuntarA: el })} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 font-semibold text-slate-800">
                        <tr>
                          <td className="px-3 py-2" colSpan={4}>
                            Total del trimestre
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{eur.format(sumas.base)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{eur.format(sumas.iva)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{eur.format(sumas.total)}</td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>

      {subiendo && (
        <SubirFacturaModal
          tipoInicial={subiendo.tipo}
          adjuntarA={subiendo.adjuntarA}
          onCerrar={() => setSubiendo(null)}
          onSubida={async (fecha, tipo, texto) => {
            setSubiendo(null);
            setAviso(texto);
            setError('');
            const m = /^(\d{4})-(\d{2})/.exec(fecha);
            const destino = m ? { anio: parseInt(m[1], 10), trimestre: Math.ceil(parseInt(m[2], 10) / 3) } : sel;
            await cargarArbol();
            if (destino) {
              setAbiertos((prev) => new Set(prev).add(destino.anio));
              setPestana(tipo);
              if (sel && destino.anio === sel.anio && destino.trimestre === sel.trimestre) await cargarListado(destino);
              else setSel(destino);
            }
          }}
        />
      )}
    </div>
  );
}

function Acciones({
  f,
  tipo,
  puedeEditar,
  onDescargar,
  onAdjuntar,
}: {
  f: Elemento;
  tipo: Pestana;
  puedeEditar: boolean;
  onDescargar: (f: Elemento, tipo: Pestana) => void;
  onAdjuntar: (f: Elemento) => void;
}) {
  if (f.descargable) {
    return (
      <button
        onClick={() => onDescargar(f, tipo)}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-blue-700 hover:bg-blue-50"
        title={tipo === 'ventas' ? 'Descargar la factura en PDF' : 'Descargar el original'}
        aria-label={tipo === 'ventas' ? 'Descargar la factura en PDF' : 'Descargar el original'}
      >
        <DownloadSimple size={16} /> <span className="hidden 2xl:inline">Descargar</span>
      </button>
    );
  }
  if (puedeEditar && f.facturaId) {
    return (
      <button
        onClick={() => onAdjuntar(f)}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-amber-700 hover:bg-amber-50"
        title="Esta factura no tiene el original guardado: súbelo para tenerlo en el archivo"
        aria-label="Adjuntar el original"
      >
        <Paperclip size={16} /> <span className="hidden 2xl:inline">Adjuntar original</span>
      </button>
    );
  }
  return <span className="text-xs text-slate-400">Sin original</span>;
}

function SubirFacturaModal({
  tipoInicial,
  adjuntarA,
  onCerrar,
  onSubida,
}: {
  tipoInicial: Pestana;
  adjuntarA?: Elemento;
  onCerrar: () => void;
  onSubida: (fecha: string, tipo: Pestana, texto: string) => void;
}) {
  const [tipo, setTipo] = useState<Pestana>(tipoInicial);
  const [fecha, setFecha] = useState(adjuntarA?.fecha ?? new Date().toISOString().slice(0, 10));
  const [numero, setNumero] = useState(adjuntarA?.numero ?? '');
  const [tercero, setTercero] = useState(adjuntarA?.tercero ?? '');
  const [nif, setNif] = useState(adjuntarA?.nif ?? '');
  const [total, setTotal] = useState(adjuntarA ? String(adjuntarA.total).replace('.', ',') : '');
  const [fichero, setFichero] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !enviando && onCerrar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [enviando, onCerrar]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!fichero) return setError('Elige el fichero de la factura (PDF o imagen).');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return setError('Indica la fecha de la factura.');
    // Admite "1.210,50" (formato español) y "1210.50".
    const texto = total.trim().replace(/\s|€/g, '');
    const importe = texto ? Number(texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto) : undefined;
    if (importe !== undefined && !Number.isFinite(importe)) return setError('El total no es un número válido (por ejemplo: 1.210,50).');

    const datos = new FormData();
    datos.append('archivo', fichero);
    datos.append('tipo', tipo === 'ventas' ? 'ingreso' : 'gasto');
    datos.append('fecha', fecha);
    if (numero.trim()) datos.append('numeroFactura', numero.trim());
    if (tercero.trim()) datos.append(tipo === 'ventas' ? 'receptor' : 'emisor', tercero.trim());
    if (nif.trim()) datos.append('nifCif', nif.trim().toUpperCase());
    if (importe !== undefined) datos.append('total', String(importe));
    if (adjuntarA?.facturaId) datos.append('facturaId', adjuntarA.facturaId);

    setEnviando(true);
    try {
      await apiFetch(companyPath('/archivo'), { method: 'POST', body: datos });
      const m = /^(\d{4})-(\d{2})/.exec(fecha)!;
      const t = Math.ceil(parseInt(m[2], 10) / 3);
      onSubida(fecha, tipo, adjuntarA ? `Original adjuntado a la factura ${adjuntarA.numero ?? ''}.` : `Factura guardada en ${t}T de ${m[1]} (${tipo}).`);
    } catch (err) {
      setError(errorMessage(err));
      setEnviando(false);
    }
  };

  const campo = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="subir-titulo">
      <form onSubmit={enviar} className="max-h-[90dvh] w-full max-w-lg space-y-4 overflow-y-auto rounded-lg bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 id="subir-titulo" className="text-lg font-semibold text-slate-900">
            {adjuntarA ? `Adjuntar original de ${adjuntarA.numero ?? 'la factura'}` : 'Subir factura al archivo'}
          </h2>
          <button type="button" onClick={onCerrar} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        {!adjuntarA && (
          <fieldset>
            <legend className="text-sm font-medium text-slate-700">Tipo</legend>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(['ventas', 'gastos'] as Pestana[]).map((t) => (
                <label
                  key={t}
                  className={`cursor-pointer rounded-lg border px-3 py-2 text-center text-sm ${tipo === t ? 'border-emerald-500 bg-emerald-50 font-medium text-emerald-800' : 'border-slate-300 text-slate-600'}`}
                >
                  <input type="radio" name="tipo" value={t} checked={tipo === t} onChange={() => setTipo(t)} className="sr-only" />
                  {t === 'ventas' ? 'Venta (emitida)' : 'Gasto (recibida)'}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            Fecha de la factura
            <input type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} className={campo} disabled={!!adjuntarA} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Número
            <input value={numero} onChange={(e) => setNumero(e.target.value)} className={campo} placeholder="F-2026-001" disabled={!!adjuntarA} />
          </label>
          <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
            {tipo === 'ventas' ? 'Cliente' : 'Proveedor'}
            <input value={tercero} onChange={(e) => setTercero(e.target.value)} className={campo} disabled={!!adjuntarA} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            NIF
            <input value={nif} onChange={(e) => setNif(e.target.value)} className={campo} disabled={!!adjuntarA} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Total (€)
            <input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} className={campo} placeholder="1.210,00" disabled={!!adjuntarA} />
          </label>
        </div>

        <label className="block text-sm font-medium text-slate-700">
          Fichero (PDF o imagen)
          <input
            type="file"
            required
            accept="application/pdf,image/jpeg,image/png,image/webp,image/tiff"
            onChange={(e) => setFichero(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
        </label>

        <p className="text-xs text-slate-500">Se guardará en la carpeta del trimestre que corresponde a la fecha de la factura.</p>

        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCerrar} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Cancelar
          </button>
          <button type="submit" disabled={enviando} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60">
            <UploadSimple size={16} /> {enviando ? 'Subiendo…' : 'Guardar en el archivo'}
          </button>
        </div>
      </form>
    </div>
  );
}
