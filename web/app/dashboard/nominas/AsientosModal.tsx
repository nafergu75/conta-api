'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, XCircle } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { Alerta, boton, botonSecundario, EstadoBadge, eur, fechaEs, Modal, num, periodoTexto } from './comun';

/**
 * Asientos de las nominas de un mes: los ya contabilizados tal como estan y,
 * para las que siguen en borrador, el que se generaria (uno por trabajador,
 * con su subcuenta 465). Desde aqui se confirma la contabilizacion.
 */

interface LineaAsiento {
  cuenta: string;
  nombre: string;
  debe: number;
  haber: number;
}

interface AsientoPrevio {
  nominaId: string;
  trabajador: string;
  nif: string;
  estado: string;
  numero: string | null;
  fecha: string;
  concepto: string;
  subcuentaNueva: boolean;
  lineas: LineaAsiento[];
  debe: number;
  haber: number;
  cuadra: boolean;
  error: string | null;
}

export function AsientosModal({
  ejercicio,
  mes,
  nominaIds,
  contabilizar,
  onCerrar,
  onContabilizado,
}: {
  ejercicio: number;
  mes: number;
  /** Solo estas nominas (si no, todas las del mes). */
  nominaIds?: string[];
  /** Muestra solo las de borrador y el boton de contabilizar. */
  contabilizar?: boolean;
  onCerrar: () => void;
  onContabilizado?: (mensaje: string, avisos?: string[]) => void;
}) {
  const [asientos, setAsientos] = useState<AsientoPrevio[] | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const ids = nominaIds?.join(',') ?? '';

  useEffect(() => {
    const q = ids ? `?nominaIds=${encodeURIComponent(ids)}` : '';
    apiFetch<{ asientos: AsientoPrevio[] }>(companyPath(`/nominas/periodos/${ejercicio}/${mes}/asiento-preview${q}`))
      .then((r) => setAsientos(contabilizar ? r.asientos.filter((a) => a.estado === 'BORRADOR') : r.asientos))
      .catch((e) => setError(errorMessage(e)));
  }, [ejercicio, mes, ids, contabilizar]);

  const descuadrados = (asientos ?? []).filter((a) => !a.cuadra);
  const nuevas = (asientos ?? []).filter((a) => a.subcuentaNueva).length;

  const confirmar = async () => {
    if (!asientos?.length) return;
    setOcupado(true);
    setError('');
    try {
      const r = await apiFetch<{ contabilizadas: number; asientos: Array<{ numero: string }>; subcuentasCreadas: string[]; avisos?: string[] }>(
        companyPath(`/nominas/periodos/${ejercicio}/${mes}/contabilizar`),
        { method: 'POST', body: JSON.stringify(nominaIds?.length ? { nominaIds: asientos.map((a) => a.nominaId) } : {}) },
      );
      const numeros = r.asientos.map((a) => a.numero);
      onContabilizado?.(
        `${r.contabilizadas} ${r.contabilizadas === 1 ? 'nómina contabilizada' : 'nóminas contabilizadas'} (${numeros.length > 3 ? `${numeros[0]} a ${numeros[numeros.length - 1]}` : numeros.join(', ')}).` +
          (r.subcuentasCreadas.length ? ` Subcuentas nuevas: ${r.subcuentasCreadas.join(', ')}.` : ''),
        r.avisos,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOcupado(false);
    }
  };

  const titulo = contabilizar ? `Contabilizar las nóminas de ${periodoTexto(ejercicio, mes)}` : `Asientos de ${periodoTexto(ejercicio, mes)}`;

  return (
    <Modal titulo={titulo} onCerrar={onCerrar} ancho="max-w-4xl">
      <div className="space-y-4">
        {asientos === null && !error && <p className="text-sm text-slate-500">Preparando los asientos...</p>}
        {asientos && asientos.length === 0 && <p className="text-sm text-slate-600">{contabilizar ? 'No hay nóminas en borrador que contabilizar.' : 'Este mes no tiene nóminas.'}</p>}
        {contabilizar && asientos && asientos.length > 0 && (
          <p className="text-sm text-slate-600">
            Se creará un asiento por trabajador con fecha del último día del mes. El líquido queda en la subcuenta 465 de cada uno hasta que se pague. En el diario el trabajador va por su
            subcuenta, sin su nombre: la contabilidad la ven usuarios que no tienen acceso a las nóminas.
            {nuevas > 0 && ` Se crearán ${nuevas} ${nuevas === 1 ? 'subcuenta 465 nueva' : 'subcuentas 465 nuevas'} en el plan contable.`}
          </p>
        )}

        {(asientos ?? []).map((a, i) => (
          <details key={a.nominaId} open={(asientos?.length ?? 0) <= 3 || i === 0 || !a.cuadra} className="rounded-lg border border-slate-200 bg-white">
            <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
              {a.cuadra ? <CheckCircle size={18} weight="fill" className="text-emerald-600" aria-label="Cuadra" /> : <XCircle size={18} weight="fill" className="text-red-600" aria-label="No cuadra" />}
              <span className="font-medium text-slate-900">{a.trabajador}</span>
              <span className="font-mono text-xs text-slate-500">{a.nif}</span>
              <EstadoBadge estado={a.estado} />
              <span className="text-slate-600">{a.numero ? `Asiento ${a.numero}` : 'Propuesta'} · {fechaEs(a.fecha)}</span>
              <span className="ml-auto tabular-nums text-slate-700">{eur.format(a.debe)}</span>
            </summary>
            <div className="space-y-2 border-t border-slate-100 p-3">
              <p className="text-xs text-slate-500">{a.concepto}</p>
              {a.error && <Alerta tipo="error">{a.error}</Alerta>}
              {a.subcuentaNueva && <p className="text-xs text-sky-700">La subcuenta 465 de este trabajador se creará al contabilizar.</p>}
              {a.lineas.length > 0 && (
                // En el movil el concepto va bajo la cuenta, para que el debe y el haber se vean sin desplazar.
                <div className="relative overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-slate-500">
                      <tr>
                        <th className="px-2 py-1 font-medium">Cuenta</th>
                        <th className="hidden px-2 py-1 font-medium sm:table-cell">Concepto</th>
                        <th className="px-2 py-1 text-right font-medium">Debe</th>
                        <th className="px-2 py-1 text-right font-medium">Haber</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {a.lineas.map((l, j) => (
                        <tr key={`${l.cuenta}-${j}`}>
                          <td className="px-2 py-1">
                            <span className="whitespace-nowrap font-mono">{l.cuenta}</span>
                            <span className="block text-xs text-slate-500 sm:hidden">{l.nombre}</span>
                          </td>
                          <td className="hidden px-2 py-1 text-slate-700 sm:table-cell">{l.nombre}</td>
                          <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">{l.debe ? num.format(l.debe) : ''}</td>
                          <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums">{l.haber ? num.format(l.haber) : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="font-semibold text-slate-900">
                      <tr className="border-t border-slate-200">
                        <td className="px-2 py-1">Total</td>
                        <td className="hidden sm:table-cell" />
                        <td className="px-2 py-1 text-right tabular-nums">{num.format(a.debe)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{num.format(a.haber)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </details>
        ))}

        {error && <Alerta tipo="error">{error}</Alerta>}
        {contabilizar && descuadrados.length > 0 && (
          <Alerta tipo="error">
            {descuadrados.length} {descuadrados.length === 1 ? 'nómina no cuadra' : 'nóminas no cuadran'}: corrígelas antes de contabilizar.
          </Alerta>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCerrar} disabled={ocupado} className={botonSecundario}>
            {contabilizar ? 'Cancelar' : 'Cerrar'}
          </button>
          {contabilizar && (
            <button type="button" onClick={confirmar} disabled={ocupado || !asientos?.length || descuadrados.length > 0} className={boton}>
              {ocupado ? 'Contabilizando...' : `Contabilizar ${asientos?.length ?? ''} ${asientos?.length === 1 ? 'nómina' : 'nóminas'}`}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
