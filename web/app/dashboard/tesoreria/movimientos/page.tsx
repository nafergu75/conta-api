'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowCounterClockwise, CaretLeft, CaretRight, EyeSlash, MagnifyingGlass, SplitHorizontal } from '@phosphor-icons/react';
import { Tooltip } from '@/app/dashboard/components/Tooltip';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { aplanar, eur, type Categoria } from '../categoriasTesoreria';
import { DesgloseModal, type MovimientoDesglose } from './DesgloseModal';

/**
 * Cobros y pagos del banco con su categoria de tesoreria. Al categorizar uno,
 * si hay otros parecidos sin categoria, se ofrece aplicarles la misma y
 * recordarlo para los proximos extractos.
 */

interface Movimiento extends MovimientoDesglose {
  categoriaId: string | null;
  ivaPorcentaje: number | null;
  ignorado: boolean;
  conciliado: boolean;
  cuentaBancaria: { bancoNombre: string | null; iban: string };
}

interface Pagina {
  total: number;
  pagina: number;
  porPagina: number;
  sinCategoria: number;
  items: Movimiento[];
}

interface Cuenta {
  id: string;
  iban: string;
  bancoNombre?: string;
}

type Estado = '' | 'sin-categoria' | 'categorizados' | 'ignorados';

interface Sugerencia {
  movimientoId: string;
  similares: number;
  clave: string;
  categoria: string;
}

export default function CobrosPagosPage() {
  const puedeEditar = tieneAlgunPermiso(getUser(), ['tesoreria:write']);
  const [tipo, setTipo] = useState<'pagos' | 'cobros'>('pagos');
  const [estado, setEstado] = useState<Estado>('');
  const [cuentaId, setCuentaId] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);

  const [datos, setDatos] = useState<Pagina | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [sugerencia, setSugerencia] = useState<Sugerencia | null>(null);
  const [desglose, setDesglose] = useState<Movimiento | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<Categoria[]>(companyPath('/treasury/categorias')),
      apiFetch<Cuenta[]>(companyPath('/treasury/bank-accounts')),
    ])
      .then(([c, b]) => {
        setCategorias(c);
        setCuentas(b);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  const cargar = useCallback(async () => {
    const p = new URLSearchParams({ tipo, pagina: String(pagina) });
    if (estado) p.set('estado', estado);
    if (cuentaId) p.set('cuentaId', cuentaId);
    if (desde) p.set('desde', desde);
    if (hasta) p.set('hasta', hasta);
    if (busqueda) p.set('q', busqueda);
    try {
      setDatos(await apiFetch<Pagina>(companyPath(`/treasury/movimientos?${p}`)));
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCargando(false);
    }
  }, [tipo, estado, cuentaId, desde, hasta, busqueda, pagina]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const nombreCategoria = (id: string | null) => aplanar(categorias).find((c) => c.id === id);

  const categorizar = async (m: Movimiento, categoriaId: string) => {
    setAviso('');
    setError('');
    try {
      const r = await apiFetch<{ similares: number; clave: string }>(companyPath(`/treasury/movimientos/${m.id}/categoria`), {
        method: 'PUT',
        body: JSON.stringify({ categoriaId: categoriaId || null }),
      });
      if (r.similares > 0 && categoriaId) {
        setSugerencia({ movimientoId: m.id, similares: r.similares, clave: r.clave, categoria: nombreCategoria(categoriaId)?.ruta ?? '' });
      }
      await cargar();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const aceptarSugerencia = async (aceptar: boolean) => {
    const s = sugerencia;
    setSugerencia(null);
    if (!s || !aceptar) return;
    try {
      const r = await apiFetch<{ actualizados: number }>(companyPath(`/treasury/movimientos/${s.movimientoId}/similares`), {
        method: 'POST',
        body: JSON.stringify({ recordar: true }),
      });
      setAviso(`${r.actualizados} movimiento${r.actualizados === 1 ? '' : 's'} más en «${s.categoria}». Los próximos extractos con «${s.clave}» se categorizarán solos.`);
      await cargar();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const ignorar = async (m: Movimiento, ignorado: boolean) => {
    try {
      await apiFetch(companyPath(`/treasury/movimientos/${m.id}/ignorado`), { method: 'PUT', body: JSON.stringify({ ignorado }) });
      setAviso(ignorado ? 'Movimiento ignorado: no cuenta en el análisis de tesorería.' : 'Movimiento recuperado.');
      await cargar();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const filtrosCambian = (f: () => void) => {
    f();
    setPagina(1);
  };

  const opciones = aplanar(categorias, tipo === 'pagos' ? 'GASTO' : 'INGRESO', true);
  const paginas = datos ? Math.max(1, Math.ceil(datos.total / datos.porPagina)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-slate-900">Cobros y pagos</h1>
            <Tooltip text="Movimientos de todas las cuentas bancarias. Asigna a cada uno su categoría de tesorería para analizar en qué entra y sale el dinero. Si hay otros parecidos, te ofreceremos categorizarlos de una vez." />
          </div>
          <p className="mt-2 text-slate-600">
            {datos && datos.sinCategoria > 0 ? (
              <>
                Tienes <strong>{datos.sinCategoria}</strong> movimiento{datos.sinCategoria === 1 ? '' : 's'} sin categoría.{' '}
                <button onClick={() => filtrosCambian(() => setEstado('sin-categoria'))} className="font-medium text-blue-600 hover:text-blue-700">
                  Verlos
                </button>
              </>
            ) : (
              'Todos los movimientos tienen categoría.'
            )}
          </p>
        </div>
        <Link href="/dashboard/tesoreria/categorias" className="text-sm font-medium text-blue-600 hover:text-blue-700">
          Gestionar las categorías
        </Link>
      </div>

      <div className="flex gap-2 border-b border-slate-200" role="tablist">
        {(['pagos', 'cobros'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tipo === t}
            onClick={() => filtrosCambian(() => setTipo(t))}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tipo === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            {t === 'pagos' ? 'Pagos' : 'Cobros'}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="f-estado" className="block text-xs font-medium text-slate-600">Estado</label>
          <select id="f-estado" value={estado} onChange={(e) => filtrosCambian(() => setEstado(e.target.value as Estado))} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Todos</option>
            <option value="sin-categoria">Sin categoría</option>
            <option value="categorizados">Categorizados</option>
            <option value="ignorados">Ignorados</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-cuenta" className="block text-xs font-medium text-slate-600">Cuenta</label>
          <select id="f-cuenta" value={cuentaId} onChange={(e) => filtrosCambian(() => setCuentaId(e.target.value))} className="mt-1 max-w-56 rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Todas</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.bancoNombre || 'Cuenta'} ···{c.iban.slice(-4)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="f-desde" className="block text-xs font-medium text-slate-600">Desde</label>
          <input id="f-desde" type="date" value={desde} onChange={(e) => filtrosCambian(() => setDesde(e.target.value))} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor="f-hasta" className="block text-xs font-medium text-slate-600">Hasta</label>
          <input id="f-hasta" type="date" value={hasta} onChange={(e) => filtrosCambian(() => setHasta(e.target.value))} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            filtrosCambian(() => setBusqueda(q.trim()));
          }}
          className="relative min-w-48 flex-1"
        >
          <label htmlFor="f-q" className="block text-xs font-medium text-slate-600">Concepto</label>
          <MagnifyingGlass size={16} className="pointer-events-none absolute bottom-2.5 left-3 text-slate-400" />
          <input id="f-q" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q.trim() !== busqueda && filtrosCambian(() => setBusqueda(q.trim()))} placeholder="Buscar..." className="mt-1 w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm" />
        </form>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {aviso && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{aviso}</p>}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Concepto</th>
              <th className="px-4 py-3 font-medium">Cuenta</th>
              <th className="px-4 py-3 text-right font-medium">Importe</th>
              <th className="px-4 py-3 font-medium">Categoría</th>
              <th className="px-4 py-3"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cargando ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Cargando movimientos...</td></tr>
            ) : !datos || datos.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No hay movimientos con estos filtros.{' '}
                  {cuentas.length === 0 ? (
                    <Link href="/dashboard/tesoreria/cuentas" className="font-medium text-blue-600">Añade una cuenta bancaria</Link>
                  ) : (
                    <Link href="/dashboard/tesoreria/extractos" className="font-medium text-blue-600">Sube un extracto</Link>
                  )}
                </td>
              </tr>
            ) : (
              datos.items.map((m) => {
                const cat = nombreCategoria(m.categoriaId);
                return (
                  <tr key={m.id} className={m.ignorado ? 'text-slate-400' : ''}>
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums">{new Date(`${m.fecha}T00:00:00`).toLocaleDateString('es-ES')}</td>
                    <td className="px-4 py-2">
                      {m.concepto}
                      {m.ignorado && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">ignorado</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                      {m.cuentaBancaria.bancoNombre || 'Cuenta'} ···{m.cuentaBancaria.iban.slice(-4)}
                    </td>
                    <td className={`whitespace-nowrap px-4 py-2 text-right tabular-nums ${m.importe >= 0 ? 'text-emerald-700' : 'text-slate-900'}`}>{eur.format(m.importe)}</td>
                    <td className="px-4 py-2">
                      {m.partes.length > 0 ? (
                        <button onClick={() => setDesglose(m)} className="flex flex-wrap gap-1" title="Ver o cambiar el desglose">
                          {m.partes.map((p, i) => {
                            const c = nombreCategoria(p.categoriaId);
                            return (
                              <span key={i} className="rounded px-1.5 py-0.5 text-xs font-medium text-white" style={{ background: c?.color ?? '#94a3b8' }}>
                                {c?.nombre ?? 'Sin categoría'} · {eur.format(Math.abs(p.importe))}
                              </span>
                            );
                          })}
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: cat?.color ?? '#e2e8f0' }} />
                          <select
                            aria-label={`Categoría de ${m.concepto}`}
                            value={m.categoriaId ?? ''}
                            disabled={!puedeEditar || m.ignorado}
                            onChange={(e) => categorizar(m, e.target.value)}
                            className="w-full max-w-60 rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                          >
                            <option value="">Sin categoría</option>
                            {opciones.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.nivel ? `   · ${o.nombre}` : o.nombre}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right">
                      {puedeEditar && (
                        <span className="flex justify-end gap-1">
                          {!m.ignorado && (
                            <button onClick={() => setDesglose(m)} className="rounded p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-600" title="Desglosar en varias categorías">
                              <SplitHorizontal size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => ignorar(m, !m.ignorado)}
                            className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                            title={m.ignorado ? 'Volver a tenerlo en cuenta' : 'Ignorar (no cuenta en el análisis, p. ej. traspasos entre cuentas propias)'}
                          >
                            {m.ignorado ? <ArrowCounterClockwise size={16} /> : <EyeSlash size={16} />}
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {datos && datos.total > datos.porPagina && (
        <div className="flex items-center justify-between text-sm text-slate-600">
          <span>
            {datos.total} movimientos · página {pagina} de {paginas}
          </span>
          <span className="flex gap-2">
            <button onClick={() => setPagina((p) => p - 1)} disabled={pagina <= 1} className="rounded-lg border border-slate-300 p-2 disabled:opacity-40" aria-label="Página anterior">
              <CaretLeft size={16} />
            </button>
            <button onClick={() => setPagina((p) => p + 1)} disabled={pagina >= paginas} className="rounded-lg border border-slate-300 p-2 disabled:opacity-40" aria-label="Página siguiente">
              <CaretRight size={16} />
            </button>
          </span>
        </div>
      )}

      {sugerencia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="sug-titulo">
          <div className="w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-lg">
            <h2 id="sug-titulo" className="text-lg font-semibold text-slate-900">Movimientos parecidos</h2>
            <p className="text-sm text-slate-700">
              Hay <strong>{sugerencia.similares}</strong> movimiento{sugerencia.similares === 1 ? '' : 's'} sin categoría con un concepto parecido a «{sugerencia.clave}». ¿{sugerencia.similares === 1 ? 'Le' : 'Les'} asigno también «{sugerencia.categoria}»?
            </p>
            <p className="text-xs text-slate-500">Si dices que sí, los próximos extractos con ese concepto se categorizarán solos.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => aceptarSugerencia(false)} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
                No
              </button>
              <button onClick={() => aceptarSugerencia(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700" autoFocus>
                Sí, asignar
              </button>
            </div>
          </div>
        </div>
      )}

      {desglose && (
        <DesgloseModal
          movimiento={desglose}
          categorias={categorias}
          onCerrar={() => setDesglose(null)}
          onGuardado={() => {
            setDesglose(null);
            setAviso('Desglose guardado.');
            cargar();
          }}
        />
      )}
    </div>
  );
}
