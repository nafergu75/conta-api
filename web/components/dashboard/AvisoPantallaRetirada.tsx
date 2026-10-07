'use client';

import Link from 'next/link';

/**
 * Lo que ve quien entra por la URL a una pantalla retirada del menú hasta que
 * funcione (ver esRutaDesactivada en nav.ts), en lugar de la pantalla.
 */
export function AvisoPantallaRetirada({ titulo, mensaje }: { titulo: string; mensaje: string }) {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 md:px-8 md:py-8">
      <h1 className="text-2xl font-bold text-slate-900">{titulo}</h1>
      <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        {mensaje}
      </div>
      <Link href="/dashboard/compras" className="inline-flex text-sm font-medium text-accent-600 hover:text-accent-700">
        Ir a Compras
      </Link>
    </div>
  );
}
