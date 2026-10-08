'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, MagnifyingGlass, Plus, Sparkle, X } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { formatoImporte } from '@/lib/moneda';
import { claseEstadoGasto, claseEstadoPago, fechaCorta, type ListadoGastos } from '@/lib/compras';

/**
 * Compras: facturas de gasto con contadores, filtros (en el servidor) y
 * paginacion de 25 en 25. Los contadores tambien filtran al pulsarlos.
 */

const POR_PAGINA = 25;

type Estado = '' | 'sin_contabilizar' | 'pendiente_revision' | 'contabilizada' | 'anulada';
type Pago = '' | 'pendiente' | 'parcial' | 'por_pagar' | 'pagada' | 'vencida';

const campo =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600 focus:border-accent-600';

export default function ComprasPage() {
  const puedeEscribir = tieneAlgunPermiso(getUser(), ['compras:write']);

  const [datos, setDatos] = useState<ListadoGastos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [busqueda, setBusqueda] = useState('');
  const [q, setQ] = useState('');
  const [estado, setEstado] = useState<Estado>('');
  const [pago, setPago] = useState<Pago>('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [pagina, setPagina] = useState(1);

  // La busqueda espera 300 ms a que el usuario deje de escribir.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(busqueda.trim());
      setPagina(1);
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  useEffect(() => {
    let vivo = true;
    const params = new URLSearchParams({ page: String(pagina), limit: String(POR_PAGINA) });
    if (q) params.set('q', q);
    if (estado) params.set('estado', estado);
    if (pago) params.set('pago', pago);
    if (desde) params.set('desde', desde);
    if (hasta) params.set('hasta', hasta);
    setCargando(true);
    apiFetch<ListadoGastos>(companyPath(`/expense-invoices?${params}`))
      .then((d) => {
        if (!vivo) return;
        setDatos(d);
        setError('');
      })
      .catch((e) => vivo && setError(errorMessage(e)))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [q, estado, pago, desde, hasta, pagina]);

  const moneda = datos?.monedaCuenta ?? 'EUR';
  const fmt = (n: number) => formatoImporte(Number(n) || 0, moneda);
  const c = datos?.contadores;
  const hayFiltros = !!(q || estado || pago || desde || hasta);

  const filtrar = (e: Estado, p: Pago) => {
    setEstado(e);
    setPago(p);
    setPagina(1);
  };
  const limpiar = () => {
    setBusqueda('');
    setQ('');
    setDesde('');
    setHasta('');
    filtrar('', '');
  };

  const contadores: Array<{ texto: string; valor: number | undefined; activo: boolean; onClick: () => void; color: string }> = [
    { texto: 'Todas', valor: c?.todas, activo: !estado && !pago, onClick: () => filtrar('', ''), color: 'text-slate-900' },
    { texto: 'Pendientes de revisar', valor: c?.pendientesRevision, activo: estado === 'pendiente_revision', onClick: () => filtrar('pendiente_revision', ''), color: 'text-amber-700' },
    { texto: 'Contabilizadas', valor: c?.contabilizadas, activo: estado === 'contabilizada', onClick: () => filtrar('contabilizada', ''), color: 'text-emerald-700' },
    { texto: 'Pendientes de pago', valor: c?.pendientesPago, activo: pago === 'por_pagar', onClick: () => filtrar('', 'por_pagar'), color: 'text-blue-700' },
    { texto: 'Vencidas', valor: c?.vencidas, activo: pago === 'vencida', onClick: () => filtrar('', 'vencida'), color: 'text-rose-700' },
    { texto: 'Anuladas', valor: c?.anuladas, activo: estado === 'anulada', onClick: () => filtrar('anulada', ''), color: 'text-slate-600' },
  ];
  if (c && c.sinContabilizar > 0) {
    contadores.splice(3, 0, {
      texto: 'Sin contabilizar',
      valor: c.sinContabilizar,
      activo: estado === 'sin_contabilizar',
      onClick: () => filtrar('sin_contabilizar', ''),
      color: 'text-blue-700',
    });
  }

  return (
    <div>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3 md:px-8">
          <h1 className="font-semibold text-slate-900">Compras</h1>
          {puedeEscribir && (
            <div className="flex flex-wrap gap-2">
              <Link
                href="/dashboard/compras/lector-gastos"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                <Sparkle size={16} /> Leer factura con IA
              </Link>
              <Link
                href="/dashboard/compras/nueva"
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-2 text-sm font-semibold text-white transition-all hover:bg-accent-700 active:scale-[0.98]"
              >
                <Plus size={16} weight="bold" /> Nueva factura de gasto
              </Link>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pt-6 pb-24 md:px-8 md:py-8">
        {/* Contadores (tambien filtran) */}
        <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
          {contadores.map((k) => (
            <button
              key={k.texto}
              type="button"
              onClick={k.onClick}
              aria-pressed={k.activo}
              className={`rounded-lg border p-3 text-left transition-colors ${k.activo ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
            >
              <p className="text-xs text-slate-600">{k.texto}</p>
              <p className={`text-xl font-bold ${k.color}`}>{k.valor ?? '—'}</p>
            </button>
          ))}
        </section>

        {/* Filtros */}
        <section className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-6">
          <div className="col-span-2 md:col-span-6">
            <label htmlFor="co-buscar" className="mb-1 block text-sm font-medium text-slate-700">
              Buscar
            </label>
            <div className="relative">
              <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="co-buscar"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Nº de registro, nº del proveedor, proveedor o NIF"
                className={`${campo} pl-9 pr-9`}
              />
              {busqueda && (
                <button type="button" onClick={() => setBusqueda('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label="Limpiar búsqueda">
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
          <div className="col-span-2 md:col-span-2">
            <label htmlFor="co-estado" className="mb-1 block text-sm font-medium text-slate-700">
              Estado
            </label>
            <select id="co-estado" value={estado} onChange={(e) => filtrar(e.target.value as Estado, pago)} className={campo}>
              <option value="">Todas</option>
              <option value="sin_contabilizar">Sin contabilizar</option>
              <option value="pendiente_revision">Pendiente de revisar</option>
              <option value="contabilizada">Contabilizada</option>
              <option value="anulada">Anulada</option>
            </select>
          </div>
          <div className="col-span-2 md:col-span-2">
            <label htmlFor="co-pago" className="mb-1 block text-sm font-medium text-slate-700">
              Pago
            </label>
            <select id="co-pago" value={pago} onChange={(e) => filtrar(estado, e.target.value as Pago)} className={campo}>
              <option value="">Todos</option>
              <option value="por_pagar">Sin pagar del todo</option>
              <option value="pendiente">Pendiente</option>
              <option value="parcial">Pagada en parte</option>
              <option value="pagada">Pagada</option>
              <option value="vencida">Vencida</option>
            </select>
          </div>
          <div>
            <label htmlFor="co-desde" className="mb-1 block text-sm font-medium text-slate-700">
              Desde
            </label>
            <input
              id="co-desde"
              type="date"
              value={desde}
              onChange={(e) => {
                setDesde(e.target.value);
                setPagina(1);
              }}
              className={campo}
            />
          </div>
          <div>
            <label htmlFor="co-hasta" className="mb-1 block text-sm font-medium text-slate-700">
              Hasta
            </label>
            <input
              id="co-hasta"
              type="date"
              value={hasta}
              onChange={(e) => {
                setHasta(e.target.value);
                setPagina(1);
              }}
              className={campo}
            />
          </div>
          {hayFiltros && (
            <button type="button" onClick={limpiar} className="col-span-2 justify-self-start text-sm font-semibold text-blue-600 hover:underline md:col-span-6">
              Quitar los filtros
            </button>
          )}
        </section>

        {/* Totales del filtro */}
        {datos && datos.total > 0 && (
          <section className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-4 text-sm sm:grid-cols-5">
            <div>
              <p className="text-slate-600">Base</p>
              <p className="font-mono font-semibold text-slate-900">{fmt(datos.totales.base)}</p>
            </div>
            <div>
              <p className="text-slate-600">IVA</p>
              <p className="font-mono font-semibold text-slate-900">{fmt(datos.totales.iva)}</p>
            </div>
            <div>
              <p className="text-slate-600">Retención</p>
              <p className="font-mono font-semibold text-slate-900">{fmt(datos.totales.retencion)}</p>
            </div>
            <div>
              <p className="text-slate-600">Total</p>
              <p className="font-mono font-semibold text-slate-900">{fmt(datos.totales.total)}</p>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-slate-600">Pendiente de pago</p>
              <p className="font-mono font-semibold text-amber-700">{fmt(datos.totales.pendiente)}</p>
            </div>
            <p className="col-span-2 text-xs text-slate-500 sm:col-span-5">Totales de las facturas que cumplen el filtro (todas las páginas), sin las anuladas.</p>
          </section>
        )}

        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>}

        {/* Resultados */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {cargando && !datos ? (
            <div className="m-6 h-64 animate-pulse rounded-lg bg-slate-100" />
          ) : !datos || datos.items.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="mb-2 font-medium text-slate-700">{hayFiltros ? 'Ninguna factura cumple el filtro' : 'Aún no hay facturas de gasto'}</p>
              {hayFiltros ? (
                <button type="button" onClick={limpiar} className="text-sm font-semibold text-blue-600 hover:underline">
                  Quitar los filtros
                </button>
              ) : (
                puedeEscribir && (
                  <Link href="/dashboard/compras/nueva" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-600 hover:text-accent-700">
                    <Plus size={16} /> Nueva factura de gasto
                  </Link>
                )
              )}
            </div>
          ) : (
            <div className={cargando ? 'opacity-60' : ''}>
              {/* Pantallas anchas: tabla (sin scroll de pagina; si no cabe, se desplaza dentro de la tarjeta) */}
              <div className="relative hidden overflow-x-auto xl:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-2.5 py-3 font-medium">Registro</th>
                    <th className="px-2.5 py-3 font-medium">Nº proveedor</th>
                    <th className="px-2.5 py-3 font-medium">Proveedor</th>
                    <th className="px-2.5 py-3 font-medium">Fecha</th>
                    <th className="px-2.5 py-3 text-right font-medium">Base</th>
                    <th className="px-2.5 py-3 text-right font-medium">IVA</th>
                    <th className="px-2.5 py-3 text-right font-medium">Total</th>
                    <th className="px-2.5 py-3 font-medium">Estado</th>
                    <th className="px-2.5 py-3 font-medium">Pago</th>
                    <th className="px-2.5 py-3">
                      <span className="sr-only">Ver</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {datos.items.map((f) => {
                    const anulada = f.estado === 'ANULADA';
                    return (
                      <tr key={f.id} className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${anulada ? 'text-slate-400 line-through' : ''}`}>
                        <td className="px-2.5 py-3 font-mono font-medium">
                          <Link href={`/dashboard/compras/${f.id}`} className={anulada ? '' : 'text-blue-600 hover:underline'}>
                            {f.numeroCompleto}
                          </Link>
                        </td>
                        <td className="max-w-[7rem] truncate px-2.5 py-3 font-mono text-slate-700" title={f.numeroFacturaProveedor ?? ''}>
                          {f.numeroFacturaProveedor ?? '—'}
                        </td>
                        <td className="max-w-[11rem] truncate px-2.5 py-3 text-slate-900" title={f.supplierNombre}>
                          {f.supplierNombre}
                        </td>
                        <td className="whitespace-nowrap px-2.5 py-3 text-slate-600">{fechaCorta(f.fechaEmision)}</td>
                        <td className="whitespace-nowrap px-2.5 py-3 text-right tabular-nums">{fmt(f.baseTotal)}</td>
                        <td className="whitespace-nowrap px-2.5 py-3 text-right tabular-nums">{fmt(f.ivaTotal)}</td>
                        <td className="whitespace-nowrap px-2.5 py-3 text-right tabular-nums font-semibold">{fmt(f.totalFactura)}</td>
                        <td className="px-2.5 py-3">
                          <span className={claseEstadoGasto(f.estado)}>{f.estadoTexto}</span>
                        </td>
                        <td className="px-2.5 py-3">{!anulada && <span className={claseEstadoPago(f.estadoPago, f.vencida)}>{f.estadoPagoTexto}</span>}</td>
                        <td className="px-2.5 py-3 text-right">
                          <Link href={`/dashboard/compras/${f.id}`} className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline">
                            <span className="sr-only">Ver</span>
                            <ArrowRight size={16} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>

              {/* Movil: tarjetas */}
              <ul className="divide-y divide-slate-100 xl:hidden">
                {datos.items.map((f) => {
                  const anulada = f.estado === 'ANULADA';
                  return (
                    <li key={f.id}>
                      <Link href={`/dashboard/compras/${f.id}`} className="flex flex-col gap-1.5 px-4 py-3 hover:bg-slate-50">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className={`min-w-0 truncate font-medium ${anulada ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{f.supplierNombre}</span>
                          <span className={`shrink-0 font-mono font-semibold ${anulada ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{fmt(f.totalFactura)}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                          <span className="font-mono">{f.numeroCompleto}</span>
                          {f.numeroFacturaProveedor && <span className="max-w-[12rem] truncate font-mono">· {f.numeroFacturaProveedor}</span>}
                          <span>· {fechaCorta(f.fechaEmision)}</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <span className={claseEstadoGasto(f.estado)}>{f.estadoTexto}</span>
                          {!anulada && <span className={claseEstadoPago(f.estadoPago, f.vencida)}>{f.estadoPagoTexto}</span>}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Paginacion */}
          {datos && datos.total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-sm">
              <button
                type="button"
                onClick={() => setPagina((p) => Math.max(1, p - 1))}
                disabled={pagina <= 1 || cargando}
                className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="text-slate-600">
                Página {datos.page} de {datos.paginas} · {datos.total} factura{datos.total !== 1 ? 's' : ''}
              </span>
              <button
                type="button"
                onClick={() => setPagina((p) => Math.min(datos.paginas, p + 1))}
                disabled={pagina >= datos.paginas || cargando}
                className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
