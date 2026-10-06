'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { FileXls, MagnifyingGlass, PencilSimple, Plus, Trash, UploadSimple, X } from '@phosphor-icons/react';
import { Tooltip } from '@/app/dashboard/components/Tooltip';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { familiasPlanas, ProductoModal, type Familia, type Producto } from './ProductoModal';

/**
 * Catalogo de productos y servicios por codigos y familias, para rellenar las
 * lineas de las facturas sin teclear descripcion, precio ni IVA.
 */

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
type Pestana = 'productos' | 'familias' | 'importar';

export default function ProductosPage() {
  const puedeEditar = tieneAlgunPermiso(getUser(), ['ventas:write', 'contabilidad:write']);
  const [pestana, setPestana] = useState<Pestana>('productos');
  const [familias, setFamilias] = useState<Familia[]>([]);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const cargarFamilias = useCallback(async () => {
    try {
      setFamilias(await apiFetch<Familia[]>(companyPath('/productos/familias')));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    cargarFamilias();
  }, [cargarFamilias]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-slate-900">Productos</h1>
          <Tooltip text="Catálogo de productos y servicios con su código, familia, precio, IVA y unidad. Al hacer una factura, eliges el producto y la línea se rellena sola." />
        </div>
        <p className="mt-2 text-slate-600">Productos y servicios por códigos y familias, para hacer las facturas más rápido.</p>
      </div>

      <div className="flex gap-2 border-b border-slate-200" role="tablist">
        {(
          [
            ['productos', 'Productos'],
            ['familias', 'Familias'],
            ...(puedeEditar ? [['importar', 'Importar desde Excel']] : []),
          ] as Array<[Pestana, string]>
        ).map(([id, texto]) => (
          <button
            key={id}
            role="tab"
            aria-selected={pestana === id}
            onClick={() => {
              setPestana(id);
              setAviso('');
              setError('');
            }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${pestana === id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            {texto}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {aviso && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{aviso}</p>}

      {pestana === 'productos' && <ListaProductos familias={familias} puedeEditar={puedeEditar} onError={setError} onAviso={setAviso} />}
      {pestana === 'familias' && <Familias familias={familias} puedeEditar={puedeEditar} recargar={cargarFamilias} onError={setError} onAviso={setAviso} />}
      {pestana === 'importar' && (
        <Importar
          onImportado={(texto) => {
            setAviso(texto);
            cargarFamilias();
            setPestana('productos');
          }}
        />
      )}
    </div>
  );
}

function ListaProductos({
  familias,
  puedeEditar,
  onError,
  onAviso,
}: {
  familias: Familia[];
  puedeEditar: boolean;
  onError: (s: string) => void;
  onAviso: (s: string) => void;
}) {
  const [items, setItems] = useState<Producto[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [familiaId, setFamiliaId] = useState('');
  const [verBajas, setVerBajas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [editando, setEditando] = useState<Producto | null | 'nuevo'>(null);

  const cargar = useCallback(async () => {
    const p = new URLSearchParams({ limit: '200' });
    if (busqueda) p.set('q', busqueda);
    if (familiaId) p.set('familiaId', familiaId);
    if (!verBajas) p.set('activos', 'true');
    try {
      const r = await apiFetch<{ items: Producto[]; total: number }>(companyPath(`/productos?${p}`));
      setItems(r.items);
      setTotal(r.total);
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setCargando(false);
    }
  }, [busqueda, familiaId, verBajas, onError]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const baja = async (p: Producto) => {
    try {
      await apiFetch(companyPath(`/productos/${p.id}`), { method: 'DELETE' });
      onAviso(`Producto ${p.referencia} eliminado. Si ya estaba en alguna factura, se ha dado de baja para conservar el histórico.`);
      await cargar();
    } catch (e) {
      onError(errorMessage(e));
    }
  };

  const reactivar = async (p: Producto) => {
    try {
      await apiFetch(companyPath(`/productos/${p.id}`), { method: 'PUT', body: JSON.stringify({ bloqueado: false }) });
      await cargar();
    } catch (e) {
      onError(errorMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setBusqueda(q.trim());
          }}
          className="relative min-w-56 flex-1"
        >
          <label htmlFor="pr-q" className="block text-xs font-medium text-slate-600">Buscar</label>
          <MagnifyingGlass size={16} className="pointer-events-none absolute bottom-2.5 left-3 text-slate-400" />
          <input id="pr-q" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => setBusqueda(q.trim())} placeholder="Código o descripción" className="mt-1 w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm" />
        </form>
        <div>
          <label htmlFor="pr-fam" className="block text-xs font-medium text-slate-600">Familia</label>
          <select id="pr-fam" value={familiaId} onChange={(e) => setFamiliaId(e.target.value)} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">Todas</option>
            {familiasPlanas(familias).map((f) => (
              <option key={f.id} value={f.id}>
                {f.nivel ? '   · ' : ''}
                {f.codigo} · {f.nombre}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
          <input type="checkbox" checked={verBajas} onChange={(e) => setVerBajas(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          Ver dados de baja
        </label>
        {puedeEditar && (
          <button onClick={() => setEditando('nuevo')} className="ml-auto flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            <Plus size={16} /> Nuevo producto
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Descripción</th>
              <th className="px-4 py-3 font-medium">Familia</th>
              <th className="px-4 py-3 text-right font-medium">Precio</th>
              <th className="px-4 py-3 text-right font-medium">IVA</th>
              <th className="px-4 py-3 font-medium">Unidad</th>
              <th className="px-4 py-3"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {cargando ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Cargando productos...</td></tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  {busqueda || familiaId ? 'Ningún producto coincide con la búsqueda.' : 'Todavía no hay productos. Crea el primero o impórtalos desde un Excel.'}
                </td>
              </tr>
            ) : (
              items.map((p) => (
                <tr key={p.id} className={p.bloqueado ? 'text-slate-400' : ''}>
                  <td className="whitespace-nowrap px-4 py-2 font-mono">{p.referencia}</td>
                  <td className="px-4 py-2">
                    {p.descripcion}
                    {p.tipo === 'SERVICIO' && <span className="ml-2 rounded bg-sky-50 px-1.5 py-0.5 text-xs text-sky-700">servicio</span>}
                    {p.bloqueado && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs">de baja</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-600">{p.familia ? `${p.familia.codigo} · ${p.familia.nombre}` : '—'}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{eur.format(p.precio)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{p.ivaPorcentaje} %</td>
                  <td className="px-4 py-2 text-slate-600">{p.unidad}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    {puedeEditar && (
                      <span className="flex justify-end gap-1">
                        <button onClick={() => setEditando(p)} className="rounded p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-600" title={`Editar ${p.referencia}`}>
                          <PencilSimple size={16} />
                        </button>
                        {p.bloqueado ? (
                          <button onClick={() => reactivar(p)} className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50">
                            Reactivar
                          </button>
                        ) : (
                          <button onClick={() => baja(p)} className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title={`Eliminar ${p.referencia}`}>
                            <Trash size={16} />
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {total > items.length && <p className="text-sm text-slate-500">Se muestran {items.length} de {total}. Busca por código o descripción para encontrar el resto.</p>}

      {editando && (
        <ProductoModal
          producto={editando === 'nuevo' ? null : editando}
          familias={familias}
          onCerrar={() => setEditando(null)}
          onGuardado={(p) => {
            setEditando(null);
            onAviso(`Producto ${p.referencia} guardado.`);
            cargar();
          }}
        />
      )}
    </div>
  );
}

function Familias({
  familias,
  puedeEditar,
  recargar,
  onError,
  onAviso,
}: {
  familias: Familia[];
  puedeEditar: boolean;
  recargar: () => Promise<void>;
  onError: (s: string) => void;
  onAviso: (s: string) => void;
}) {
  const [nueva, setNueva] = useState({ codigo: '', nombre: '', ivaPorcentaje: '', cuentaVentas: '', parentId: '' });

  const pedir = async (fn: () => Promise<unknown>, ok: string) => {
    onError('');
    onAviso('');
    try {
      await fn();
      onAviso(ok);
      await recargar();
      return true;
    } catch (e) {
      onError(errorMessage(e));
      return false;
    }
  };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await pedir(
      () =>
        apiFetch(companyPath('/productos/familias'), {
          method: 'POST',
          body: JSON.stringify({
            codigo: nueva.codigo,
            nombre: nueva.nombre,
            ivaPorcentaje: nueva.ivaPorcentaje === '' ? null : Number(nueva.ivaPorcentaje.replace(',', '.')),
            cuentaVentas: nueva.cuentaVentas || null,
            parentId: nueva.parentId || undefined,
          }),
        }),
      `Familia ${nueva.codigo.toUpperCase()} creada.`,
    );
    if (ok) setNueva({ codigo: '', nombre: '', ivaPorcentaje: '', cuentaVentas: '', parentId: '' });
  };

  const guardar = (f: Familia, cambios: Record<string, unknown>) =>
    pedir(() => apiFetch(companyPath(`/productos/familias/${f.id}`), { method: 'PATCH', body: JSON.stringify(cambios) }), `Familia ${f.codigo} guardada.`);

  const borrar = (f: Familia) => pedir(() => apiFetch(companyPath(`/productos/familias/${f.id}`), { method: 'DELETE' }), `Familia ${f.codigo} borrada.`);

  const celda = 'rounded border border-transparent px-2 py-1 text-sm hover:border-slate-200 focus:border-blue-400 disabled:hover:border-transparent';

  const fila = (f: Familia, nivel: number) => (
    <tr key={f.id} className={f.activa ? '' : 'text-slate-400'}>
      <td className="px-4 py-2 font-mono" style={{ paddingLeft: 16 + nivel * 24 }}>{f.codigo}</td>
      <td className="px-4 py-2">
        <input aria-label={`Nombre de la familia ${f.codigo}`} defaultValue={f.nombre} disabled={!puedeEditar} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== f.nombre && guardar(f, { nombre: e.target.value.trim() })} className={`${celda} w-full`} />
      </td>
      <td className="px-4 py-2">
        <input aria-label={`IVA de la familia ${f.codigo}`} defaultValue={f.ivaPorcentaje ?? ''} placeholder="—" disabled={!puedeEditar} onBlur={(e) => { const v = e.target.value === '' ? null : Number(e.target.value.replace(',', '.')); if (v !== f.ivaPorcentaje) guardar(f, { ivaPorcentaje: v }); }} className={`${celda} w-16 text-right tabular-nums`} />
      </td>
      <td className="px-4 py-2">
        <input aria-label={`Cuenta de ventas de la familia ${f.codigo}`} defaultValue={f.cuentaVentas ?? ''} placeholder="700" disabled={!puedeEditar} onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== f.cuentaVentas) guardar(f, { cuentaVentas: v }); }} className={`${celda} w-28 font-mono`} />
      </td>
      <td className="px-4 py-2 text-right tabular-nums text-slate-600">{f.productos}</td>
      <td className="px-4 py-2 text-right">
        {puedeEditar && (
          <span className="flex justify-end gap-1">
            {nivel === 0 && (
              <button onClick={() => setNueva((n) => ({ ...n, parentId: f.id, codigo: f.codigo }))} className="rounded p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-600" title={`Añadir subfamilia a ${f.nombre}`}>
                <Plus size={16} />
              </button>
            )}
            {f.productos === 0 && f.hijas.length === 0 ? (
              <button onClick={() => borrar(f)} className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title={`Borrar ${f.nombre}`}>
                <Trash size={16} />
              </button>
            ) : (
              <button onClick={() => guardar(f, { activa: !f.activa })} className="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">
                {f.activa ? 'Desactivar' : 'Activar'}
              </button>
            )}
          </span>
        )}
      </td>
    </tr>
  );

  const padre = familias.find((f) => f.id === nueva.parentId);

  return (
    <div className="space-y-4">
      {puedeEditar && (
        <form onSubmit={crear} className="grid grid-cols-2 items-end gap-3 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-6">
          <div>
            <label htmlFor="fa-codigo" className="block text-xs font-medium text-slate-600">Código</label>
            <input id="fa-codigo" value={nueva.codigo} onChange={(e) => setNueva({ ...nueva, codigo: e.target.value })} placeholder="01" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase" required />
          </div>
          <div className="col-span-2">
            <label htmlFor="fa-nombre" className="block text-xs font-medium text-slate-600">{padre ? `Subfamilia de «${padre.nombre}»` : 'Nombre'}</label>
            <input id="fa-nombre" value={nueva.nombre} onChange={(e) => setNueva({ ...nueva, nombre: e.target.value })} placeholder="Bebidas" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
          </div>
          <div>
            <label htmlFor="fa-iva" className="block text-xs font-medium text-slate-600">IVA %</label>
            <input id="fa-iva" inputMode="decimal" value={nueva.ivaPorcentaje} onChange={(e) => setNueva({ ...nueva, ivaPorcentaje: e.target.value })} placeholder="21" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm" />
          </div>
          <div>
            <label htmlFor="fa-cuenta" className="block text-xs font-medium text-slate-600">Cuenta de ventas</label>
            <input id="fa-cuenta" inputMode="numeric" value={nueva.cuentaVentas} onChange={(e) => setNueva({ ...nueva, cuentaVentas: e.target.value })} placeholder="700" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm" />
          </div>
          <div className="flex gap-2">
            {padre && (
              <button type="button" onClick={() => setNueva({ ...nueva, parentId: '' })} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Crear como familia principal">
                <X size={16} />
              </button>
            )}
            <button type="submit" className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Crear</button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">IVA %</th>
              <th className="px-4 py-3 font-medium">Cuenta de ventas</th>
              <th className="px-4 py-3 text-right font-medium">Productos</th>
              <th className="px-4 py-3"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {familias.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Todavía no hay familias. Agrupar los productos facilita encontrarlos y numerarlos (01001, 01002...).</td></tr>
            ) : (
              familias.map((f) => (
                <Fragment key={f.id}>
                  {fila(f, 0)}
                  {f.hijas.map((h) => fila(h, 1))}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface VistaImportacion {
  total: number;
  nuevos: number;
  actualizados: number;
  familiasNuevas: string[];
  muestra?: Array<{ fila: number; referencia: string; descripcion: string; familia?: string; precio: number; ivaPorcentaje?: number }>;
}

function Importar({ onImportado }: { onImportado: (texto: string) => void }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<VistaImportacion | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const enviar = (f: File, vistaPrevia: boolean) => {
    const d = new FormData();
    d.append('archivo', f);
    return apiFetch<VistaImportacion>(companyPath(`/productos/importar${vistaPrevia ? '?vistaPrevia=1' : ''}`), { method: 'POST', body: d });
  };

  const elegir = async (f: File | undefined) => {
    if (!f) return;
    setArchivo(f);
    setVista(null);
    setError('');
    setOcupado(true);
    try {
      setVista(await enviar(f, true));
    } catch (e) {
      setError(errorMessage(e));
      if (input.current) input.current.value = '';
    } finally {
      setOcupado(false);
    }
  };

  const importar = async () => {
    if (!archivo) return;
    setOcupado(true);
    setError('');
    try {
      const r = await enviar(archivo, false);
      onImportado(`Catálogo importado: ${r.nuevos} productos nuevos y ${r.actualizados} actualizados${r.familiasNuevas.length ? `; familias nuevas: ${r.familiasNuevas.join(', ')}` : ''}.`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
      {!vista && (
        <label
          className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-8 transition hover:border-blue-400 hover:bg-blue-50"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            elegir(e.dataTransfer.files?.[0]);
          }}
        >
          <UploadSimple size={32} className="mb-2 text-slate-400" />
          <span className="text-sm font-medium text-slate-900">{ocupado ? 'Leyendo el catálogo...' : 'Haz clic o arrastra tu catálogo'}</span>
          <span className="mt-1 text-xs text-slate-500">Excel (.xlsx, .xls) o CSV con las columnas Código y Descripción como mínimo</span>
          <input ref={input} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => elegir(e.target.files?.[0])} disabled={ocupado} className="sr-only" />
        </label>
      )}

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {vista && (
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
            <FileXls size={20} className="text-emerald-600" /> {archivo?.name}
          </p>
          <p className="text-sm text-slate-700">
            {vista.total} productos: <strong>{vista.nuevos}</strong> {vista.nuevos === 1 ? 'nuevo' : 'nuevos'} y <strong>{vista.actualizados}</strong>{' '}
            {vista.actualizados === 1 ? 'que ya existe y se actualizará' : 'que ya existen y se actualizarán'} (mismo código).
            {vista.familiasNuevas.length > 0 && ` Se crearán las familias: ${vista.familiasNuevas.join(', ')}.`}
          </p>
          {vista.muestra && (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Código</th>
                    <th className="px-3 py-2 font-medium">Descripción</th>
                    <th className="px-3 py-2 font-medium">Familia</th>
                    <th className="px-3 py-2 text-right font-medium">Precio</th>
                    <th className="px-3 py-2 text-right font-medium">IVA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vista.muestra.map((m) => (
                    <tr key={m.fila}>
                      <td className="px-3 py-2 font-mono">{m.referencia}</td>
                      <td className="px-3 py-2">{m.descripcion}</td>
                      <td className="px-3 py-2 text-slate-600">{m.familia ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{eur.format(m.precio)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m.ivaPorcentaje === undefined ? '—' : `${m.ivaPorcentaje} %`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                setVista(null);
                setArchivo(null);
                if (input.current) input.current.value = '';
              }}
              disabled={ocupado}
              className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
            >
              Cancelar
            </button>
            <button onClick={importar} disabled={ocupado} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {ocupado ? 'Importando...' : `Importar ${vista.total} productos`}
            </button>
          </div>
        </div>
      )}

      <div className="text-xs text-slate-500">
        <p className="font-medium text-slate-600">Columnas que se reconocen (en cualquier orden):</p>
        <p>Código · Descripción · Familia · Precio (o PVP) · IVA · Unidad · Tipo (producto/servicio) · Precio de compra · Cuenta de ventas.</p>
        <p className="mt-1">Si un código ya existe, se actualiza. Si una familia no existe, se crea.</p>
      </div>
    </div>
  );
}
