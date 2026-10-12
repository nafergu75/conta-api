'use client';

import { useCallback, useEffect } from 'react';
import { CaretDown, X } from '@phosphor-icons/react';
import type { CatalogoPermisos } from '@/lib/auth';
import { resumenPerfil } from './permisos';

/**
 * Piezas de pantalla que comparten la Administracion global (/dashboard/admin)
 * y Configuracion > Usuarios: ventana, etiquetas, el boton que abre el editor
 * de permisos y la linea que resume un perfil.
 */

/** Pregunta antes de cerrar una ventana que enseña una contraseña provisional. */
export const PREGUNTA_COPIADA = '¿Has copiado la contraseña? Después no se puede volver a ver.';

export const PREGUNTA_CAMBIO_PERFIL =
  'Al cambiar de perfil se quitan los permisos que has marcado y se parte de los del perfil nuevo. ¿Seguir?';

/** "15 de octubre de 2026 a las 10:30" (hora de España). */
export const fechaYHora = (iso: string) => {
  const d = new Date(iso);
  const dia = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' });
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  return `${dia} a las ${hora}`;
};

export type TonoEtiqueta = 'verde' | 'gris' | 'indigo' | 'rojo' | 'ambar';

/**
 * Etiqueta de estado. Con `ajustar`, un texto largo puede partirse en dos
 * líneas para no salirse de una columna estrecha.
 */
export function Etiqueta({ tono, ajustar = false, children }: { tono: TonoEtiqueta; ajustar?: boolean; children: React.ReactNode }) {
  const tonos = {
    verde: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    gris: 'border-slate-200 bg-slate-100 text-slate-600',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    rojo: 'border-rose-200 bg-rose-50 text-rose-700',
    ambar: 'border-amber-200 bg-amber-50 text-amber-700',
  } as const;
  return (
    <span className={`inline-flex items-center ${ajustar ? 'rounded-xl' : 'whitespace-nowrap rounded-full'} border px-2 py-0.5 text-[11px] font-medium ${tonos[tono]}`}>
      {children}
    </span>
  );
}

export function Modal({
  titulo,
  onClose,
  children,
  ancho = 'max-w-md',
  confirmarAlCerrar,
}: {
  titulo: string;
  onClose: () => void;
  children: React.ReactNode;
  ancho?: string;
  /** Si se pasa, cerrar con Escape, la X o un clic fuera pregunta esto antes. */
  confirmarAlCerrar?: string;
}) {
  const cerrar = useCallback(() => {
    if (confirmarAlCerrar && !window.confirm(confirmarAlCerrar)) return;
    onClose();
  }, [confirmarAlCerrar, onClose]);

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [cerrar]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:px-4" onClick={cerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`max-h-[90dvh] w-full ${ancho} overflow-y-auto rounded-t-xl bg-white p-5 shadow-xl sm:rounded-xl sm:p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="min-w-0 break-words text-lg font-semibold text-slate-900">{titulo}</h2>
          <button type="button" onClick={cerrar} aria-label="Cerrar" className="p-1.5 text-slate-500 transition-colors hover:text-slate-900">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Boton que abre o cierra el editor de permisos («Ajustar permisos (opcional)»). */
export function BotonAjustar({
  abierto,
  onClick,
  controla,
  personalizado,
}: {
  abierto: boolean;
  onClick: () => void;
  controla: string;
  /** Hay casillas cambiadas: se guardan aunque el editor este plegado, y se dice. */
  personalizado?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={abierto}
      aria-controls={controla}
      className="inline-flex min-h-[44px] flex-wrap items-center gap-1.5 self-start rounded-lg px-1 text-sm font-medium text-slate-700 hover:text-slate-900"
    >
      <CaretDown size={14} className={`transition-transform ${abierto ? 'rotate-180' : ''}`} aria-hidden />
      Ajustar permisos <span className="font-normal text-slate-500">(opcional)</span>
      {personalizado && (
        <span className="inline-flex items-center whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
          Personalizado
        </span>
      )}
    </button>
  );
}

/** Una linea bajo el desplegable de perfil que dice lo que incluye. */
export function ResumenDelPerfil({ catalogo, rol, id }: { catalogo: CatalogoPermisos | null; rol: string; id?: string }) {
  const texto = resumenPerfil(catalogo, rol);
  return texto ? (
    <p id={id} className="text-xs text-slate-500">
      {texto}
    </p>
  ) : null;
}
