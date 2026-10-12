import type { ReactNode } from 'react';

/**
 * Margen lateral y ancho máximo de las pantallas cuyas páginas no lo ponen
 * (modelos fiscales, Registro Mercantil, informes, mayor de terceros, cierre
 * y puesta en marcha). Es el mismo que ya llevaban Ventas o el aviso de
 * empresa no española: 16 px en el móvil y 32 px en pantallas anchas.
 */
export default function MargenPagina({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-8">{children}</div>;
}
