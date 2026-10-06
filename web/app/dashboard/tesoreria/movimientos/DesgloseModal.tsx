'use client';

import { useState } from 'react';
import { Plus, Trash, X } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { aplanar, eur, ivaIncluido, type Categoria } from '../categoriasTesoreria';

interface Parte {
  importe: string; // en positivo, como lo escribe el usuario
  categoriaId: string;
  ivaPorcentaje: string;
}

export interface MovimientoDesglose {
  id: string;
  fecha: string;
  concepto: string;
  importe: number;
  partes: Array<{ importe: number; categoriaId: string | null; ivaPorcentaje: number | null }>;
}

const num = (s: string) => Number(String(s).replace(',', '.'));

/**
 * Reparte un movimiento en varias categorias (p. ej. un pago de software que
 * es mitad marketing y mitad comercial). Las partes suman el importe exacto;
 * el IVA va incluido en cada parte y se muestra su importe.
 */
export function DesgloseModal({
  movimiento,
  categorias,
  onCerrar,
  onGuardado,
}: {
  movimiento: MovimientoDesglose;
  categorias: Categoria[];
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const signo = movimiento.importe < 0 ? -1 : 1;
  const total = Math.abs(movimiento.importe);
  const opciones = aplanar(categorias, signo < 0 ? 'GASTO' : 'INGRESO', true);
  const iniciales: Parte[] = movimiento.partes.length
    ? movimiento.partes.map((p) => ({ importe: String(Math.abs(p.importe)), categoriaId: p.categoriaId ?? '', ivaPorcentaje: p.ivaPorcentaje == null ? '' : String(p.ivaPorcentaje) }))
    : [
        { importe: (Math.round((total / 2) * 100) / 100).toFixed(2), categoriaId: '', ivaPorcentaje: '' },
        { importe: (total - Math.round((total / 2) * 100) / 100).toFixed(2), categoriaId: '', ivaPorcentaje: '' },
      ];
  const [partes, setPartes] = useState<Parte[]>(iniciales);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const suma = Math.round(partes.reduce((t, p) => t + (num(p.importe) || 0), 0) * 100) / 100;
  const diferencia = Math.round((total - suma) * 100) / 100;

  const cambiar = (i: number, cambio: Partial<Parte>) => {
    setPartes((ps) =>
      ps.map((p, j) => {
        if (j !== i) return p;
        const nueva = { ...p, ...cambio };
        // Al elegir categoria, se propone su IVA habitual.
        if (cambio.categoriaId !== undefined && !p.ivaPorcentaje) {
          const c = opciones.find((o) => o.id === cambio.categoriaId);
          if (c?.ivaPorcentaje != null) nueva.ivaPorcentaje = String(c.ivaPorcentaje);
        }
        return nueva;
      }),
    );
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (diferencia !== 0) return setError(`Las partes suman ${eur.format(suma)} y el movimiento es de ${eur.format(total)}.`);
    setGuardando(true);
    setError('');
    try {
      await apiFetch(companyPath(`/treasury/movimientos/${movimiento.id}/desglose`), {
        method: 'PUT',
        body: JSON.stringify({
          partes: partes.map((p) => ({
            importe: signo * num(p.importe),
            categoriaId: p.categoriaId || null,
            ivaPorcentaje: p.ivaPorcentaje === '' ? null : num(p.ivaPorcentaje),
          })),
        }),
      });
      onGuardado();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setGuardando(false);
    }
  };

  const deshacer = async () => {
    setGuardando(true);
    try {
      await apiFetch(companyPath(`/treasury/movimientos/${movimiento.id}/desglose`), { method: 'DELETE' });
      onGuardado();
    } catch (err) {
      setError(errorMessage(err));
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="desglose-titulo">
      <form onSubmit={guardar} className="w-full max-w-2xl space-y-4 rounded-lg bg-white p-6 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="desglose-titulo" className="text-lg font-semibold text-slate-900">Desglosar movimiento</h2>
            <p className="mt-1 text-sm text-slate-600">
              {new Date(`${movimiento.fecha}T00:00:00`).toLocaleDateString('es-ES')} · {movimiento.concepto} ·{' '}
              <strong className="tabular-nums">{eur.format(movimiento.importe)}</strong>
            </p>
          </div>
          <button type="button" onClick={onCerrar} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="pb-2 font-medium">Importe (IVA incluido)</th>
                <th className="pb-2 font-medium">IVA %</th>
                <th className="pb-2 text-right font-medium">Cuota de IVA</th>
                <th className="pb-2 pl-3 font-medium">Categoría</th>
                <th className="pb-2"><span className="sr-only">Quitar</span></th>
              </tr>
            </thead>
            <tbody>
              {partes.map((p, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2">
                    <input aria-label={`Importe de la parte ${i + 1}`} inputMode="decimal" value={p.importe} onChange={(e) => cambiar(i, { importe: e.target.value })} className="w-32 rounded border border-slate-300 px-2 py-1.5 text-right tabular-nums" />
                  </td>
                  <td className="py-1 pr-2">
                    <input aria-label={`IVA de la parte ${i + 1}`} inputMode="decimal" value={p.ivaPorcentaje} placeholder="—" onChange={(e) => cambiar(i, { ivaPorcentaje: e.target.value })} className="w-16 rounded border border-slate-300 px-2 py-1.5 text-right tabular-nums" />
                  </td>
                  <td className="py-1 text-right tabular-nums text-slate-600">{eur.format(ivaIncluido(num(p.importe) || 0, p.ivaPorcentaje === '' ? null : num(p.ivaPorcentaje)))}</td>
                  <td className="py-1 pl-3">
                    <select aria-label={`Categoría de la parte ${i + 1}`} value={p.categoriaId} onChange={(e) => cambiar(i, { categoriaId: e.target.value })} className="w-full rounded border border-slate-300 px-2 py-1.5">
                      <option value="">Sin categoría</option>
                      {opciones.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.nivel ? `   · ${o.nombre}` : o.nombre}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1 pl-2">
                    {partes.length > 2 && (
                      <button type="button" onClick={() => setPartes((ps) => ps.filter((_, j) => j !== i))} className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600" aria-label={`Quitar la parte ${i + 1}`}>
                        <Trash size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <button
            type="button"
            onClick={() => setPartes((ps) => [...ps, { importe: diferencia > 0 ? diferencia.toFixed(2) : '', categoriaId: '', ivaPorcentaje: '' }])}
            disabled={partes.length >= 20}
            className="flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700"
          >
            <Plus size={16} /> Añadir parte
          </button>
          <span className={`tabular-nums ${diferencia === 0 ? 'text-green-700' : 'text-amber-700'}`}>
            {diferencia === 0 ? 'Cuadra con el movimiento' : `Faltan ${eur.format(diferencia)} por repartir`}
          </span>
        </div>

        {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <div className="flex flex-wrap justify-between gap-3 pt-2">
          {movimiento.partes.length > 0 ? (
            <button type="button" onClick={deshacer} disabled={guardando} className="rounded-lg px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
              Deshacer desglose
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-3">
            <button type="button" onClick={onCerrar} disabled={guardando} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
              Cancelar
            </button>
            <button type="submit" disabled={guardando || diferencia !== 0} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {guardando ? 'Guardando...' : 'Guardar desglose'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
