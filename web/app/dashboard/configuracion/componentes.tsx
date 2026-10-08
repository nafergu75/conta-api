'use client';

import type { ReactNode } from 'react';
import { CheckCircle, Eye, WarningCircle, X } from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';

/** Cabecera de cada bloque de Configuracion. */
export function CabeceraBloque({ icono: Icono, titulo, descripcion }: { icono: Icon; titulo: string; descripcion: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <Icono size={26} className="mt-1 shrink-0 text-emerald-700" />
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-slate-900">{titulo}</h1>
        <p className="mt-1 text-sm text-slate-600">{descripcion}</p>
      </div>
    </div>
  );
}

/** Aviso de que el bloque se ve en solo lectura y de quien puede cambiarlo. */
export function AvisoSoloLectura({ quien }: { quien: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
      <Eye size={18} className="mt-0.5 shrink-0 text-slate-500" />
      <span>Lo ves en modo lectura. Pueden cambiarlo {quien}.</span>
    </p>
  );
}

/** Bloque al que el usuario no tiene acceso ni para verlo. */
export function SinAcceso({ texto }: { texto: string }) {
  return <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">{texto}</p>;
}

export type MensajeConfig = { ok: boolean; texto: ReactNode } | null;

/** Resultado de guardar o de una accion (verde si fue bien; ambar si no). */
export function Mensaje({ mensaje, onCerrar }: { mensaje: MensajeConfig; onCerrar?: () => void }) {
  if (!mensaje) return null;
  return (
    <div
      role={mensaje.ok ? 'status' : 'alert'}
      className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
        mensaje.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-900'
      }`}
    >
      {mensaje.ok ? <CheckCircle size={18} className="mt-0.5 shrink-0" /> : <WarningCircle size={18} className="mt-0.5 shrink-0" />}
      <div className="min-w-0 flex-1">{mensaje.texto}</div>
      {onCerrar && (
        <button type="button" onClick={onCerrar} aria-label="Cerrar aviso" className="shrink-0 rounded p-0.5 hover:bg-black/5">
          <X size={16} />
        </button>
      )}
    </div>
  );
}

/** Etiqueta de estado (Abierto, Activa, Predeterminada...). */
export function Etiqueta({ tono, children }: { tono: 'verde' | 'gris' | 'ambar' | 'azul' | 'rojo'; children: ReactNode }) {
  const color = {
    verde: 'bg-emerald-100 text-emerald-800',
    gris: 'bg-slate-100 text-slate-700',
    ambar: 'bg-amber-100 text-amber-800',
    azul: 'bg-blue-100 text-blue-800',
    rojo: 'bg-red-100 text-red-800',
  }[tono];
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>{children}</span>;
}
