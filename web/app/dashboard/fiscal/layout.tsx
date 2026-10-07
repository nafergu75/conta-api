'use client';

import type { ReactNode } from 'react';
import { useEmpresaEspanola } from '@/lib/fiscal';

/**
 * Los modelos fiscales son los de la AEAT (303, 111, 115, 347, 390, 190, 200):
 * una empresa no establecida en España no los presenta. El menú ya no los
 * enseña y el servidor los rechaza; esto cubre a quien llegue por un enlace
 * guardado o desde Carmen. Mientras se lee el país (o si no se puede leer) se
 * muestra la pantalla normal.
 */
export default function FiscalLayout({ children }: { children: ReactNode }) {
  const espanola = useEmpresaEspanola();
  if (espanola === false) {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 md:px-8 md:py-8">
        <h1 className="text-2xl font-bold text-slate-900">Modelos Fiscales</h1>
        <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          Esta empresa no está establecida en España, así que no presenta modelos de la AEAT (IVA, retenciones, Impuesto sobre Sociedades). Si
          tiene establecimiento permanente en España, su país tiene que ser España (en Datos de la empresa).
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
