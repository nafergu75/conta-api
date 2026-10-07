'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowClockwise, BookOpenText, Check, Copy, Database, LockSimple, Sparkle, Warning } from '@phosphor-icons/react';
import {
  copiarAlPortapapeles,
  esEnlaceExterno,
  esEnlaceInterno,
  fechaCorta,
  momento,
  textoParaCopiar,
  type RespuestaVista,
} from '@/lib/carmen';
import { useCarmen, type MensajeCarmen, type MensajeVista } from './CarmenProvider';
import { CarmenBloques } from './CarmenBloques';
import { CarmenAclaracion } from './CarmenAclaracion';
import type { Variante } from './CarmenConversacion';
import { esRutaDesactivada, esRutaSoloEspana } from '@/components/dashboard/nav';

const accionPequena =
  'inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50';

/**
 * Un mensaje de la conversación. El texto se pinta siempre como texto plano
 * (nunca como HTML): lo que llega del servidor no puede meter marcado.
 */
export function CarmenMensaje({ m, variante }: { m: MensajeVista; variante: Variante }) {
  if (m.rol === 'usuario') {
    return (
      <div className="flex justify-end" data-carmen-pregunta="">
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-emerald-600 px-3.5 py-2 text-sm text-white">
          <span className="sr-only">Tú: </span>
          {m.texto}
        </p>
      </div>
    );
  }
  if (m.rol === 'error') return <MensajeError m={m} />;
  return <RespuestaCarmen m={m} variante={variante} />;
}

function MensajeError({ m }: { m: Extract<MensajeVista, { rol: 'error' }> }) {
  const { reintentar, enviando } = useCarmen();
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800"
    >
      <Warning size={16} aria-hidden="true" className="shrink-0" />
      <span className="min-w-0 flex-1">{m.texto}</span>
      {m.reintento && (
        <button
          type="button"
          onClick={() => reintentar(m)}
          disabled={enviando}
          className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 disabled:opacity-50"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

/** «Tus datos», «Pregunta frecuente» o «Respuesta orientativa de IA»: de dónde sale la respuesta. */
function Origen({ r }: { r: RespuestaVista }) {
  const { empresaEspanola } = useCarmen();
  const chip = 'inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg border px-2.5 py-0.5 text-[11px] font-medium';
  if (r.origen === 'datos') {
    return (
      <p className={`${chip} border-emerald-200 bg-emerald-50 text-emerald-800`}>
        <Database size={12} weight="bold" aria-hidden="true" />
        <span>Tus datos</span>
        {r.calculadoEn && <span className="font-normal">· calculado {momento(r.calculadoEn)}</span>}
      </p>
    );
  }
  if (r.origen === 'faq') {
    const f = r.fuente;
    return (
      <p className={`${chip} border-sky-200 bg-sky-50 text-sky-800`}>
        <BookOpenText size={12} weight="bold" aria-hidden="true" />
        <span>Pregunta frecuente</span>
        {f && (
          <span className="min-w-0 font-normal">
            · Fuente:{' '}
            {esEnlaceExterno(f.url) ? (
              <a href={f.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:no-underline">
                {f.titulo}
                <span className="sr-only"> (se abre en otra pestaña)</span>
              </a>
            ) : esEnlaceInterno(f.url) && !esRutaDesactivada(f.url) && !(empresaEspanola === false && esRutaSoloEspana(f.url)) ? (
              <Link href={f.url} className="underline underline-offset-2 hover:no-underline">
                {f.titulo}
              </Link>
            ) : (
              f.titulo
            )}{' '}
            · verificada {fechaCorta(f.verificadaEl)}
          </span>
        )}
      </p>
    );
  }
  if (r.origen === 'ia') {
    return (
      <p className={`${chip} border-amber-200 bg-amber-50 text-amber-800`} title={r.etiquetaIA}>
        <Sparkle size={12} weight="bold" aria-hidden="true" />
        <span>Respuesta orientativa de IA · no ha visto tus datos</span>
      </p>
    );
  }
  return null;
}

function RespuestaCarmen({ m, variante }: { m: MensajeCarmen; variante: Variante }) {
  const { valorar, noEraEsto, actualizarRespuesta, enviando } = useCarmen();
  const [copiado, setCopiado] = useState<'si' | 'no' | null>(null);
  const r = m.r;

  useEffect(() => {
    if (!copiado) return;
    const t = window.setTimeout(() => setCopiado(null), 2500);
    return () => window.clearTimeout(t);
  }, [copiado]);

  if (m.oculto) {
    return (
      <p className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-3 text-sm italic text-slate-500">
        <LockSimple size={16} aria-hidden="true" className="shrink-0" />
        {r.texto}
      </p>
    );
  }

  const copiar = async () => setCopiado((await copiarAlPortapapeles(textoParaCopiar(r))) ? 'si' : 'no');

  return (
    <article
      aria-label="Respuesta de Carmen"
      className="min-w-0 space-y-3 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-3 shadow-sm"
    >
      <Origen r={r} />

      {r.entendido && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span className="min-w-0">
            He entendido: <span className="font-medium text-slate-700">{r.entendido}</span>
          </span>
          <button
            type="button"
            onClick={() => noEraEsto(m)}
            disabled={enviando}
            className="rounded-md border border-slate-200 px-2 py-0.5 font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
          >
            No era esto
          </button>
        </div>
      )}

      <p className="whitespace-pre-line break-words text-sm leading-relaxed text-slate-800">{r.texto}</p>

      <CarmenBloques r={r} variante={variante} />

      {r.botones && r.botones.length > 0 && <CarmenAclaracion botones={r.botones} origen={m} />}

      <div className="flex flex-wrap items-center gap-x-1 gap-y-1 border-t border-slate-100 pt-2">
        <button type="button" onClick={copiar} className={accionPequena}>
          {copiado === 'si' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copiado === 'si' ? 'Copiado' : 'Copiar'}
        </button>
        {r.actualizar && (
          <button type="button" onClick={() => actualizarRespuesta(m)} disabled={enviando} className={accionPequena}>
            <ArrowClockwise size={14} aria-hidden="true" />
            Actualizar
          </button>
        )}
        <span className="sr-only" role="status">
          {copiado === 'si' ? 'Respuesta copiada' : copiado === 'no' ? 'No se ha podido copiar' : ''}
        </span>
        {copiado === 'no' && <span className="text-xs text-red-700">No se ha podido copiar</span>}
        <div role="group" aria-label="¿Te ha servido esta respuesta?" className="ml-auto flex items-center gap-1 text-xs text-slate-500">
          <span aria-hidden="true">¿Te ha servido?</span>
          <button
            type="button"
            onClick={() => valorar(m, true)}
            aria-pressed={m.valoracion === 1}
            className={`${accionPequena} ${m.valoracion === 1 ? 'bg-emerald-50 font-semibold text-emerald-800' : ''}`}
          >
            Sí
          </button>
          <button
            type="button"
            onClick={() => valorar(m, false)}
            aria-pressed={m.valoracion === 0}
            className={`${accionPequena} ${m.valoracion === 0 ? 'bg-slate-100 font-semibold text-slate-800' : ''}`}
          >
            No
          </button>
        </div>
      </div>
    </article>
  );
}
