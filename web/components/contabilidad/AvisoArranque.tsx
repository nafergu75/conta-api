'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ClockCounterClockwise, Info, WarningCircle } from '@phosphor-icons/react';
import { arranqueApi, type AvisoArranque as Aviso } from '@/lib/arranque';

/**
 * Aviso fijo del panel de «Traer la contabilidad de 2026»:
 *  - rojo si una importación se quedó a medias;
 *  - ámbar si a la contabilidad traída le faltan datos (hasta 5 puntos);
 *  - azul, invitación a traerla antes del primer cliente o proveedor.
 * No pinta nada si el servidor no tiene nada que avisar o si falla (el resto
 * del panel sigue igual). Solo lo pide quien tiene Contabilidad «Ver».
 */
export function AvisoArranque() {
  const [aviso, setAviso] = useState<Aviso | null>(null);

  useEffect(() => {
    let vivo = true;
    arranqueApi
      .aviso()
      .then((a) => {
        if (vivo) setAviso(a ?? null);
      })
      .catch(() => {
        // Sin aviso: no se molesta con un error aquí.
      });
    return () => {
      vivo = false;
    };
  }, []);

  if (!aviso) return null;

  const estilo =
    aviso.nivel === 'A_MEDIAS'
      ? { caja: 'border-red-200 bg-red-50', texto: 'text-red-800', icono: <WarningCircle size={22} className="shrink-0 text-red-600" />, boton: 'Seguir o deshacer' }
      : aviso.nivel === 'FALTAN_DATOS'
        ? { caja: 'border-amber-200 bg-amber-50', texto: 'text-amber-900', icono: <ClockCounterClockwise size={22} className="shrink-0 text-amber-600" />, boton: 'Completar los datos' }
        : { caja: 'border-sky-200 bg-sky-50', texto: 'text-sky-900', icono: <Info size={22} className="shrink-0 text-sky-600" />, boton: 'Traer la contabilidad' };
  const resto = aviso.total - aviso.puntos.length;

  return (
    <section role={aviso.nivel === 'INVITACION' ? 'status' : 'alert'} aria-label="Contabilidad del año anterior" className={`rounded-xl border p-4 ${estilo.caja}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3">
          {estilo.icono}
          <div className={`min-w-0 text-sm ${estilo.texto}`}>
            <p className="font-medium">{aviso.texto}</p>
            {aviso.puntos.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {aviso.puntos.map((p) => (
                  <li key={p} className="break-words">
                    {p}
                  </li>
                ))}
              </ul>
            )}
            {resto > 0 && <p className="mt-1">y {resto === 1 ? 'otro punto más' : `${resto} puntos más`}.</p>}
          </div>
        </div>
        <Link
          href={aviso.enlace}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 self-start rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          {estilo.boton} <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  );
}
