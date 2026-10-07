'use client';

import { useEffect, useRef } from 'react';
import { useCarmen } from './CarmenProvider';
import { CarmenMensaje } from './CarmenMensaje';
import { CarmenSugerencias } from './CarmenSugerencias';

export type Variante = 'panel' | 'pagina';

/**
 * Lista de mensajes (role="log": el lector de pantalla lee cada respuesta nueva)
 * con la bienvenida cuando la conversación está vacía.
 */
export function CarmenConversacion({ variante }: { variante: Variante }) {
  const { mensajes, enviando, cargandoConversacion, errorConversacion } = useCarmen();
  const zonaRef = useRef<HTMLDivElement>(null);
  const cuantos = useRef(0);

  // Al llegar una respuesta se enseña desde la pregunta (las tablas son largas);
  // al preguntar, se baja al final.
  useEffect(() => {
    const zona = zonaRef.current;
    if (!zona) return;
    const nuevos = mensajes.length > cuantos.current;
    cuantos.current = mensajes.length;
    if (!nuevos) return;
    const ultimo = mensajes[mensajes.length - 1];
    const suave = window.matchMedia?.('(prefers-reduced-motion: no-preference)').matches ? 'smooth' : 'auto';
    if (ultimo?.rol !== 'usuario') {
      const preguntas = zona.querySelectorAll<HTMLElement>('[data-carmen-pregunta]');
      const ancla = preguntas[preguntas.length - 1];
      if (ancla && mensajes.length > 1) {
        zona.scrollTo({ top: ancla.offsetTop - 12, behavior: suave });
        return;
      }
    }
    zona.scrollTo({ top: zona.scrollHeight, behavior: suave });
  }, [mensajes]);

  const ancho = variante === 'pagina' ? 'mx-auto w-full max-w-3xl' : '';

  return (
    <div
      ref={zonaRef}
      className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain bg-slate-50 px-3 py-4 md:px-4"
    >
      <div className={ancho}>
        {errorConversacion && (
          <p role="alert" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {errorConversacion}
          </p>
        )}
        {cargandoConversacion && (
          <p role="status" className="py-6 text-center text-sm text-slate-500">
            Cargando la conversación…
          </p>
        )}
        {!cargandoConversacion && mensajes.length === 0 && <CarmenSugerencias variante={variante} />}

        <div role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversación con Carmen" className="space-y-4">
          {mensajes.map((m) => (
            <CarmenMensaje key={m.id} m={m} variante={variante} />
          ))}
        </div>

        {enviando && (
          <p role="status" className="mt-4 flex items-center gap-2 text-sm text-slate-500">
            <span className="flex gap-1" aria-hidden="true">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:-0.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500 [animation-delay:-0.1s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-500" />
            </span>
            Carmen está buscando…
          </p>
        )}
      </div>
    </div>
  );
}
