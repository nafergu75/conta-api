'use client';

import { Sparkle } from '@phosphor-icons/react';
import type { Boton } from '@/lib/carmen';
import { useCarmen, type MensajeCarmen } from './CarmenProvider';

const chipBase =
  'inline-flex max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50';
/** Botón de sugerencia (las clases claras se oscurecen solas en modo noche: globals.css). */
export const chipCarmen = `${chipBase} border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-slate-50 hover:text-emerald-800`;
const chipIA = `${chipBase} border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100`;

/**
 * Botones de una respuesta: seguimientos («¿Y el trimestre pasado?»), opciones
 * cuando Carmen no está segura («¿Te refieres a A o a B?») o fichas parecidas.
 * Cada uno manda su acción tal cual; Carmen no vuelve a interpretar el texto.
 */
export function CarmenAclaracion({ botones, origen }: { botones: Boton[]; origen?: MensajeCarmen }) {
  const { pulsarBoton, enviando } = useCarmen();
  // «Preguntar a la IA» reenvía la pregunta escrita; sin ella no tiene sentido.
  const visibles = botones.filter((b) => b.accion.tipo !== 'ia' || !!origen?.pregunta);
  if (!visibles.length) return null;

  return (
    <div role="group" aria-label="Opciones para seguir" className="flex flex-wrap gap-1.5">
      {visibles.map((b, i) => (
        <button
          key={i}
          type="button"
          onClick={() => pulsarBoton(b, origen)}
          disabled={enviando}
          className={b.accion.tipo === 'ia' ? chipIA : chipCarmen}
        >
          {b.accion.tipo === 'ia' && <Sparkle size={12} weight="bold" aria-hidden="true" />}
          <span className="min-w-0 break-words">{b.texto}</span>
        </button>
      ))}
    </div>
  );
}
