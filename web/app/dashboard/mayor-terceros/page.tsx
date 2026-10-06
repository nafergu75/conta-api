'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CaretRight, FilePdf, FileXls, MagnifyingGlass, X } from '@phosphor-icons/react';
import { Tooltip } from '@/app/dashboard/components/Tooltip';
import { apiDownload, apiFetch, companyPath, errorMessage } from '@/lib/api';
import { TablaInforme, fecha, importe, type Tabla } from '../informes/TablaInforme';

/**
 * Mayor de clientes y de proveedores: el saldo de cada tercero segun la
 * contabilidad (cuentas 43 / 40-41), con su detalle de movimientos. En clientes
 * se cruza con lo pendiente segun las facturas emitidas.
 */

type Tipo = 'clientes' | 'proveedores';

interface FilaTercero {
  id: string;
  nombre: string;
  nif: string | null;
  cuentas: string[];
  saldoInicial: number;
  debe: number;
  haber: number;
  saldoFinal: number;
  movimientos: number;
  pendienteFacturas: number | null;
}

interface Listado {
  terceros: FilaTercero[];
  totales: { saldoInicial: number; debe: number; haber: number; saldoFinal: number };
}

interface Detalle {
  tercero: { id: string; nombre: string; nif: string | null; saldoInicial: number; debe: number; haber: number; saldoFinal: number };
  facturasPendientes: Array<{ id: string; numeroCompleto: string | null; fechaEmision: string; fechaVencimiento: string; totalFactura: number; estado: string }>;
  totalPendiente: number;
  tabla: Tabla;
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_');

export default function MayorTercerosPage() {
  const anioActual = new Date().getFullYear();
  const [tipo, setTipo] = useState<Tipo>('clientes');
  const [ejercicios, setEjercicios] = useState<number[]>([anioActual]);
  const [ejercicio, setEjercicio] = useState(anioActual);
  const [hasta, setHasta] = useState('');
  const [soloConSaldo, setSoloConSaldo] = useState(true);
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [listado, setListado] = useState<Listado | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<FilaTercero | null>(null);

  useEffect(() => {
    apiFetch<number[]>(companyPath('/informes-contables/ejercicios'))
      .then((l) => {
        if (l.length) {
          setEjercicios(l);
          setEjercicio(l[0]);
        }
      })
      .catch(() => undefined);
  }, []);

  const periodo = useCallback(() => {
    const p = new URLSearchParams();
    if (hasta) {
      p.set('desde', `${ejercicio}-01-01`);
      p.set('hasta', hasta);
    } else p.set('ejercicio', String(ejercicio));
    return p;
  }, [ejercicio, hasta]);

  const cargar = useCallback(async () => {
    const p = periodo();
    if (soloConSaldo) p.set('soloConSaldo', '1');
    if (busqueda) p.set('q', busqueda);
    setCargando(true);
    setError('');
    try {
      setListado(await apiFetch<Listado>(companyPath(`/informes-contables/terceros/${tipo}?${p}`)));
    } catch (e) {
      setListado(null);
      setError(errorMessage(e));
    } finally {
      setCargando(false);
    }
  }, [tipo, periodo, soloConSaldo, busqueda]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const descargar = async (formato: 'pdf' | 'xlsx') => {
    const p = periodo();
    if (soloConSaldo) p.set('soloConSaldo', '1');
    if (busqueda) p.set('q', busqueda);
    p.set('formato', formato);
    try {
      await apiDownload(companyPath(`/informes-contables/terceros/${tipo}?${p}`), `mayor_${tipo}_${hasta || ejercicio}.${formato}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const campo = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
  const esCliente = tipo === 'clientes';
  const descuadre = (t: FilaTercero) => t.pendienteFacturas !== null && Math.abs(t.pendienteFacturas - t.saldoFinal) >= 0.01;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Mayor de clientes y proveedores</h1>
          <Tooltip text="Saldos sacados de la contabilidad (cuentas 43 de clientes y 40/41 de proveedores). El cliente o proveedor de cada apunte sale de la factura enlazada al asiento, de la referencia del apunte o de su subcuenta." />
        </div>
        <p className="mt-2 text-slate-600">Lo que te debe cada cliente y lo que debes a cada proveedor, con sus movimientos.</p>
      </div>

      <div className="flex gap-2 border-b border-slate-200" role="tablist">
        {(['clientes', 'proveedores'] as Tipo[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tipo === t}
            onClick={() => {
              setTipo(t);
              setAbierto(null);
            }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tipo === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            {t === 'clientes' ? 'Clientes' : 'Proveedores'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setBusqueda(q.trim());
          }}
          className="relative col-span-2 sm:min-w-56 sm:flex-1"
        >
          <label htmlFor="mt-q" className="block text-xs font-medium text-slate-600">Buscar</label>
          <MagnifyingGlass size={16} className="pointer-events-none absolute bottom-2.5 left-3 text-slate-400" />
          <input id="mt-q" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setBusqueda(q.trim())} placeholder="Nombre, NIF o subcuenta" className="mt-1 w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm" />
        </form>
        <div className="sm:w-28">
          <label htmlFor="mt-ej" className="block text-xs font-medium text-slate-600">Ejercicio</label>
          <select
            id="mt-ej"
            value={ejercicio}
            onChange={(e) => {
              setEjercicio(Number(e.target.value));
              setHasta('');
            }}
            className={campo}
          >
            {ejercicios.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="sm:w-40">
          <label htmlFor="mt-hasta" className="block text-xs font-medium text-slate-600">Hasta (opcional)</label>
          <input id="mt-hasta" type="date" min={`${ejercicio}-01-01`} max={`${ejercicio}-12-31`} value={hasta} onChange={(e) => setHasta(e.target.value)} className={campo} />
        </div>
        <label className="col-span-2 flex items-center gap-2 pb-2 text-sm text-slate-600 sm:col-span-1">
          <input type="checkbox" checked={soloConSaldo} onChange={(e) => setSoloConSaldo(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          Solo con saldo
        </label>
        <div className="col-span-2 flex gap-2 sm:ml-auto">
          <button onClick={() => descargar('pdf')} disabled={!listado} className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 sm:flex-none">
            <FilePdf size={16} /> PDF
          </button>
          <button onClick={() => descargar('xlsx')} disabled={!listado} className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 sm:flex-none">
            <FileXls size={16} /> Excel
          </button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {cargando && !listado ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Calculando saldos…</div>
      ) : listado && listado.terceros.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {busqueda ? 'Nadie coincide con la búsqueda.' : soloConSaldo ? `Ningún ${esCliente ? 'cliente' : 'proveedor'} tiene saldo en este periodo.` : 'No hay movimientos en este periodo.'}
        </div>
      ) : listado ? (
        <>
          {/* Escritorio: tabla */}
          <div className={`hidden overflow-x-auto rounded-lg border border-slate-200 bg-white md:block ${cargando ? 'opacity-60' : ''}`}>
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">{esCliente ? 'Cliente' : 'Proveedor'}</th>
                  <th className="px-4 py-3 text-right font-medium">Saldo inicial</th>
                  <th className="px-4 py-3 text-right font-medium">Debe</th>
                  <th className="px-4 py-3 text-right font-medium">Haber</th>
                  <th className="px-4 py-3 text-right font-medium">Saldo final</th>
                  {esCliente && (
                    <th className="px-4 py-3 text-right font-medium">
                      <span className="inline-flex items-center gap-1">
                        Pendiente s/ facturas
                        <Tooltip text="Facturas emitidas no marcadas como cobradas. Si no coincide con el saldo contable, hay un cobro sin registrar o una factura sin marcar." position="left" />
                      </span>
                    </th>
                  )}
                  <th className="px-2 py-3"><span className="sr-only">Ver</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {listado.terceros.map((t) => (
                  <tr key={t.id} onClick={() => setAbierto(t)} className="cursor-pointer hover:bg-blue-50/50">
                    <td className="px-4 py-2">
                      <div className="font-medium text-slate-900">{t.nombre}</div>
                      <div className="font-mono text-xs text-slate-500">{[t.nif, t.cuentas.join(', ')].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-mono tabular-nums text-slate-600">{t.saldoInicial ? importe(t.saldoInicial) : ''}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-mono tabular-nums">{t.debe ? importe(t.debe) : ''}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-mono tabular-nums">{t.haber ? importe(t.haber) : ''}</td>
                    <td className={`whitespace-nowrap px-4 py-2 text-right font-mono font-semibold tabular-nums ${t.saldoFinal < 0 ? 'text-amber-700' : 'text-slate-900'}`}>{importe(t.saldoFinal)}</td>
                    {esCliente && (
                      <td className={`whitespace-nowrap px-4 py-2 text-right font-mono tabular-nums ${descuadre(t) ? 'text-red-700' : 'text-slate-500'}`} title={descuadre(t) ? 'No coincide con el saldo contable' : undefined}>
                        {t.pendienteFacturas === null ? '—' : importe(t.pendienteFacturas)}
                      </td>
                    )}
                    <td className="px-2 py-2 text-slate-400"><CaretRight size={16} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-emerald-700 bg-emerald-50 font-semibold">
                  <td className="px-4 py-2">Total ({listado.terceros.length})</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{importe(listado.totales.saldoInicial)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{importe(listado.totales.debe)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{importe(listado.totales.haber)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{importe(listado.totales.saldoFinal)}</td>
                  {esCliente && <td />}
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Movil: tarjetas */}
          <ul className={`space-y-2 md:hidden ${cargando ? 'opacity-60' : ''}`}>
            {listado.terceros.map((t) => (
              <li key={t.id}>
                <button onClick={() => setAbierto(t)} className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left active:bg-slate-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-900">{t.nombre}</div>
                      {t.nif && <div className="font-mono text-xs text-slate-500">{t.nif}</div>}
                    </div>
                    <div className={`whitespace-nowrap font-mono text-base font-semibold tabular-nums ${t.saldoFinal < 0 ? 'text-amber-700' : 'text-slate-900'}`}>{importe(t.saldoFinal)} €</div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-500">
                    <span>Inicial <span className="block font-mono text-slate-700">{importe(t.saldoInicial)}</span></span>
                    <span>Debe <span className="block font-mono text-slate-700">{importe(t.debe)}</span></span>
                    <span>Haber <span className="block font-mono text-slate-700">{importe(t.haber)}</span></span>
                  </div>
                  {esCliente && t.pendienteFacturas !== null && descuadre(t) && (
                    <p className="mt-2 text-xs text-red-700">Pendiente según facturas: {importe(t.pendienteFacturas)} €</p>
                  )}
                </button>
              </li>
            ))}
            <li className="flex justify-between rounded-lg bg-emerald-50 p-3 text-sm font-semibold">
              <span>Total ({listado.terceros.length})</span>
              <span className="font-mono">{importe(listado.totales.saldoFinal)} €</span>
            </li>
          </ul>
          <p className="text-xs text-slate-500">
            {esCliente ? 'Saldo positivo: lo que te deben; negativo: anticipos o cobros de más.' : 'Saldo positivo: lo que debes; negativo: anticipos o pagos de más.'} Pulsa en una fila para ver sus movimientos.
          </p>
        </>
      ) : null}

      {abierto && <DetalleTercero tipo={tipo} fila={abierto} periodo={periodo()} onCerrar={() => setAbierto(null)} />}
    </div>
  );
}

function DetalleTercero({ tipo, fila, periodo, onCerrar }: { tipo: Tipo; fila: FilaTercero; periodo: URLSearchParams; onCerrar: () => void }) {
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [error, setError] = useState('');
  const qs = periodo.toString();
  const ruta = companyPath(`/informes-contables/terceros/${tipo}/${encodeURIComponent(fila.id)}`);

  useEffect(() => {
    setDetalle(null);
    setError('');
    apiFetch<Detalle>(`${ruta}?${qs}`)
      .then(setDetalle)
      .catch((e) => setError(errorMessage(e)));
  }, [ruta, qs]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onCerrar]);

  const descargar = async (formato: 'pdf' | 'xlsx') => {
    try {
      await apiDownload(`${ruta}?${qs}&formato=${formato}`, `mayor_${sinTildes(fila.nombre)}.${formato}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div className="fixed inset-0 z-50 !mt-0 flex items-stretch justify-end bg-slate-900/40" onClick={onCerrar} role="dialog" aria-modal="true" aria-label={`Mayor de ${fila.nombre}`}>
      <div className="flex h-full w-full max-w-5xl flex-col bg-slate-50 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-4">
          <div className="min-w-0">
            <button onClick={onCerrar} className="mb-1 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 sm:hidden">
              <ArrowLeft size={14} /> Volver
            </button>
            <h2 className="truncate text-lg font-semibold text-slate-900">{fila.nombre}</h2>
            <p className="font-mono text-xs text-slate-500">{[fila.nif, fila.cuentas.join(', ')].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={() => descargar('pdf')} disabled={!detalle} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              <FilePdf size={16} /> <span className="hidden sm:inline">PDF</span>
            </button>
            <button onClick={() => descargar('xlsx')} disabled={!detalle} className="flex items-center gap-1.5 rounded-lg border border-emerald-600 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">
              <FileXls size={16} /> <span className="hidden sm:inline">Excel</span>
            </button>
            <button onClick={onCerrar} className="hidden rounded p-2 text-slate-500 hover:bg-slate-100 sm:block" aria-label="Cerrar">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          {!detalle && !error && <p className="text-sm text-slate-500">Cargando movimientos…</p>}
          {detalle && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(
                  [
                    ['Saldo inicial', detalle.tercero.saldoInicial],
                    ['Debe', detalle.tercero.debe],
                    ['Haber', detalle.tercero.haber],
                    ['Saldo final', detalle.tercero.saldoFinal],
                  ] as Array<[string, number]>
                ).map(([t, v], i) => (
                  <div key={t} className={`rounded-lg border p-3 ${i === 3 ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                    <div className="text-xs text-slate-500">{t}</div>
                    <div className="font-mono text-base font-semibold tabular-nums text-slate-900">{importe(v)} €</div>
                  </div>
                ))}
              </div>
              <TablaInforme tabla={detalle.tabla} />
              {tipo === 'clientes' && detalle.facturasPendientes.length > 0 && (
                <section className="rounded-lg border border-slate-200 bg-white p-4">
                  <h3 className="text-sm font-semibold text-slate-900">Facturas pendientes de cobro según facturación</h3>
                  <ul className="mt-2 divide-y divide-slate-100 text-sm">
                    {detalle.facturasPendientes.map((f) => (
                      <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                        <span className="font-mono">{f.numeroCompleto}</span>
                        <span className="text-slate-500">emitida {fecha(f.fechaEmision)} · vence {fecha(f.fechaVencimiento)}</span>
                        <span className="font-mono tabular-nums">{importe(f.totalFactura)} €</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-right text-sm font-semibold">Total {importe(detalle.totalPendiente)} €</p>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
