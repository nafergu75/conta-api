'use client';

import { useState, type ReactNode } from 'react';
import { CheckCircle, Info, Warning, WarningCircle, XCircle } from '@phosphor-icons/react';
import type { NivelCarga, NivelPunto, PuntoComprobacion } from '@/lib/arranque';

/** Piezas comunes de la pantalla «Traer la contabilidad de 2026». */

export const boton =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50';
export const botonSecundario =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
export const botonPeligro =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50';
export const campo =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500';
export const enlace = 'font-medium text-emerald-700 underline-offset-2 hover:underline';

/** Una tarjeta con título (una fase del resumen, un bloque de datos...). */
export function Bloque({ titulo, extra, children, id }: { titulo: ReactNode; extra?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

/** Una cifra con su rótulo. */
export function Cifra({ titulo, valor, tono = 'normal' }: { titulo: string; valor: ReactNode; tono?: 'normal' | 'bien' | 'mal' | 'aviso' }) {
  const color = tono === 'bien' ? 'text-emerald-700' : tono === 'mal' ? 'text-red-700' : tono === 'aviso' ? 'text-amber-700' : 'text-slate-900';
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{titulo}</p>
      <p className={`mt-1 break-words text-base font-semibold tabular-nums ${color}`}>{valor}</p>
    </div>
  );
}

export function Cifras({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{children}</div>;
}

/** Aviso en una línea (éxito, error o aviso). */
export function Nota({ tipo, children }: { tipo: 'bien' | 'error' | 'aviso' | 'info'; children: ReactNode }) {
  const estilos = {
    bien: ['border-emerald-200 bg-emerald-50 text-emerald-800', <CheckCircle key="i" size={18} className="mt-0.5 shrink-0" />],
    error: ['border-red-200 bg-red-50 text-red-700', <WarningCircle key="i" size={18} className="mt-0.5 shrink-0" />],
    aviso: ['border-amber-200 bg-amber-50 text-amber-800', <Warning key="i" size={18} className="mt-0.5 shrink-0" />],
    info: ['border-sky-200 bg-sky-50 text-sky-800', <Info key="i" size={18} className="mt-0.5 shrink-0" />],
  } as const;
  const [clase, icono] = estilos[tipo];
  return (
    <div role={tipo === 'error' ? 'alert' : undefined} className={`flex gap-2 rounded-lg border p-3 text-sm ${clase}`}>
      {icono}
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}

const ESTILO_NIVEL: Record<NivelCarga, { caja: string; texto: string; icono: ReactNode; titulo: string }> = {
  CORRECTO: {
    caja: 'border-emerald-200 bg-emerald-50',
    texto: 'text-emerald-900',
    icono: <CheckCircle size={28} weight="fill" className="shrink-0 text-emerald-600" />,
    titulo: 'Todo correcto',
  },
  FALTAN_DATOS: {
    caja: 'border-amber-200 bg-amber-50',
    texto: 'text-amber-900',
    icono: <Warning size={28} weight="fill" className="shrink-0 text-amber-600" />,
    titulo: 'Faltan datos',
  },
  ERRORES: {
    caja: 'border-red-200 bg-red-50',
    texto: 'text-red-800',
    icono: <XCircle size={28} weight="fill" className="shrink-0 text-red-600" />,
    titulo: 'Hay errores',
  },
};

const ORDEN: NivelPunto[] = ['ERROR', 'FALTA', 'AVISO', 'INFO'];
const TITULO_GRUPO: Record<NivelPunto, string> = {
  ERROR: 'Hay que corregirlo antes de traer la contabilidad',
  FALTA: 'Falta por completar (se puede seguir)',
  AVISO: 'Conviene revisarlo',
  INFO: 'Para que lo sepas',
};
const ICONO_PUNTO: Record<NivelPunto, ReactNode> = {
  ERROR: <XCircle size={18} className="mt-0.5 shrink-0 text-red-600" />,
  FALTA: <Warning size={18} className="mt-0.5 shrink-0 text-amber-600" />,
  AVISO: <Warning size={18} className="mt-0.5 shrink-0 text-amber-600" />,
  INFO: <Info size={18} className="mt-0.5 shrink-0 text-sky-600" />,
};

/** Lleva la pantalla a un bloque (por su id) y pone el foco en su primer campo. */
export function irA(id: string) {
  const el = typeof document !== 'undefined' ? document.getElementById(id) : null;
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])')?.focus({ preventScroll: true });
}

/** Lo que la comprobación dice de un formulario, repetido debajo de él (no hay que volver arriba para verlo). */
export function PuntosFormulario({ puntos }: { puntos: PuntoComprobacion[] }) {
  const vistos = puntos.filter((p) => p.nivel !== 'INFO');
  if (!vistos.length) return null;
  return (
    <ul className="mt-3 space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-2" aria-live="polite">
      {vistos.map((p) => (
        <li key={p.clave + p.texto} className="flex gap-2 text-sm text-slate-800">
          {ICONO_PUNTO[p.nivel]}
          <span className="min-w-0 break-words">{p.texto}</span>
        </li>
      ))}
    </ul>
  );
}

/** Un punto de la comprobación, con su detalle plegado. */
function Punto({ p, accion }: { p: PuntoComprobacion; accion?: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <li className="flex gap-2 py-2">
      {ICONO_PUNTO[p.nivel]}
      <div className="min-w-0 flex-1 text-sm text-slate-800">
        <p className="break-words">{p.texto}</p>
        {p.detalle && p.detalle.length > 0 && (
          <>
            <button type="button" onClick={() => setAbierto((v) => !v)} className="mt-1 text-xs font-medium text-slate-600 underline-offset-2 hover:underline" aria-expanded={abierto}>
              {abierto ? 'Ocultar el detalle' : `Ver el detalle (${p.detalle.length})`}
            </button>
            {abierto && (
              <ul className="mt-1 max-h-60 space-y-0.5 overflow-y-auto rounded border border-slate-200 bg-slate-50 p-2 font-mono text-xs text-slate-700">
                {p.detalle.map((d, i) => (
                  <li key={i} className="break-words">
                    {d}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {accion}
      </div>
    </li>
  );
}

/**
 * El mensaje de la comprobación en tres niveles (Todo correcto, Faltan datos,
 * Hay errores) con la lista de puntos agrupada. `accionDe` añade un botón a
 * un punto (por ejemplo, aceptar un aviso con un motivo).
 */
export function MensajeComprobacion({
  nivel,
  mensaje,
  puntos,
  accionDe,
  pie,
}: {
  nivel: NivelCarga;
  mensaje: string;
  puntos: PuntoComprobacion[];
  accionDe?: (p: PuntoComprobacion) => ReactNode;
  pie?: ReactNode;
}) {
  const e = ESTILO_NIVEL[nivel];
  // Con la lista de abajo, la cabecera solo resume (no repite todos los puntos seguidos).
  const errores = puntos.filter((p) => p.nivel === 'ERROR').length;
  const faltan = puntos.filter((p) => p.nivel === 'FALTA').length;
  const resumen =
    nivel === 'ERRORES' && errores
      ? `Todavía no se puede traer la contabilidad: ${errores === 1 ? 'hay 1 cosa que corregir' : `hay ${errores} cosas que corregir`}. Están en la lista de abajo.`
      : nivel === 'FALTAN_DATOS' && faltan
        ? `Puedes seguir, pero ${faltan === 1 ? 'falta 1 dato' : `faltan ${faltan} datos`}. Están en la lista de abajo; los puedes completar después.`
        : mensaje;
  return (
    <section aria-live="polite" className={`rounded-xl border p-4 sm:p-5 ${e.caja}`}>
      <div className="flex gap-3">
        {e.icono}
        <div className={`min-w-0 ${e.texto}`}>
          <h2 className="text-lg font-semibold">{e.titulo}</h2>
          <p className="mt-1 text-sm">{resumen}</p>
        </div>
      </div>
      {ORDEN.map((n) => {
        const delNivel = puntos.filter((p) => p.nivel === n);
        if (!delNivel.length) return null;
        return (
          <div key={n} className="mt-4 rounded-lg border border-slate-200 bg-white px-3 py-1">
            <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{TITULO_GRUPO[n]}</h3>
            <ul className="divide-y divide-slate-100">
              {delNivel.map((p) => (
                <Punto key={p.clave + p.texto} p={p} accion={accionDe?.(p)} />
              ))}
            </ul>
          </div>
        );
      })}
      {pie}
    </section>
  );
}

/** Diálogo modal sencillo (confirmar, deshacer...). */
export function Dialogo({ titulo, children, onCerrar, ancho = 'max-w-lg' }: { titulo: string; children: ReactNode; onCerrar: () => void; ancho?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onClick={onCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`max-h-[90dvh] w-full ${ancho} overflow-y-auto rounded-xl bg-white p-5 shadow-xl sm:p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-slate-900">{titulo}</h2>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}
