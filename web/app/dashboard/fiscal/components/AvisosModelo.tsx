'use client';

import Link from 'next/link';
import { Warning } from '@phosphor-icons/react';

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
