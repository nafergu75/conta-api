'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowCounterClockwise, CheckCircle, LockKey, LockKeyOpen } from '@phosphor-icons/react';
import { Tooltip } from '@/app/dashboard/components/Tooltip';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { boton, botonSecundario, campo, Dato, eur, fechaEs, Mensajes, num } from '../importacion';

/**
 * Cierre del ejercicio y traspaso de saldos: regularizacion (6/7 a la 129),
 * cierre de las cuentas de balance y apertura del ejercicio siguiente.
 */

interface Linea {
  cuenta: string;
  nombre: string;
  debe: number;
  haber: number;
}

interface VistaCierre {
  ejercicio: number;
  estado: 'ABIERTO' | 'CERRADO';
  ingresos: number;
  gastos: number;
  resultado: number;
  resultadoAnteriores: number;
  periodosAbiertos: number;
  bancos: { exigido: boolean; cuadra: boolean; descuadradas: number };
  asientos: Array<{ tipo: 'REGULARIZACION' | 'CIERRE' | 'APERTURA'; fecha: string; concepto: string; lineas: Linea[]; debe: number; haber: number }>;
  cierreExistente: Array<{ id: string; numero: string; tipo: string; fecha: string }>;
  siguiente: { ejercicio: number; existe: boolean; apertura: { id: string; numero: string } | null; otrosAsientos: number; cerrado: boolean };
  avisos: string[];
  motivosBloqueo: string[];
  puedeCerrar: boolean;
  puedeDeshacer: boolean;
  motivoNoDeshacer: string | null;
}

const NOMBRE_TIPO: Record<string, string> = {
  REGULARIZACION: 'Regularización',
  CIERRE: 'Cierre',
  APERTURA: 'Apertura',
};

const anioActual = new Date().getFullYear();

export default function CierreEjercicioPage() {
  const puedeEditar = tieneAlgunPermiso(getUser(), ['contabilidad:write']);
  const [ejercicio, setEjercicio] = useState(anioActual - 1);
  const [reemplazarApertura, setReemplazarApertura] = useState(false);
  const [vista, setVista] = useState<VistaCierre | null>(null);
  const [cargando, setCargando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      setVista(await apiFetch<VistaCierre>(companyPath(`/periodos/cierre?ejercicio=${ejercicio}${reemplazarApertura ? '&reemplazarApertura=1' : ''}`)));
    } catch (e) {
      setVista(null);
      setError(errorMessage(e));
    } finally {
      setCargando(false);
    }
  }, [ejercicio, reemplazarApertura]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cerrar = async () => {
    setOcupado(true);
    setError('');
    try {
      const r = await apiFetch<{ resultadoEjercicio: number; numeros: Record<string, string> }>(companyPath(`/periodos/cierre?ejercicio=${ejercicio}`), {
        method: 'POST',
        body: JSON.stringify({ reemplazarApertura }),
      });
      setAviso(
        `Ejercicio ${ejercicio} cerrado con un resultado de ${eur.format(r.resultadoEjercicio)}. Asientos: ${Object.entries(r.numeros)
          .map(([t, n]) => `${NOMBRE_TIPO[t] ?? t} ${n}`)
          .join(', ')}. El ${ejercicio + 1} ya está abierto con los saldos traspasados.`,
      );
      setConfirmando(false);
      setReemplazarApertura(false);
      await cargar();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOcupado(false);
    }
  };

  const deshacer = async () => {
    if (!window.confirm(`Se anularán la regularización y el cierre del ${ejercicio} y la apertura del ${ejercicio + 1}, y el ejercicio volverá a estar abierto. ¿Continuar?`)) return;
    setOcupado(true);
    setError('');
    try {
      const r = await apiFetch<{ anulados: number }>(companyPath(`/periodos/cierre?ejercicio=${ejercicio}`), { method: 'DELETE' });
      setAviso(`Cierre del ${ejercicio} deshecho: ${r.anulados} asientos anulados. El ejercicio vuelve a estar abierto.`);
      await cargar();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOcupado(false);
    }
  };

  const anios = Array.from({ length: 8 }, (_, i) => anioActual + 1 - i);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Cierre y traspaso de saldos</h1>
          <Tooltip text="Lleva gastos e ingresos a la cuenta 129, cierra las cuentas de balance y abre el ejercicio siguiente con los mismos saldos. Se puede deshacer mientras el año siguiente solo tenga la apertura." />
        </div>
        <p className="mt-2 text-slate-600">Revisa el resumen y los asientos que se van a crear antes de cerrar.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm font-medium text-slate-700">
          Ejercicio
          <select
            className={`${campo} w-40`}
            value={ejercicio}
            onChange={(e) => {
              setEjercicio(Number(e.target.value));
              setAviso('');
              setConfirmando(false);
              setReemplazarApertura(false);
            }}
          >
            {anios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        {vista && (
          <span
            className={`mb-1 inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${
              vista.estado === 'CERRADO' ? 'bg-slate-100 text-slate-700' : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            {vista.estado === 'CERRADO' ? <LockKey size={16} /> : <LockKeyOpen size={16} />}
            {vista.estado === 'CERRADO' ? 'Cerrado' : 'Abierto'}
          </span>
        )}
      </div>

      {aviso && (
        <p className="flex gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle size={18} className="mt-0.5 shrink-0" /> <span>{aviso}</span>
        </p>
      )}
      {error && <Mensajes errores={[error]} />}
      {cargando && !vista && <p className="text-sm text-slate-500">Calculando...</p>}

      {vista && vista.estado === 'ABIERTO' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Dato titulo="Ingresos (grupo 7)" valor={eur.format(vista.ingresos)} />
            <Dato titulo="Gastos (grupo 6)" valor={eur.format(vista.gastos)} />
            <Dato titulo={vista.resultado >= 0 ? 'Beneficio' : 'Pérdida'} valor={eur.format(vista.resultado)} tono={vista.resultado >= 0 ? 'bien' : 'mal'} />
            <Dato titulo="Meses aún abiertos" valor={vista.periodosAbiertos} />
          </div>

          <Mensajes errores={vista.motivosBloqueo} avisos={vista.avisos} />

          {vista.siguiente.apertura && puedeEditar && (
            <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-4 text-sm">
              <input type="checkbox" className="mt-1" checked={reemplazarApertura} onChange={(e) => setReemplazarApertura(e.target.checked)} />
              <span>
                Sustituir la apertura existente del {vista.siguiente.ejercicio} ({vista.siguiente.apertura.numero}) por la que sale de este cierre.
              </span>
            </label>
          )}

          {vista.asientos.map((a) => (
            <details key={a.tipo} className="rounded-lg border border-slate-200 bg-white" open={a.tipo === 'REGULARIZACION' && a.lineas.length <= 12}>
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="font-medium text-slate-900">
                  {a.concepto} <span className="font-normal text-slate-500">· {fechaEs(a.fecha)} · {a.lineas.length} apuntes</span>
                </span>
                <span className="tabular-nums text-slate-700">{eur.format(a.debe)}</span>
              </summary>
              <div className="overflow-x-auto border-t border-slate-100">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Cuenta</th>
                      <th className="px-3 py-2 font-medium">Nombre</th>
                      <th className="px-3 py-2 text-right font-medium">Debe</th>
                      <th className="px-3 py-2 text-right font-medium">Haber</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {a.lineas.map((l) => (
                      <tr key={l.cuenta}>
                        <td className="px-3 py-1.5 font-mono">{l.cuenta}</td>
                        <td className="px-3 py-1.5 text-slate-700">{l.nombre}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{l.debe ? num.format(l.debe) : ''}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{l.haber ? num.format(l.haber) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-semibold text-slate-900">
                    <tr>
                      <td className="px-3 py-2" colSpan={2}>
                        Total
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{num.format(a.debe)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{num.format(a.haber)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </details>
          ))}

          {puedeEditar && (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              {!confirmando ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-600">
                    Se crearán {vista.asientos.length} asientos, se bloquearán los meses del {vista.ejercicio} y se abrirá el {vista.siguiente.ejercicio}
                    {vista.siguiente.existe ? '' : ' (se crea el ejercicio)'}.
                  </p>
                  <button onClick={() => setConfirmando(true)} disabled={!vista.puedeCerrar || ocupado} className={boton}>
                    <LockKey size={16} /> Cerrar ejercicio y abrir el siguiente
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-slate-900">
                    ¿Cerrar el ejercicio {vista.ejercicio} con un {vista.resultado >= 0 ? 'beneficio' : 'resultado negativo'} de {eur.format(vista.resultado)}?
                  </p>
                  <p className="text-sm text-slate-600">
                    Después no se podrán añadir asientos al {vista.ejercicio}. Si te equivocas, podrás deshacer el cierre mientras el {vista.siguiente.ejercicio} no tenga más
                    asientos que la apertura.
                  </p>
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button onClick={() => setConfirmando(false)} disabled={ocupado} className={botonSecundario}>
                      Cancelar
                    </button>
                    <button onClick={cerrar} disabled={ocupado} className={boton}>
                      {ocupado ? 'Cerrando...' : 'Sí, cerrar el ejercicio'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {vista && vista.estado === 'CERRADO' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
            <p className="font-medium text-slate-900">El ejercicio {vista.ejercicio} está cerrado.</p>
            {vista.cierreExistente.length > 0 && (
              <ul className="mt-2 space-y-1 text-slate-600">
                {vista.cierreExistente.map((a) => (
                  <li key={a.id}>
                    {NOMBRE_TIPO[a.tipo] ?? a.tipo}: <span className="font-mono">{a.numero}</span> del {fechaEs(a.fecha)}
                  </li>
                ))}
                {vista.siguiente.apertura && (
                  <li>
                    Apertura del {vista.siguiente.ejercicio}: <span className="font-mono">{vista.siguiente.apertura.numero}</span>
                  </li>
                )}
              </ul>
            )}
          </div>
          {puedeEditar &&
            (vista.puedeDeshacer ? (
              <button onClick={deshacer} disabled={ocupado} className={botonSecundario}>
                <ArrowCounterClockwise size={16} /> {ocupado ? 'Deshaciendo...' : 'Deshacer cierre'}
              </button>
            ) : (
              vista.motivoNoDeshacer && <p className="text-sm text-slate-500">{vista.motivoNoDeshacer}</p>
            ))}
        </div>
      )}
    </div>
  );
}
