'use client';

import { useEffect, useState } from 'react';
import { X } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';

export interface Familia {
  id: string;
  codigo: string;
  nombre: string;
  ivaPorcentaje: number | null;
  cuentaVentas: string | null;
  activa: boolean;
  parentId: string | null;
  productos: number;
  hijas: Familia[];
}

export interface Producto {
  id: string;
  referencia: string;
  descripcion: string;
  precio: number;
  ivaPorcentaje: number;
  unidad: string;
  tipo: 'PRODUCTO' | 'SERVICIO';
  precioCompra: number | null;
  cuentaVentas: string | null;
  cuentaVentasEfectiva: string;
  notas: string | null;
  bloqueado: boolean;
  familiaId: string | null;
  familia: { id: string; codigo: string; nombre: string } | null;
}

/** Familias en lista plana, con las subfamilias detras de su familia. */
export function familiasPlanas(arbol: Familia[]) {
  return arbol.flatMap((f) => [{ ...f, nivel: 0 }, ...f.hijas.map((h) => ({ ...h, nivel: 1 }))]);
}

const UNIDADES = ['ud', 'h', 'kg', 'l', 'm', 'm2', 'día', 'mes', 'servicio'];
const IVAS = [21, 10, 4, 0];
const campo = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500';
const num = (s: string) => Number(String(s).replace(',', '.'));

/** Alta o edicion de un producto. Al elegir familia propone el siguiente codigo y su IVA. */
export function ProductoModal({
  producto,
  familias,
  onCerrar,
  onGuardado,
}: {
  producto: Producto | null; // null = nuevo
  familias: Familia[];
  onCerrar: () => void;
  onGuardado: (p: Producto) => void;
}) {
  const [f, setF] = useState({
    referencia: producto?.referencia ?? '',
    descripcion: producto?.descripcion ?? '',
    familiaId: producto?.familiaId ?? '',
    tipo: producto?.tipo ?? 'PRODUCTO',
    unidad: producto?.unidad ?? 'ud',
    precio: producto ? String(producto.precio) : '',
    ivaPorcentaje: String(producto?.ivaPorcentaje ?? 21),
    precioCompra: producto?.precioCompra == null ? '' : String(producto.precioCompra),
    cuentaVentas: producto?.cuentaVentas ?? '',
    notas: producto?.notas ?? '',
  });
  const [codigoTocado, setCodigoTocado] = useState(Boolean(producto));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const planas = familiasPlanas(familias).filter((x) => x.activa || x.id === producto?.familiaId);

  // Producto nuevo: codigo sugerido segun la familia (mientras no lo escriba el usuario).
  useEffect(() => {
    if (codigoTocado) return;
    const q = f.familiaId ? `?familiaId=${encodeURIComponent(f.familiaId)}` : '';
    apiFetch<{ codigo: string }>(companyPath(`/productos/siguiente-codigo${q}`))
      .then((r) => setF((x) => ({ ...x, referencia: r.codigo })))
      .catch(() => undefined);
  }, [f.familiaId, codigoTocado]);

  const elegirFamilia = (familiaId: string) => {
    const fam = planas.find((x) => x.id === familiaId);
    setF((x) => ({ ...x, familiaId, ...(!producto && fam?.ivaPorcentaje != null && { ivaPorcentaje: String(fam.ivaPorcentaje) }) }));
  };

  const precioConIva = Math.round(num(f.precio || '0') * (1 + num(f.ivaPorcentaje || '0') / 100) * 100) / 100;
  const margen = f.precioCompra && num(f.precio) > 0 ? Math.round(((num(f.precio) - num(f.precioCompra)) / num(f.precio)) * 1000) / 10 : null;

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError('');
    try {
      const cuerpo = {
        referencia: f.referencia.trim(),
        descripcion: f.descripcion.trim(),
        familiaId: f.familiaId || null,
        tipo: f.tipo,
        unidad: f.unidad,
        precio: num(f.precio || '0'),
        ivaPorcentaje: num(f.ivaPorcentaje || '0'),
        precioCompra: f.precioCompra === '' ? null : num(f.precioCompra),
        cuentaVentas: f.cuentaVentas.trim() || null,
        notas: f.notas.trim() || null,
      };
      const r = await apiFetch<Producto>(companyPath(producto ? `/productos/${producto.id}` : '/productos'), {
        method: producto ? 'PUT' : 'POST',
        body: JSON.stringify(cuerpo),
      });
      onGuardado(r);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setGuardando(false);
    }
  };

  const fam = planas.find((x) => x.id === f.familiaId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="prod-titulo">
      <form onSubmit={guardar} className="max-h-[90dvh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-lg bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 id="prod-titulo" className="text-lg font-semibold text-slate-900">{producto ? `Producto ${producto.referencia}` : 'Nuevo producto'}</h2>
          <button type="button" onClick={onCerrar} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
          <div className="md:col-span-3">
            <label htmlFor="p-familia" className="block text-sm font-medium text-slate-700">Familia</label>
            <select id="p-familia" value={f.familiaId} onChange={(e) => elegirFamilia(e.target.value)} className={campo}>
              <option value="">Sin familia</option>
              {planas.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nivel ? '   · ' : ''}
                  {x.codigo} · {x.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3">
            <label htmlFor="p-codigo" className="block text-sm font-medium text-slate-700">Código</label>
            <input
              id="p-codigo"
              value={f.referencia}
              onChange={(e) => {
                setCodigoTocado(true);
                setF({ ...f, referencia: e.target.value });
              }}
              className={`${campo} font-mono`}
              required
            />
            {!producto && <p className="mt-1 text-xs text-slate-500">Te proponemos el siguiente libre{fam ? ` de la familia ${fam.codigo}` : ''}.</p>}
          </div>
          <div className="md:col-span-6">
            <label htmlFor="p-desc" className="block text-sm font-medium text-slate-700">Descripción</label>
            <input id="p-desc" value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} className={campo} required placeholder="Lo que saldrá en la línea de la factura" />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="p-tipo" className="block text-sm font-medium text-slate-700">Tipo</label>
            <select id="p-tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as 'PRODUCTO' | 'SERVICIO' })} className={campo}>
              <option value="PRODUCTO">Producto</option>
              <option value="SERVICIO">Servicio</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="p-unidad" className="block text-sm font-medium text-slate-700">Unidad</label>
            <input id="p-unidad" list="unidades" value={f.unidad} onChange={(e) => setF({ ...f, unidad: e.target.value })} className={campo} />
            <datalist id="unidades">{UNIDADES.map((u) => <option key={u} value={u} />)}</datalist>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="p-iva" className="block text-sm font-medium text-slate-700">IVA %</label>
            <input id="p-iva" list="ivas" inputMode="decimal" value={f.ivaPorcentaje} onChange={(e) => setF({ ...f, ivaPorcentaje: e.target.value })} className={`${campo} text-right tabular-nums`} />
            <datalist id="ivas">{IVAS.map((i) => <option key={i} value={i} />)}</datalist>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="p-precio" className="block text-sm font-medium text-slate-700">Precio de venta (sin IVA)</label>
            <input id="p-precio" inputMode="decimal" value={f.precio} onChange={(e) => setF({ ...f, precio: e.target.value })} className={`${campo} text-right tabular-nums`} placeholder="0,00" />
            <p className="mt-1 text-xs text-slate-500 tabular-nums">Con IVA: {precioConIva.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="p-compra" className="block text-sm font-medium text-slate-700">Precio de compra <span className="font-normal text-slate-500">(opcional)</span></label>
            <input id="p-compra" inputMode="decimal" value={f.precioCompra} onChange={(e) => setF({ ...f, precioCompra: e.target.value })} className={`${campo} text-right tabular-nums`} />
            {margen !== null && <p className="mt-1 text-xs text-slate-500 tabular-nums">Margen: {margen.toLocaleString('es-ES')} %</p>}
          </div>
          <div className="md:col-span-2">
            <label htmlFor="p-cuenta" className="block text-sm font-medium text-slate-700">Cuenta de ventas <span className="font-normal text-slate-500">(opcional)</span></label>
            <input id="p-cuenta" inputMode="numeric" value={f.cuentaVentas} onChange={(e) => setF({ ...f, cuentaVentas: e.target.value })} className={`${campo} font-mono`} placeholder={fam?.cuentaVentas ?? (f.tipo === 'SERVICIO' ? '705' : '700')} />
            <p className="mt-1 text-xs text-slate-500">Si la dejas vacía, la de la familia o la habitual.</p>
          </div>
          <div className="md:col-span-6">
            <label htmlFor="p-notas" className="block text-sm font-medium text-slate-700">Notas internas <span className="font-normal text-slate-500">(no salen en la factura)</span></label>
            <textarea id="p-notas" rows={2} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} className={campo} />
          </div>
        </div>

        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCerrar} disabled={guardando} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
            Cancelar
          </button>
          <button type="submit" disabled={guardando} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {guardando ? 'Guardando...' : producto ? 'Guardar' : 'Crear producto'}
          </button>
        </div>
      </form>
    </div>
  );
}
