'use client';

import Link from 'next/link';
import { ShieldWarning, WarningCircle } from '@phosphor-icons/react';
import { fechaLarga, type EstadoRedSeguridad } from '@/lib/verifactu';

/** Pantalla donde sale el aviso: cada una da la salida que tiene sentido allí. */
export type DondeAviso = 'lista' | 'formulario' | 'borrador';

const QUE_HACER: Record<DondeAviso, string> = {
  lista: 'Puedes seguir preparando borradores y proformas.',
  formulario: 'Guarda el borrador y pásalo a factura cuando VERI*FACTU esté activo.',
  borrador: 'Este borrador queda guardado. Lo podrás pasar a factura cuando VERI*FACTU esté activo.',
};

/**
 * Aviso de la red de seguridad de VERI*FACTU en Ventas, en el formulario de
 * factura y en el detalle de un borrador: el aviso previo (desde el 1-12-2026)
 * o, desde el 1-1-2027, que ya no se puede emitir. Con el bloqueo, además de lo
 * que se puede hacer en esa pantalla, la salida para quien tiene que entregar
 * una factura ya: hacerla con otro programa y registrarla con el lector (la red
 * no bloquea las facturas que expidió otro programa). No pinta nada si la red
 * no afecta a la empresa.
 */
export default function AvisoRedSeguridad({ estado, donde }: { estado: EstadoRedSeguridad | null; donde: DondeAviso }) {
  if (!estado) return null;
  if (estado.bloquea) {
    return (
      <div role="alert" className="flex gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
        <ShieldWarning size={20} weight="duotone" className="mt-0.5 shrink-0" aria-hidden />
        <div className="space-y-1">
          <p className="font-semibold">Todavía no se pueden emitir facturas de esta empresa</p>
          <p>
            Desde el {fechaLarga(estado.inicio)} hace falta tener VERI*FACTU activo para emitir. {QUE_HACER[donde]}
          </p>
          <p>
            Si tienes que entregar una factura ya, hazla con un programa que tenga VERI*FACTU (por ejemplo, el gratuito de la AEAT) y
            regístrala aquí con el{' '}
            <Link href="/dashboard/ventas/lector-ingresos" className="font-medium underline underline-offset-2">
              lector de facturas
            </Link>
            .
          </p>
        </div>
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
