'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { Archive, ArrowCounterClockwise, Plus, Trash, X } from '@phosphor-icons/react';
import { Tooltip } from '@/app/dashboard/components/Tooltip';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { COLORES, type Categoria, type TipoCategoria } from '../categoriasTesoreria';

/**
 * Categorias analiticas de cobros y pagos. No son cuentas contables: sirven
 * para ver en que entra y sale el dinero y para la prevision de tesoreria.
 */
export default function CategoriasTesoreriaPage() {
  const puedeEditar = tieneAlgunPermiso(getUser(), ['tesoreria:write']);
  const [tipo, setTipo] = useState<TipoCategoria>('GASTO');
  const [arbol, setArbol] = useState<Categoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [nueva, setNueva] = useState({ nombre: '', color: COLORES[0], parentId: '' });
  const [verArchivadas, setVerArchivadas] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setArbol(await apiFetch<Categoria[]>(companyPath('/treasury/categorias')));
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const accion = async (fn: () => Promise<unknown>, ok: string) => {
    setError('');
    setAviso('');
    try {
      await fn();
      setAviso(ok);
      await cargar();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const crear = (e: React.FormEvent) => {
    e.preventDefault();
    const nombre = nueva.nombre.trim();
    if (!nombre) return;
    accion(
      () =>
        apiFetch(companyPath('/treasury/categorias'), {
          method: 'POST',
          body: JSON.stringify({ tipo, nombre, color: nueva.color, parentId: nueva.parentId || undefined }),
        }),
      `Categoría «${nombre}» creada.`,
    ).then(() => setNueva((n) => ({ ...n, nombre: '' })));
  };

  const guardar = (c: Categoria, cambios: Partial<Pick<Categoria, 'nombre' | 'color' | 'ivaPorcentaje' | 'activa'>>) =>
    accion(
      () => apiFetch(companyPath(`/treasury/categorias/${c.id}`), { method: 'PATCH', body: JSON.stringify(cambios) }),
      cambios.activa === true ? `«${c.nombre}» recuperada.` : `«${c.nombre}» guardada.`,
    );

  const borrar = async (c: Categoria) => {
    setError('');
    setAviso('');
    try {
      const r = await apiFetch<{ borrada: boolean; archivada: boolean }>(companyPath(`/treasury/categorias/${c.id}`), { method: 'DELETE' });
      setAviso(
        r.archivada
          ? `«${c.nombre}» tiene movimientos: se ha archivado en vez de borrarla, para no perder el histórico. Puedes recuperarla cuando quieras.`
          : `«${c.nombre}» borrada.`,
      );
      await cargar();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const delTipo = arbol.filter((c) => c.tipo === tipo && (verArchivadas || c.activa));
  const archivadas = arbol.filter((c) => c.tipo === tipo).reduce((n, c) => n + (c.activa ? 0 : 1) + c.hijas.filter((h) => !h.activa).length, 0);

  const fila = (c: Categoria, nivel: number) => (
    <li key={c.id} className={`flex flex-wrap items-center gap-3 border-t border-slate-100 py-2 pr-4 ${c.activa ? '' : 'opacity-60'}`} style={{ paddingLeft: 16 + nivel * 28 }}>
      <input
        type="color"
        aria-label={`Color de ${c.nombre}`}
        defaultValue={c.color}
        disabled={!puedeEditar}
        onBlur={(e) => e.target.value !== c.color && guardar(c, { color: e.target.value })}
        className="h-6 w-6 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
      />
      <input
        aria-label="Nombre"
        defaultValue={c.nombre}
        disabled={!puedeEditar}
        onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== c.nombre && guardar(c, { nombre: e.target.value.trim() })}
        className={`min-w-0 flex-1 rounded border border-transparent px-2 py-1 text-sm hover:border-slate-200 focus:border-blue-400 ${nivel === 0 ? 'font-medium text-slate-900' : 'text-slate-700'}`}
      />
      <label className="flex items-center gap-1 text-xs text-slate-500">
        IVA
        <input
          type="number"
          min={0}
          max={100}
          defaultValue={c.ivaPorcentaje ?? ''}
          placeholder="—"
          disabled={!puedeEditar}
          onBlur={(e) => {
            const v = e.target.value === '' ? null : Number(e.target.value);
            if (v !== c.ivaPorcentaje) guardar(c, { ivaPorcentaje: v });
          }}
          className="w-16 rounded border border-slate-200 px-2 py-1 text-right text-sm tabular-nums"
        />
        %
      </label>
      {!c.activa && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">archivada</span>}
      {puedeEditar && (
        <span className="flex gap-1">
          {nivel === 0 && c.activa && (
            <button
              onClick={() => setNueva((n) => ({ ...n, parentId: c.id, color: c.color }))}
              className="rounded p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-600"
              title={`Añadir subcategoría a ${c.nombre}`}
            >
              <Plus size={16} />
            </button>
          )}
          {c.activa ? (
            <>
              <button onClick={() => guardar(c, { activa: false })} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title={`Archivar ${c.nombre}`}>
                <Archive size={16} />
              </button>
              <button onClick={() => borrar(c)} className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title={`Borrar ${c.nombre}`}>
                <Trash size={16} />
              </button>
            </>
          ) : (
            <button onClick={() => guardar(c, { activa: true })} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" title={`Recuperar ${c.nombre}`}>
              <ArrowCounterClockwise size={16} />
            </button>
          )}
        </span>
      )}
    </li>
  );

  const padreElegido = arbol.find((c) => c.id === nueva.parentId);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-slate-900">Categorías de tesorería</h1>
          <Tooltip text="Agrupan los cobros y pagos del banco para analizar en qué entra y sale el dinero y preparar la previsión. No son cuentas contables: puedes organizarlas como quieras (por proyecto, cliente, área...)." />
        </div>
        <p className="mt-2 text-slate-600">Categorías y subcategorías para analizar cobros y pagos. El IVA es el habitual de la categoría y se propone al categorizar.</p>
      </div>

      <div className="flex gap-2 border-b border-slate-200" role="tablist">
        {(['GASTO', 'INGRESO'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tipo === t}
            onClick={() => {
              setTipo(t);
              setNueva((n) => ({ ...n, parentId: '' }));
            }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tipo === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            {t === 'GASTO' ? 'Pagos (gastos)' : 'Cobros (ingresos)'}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {aviso && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{aviso}</p>}

      {puedeEditar && (
        <form onSubmit={crear} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
          <div className="min-w-48 flex-1">
            <label htmlFor="nueva-cat" className="block text-sm font-medium text-slate-700">
              {padreElegido ? `Nueva subcategoría de «${padreElegido.nombre}»` : 'Nueva categoría'}
            </label>
            <input
              id="nueva-cat"
              value={nueva.nombre}
              onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })}
              placeholder={tipo === 'GASTO' ? 'Ej.: Vehículos' : 'Ej.: Alquileres cobrados'}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="nueva-color" className="block text-sm font-medium text-slate-700">Color</label>
            <input id="nueva-color" type="color" value={nueva.color} onChange={(e) => setNueva({ ...nueva, color: e.target.value })} className="mt-1 h-9 w-12 cursor-pointer rounded border border-slate-300" />
          </div>
          {padreElegido && (
            <button type="button" onClick={() => setNueva({ ...nueva, parentId: '' })} className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
              <X size={14} /> Sin categoría padre
            </button>
          )}
          <button type="submit" disabled={!nueva.nombre.trim()} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            Crear
          </button>
        </form>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {cargando ? (
          <p className="px-6 py-8 text-center text-slate-500">Cargando categorías...</p>
        ) : delTipo.length === 0 ? (
          <p className="px-6 py-8 text-center text-slate-500">No hay categorías.</p>
        ) : (
          <ul>
            {delTipo.map((c) => (
              <Fragment key={c.id}>
                {fila(c, 0)}
                {c.hijas.filter((h) => verArchivadas || h.activa).map((h) => fila(h, 1))}
              </Fragment>
            ))}
          </ul>
        )}
      </div>
      {archivadas > 0 && (
        <button onClick={() => setVerArchivadas((v) => !v)} className="text-sm font-medium text-blue-600 hover:text-blue-700">
          {verArchivadas ? 'Ocultar archivadas' : `Ver ${archivadas} archivada${archivadas === 1 ? '' : 's'}`}
        </button>
      )}
    </div>
  );
}
