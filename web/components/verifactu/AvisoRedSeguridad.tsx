'use client';

import { ShieldWarning, WarningCircle } from '@phosphor-icons/react';
import type { EstadoRedSeguridad } from '@/lib/verifactu';

/**
 * Aviso de la red de seguridad de VERI*FACTU en Ventas y en el formulario de
 * factura: el aviso previo (desde el 1-12-2026) o, desde el 1-1-2027, que ya
 * no se puede emitir. No pinta nada si la red no afecta a la empresa.
 */
export default function AvisoRedSeguridad({ estado }: { estado: EstadoRedSeguridad | null }) {
  if (!estado) return null;
  if (estado.bloquea && estado.motivo) {
    return (
      <div role="alert" className="flex gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
        <ShieldWarning size={20} weight="duotone" className="mt-0.5 shrink-0" aria-hidden />
        <p>
          <span className="font-semibold">No se pueden emitir facturas.</span> {estado.motivo}
        </p>
      </div>
    );
  }
  if (estado.aviso) {
    return (
      <div role="status" className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <WarningCircle size={20} weight="duotone" className="mt-0.5 shrink-0" aria-hidden />
        <p>
          <span className="font-semibold">VERI*FACTU.</span> {estado.aviso}
        </p>
      </div>
    );
  }
  return null;
}
