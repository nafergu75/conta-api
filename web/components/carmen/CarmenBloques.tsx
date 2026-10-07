'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, DownloadSimple, Info } from '@phosphor-icons/react';
import { apiDownload, companyPath, errorMessage } from '@/lib/api';
import { esEnlaceInterno, type Descarga, type RespuestaVista } from '@/lib/carmen';
import { esRutaSoloEspana } from '@/components/dashboard/nav';
import { TablaInforme } from '@/app/dashboard/informes/TablaInforme';
import { useCarmen } from './CarmenProvider';
import type { Variante } from './CarmenConversacion';

/** Filas que se ven en la ventana; el resto, en la pantalla o en la descarga. */
const FILAS_VISIBLES = 10;


/** «perdidas-ganancias.pdf» a partir de la ruta de la descarga. */
function nombreFichero(d: Descarga): string {
  const base = d.ruta.split('?')[0].split('/').filter(Boolean).pop() || 'informe';
  return `${base.replace(/[^a-z0-9-]/gi, '-')}.${d.formato}`;
}

/** KPIs, tabla, enlaces a la pantalla, descargas y avisos de una respuesta. */
export function CarmenBloques({ r, variante }: { r: RespuestaVista; variante: Variante }) {
  const { cerrar, enPagina, empresaEspanola } = useCarmen();
  const [descargando, setDescargando] = useState<string | null>(null);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);

  // A una empresa no establecida en España no se le lleva a modelos fiscales ni a nóminas: su menú no los tiene.
  const enlaces = (r.enlaces ?? []).filter((e) => esEnlaceInterno(e.href) && !(empresaEspanola === false && esRutaSoloEspana(e.href)));
  const descargas = (r.descargas ?? []).filter((d) => d.ruta.startsWith('/') && !d.ruta.includes('..'));
  const tabla = r.tabla;
  const filas = tabla ? tabla.filas.slice(0, FILAS_VISIBLES) : [];
  const total = tabla ? Math.max(tabla.totalFilas, tabla.filas.length) : 0;

  // La ventana es modal (tapa la pantalla en el móvil, y en escritorio deja un velo y bloquea
  // el desplazamiento y el foco): al seguir un enlace se cierra para poder usar la pantalla.
  // La conversación se queda y Ctrl+/ o el botón la vuelven a abrir.
  const alSeguirEnlace = () => {
    if (!enPagina) cerrar();
  };

  const descargar = async (d: Descarga) => {
    setDescargando(d.ruta);
    setErrorDescarga(null);
    try {
      await apiDownload(companyPath(d.ruta), nombreFichero(d));
    } catch (e) {
      setErrorDescarga(errorMessage(e));
    } finally {
      setDescargando(null);
    }
  };

  return (
    <>
      {r.kpis && r.kpis.length > 0 && (
        <dl className={`grid grid-cols-2 gap-2 ${variante === 'pagina' ? 'sm:grid-cols-3' : ''}`}>
          {r.kpis.map((k, i) => (
            <div key={i} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <dt className="text-[11px] font-medium leading-tight text-slate-500">{k.etiqueta}</dt>
              <dd className="mt-0.5 break-words text-base font-semibold tabular-nums text-slate-900">{k.valor}</dd>
              {k.detalle && <dd className="mt-0.5 text-[11px] leading-tight text-slate-500">{k.detalle}</dd>}
            </div>
          ))}
        </dl>
      )}

      {tabla && (
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-semibold text-slate-700">
            {tabla.titulo}
            {tabla.periodo && <span className="font-normal text-slate-500"> · {tabla.periodo}</span>}
          </p>
          <TablaInforme tabla={{ columnas: tabla.columnas, filas, notas: tabla.notas }} compacta />
          {total > filas.length && (
            <p className="text-xs text-slate-500">
              Se ven {filas.length} de {total} filas.{' '}
              {enlaces[0] ? (
                <Link
                  href={enlaces[0].href}
                  onClick={alSeguirEnlace}
                  className="font-medium text-emerald-700 underline underline-offset-2 hover:no-underline"
                >
                  Ver todo en la pantalla
                </Link>
              ) : (
                'Cópiala o descárgala para verla entera.'
              )}
            </p>
          )}
        </div>
      )}

      {r.avisos && r.avisos.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">
          {r.avisos.map((a, i) => (
            <li key={i} className="flex gap-1.5">
              <Info size={14} aria-hidden="true" className="mt-px shrink-0 text-slate-500" />
              <span className="min-w-0 break-words">{a}</span>
            </li>
          ))}
        </ul>
      )}

      {(enlaces.length > 0 || descargas.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {enlaces.map((e, i) => (
            <Link
              key={`e${i}`}
              href={e.href}
              onClick={alSeguirEnlace}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
            >
              {e.texto}
              <ArrowRight size={12} weight="bold" aria-hidden="true" />
            </Link>
          ))}
          {descargas.map((d, i) => (
            <button
              key={`d${i}`}
              type="button"
              onClick={() => descargar(d)}
              disabled={descargando !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
            >
              <DownloadSimple size={14} aria-hidden="true" />
              {descargando === d.ruta ? 'Descargando…' : d.texto}
            </button>
          ))}
        </div>
      )}
      {errorDescarga && (
        <p role="alert" className="text-xs text-red-700">
          {errorDescarga}
        </p>
      )}
    </>
  );
}
