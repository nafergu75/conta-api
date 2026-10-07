'use client';

import type { ReactNode } from 'react';
import { useEmpresaEspanola } from '@/lib/fiscal';
import { Alerta, pagina } from './comun';

/**
 * Las nominas son las de la gestoria espanola (Seguridad Social, IRPF, 111 y
 * 190): una empresa no establecida en Espana no las usa. El menu ya no las
 * ensena; esto cubre a quien llegue por un enlace guardado. Mientras se lee el
 * pais (o si no se puede leer) se muestra la pantalla normal.
 */
export default function NominasLayout({ children }: { children: ReactNode }) {
  const espanola = useEmpresaEspanola();
  if (espanola === false) {
    return (
      <div className={pagina}>
        <h1 className="text-2xl font-bold text-slate-900">Nóminas</h1>
        <Alerta tipo="info">
          Esta empresa no está establecida en España, así que no lleva nóminas de la gestoría española (Seguridad Social, IRPF y modelos 111 y
          190). Si tiene establecimiento permanente en España, su país tiene que ser España (en Datos de la empresa).
        </Alerta>
      </div>
    );
  }
  return <>{children}</>;
}
