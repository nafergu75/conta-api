'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CaretLeft } from '@phosphor-icons/react';
import { ProveedorConfiguracion } from './contexto';
import { BASE, Indice } from './indice';

/**
 * Configuracion: indice lateral en escritorio; en el movil, la portada muestra
 * el indice como lista y cada bloque lleva un enlace para volver a ella. Un
 * bloque que se puede ver pero no cambiar se abre en modo lectura.
 */

function Marco({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const enPortada = pathname === BASE;
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <div className="md:grid md:grid-cols-[210px_minmax(0,1fr)] md:gap-8">
        <aside className="hidden md:block">
          <div className="sticky top-6">
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Configuración</p>
            <Indice variante="lateral" />
          </div>
        </aside>
        <div className="min-w-0 space-y-6">
          {/* Movil: desde un bloque se vuelve a la portada, que lleva el indice como lista. */}
          {!enPortada && (
            <Link href={BASE} className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 md:hidden">
              <CaretLeft size={16} /> Configuración
            </Link>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

export default function ConfiguracionLayout({ children }: { children: ReactNode }) {
  return (
    <ProveedorConfiguracion>
      <Marco>{children}</Marco>
    </ProveedorConfiguracion>
  );
}
