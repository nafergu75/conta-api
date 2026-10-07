'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ClockCounterClockwise, NotePencil, Robot, X } from '@phosphor-icons/react';
import { useCarmen, RUTA_CARMEN } from './CarmenProvider';
import { CarmenConversacion } from './CarmenConversacion';
import { CarmenEntrada } from './CarmenEntrada';
import { CarmenPie } from './CarmenPie';
import { useAtraparFoco } from './useAtraparFoco';

const iconoCabecera =
  'flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500';

/**
 * Ventana de Carmen: panel lateral de 420 px en escritorio y hoja a pantalla
 * completa en el móvil, con la pregunta abajo. Es modal: el foco no sale de la
 * ventana, Esc la cierra y el foco vuelve al botón flotante.
 */
export function CarmenPanel() {
  const { disponible, abierto, cerrar, nuevaConversacion, mensajes, enviando, entradaRef } = useCarmen();
  const ventanaRef = useRef<HTMLDivElement>(null);

  useAtraparFoco(ventanaRef, abierto, cerrar);

  // Al abrir, el foco va a la pregunta; la página de debajo no se desplaza.
  useEffect(() => {
    if (!abierto) return;
    const t = window.setTimeout(() => entradaRef.current?.focus(), 30);
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.clearTimeout(t);
      document.body.style.overflow = previo;
    };
  }, [abierto, entradaRef]);

  if (!disponible || !abierto) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Fondo: en escritorio se ve la pantalla detrás; un clic fuera cierra. */}
      <div className="absolute inset-0 hidden bg-slate-900/25 md:block" onClick={cerrar} aria-hidden="true" />
      <div
        ref={ventanaRef}
        id="carmen-ventana"
        role="dialog"
        aria-modal="true"
        aria-labelledby="carmen-ventana-titulo"
        className="absolute inset-0 flex h-[100dvh] flex-col overflow-x-hidden bg-white md:left-auto md:w-[420px] md:border-l md:border-slate-200 md:shadow-xl"
      >
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 px-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-700" aria-hidden="true">
            <Robot size={18} weight="duotone" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="carmen-ventana-titulo" className="text-sm font-semibold text-slate-900">
              Carmen
            </h2>
            <p className="truncate text-xs text-slate-500">Tus datos y tus dudas contables</p>
          </div>
          <button
            type="button"
            onClick={nuevaConversacion}
            disabled={enviando || mensajes.length === 0}
            className={`${iconoCabecera} disabled:opacity-40`}
            aria-label="Nueva conversación"
            title="Nueva conversación"
          >
            <NotePencil size={18} aria-hidden="true" />
          </button>
          <Link href={RUTA_CARMEN} className={iconoCabecera} aria-label="Ver todas tus conversaciones" title="Conversaciones">
            <ClockCounterClockwise size={18} aria-hidden="true" />
          </Link>
          <button type="button" onClick={cerrar} className={iconoCabecera} aria-label="Cerrar Carmen" title="Cerrar (Esc)">
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <CarmenConversacion variante="panel" />
        <CarmenEntrada variante="panel" />
        <CarmenPie variante="panel" />
      </div>
    </div>
  );
}
