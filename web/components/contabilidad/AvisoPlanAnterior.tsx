'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ListNumbers, X } from '@phosphor-icons/react';
import { ApiError } from '@/lib/api';
import { ANIO_GESTORIA, codigoDelError, RUTA_ARRANQUE } from '@/lib/arranque';

/** Código del 409 que da el servidor antes del primer cliente o proveedor sin el plan de la gestoría. */
export const CODIGO_PLAN_ANTERIOR = 'PLAN_ANTERIOR_PENDIENTE';

/** Lo que se añade al cuerpo de la petición para seguir sin el plan anterior. */
export type ExtraPlanAnterior = { confirmarSinPlanAnterior?: true };

function enlaceDe(e: ApiError): string {
  const d = e.detalles && typeof e.detalles === 'object' ? (e.detalles as { enlace?: unknown }) : {};
  return typeof d.enlace === 'string' && d.enlace.startsWith('/') ? d.enlace : RUTA_ARRANQUE;
}

/**
 * Aviso antes de dar de alta el primer cliente o proveedor de una empresa
 * española sin haber traído el plan de cuentas de la gestoría.
 *
 * Uso: `const aviso = useAvisoPlanAnterior();` y en el envío
 * `const r = await aviso.intentar((extra) => apiFetch(ruta, { method: 'POST', body: JSON.stringify({ ...cuerpo, ...extra }) }));`.
 * Si el servidor responde 409 PLAN_ANTERIOR_PENDIENTE, se abre el diálogo:
 *  - «Traer antes el plan» lleva al apartado y `intentar` devuelve null;
 *  - «Seguir» repite la petición con `confirmarSinPlanAnterior: true`;
 *  - cerrar el diálogo (también con Escape) devuelve null sin hacer nada.
 * Cualquier otro error se lanza tal cual. Pinta `aviso.dialogo` en la página.
 * Puede ir dentro de otro diálogo (la ficha de alta del lector): mientras está
 * abierto, Escape y el tabulador son solo suyos, y al cerrarlo el foco vuelve
 * a donde estaba.
 */
export function useAvisoPlanAnterior(): {
  intentar: <T>(hacer: (extra: ExtraPlanAnterior) => Promise<T>) => Promise<T | null>;
  dialogo: ReactNode;
} {
  const router = useRouter();
  const [abierto, setAbierto] = useState<{ texto: string; enlace: string } | null>(null);
  const resolver = useRef<((r: 'seguir' | 'traer' | 'cerrar') => void) | null>(null);
  const cajaRef = useRef<HTMLDivElement>(null);
  const estaAbierto = !!abierto;

  useEffect(() => {
    if (!estaAbierto) return;
    const antes = document.activeElement;
    // En captura y en window: llega antes que el Escape del diálogo de debajo, que ya no se entera.
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        resolver.current?.('cerrar');
        return;
      }
      if (e.key !== 'Tab' || !cajaRef.current) return;
      const botones = Array.from(cajaRef.current.querySelectorAll<HTMLElement>('button:not([disabled])'));
      if (!botones.length) return;
      const dentro = cajaRef.current.contains(document.activeElement);
      const primero = botones[0];
      const ultimo = botones[botones.length - 1];
      if (!dentro || (e.shiftKey && document.activeElement === primero) || (!e.shiftKey && document.activeElement === ultimo)) {
        e.stopPropagation();
        e.preventDefault();
        (e.shiftKey ? ultimo : primero).focus();
      }
    };
    window.addEventListener('keydown', alTeclear, true);
    return () => {
      window.removeEventListener('keydown', alTeclear, true);
      if (antes instanceof HTMLElement && document.contains(antes)) antes.focus({ preventScroll: true });
    };
  }, [estaAbierto]);

  const intentar = useCallback(
    async <T,>(hacer: (extra: ExtraPlanAnterior) => Promise<T>): Promise<T | null> => {
      try {
        return await hacer({});
      } catch (e) {
        if (!(e instanceof ApiError) || e.status !== 409 || codigoDelError(e) !== CODIGO_PLAN_ANTERIOR) throw e;
        const enlace = enlaceDe(e);
        const respuesta = await new Promise<'seguir' | 'traer' | 'cerrar'>((ok) => {
          resolver.current = ok;
          setAbierto({ texto: e.message, enlace });
        });
        resolver.current = null;
        setAbierto(null);
        if (respuesta === 'traer') {
          router.push(enlace);
          return null;
        }
        if (respuesta === 'cerrar') return null;
        return hacer({ confirmarSinPlanAnterior: true });
      }
    },
    [router],
  );

  const responder = (r: 'seguir' | 'traer' | 'cerrar') => resolver.current?.(r);

  const dialogo = abierto ? (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onClick={(e) => {
        // Puede ir dentro de otro diálogo: el clic fuera cierra solo este.
        e.stopPropagation();
        responder('cerrar');
      }}
    >
      <div
        ref={cajaRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="aviso-plan-titulo"
        aria-describedby="aviso-plan-texto"
        className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-3">
            <ListNumbers size={26} className="mt-0.5 shrink-0 text-amber-600" />
            <h2 id="aviso-plan-titulo" className="text-lg font-semibold text-slate-900">
              Antes del primer cliente o proveedor
            </h2>
          </div>
          <button type="button" onClick={() => responder('cerrar')} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Cerrar sin hacer nada">
            <X size={20} />
          </button>
        </div>
        <p id="aviso-plan-texto" className="mt-3 text-sm text-slate-700">
          {abierto.texto}
        </p>
        <p className="mt-3 text-sm text-slate-600">
          Si la gestoría te lleva la contabilidad de {ANIO_GESTORIA}, pídele el plan de cuentas con las subcuentas y súbelo en «Traer la contabilidad de {ANIO_GESTORIA}». Si
          vas ahora, lo que has escrito en esta pantalla no se guarda.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            autoFocus
            onClick={() => responder('traer')}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Traer antes el plan
          </button>
          <button
            type="button"
            onClick={() => responder('seguir')}
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Esta empresa no tiene contabilidad anterior: seguir
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { intentar, dialogo };
}
