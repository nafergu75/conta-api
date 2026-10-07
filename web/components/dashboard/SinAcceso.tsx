'use client';

import Link from 'next/link';
import { LockKey } from '@phosphor-icons/react';
import { ApiError } from '@/lib/api';

/** Lo que dice el servidor en un 403 de permisos, por si el error no trae texto. */
export const MENSAJE_SIN_ACCESO = 'No tienes permiso para esto en esta empresa. Si lo necesitas, pídeselo al administrador.';

/**
 * Si el error es un 403 (su acceso no incluye esta parte), el texto para el
 * aviso; si no, null. El 403 de «pon una contraseña tuya» no llega aquí:
 * apiFetch ya lleva a esa pantalla.
 */
export function mensajeSinAcceso(e: unknown): string | null {
  if (!(e instanceof ApiError) || e.status !== 403) return null;
  return e.message && !/^Error 403$/.test(e.message) ? e.message : MENSAJE_SIN_ACCESO;
}

/**
 * Pantalla entera para quien llega (con un enlace guardado o el historial) a
 * una parte que su acceso no incluye: sin estado vacío ni botones de crear,
 * que harían pensar que no hay datos.
 */
export function PantallaSinAcceso({ titulo, mensaje }: { titulo: string; mensaje?: string }) {
  return (
    <div>
      <header className="sticky top-0 z-40 h-16 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-full max-w-6xl items-center px-4 md:px-8">
          <h1 className="font-semibold text-slate-900">{titulo}</h1>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        <div role="status" className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          <LockKey size={20} className="mt-0.5 shrink-0 text-slate-400" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium text-slate-900">Tu acceso a esta empresa no incluye esta parte.</p>
            <p className="mt-1">{mensaje ?? MENSAJE_SIN_ACCESO}</p>
            <Link href="/dashboard" className="mt-3 inline-flex min-h-[44px] items-center font-medium text-accent-600 hover:text-accent-700">
              Ir al resumen
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
