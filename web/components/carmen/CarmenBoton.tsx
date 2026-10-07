'use client';

import { Robot } from '@phosphor-icons/react';
import { useCarmen } from './CarmenProvider';

/**
 * Botón flotante «Pregunta a Carmen», en todas las pantallas del panel menos la
 * de Carmen. En el móvil va encima del botón del menú (abajo a la derecha) y
 * solo enseña el icono; en escritorio, con texto.
 */
export function CarmenBoton() {
  const { disponible, enPagina, abierto, abrir, botonRef } = useCarmen();
  if (!disponible || enPagina) return null;

  return (
    <>
      {/* Hueco al final de la pantalla para que el botón no tape lo último (p. ej. un «Guardar» abajo a la derecha). */}
      <div aria-hidden="true" className="h-28 md:h-16" />
      <button
        ref={botonRef}
        type="button"
        onClick={abrir}
        aria-label="Pregunta a Carmen"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-controls={abierto ? 'carmen-ventana' : undefined}
        aria-keyshortcuts="Control+/"
        title="Pregunta a Carmen (Ctrl+/)"
        className="fixed bottom-20 right-5 z-40 flex h-12 w-12 items-center justify-center gap-2 rounded-full border border-emerald-200 bg-white text-emerald-700 shadow-lg transition-transform hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-black active:scale-[0.96] md:bottom-6 md:right-6 md:h-11 md:w-auto md:px-4"
      >
        <Robot size={22} weight="duotone" aria-hidden="true" />
        <span className="hidden text-sm font-semibold md:inline">Pregunta a Carmen</span>
      </button>
    </>
  );
}
