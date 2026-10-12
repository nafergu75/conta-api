'use client';

import Link from 'next/link';
import { Info, Warning } from '@phosphor-icons/react';
import { anioEspana } from '@/lib/anios';

/** Avisos del calculo en ambar; los de nominas, con enlace a Nominas del mes. */
export function AvisosModelo({ avisos, ejercicio, mes }: { avisos?: string[]; ejercicio: number; mes?: number }) {
  if (!avisos?.length) return null;
  const conNominas = avisos.some((a) => /nómina/i.test(a));
  return (
    <div role="status" className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      <ul className="space-y-1">
        {avisos.map((a) => (
          <li key={a} className="flex gap-2">
            <Warning size={18} className="mt-0.5 shrink-0" aria-hidden /> <span>{a}</span>
          </li>
        ))}
      </ul>
      {conNominas && (
        <Link href={mes ? `/dashboard/nominas?ejercicio=${ejercicio}&mes=${mes}` : '/dashboard/nominas'} className="inline-block font-medium underline">
          Ir a Nóminas
        </Link>
      )}
    </div>
  );
}

/**
 * Modelos anuales (390, 190, 180, 347, 200) de un ejercicio que aún no ha
 * terminado en hora de Madrid: lo que se ve es una vista previa con los datos
 * de hoy y todavía no se puede presentar.
 */
export function AvisoEjercicioEnCurso({ ejercicio }: { ejercicio: number }) {
  if (ejercicio < anioEspana()) return null;
  return (
    <p role="note" className="flex w-full gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
      <Info size={18} className="mt-0.5 shrink-0" aria-hidden />
      <span>
        El ejercicio {ejercicio} aún no ha terminado: esto es una vista previa con los datos de hoy. Se presenta a partir del 1 de enero de {ejercicio + 1}.
      </span>
    </p>
  );
}
