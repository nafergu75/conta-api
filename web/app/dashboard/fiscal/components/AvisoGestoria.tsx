'use client';

import { useEffect, useState } from 'react';
import { Info } from '@phosphor-icons/react';
import { EVENTO_AVISO_GESTORIA } from '@/lib/api';

/**
 * Aviso en los modelos de un año que lleva la gestoría (Traer la contabilidad
 * de 2026): la consulta funciona, pero ese modelo lo presenta la gestoría. El
 * servidor lo manda en la cabecera X-Aviso-Gestoria y apiFetch lo reenvía como
 * evento; al consultar otro año, desaparece.
 */
export function AvisoGestoria() {
  const [texto, setTexto] = useState<string | null>(null);
  useEffect(() => {
    const oir = (e: Event) => setTexto((e as CustomEvent<string | null>).detail ?? null);
    window.addEventListener(EVENTO_AVISO_GESTORIA, oir);
    return () => window.removeEventListener(EVENTO_AVISO_GESTORIA, oir);
  }, []);
  if (!texto) return null;
  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-4 md:px-8">
      <p role="note" className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <Info size={18} className="mt-0.5 shrink-0" aria-hidden /> <span>{texto}</span>
      </p>
    </div>
  );
}
