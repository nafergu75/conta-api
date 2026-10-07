'use client';

import { useId, useMemo, useState } from 'react';
import { BookOpenText, CaretDown } from '@phosphor-icons/react';
import { NOMBRE_AREA, type CatalogoCarmen } from '@/lib/carmen';
import { useCarmen } from './CarmenProvider';
import { chipCarmen } from './CarmenAclaracion';
import type { Variante } from './CarmenConversacion';

const subtitulo = 'text-[11px] font-semibold uppercase tracking-wide text-slate-500';

/** El catálogo sin el área de impuestos ni sus chips (para empresas no establecidas en España). */
function sinImpuestos(c: CatalogoCarmen | null): CatalogoCarmen | null {
  if (!c) return c;
  const ids = new Set(c.areas.filter((a) => a.area === 'impuestos').flatMap((a) => a.intenciones.map((i) => i.id)));
  return {
    ...c,
    areas: c.areas.filter((a) => a.area !== 'impuestos'),
    chips: c.chips.filter((b) => !(b.accion.tipo === 'intencion' && ids.has(b.accion.id))),
  };
}

/**
 * Bienvenida: sugerencias de la pantalla en la que está el usuario, dudas
 * frecuentes y «¿Qué puedo preguntarte?» con todo lo que puede consultar con sus
 * permisos, por áreas.
 */
export function CarmenSugerencias({ variante }: { variante: Variante }) {
  const { catalogo: catalogoServidor, errorCatalogo, pulsarBoton, enviando, empresaEspanola } = useCarmen();
  const [verTodo, setVerTodo] = useState(false);
  const idCatalogo = useId();

  // Empresa no establecida en España: ni IVA ni modelos de la AEAT, como en el menú.
  const extranjera = empresaEspanola === false;
  const catalogo = useMemo(() => (extranjera ? sinImpuestos(catalogoServidor) : catalogoServidor), [extranjera, catalogoServidor]);
  const sinDatos = catalogo !== null && catalogo.areas.length === 0;

  return (
    <section aria-label="Para empezar" className="mb-4 space-y-4">
      <div>
        <p className="text-base font-semibold text-slate-900">Hola, soy Carmen</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          {extranjera
            ? 'Te digo las cifras de tu contabilidad (cobros, bancos, asientos…) y te resuelvo dudas de la app con fichas revisadas.'
            : 'Te digo las cifras de tu contabilidad (cobros, bancos, IVA, asientos…) y te resuelvo dudas de la app y de impuestos con fichas revisadas.'}{' '}
          No cambio nada: si hay que hacer algo, te llevo a la pantalla donde se hace.
        </p>
        {sinDatos && (
          <p className="mt-2 text-sm text-slate-600">Con tus permisos en esta empresa no puedo consultar datos, pero sí resolver dudas.</p>
        )}
      </div>

      {catalogo === null && !errorCatalogo && (
        <p role="status" className="text-sm text-slate-500">
          Cargando sugerencias…
        </p>
      )}
      {errorCatalogo && (
        <p className="text-sm text-slate-500">No he podido cargar las sugerencias. Puedes escribir tu pregunta igualmente.</p>
      )}

      {catalogo && catalogo.chips.length > 0 && (
        <div className="space-y-2">
          {/* No «Para esta pantalla»: el servidor mezcla las de la pantalla con las generales del panel. */}
          <p className={subtitulo}>Puedes empezar por</p>
          <div className="flex flex-wrap gap-1.5">
            {catalogo.chips.map((b, i) => (
              <button key={i} type="button" onClick={() => pulsarBoton(b)} disabled={enviando} className={chipCarmen}>
                {b.texto}
              </button>
            ))}
          </div>
        </div>
      )}

      {catalogo && catalogo.fichas.length > 0 && (
        <div className="space-y-2">
          <p className={subtitulo}>Dudas frecuentes</p>
          <div className="flex flex-wrap gap-1.5">
            {catalogo.fichas.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => pulsarBoton({ texto: f.pregunta, accion: { tipo: 'faq', id: f.id } })}
                disabled={enviando}
                className={chipCarmen}
              >
                <BookOpenText size={12} aria-hidden="true" className="shrink-0" />
                <span className="min-w-0">{f.pregunta}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {catalogo && catalogo.areas.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setVerTodo((v) => !v)}
            aria-expanded={verTodo}
            aria-controls={idCatalogo}
            className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-emerald-700 underline underline-offset-2 hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          >
            ¿Qué puedo preguntarte?
            <CaretDown size={12} weight="bold" aria-hidden="true" className={`transition-transform ${verTodo ? 'rotate-180' : ''}`} />
          </button>
          {verTodo && (
            <div id={idCatalogo} className={`mt-3 grid gap-3 ${variante === 'pagina' ? 'sm:grid-cols-2' : ''}`}>
              {catalogo.areas.map((a) => (
                <div key={a.area} className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-sm font-semibold text-slate-900">{NOMBRE_AREA[a.area] ?? a.area}</p>
                  <ul className="mt-2 space-y-1.5">
                    {a.intenciones.map((i) => (
                      <li key={i.id}>
                        <button
                          type="button"
                          onClick={() => pulsarBoton({ texto: i.ejemplos[0] ?? i.titulo, accion: { tipo: 'intencion', id: i.id } })}
                          disabled={enviando}
                          className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
                        >
                          <span className="block text-sm text-slate-800">{i.titulo}</span>
                          {/* El primer ejemplo es la pregunta tal cual (el segundo va sin tildes: es para el clasificador). */}
                          {i.ejemplos[0] && <span className="block text-xs text-slate-500">«{i.ejemplos[0]}»</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
