'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { fechaCorta } from '@/lib/compras';
import { formatoImporte } from '@/lib/moneda';

/**
 * 111 y 115: retención de abonos que no cabe en el modelo del periodo (se
 * resta casilla a casilla y como mucho hasta cero). Ese exceso no se resta en
 * ningún otro periodo: se recupera pidiendo la rectificación del modelo en que
 * se declaró. En la contabilidad pasa de la 4751 a la 4709 (Hacienda deudora)
 * con un asiento propio: POST /tax-models/<111|115>/traspaso-4709 (y /anular).
 */

export interface Traspaso4709 {
  asientoId: string;
  numero: string;
  fecha: string;
  importe: number;
}

export function Traspaso4709Panel({
  codigo,
  ejercicio,
  periodo,
  exceso,
  traspaso,
  onCambio,
}: {
  codigo: '111' | '115';
  ejercicio: number;
  periodo: string;
  /** Retención de abonos que no cabe en el modelo (null o 0: no hay). */
  exceso: number | null | undefined;
  traspaso: Traspaso4709 | null | undefined;
  onCambio: () => void;
}) {
  const user = getUser();
  const puede = tieneAlgunPermiso(user, ['impuestos:write', 'contabilidad:write']);
  const veAsiento = tieneAlgunPermiso(user, ['contabilidad:read', 'contabilidad:write']);
  const [fecha, setFecha] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  if (!exceso || exceso <= 0) return null;
  const eur = (n: number) => formatoImporte(n, 'EUR');

  const pasar = async () => {
    setOcupado(true);
    setError('');
    setAviso('');
    try {
      const r = await apiFetch<{ importe: number; asiento: Traspaso4709 }>(companyPath(`/tax-models/${codigo}/traspaso-4709`), {
        method: 'POST',
        body: JSON.stringify({ ejercicio, periodo, ...(fecha ? { fecha } : {}) }),
      });
      setAviso(`Hecho: ${eur(r.importe)} pasados de la 4751 a la 4709 (asiento ${r.asiento.numero}).`);
      onCambio();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOcupado(false);
    }
  };

  const anular = async () => {
    if (!traspaso || !window.confirm(`¿Anular el asiento ${traspaso.numero}? El exceso vuelve a quedar en la 4751.`)) return;
    setOcupado(true);
    setError('');
    setAviso('');
    try {
      await apiFetch(companyPath(`/tax-models/${codigo}/traspaso-4709/anular`), { method: 'POST', body: JSON.stringify({ ejercicio, periodo }) });
      setAviso('Traspaso anulado.');
      onCambio();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 md:p-6">
      <h2 className="font-semibold">Retención de abonos que no cabe en este {codigo}</h2>
      <p>
        Los abonos del periodo restan {eur(exceso)} más de retención de lo que este modelo puede restar: el {codigo} no admite importes negativos. Esa parte no se resta
        en ningún otro periodo: se recupera pidiendo la rectificación del {codigo} en que se declaró la factura original.
      </p>
      {traspaso ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <p>
            Ya está pasada de la 4751 a la 4709 con el asiento{' '}
            {veAsiento ? (
              <Link href={`/dashboard/motor-contable/${encodeURIComponent(traspaso.asientoId)}`} className="font-mono font-semibold underline">
                {traspaso.numero}
              </Link>
            ) : (
              <span className="font-mono font-semibold">{traspaso.numero}</span>
            )}{' '}
            del {fechaCorta(traspaso.fecha)} ({eur(traspaso.importe)}).
          </p>
          {puede && (
            <button type="button" disabled={ocupado} onClick={anular} className="self-start font-semibold text-red-700 hover:underline disabled:opacity-50 sm:ml-auto">
              Anular el traspaso
            </button>
          )}
        </div>
      ) : puede ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div>
            <label htmlFor={`t4709-fecha-${codigo}`} className="mb-1 block text-xs font-medium text-amber-900">
              Fecha del asiento
            </label>
            <input
              id={`t4709-fecha-${codigo}`}
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 sm:w-auto"
            />
            <p className="mt-1 text-xs text-amber-800">Vacía: el último día del periodo.</p>
          </div>
          <button
            type="button"
            disabled={ocupado}
            onClick={pasar}
            className="self-start rounded-lg bg-amber-600 px-4 py-2 font-semibold text-white hover:bg-amber-700 disabled:opacity-60 sm:mb-5"
          >
            {ocupado ? 'Pasando…' : 'Pasar a la 4709'}
          </button>
        </div>
      ) : (
        <p>Para pasarla de la 4751 a la 4709 hace falta el permiso de escritura en Impuestos o en Contabilidad.</p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
          {error}
        </p>
      )}
      {aviso && (
        <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-800">
          {aviso}
        </p>
      )}
    </section>
  );
}
