'use client';

import { useEffect, useState } from 'react';
import { errorMessage } from '@/lib/api';
import { ANIO_GESTORIA, arranqueApi, varios, type PlanDeshacer } from '@/lib/arranque';
import { botonPeligro, botonSecundario, Dialogo, Nota } from './comun';

/**
 * Deshacer una carga: primero se ve qué se revierte (sin cambiar nada) y
 * después, si se puede, se deshace. Las fichas de clientes y proveedores que
 * creó la carga se borran solo si se marcan (y si no tienen facturas ni
 * apuntes).
 */
export function DeshacerCarga({ cargaId, puedeDeshacer, onCerrar, onHecho }: { cargaId: string; puedeDeshacer: boolean; onCerrar: () => void; onHecho: (texto: string) => void }) {
  const [plan, setPlan] = useState<PlanDeshacer | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [devolver, setDevolver] = useState(false);
  const [borrar, setBorrar] = useState<Set<string>>(new Set());

  useEffect(() => {
    arranqueApi
      .vistaDeshacer(cargaId)
      .then(setPlan)
      .catch((e) => setError(errorMessage(e)));
  }, [cargaId]);

  const deshacer = async () => {
    setOcupado(true);
    setError('');
    try {
      const r = await arranqueApi.deshacer(cargaId, { devolverAsientos2026: devolver, borrarFichas: Array.from(borrar) });
      onHecho(r.hecho ?? 'Carga deshecha.');
    } catch (e) {
      setError(errorMessage(e));
      setOcupado(false);
    }
  };

  const borrables = plan?.fichasCreadas.filter((f) => f.borrable) ?? [];
  const noBorrables = plan?.fichasCreadas.filter((f) => !f.borrable) ?? [];

  return (
    <Dialogo titulo={plan ? `Deshacer la versión ${plan.version}` : 'Deshacer la carga'} onCerrar={ocupado ? () => undefined : onCerrar} ancho="max-w-2xl">
      {!plan && !error && <p className="text-sm text-slate-600">Mirando qué se revertiría…</p>}
      {error && <Nota tipo="error">{error}</Nota>}
      {plan && (
        <div className="space-y-4 text-sm">
          {plan.bloqueos.length > 0 && (
            <Nota tipo="error">
              <p className="font-medium">Ahora no se puede deshacer:</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {plan.bloqueos.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </Nota>
          )}
          <div>
            <p className="font-medium text-slate-900">Esto es lo que se revierte, en este orden:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">
              {plan.acciones.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </div>

          {plan.asientos2026 > 0 && (
            <label className="flex items-start gap-2 text-slate-700">
              <input type="checkbox" className="mt-1" checked={devolver} disabled={!plan.puede || ocupado} onChange={(e) => setDevolver(e.target.checked)} />
              <span>
                Devolver a la contabilidad los {varios(plan.asientos2026, 'asiento', 'asientos')} de {ANIO_GESTORIA} hechos en la app que la carga retiró.
              </span>
            </label>
          )}

          {plan.fichasCreadas.length > 0 && (
            <div>
              <p className="font-medium text-slate-900">Clientes y proveedores que creó la carga</p>
              <p className="text-slate-600">Se quedan, salvo los que marques. Solo se pueden borrar los que no tienen facturas ni apuntes.</p>
              {borrables.length > 0 && (
                <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {borrables.map((f) => (
                    <li key={f.id}>
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={borrar.has(f.id)}
                          disabled={!plan.puede || ocupado}
                          onChange={(e) =>
                            setBorrar((s) => {
                              const n = new Set(s);
                              if (e.target.checked) n.add(f.id);
                              else n.delete(f.id);
                              return n;
                            })
                          }
                        />
                        <span className="min-w-0 break-words">
                          Borrar {f.tipo === 'cliente' ? 'el cliente' : 'el proveedor'} {f.nombre} <span className="text-slate-500">({f.nif})</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {borrables.length > 1 && plan.puede && (
                <button type="button" className="mt-1 text-xs font-medium text-emerald-700 hover:underline" onClick={() => setBorrar(new Set(borrables.map((f) => f.id)))}>
                  Marcar todos
                </button>
              )}
              {noBorrables.length > 0 && (
                <p className="mt-2 text-slate-600">
                  {varios(noBorrables.length, 'ficha se queda', 'fichas se quedan')} porque ya tienen movimientos: {noBorrables.slice(0, 5).map((f) => f.nombre).join(', ')}
                  {noBorrables.length > 5 ? '…' : '.'}
                </p>
              )}
            </div>
          )}
        </div>
      )}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
        {plan?.puede && puedeDeshacer && (
          <button type="button" className={botonPeligro} disabled={ocupado} onClick={deshacer}>
            {ocupado ? 'Deshaciendo…' : 'Deshacer la carga'}
          </button>
        )}
        <button type="button" className={botonSecundario} disabled={ocupado} onClick={onCerrar}>
          {plan?.puede && puedeDeshacer ? 'Cancelar' : 'Cerrar'}
        </button>
      </div>
      {plan?.puede && !puedeDeshacer && <p className="mt-2 text-xs text-slate-500">Solo un administrador de la empresa puede deshacer la carga.</p>}
    </Dialogo>
  );
}
