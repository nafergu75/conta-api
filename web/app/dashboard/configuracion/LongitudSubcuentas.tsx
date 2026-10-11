'use client';

import { useEffect, useState } from 'react';
import { LockSimple, UsersThree } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import type { LongitudSubcuentas as Longitud } from '@/lib/subcuentas';
import { Mensaje, type MensajeConfig } from './componentes';

/**
 * Digitos de las subcuentas de clientes y proveedores (430, 400 y 410 + numero).
 * Se elige una vez: en cuanto un cliente o proveedor tiene subcuenta, queda
 * fijada (cambiarla obligaria a renumerar toda la contabilidad).
 */
export function LongitudSubcuentas({ puedeEditar }: { puedeEditar: boolean }) {
  const [datos, setDatos] = useState<Longitud | null>(null);
  const [valor, setValor] = useState(8);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState<MensajeConfig>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    apiFetch<Longitud>(companyPath('/reglas-contables/longitud-subcuentas'))
      .then((d) => {
        setDatos(d);
        setValor(d.longitud);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  const guardar = async () => {
    setGuardando(true);
    setMensaje(null);
    try {
      const d = await apiFetch<Longitud>(companyPath('/reglas-contables/longitud-subcuentas'), { method: 'PUT', body: JSON.stringify({ longitud: valor }) });
      setDatos(d);
      setValor(d.longitud);
      setMensaje({ ok: true, texto: `Guardado: las subcuentas de clientes y proveedores tendrán ${d.longitud} dígitos.` });
    } catch (e) {
      setMensaje({ ok: false, texto: errorMessage(e) });
    } finally {
      setGuardando(false);
    }
  };

  const ejemplo = (n: number) => `430${'1'.padStart(n - 3, '0')}`;
  const opciones = datos ? Array.from({ length: datos.maximo - datos.minimo + 1 }, (_, i) => datos.minimo + i) : [];
  const bloqueada = !!datos?.bloqueada;
  const editable = puedeEditar && !bloqueada;

  return (
    <section aria-labelledby="longitud-subcuentas" className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
      <h2 id="longitud-subcuentas" className="flex items-center gap-2 font-semibold text-slate-900">
        <UsersThree size={20} className="text-slate-500" /> Subcuentas de clientes y proveedores
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Cada cliente tiene su subcuenta de la 430 y cada proveedor las suyas de la 400 y la 410, con el mismo número. Aquí eliges cuántos dígitos tienen.
      </p>

      {error ? (
        <p className="mt-3 text-sm text-red-700">No se ha podido leer: {error}</p>
      ) : !datos ? (
        <p className="mt-3 text-sm text-slate-500">Cargando…</p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="sm:w-56">
              <label htmlFor="cfg-longitud" className="mb-1 block text-sm font-medium text-slate-700">
                Dígitos de las subcuentas
              </label>
              <select
                id="cfg-longitud"
                value={valor}
                disabled={!editable || guardando}
                onChange={(e) => setValor(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
              >
                {opciones.map((n) => (
                  <option key={n} value={n}>
                    {n} dígitos (p. ej. {ejemplo(n)})
                  </option>
                ))}
              </select>
            </div>
            {editable && (
              <button
                type="button"
                onClick={guardar}
                disabled={guardando || valor === datos.longitud}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            )}
          </div>

          {bloqueada ? (
            <p className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <LockSimple size={18} className="mt-0.5 shrink-0 text-slate-500" />
              <span>
                Ya no se puede cambiar: hay clientes o proveedores con subcuenta asignada y cambiarla obligaría a renumerar toda la contabilidad.
              </span>
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              {datos.guardada ? '' : 'Aún no la has elegido: se usan 8 dígitos, lo habitual (hasta 99.999 clientes). '}
              Si traes el plan contable del año anterior, la puesta en marcha pone la longitud de ese plan. En cuanto un cliente o proveedor tenga subcuenta, ya no se podrá
              cambiar.
            </p>
          )}
          {!puedeEditar && !bloqueada && <p className="text-xs text-slate-500">La cambia el administrador de la empresa o quien lleva la contabilidad.</p>}
          <Mensaje mensaje={mensaje} onCerrar={() => setMensaje(null)} />
        </div>
      )}
    </section>
  );
}
