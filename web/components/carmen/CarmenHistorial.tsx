'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChatsCircle, NotePencil, Trash } from '@phosphor-icons/react';
import { errorMessage } from '@/lib/api';
import { borrarConversacion, listarConversaciones, momento, type SesionResumen } from '@/lib/carmen';
import { useCarmen } from './CarmenProvider';

/**
 * Conversaciones del usuario en esta empresa (solo las suyas), de la más
 * reciente a la más antigua, con «Nueva conversación» y borrar con
 * confirmación. `alElegir` lo usa el cajón del móvil para cerrarse.
 */
export function CarmenHistorial({ alElegir }: { alElegir?: () => void }) {
  const { sessionId, abrirConversacion, nuevaConversacion, conversacionBorrada, versionLista, enviando, disponible } = useCarmen();
  const [sesiones, setSesiones] = useState<SesionResumen[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [aviso, setAviso] = useState('');
  const cancelarRef = useRef<HTMLButtonElement>(null);
  const nuevaRef = useRef<HTMLButtonElement>(null);

  const cargar = useCallback(async (hasta: number) => {
    setCargando(true);
    setError(null);
    try {
      // Se recargan todas las páginas ya vistas: el orden cambia con cada pregunta.
      const paginas = await Promise.all(Array.from({ length: hasta }, (_, i) => listarConversaciones(i + 1)));
      const vistas = new Set<string>();
      setSesiones(paginas.flatMap((p) => p.sesiones).filter((s) => (vistas.has(s.id) ? false : (vistas.add(s.id), true))));
      setTotal(paginas[paginas.length - 1]?.total ?? 0);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (disponible) void cargar(pagina);
  }, [disponible, cargar, pagina, versionLista]);

  useEffect(() => {
    if (confirmando) cancelarRef.current?.focus();
  }, [confirmando]);

  const borrar = async (s: SesionResumen) => {
    setBorrando(true);
    try {
      await borrarConversacion(s.id);
      setConfirmando(null);
      setSesiones((ls) => ls.filter((x) => x.id !== s.id));
      setTotal((t) => Math.max(0, t - 1));
      setAviso('Conversación borrada.');
      conversacionBorrada(s.id);
      // El elemento con el foco ya no existe: se lleva a «Nueva conversación».
      nuevaRef.current?.focus();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBorrando(false);
    }
  };

  const titulo = (s: SesionResumen) => s.titulo?.trim() || 'Conversación sin título';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-slate-200 p-3">
        <button
          ref={nuevaRef}
          type="button"
          onClick={() => {
            nuevaConversacion();
            alElegir?.();
          }}
          disabled={enviando}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-50 dark:focus-visible:ring-offset-black"
        >
          <NotePencil size={16} aria-hidden="true" />
          Nueva conversación
        </button>
      </div>

      <nav aria-label="Tus conversaciones con Carmen" className="min-h-0 flex-1 overflow-y-auto p-2">
        <p className="sr-only" role="status">
          {aviso}
        </p>
        {error && (
          <div role="alert" className="m-1 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">
            {error}{' '}
            <button type="button" onClick={() => void cargar(pagina)} className="font-semibold underline">
              Reintentar
            </button>
          </div>
        )}
        {!cargando && !error && sesiones.length === 0 && (
          <p className="flex items-center gap-2 p-3 text-sm text-slate-500">
            <ChatsCircle size={18} aria-hidden="true" />
            Aún no tienes conversaciones.
          </p>
        )}
        <ul className="space-y-0.5">
          {sesiones.map((s) => {
            const actual = s.id === sessionId;
            return (
              <li key={s.id} className={`group rounded-lg ${actual ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}>
                <div className="flex items-start gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      void abrirConversacion(s.id);
                      alElegir?.();
                    }}
                    aria-current={actual ? 'true' : undefined}
                    disabled={enviando}
                    className="min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60"
                  >
                    <span className={`block truncate text-sm ${actual ? 'font-semibold text-emerald-800' : 'text-slate-800'}`}>
                      {titulo(s)}
                    </span>
                    <span className="block text-[11px] text-slate-500">{momento(s.updatedAt)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmando(s.id)}
                    aria-label={`Borrar la conversación «${titulo(s)}»`}
                    title="Borrar"
                    className="mt-1 rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  >
                    <Trash size={16} aria-hidden="true" />
                  </button>
                </div>
                {confirmando === s.id && (
                  <div
                    role="group"
                    aria-label="Confirmar el borrado"
                    className="mx-2 mb-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-900"
                  >
                    <p>¿Borrar esta conversación? No se puede deshacer.</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => void borrar(s)}
                        disabled={borrando}
                        className="rounded-md bg-red-600 px-2.5 py-1 font-semibold text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50"
                      >
                        {borrando ? 'Borrando…' : 'Borrar'}
                      </button>
                      <button
                        ref={cancelarRef}
                        type="button"
                        onClick={() => setConfirmando(null)}
                        disabled={borrando}
                        className="rounded-md border border-slate-300 bg-white px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {cargando && sesiones.length === 0 && (
          <p role="status" className="p-3 text-sm text-slate-500">
            Cargando…
          </p>
        )}
        {!cargando && sesiones.length < total && (
          <button
            type="button"
            onClick={() => setPagina((p) => p + 1)}
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            Ver más antiguas
          </button>
        )}
      </nav>

      <p className="shrink-0 border-t border-slate-200 p-3 text-[11px] leading-snug text-slate-500">
        Solo tú ves tus conversaciones. Se borran solas a los 90 días como mucho, y las cifras quedan como se dieron ese día.
      </p>
    </div>
  );
}
