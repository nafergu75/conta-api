'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChatsCircle, NotePencil, Robot, X } from '@phosphor-icons/react';
import { useCarmen } from '@/components/carmen/CarmenProvider';
import { CarmenConversacion } from '@/components/carmen/CarmenConversacion';
import { CarmenEntrada } from '@/components/carmen/CarmenEntrada';
import { CarmenPie } from '@/components/carmen/CarmenPie';
import { CarmenHistorial } from '@/components/carmen/CarmenHistorial';
import { useAtraparFoco } from '@/components/carmen/useAtraparFoco';

const botonCabecera =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50';

/**
 * Asistente Carmen a pantalla completa: las conversaciones a la izquierda (en
 * el móvil, en un cajón) y la conversación en el resto. Es la misma
 * conversación que la de la ventana flotante.
 */
export default function CarmenPage() {
  const { iniciado, disponible, nuevaConversacion, enviando, mensajes, entradaRef } = useCarmen();
  const [cajon, setCajon] = useState(false);
  const cajonRef = useRef<HTMLDivElement>(null);
  const abreCajonRef = useRef<HTMLButtonElement>(null);

  const cerrarCajon = useCallback(() => {
    setCajon(false);
    requestAnimationFrame(() => abreCajonRef.current?.focus());
  }, []);
  useAtraparFoco(cajonRef, cajon, cerrarCajon);

  useEffect(() => {
    if (cajon) cajonRef.current?.querySelector<HTMLElement>('button')?.focus();
  }, [cajon]);

  // Escritorio: la lista va a la izquierda; en el móvil, en el cajón (y solo se monta una).
  const [escritorio, setEscritorio] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const alCambiar = () => {
      setEscritorio(mq.matches);
      if (mq.matches) setCajon(false);
    };
    alCambiar();
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, []);

  // Al entrar, el foco va a la pregunta (en escritorio; en el móvil abriría el teclado).
  useEffect(() => {
    if (disponible && window.matchMedia?.('(min-width: 768px)').matches) entradaRef.current?.focus();
  }, [disponible, entradaRef]);

  // La página ocupa la pantalla menos lo que haya encima (el aviso de «Faltan datos de la
  // empresa»): así la pregunta queda siempre abajo, sin desplazar la página entera.
  const mainRef = useRef<HTMLElement>(null);
  const [arriba, setArriba] = useState(0);
  useLayoutEffect(() => {
    const medir = () => {
      const m = mainRef.current;
      if (m) setArriba(Math.max(0, Math.round(m.getBoundingClientRect().top + window.scrollY)));
    };
    medir();
    const observador = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(medir) : null;
    observador?.observe(document.body);
    window.addEventListener('resize', medir);
    return () => {
      observador?.disconnect();
      window.removeEventListener('resize', medir);
    };
  }, [iniciado, disponible]);

  if (!iniciado) return <main className="h-[100dvh]" aria-busy="true" />;
  if (!disponible) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 md:px-8">
        <h1 className="text-2xl font-semibold text-slate-900">Asistente Carmen</h1>
        <p className="mt-2 text-slate-600">Carmen necesita una sesión real: en la demo sin servidor no está disponible.</p>
      </main>
    );
  }

  return (
    <main ref={mainRef} className="flex min-h-0 overflow-hidden" style={{ height: `calc(100dvh - ${arriba}px)` }}>
      {escritorio && (
        <aside className="w-72 shrink-0 border-r border-slate-200 bg-white" aria-label="Conversaciones">
          <CarmenHistorial />
        </aside>
      )}

      {cajon && !escritorio && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            ref={cajonRef}
            role="dialog"
            aria-modal="true"
            aria-label="Tus conversaciones"
            className="flex h-full w-80 max-w-[85vw] flex-col bg-white shadow-xl"
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4">
              <span className="font-semibold text-slate-900">Conversaciones</span>
              <button
                type="button"
                onClick={cerrarCajon}
                aria-label="Cerrar conversaciones"
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <CarmenHistorial alElegir={cerrarCajon} />
            </div>
          </div>
          <button type="button" aria-label="Cerrar conversaciones" tabIndex={-1} className="flex-1 bg-slate-900/40" onClick={cerrarCajon} />
        </div>
      )}

      <section className="flex min-w-0 flex-1 flex-col" aria-labelledby="carmen-titulo">
        <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 md:px-6">
          <span
            className="hidden h-9 w-9 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 sm:flex"
            aria-hidden="true"
          >
            <Robot size={20} weight="duotone" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 id="carmen-titulo" className="text-base font-semibold text-slate-900 md:text-lg">
              Asistente Carmen
            </h1>
            <p className="hidden truncate text-xs text-slate-500 sm:block">Pregunta por tus datos y tus dudas contables y fiscales</p>
          </div>
          <button
            ref={abreCajonRef}
            type="button"
            onClick={() => setCajon(true)}
            className={`${botonCabecera} md:hidden`}
            aria-haspopup="dialog"
          >
            <ChatsCircle size={16} aria-hidden="true" />
            Conversaciones
          </button>
          <button type="button" onClick={nuevaConversacion} disabled={enviando || mensajes.length === 0} className={botonCabecera}>
            <NotePencil size={16} aria-hidden="true" />
            <span className="hidden sm:inline">Nueva</span>
            <span className="sr-only sm:hidden">Nueva conversación</span>
          </button>
        </header>

        <CarmenConversacion variante="pagina" />
        <CarmenEntrada variante="pagina" />
        <CarmenPie variante="pagina" />
      </section>
    </main>
  );
}
