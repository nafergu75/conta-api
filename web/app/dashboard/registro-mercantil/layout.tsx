'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useEmpresaEspanola } from '@/lib/fiscal';

/**
 * El Registro Mercantil (legalizacion de libros y deposito de cuentas) es el
 * español: una empresa no establecida en España no lo usa. El menu ya no lo
 * enseña; esto cubre a quien llegue por un enlace guardado o desde Carmen.
 * Mientras se lee el pais (o si no se puede leer) se muestra la pantalla normal.
 */
export default function RegistroMercantilLayout({ children }: { children: ReactNode }) {
  const espanola = useEmpresaEspanola();
  if (espanola === false) {
    return (
      <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 md:px-8 md:py-8">
        <h1 className="text-2xl font-bold text-slate-900">Registro Mercantil</h1>
        <div role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          Esta empresa no está establecida en España, así que no legaliza libros ni deposita cuentas en el Registro Mercantil español. Para cerrar el
          ejercicio, usa{' '}
          <Link href="/dashboard/contabilidad/cierre-ejercicio" className="font-medium underline">
            Cierre y traspaso de saldos
          </Link>
          .
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
