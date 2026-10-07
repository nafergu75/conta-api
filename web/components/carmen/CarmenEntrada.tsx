'use client';

import { useId, useLayoutEffect, useState } from 'react';
import { PaperPlaneRight } from '@phosphor-icons/react';
import { AVISO_PREGUNTA, MAX_PREGUNTA } from '@/lib/carmen';
import { useCarmen } from './CarmenProvider';
import type { Variante } from './CarmenConversacion';

/**
 * Caja de la pregunta: Enter envía y Mayús+Enter salta de línea; 500 caracteres
 * como máximo, con contador desde 400. Mientras Carmen responde no se puede
 * enviar otra (la caja no se desactiva para no perder el foco).
 */
export function CarmenEntrada({ variante }: { variante: Variante }) {
  const { enviarTexto, enviando, entradaRef } = useCarmen();
  const [texto, setTexto] = useState('');
  const id = useId();

  // La caja crece con el texto hasta unas 6 líneas.
  useLayoutEffect(() => {
    const t = entradaRef.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
    // Sin barra de desplazamiento hasta que de verdad no quepa.
    t.style.overflowY = t.scrollHeight > 160 ? 'auto' : 'hidden';
  }, [texto, entradaRef]);

  const enviar = () => {
    if (enviando || !texto.trim()) return;
    enviarTexto(texto);
    setTexto('');
  };

  const alPulsar = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      enviar();
    }
  };

  const largo = texto.length;
  // En la página, en el móvil, el botón del menú flota abajo a la derecha: se le deja sitio.
  const hueco = variante === 'pagina' ? 'pr-[4.5rem] md:pr-0' : '';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        enviar();
      }}
      className="shrink-0 border-t border-slate-200 bg-white px-3 pt-3"
    >
      <div className={`${variante === 'pagina' ? 'mx-auto max-w-3xl' : ''} ${hueco}`}>
        <label htmlFor={id} className="sr-only">
          Tu pregunta para Carmen
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id={id}
            ref={entradaRef}
            rows={1}
            value={texto}
            onChange={(e) => setTexto(e.target.value.slice(0, MAX_PREGUNTA))}
            onKeyDown={alPulsar}
            maxLength={MAX_PREGUNTA}
            readOnly={enviando}
            aria-busy={enviando}
            aria-describedby={`${id}-ayuda`}
            placeholder={enviando ? 'Carmen está buscando…' : 'Escribe tu pregunta…'}
            className="max-h-40 min-h-[44px] min-w-0 flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
          <button
            type="submit"
            disabled={enviando || !texto.trim()}
            aria-label="Enviar pregunta"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-40 dark:focus-visible:ring-offset-black"
          >
            <PaperPlaneRight size={18} weight="fill" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-1 flex min-h-[16px] items-center justify-between gap-2 text-[11px] text-slate-500">
          <span id={`${id}-ayuda`} className="hidden sm:inline">
            Enter para enviar · Mayús+Enter, nueva línea
          </span>
          {largo >= AVISO_PREGUNTA && (
            <span aria-live="polite" className={`ml-auto tabular-nums ${largo >= MAX_PREGUNTA ? 'font-semibold text-red-700' : ''}`}>
              {largo} de {MAX_PREGUNTA}
            </span>
          )}
        </div>
      </div>
    </form>
  );
}
