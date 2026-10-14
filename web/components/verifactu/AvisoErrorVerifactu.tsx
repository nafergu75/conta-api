'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { WarningCircle } from '@phosphor-icons/react';
import { LIMITE_SIMPLIFICADA_GENERAL, type ErrorVerifactu, type PropuestaSimplificada } from '@/lib/erroresVerifactu';

/** Enlace que se abre en otra pestaña: el formulario y el borrador se quedan como están. */
function EnOtraPestana({ href, children }: { href: string; children: ReactNode }) {
  return (
    <>
      <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
        {children}
      </a>{' '}
      (en otra pestaña)
    </>
  );
}

const boton =
  'inline-flex items-center rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-50 disabled:opacity-50';

interface Props {
  error: ErrorVerifactu;
  /** id del aviso: el formulario lo enlaza con aria-describedby y le da el foco. */
  id?: string;
  /** Cliente de la factura: enlace a su ficha cuando el problema es suyo. */
  clienteId?: string | null;
  /** El error salió al pasar a factura un borrador ya guardado. */
  borradorGuardado?: boolean;
  /** Texto del botón de emitir («Pasar a factura» o «Emitir rectificativa»): se cita al decir qué pulsar. */
  verbo: string;
  /** Cliente sin NIF en una completa que cabe como simplificada. */
  propuesta?: PropuestaSimplificada | null;
  /** Cambia el formulario a simplificada (F2). */
  onSimplificada?: () => void;
  /** Sin formulario a mano (ficha del borrador): dónde se edita para cambiarla. */
  hrefEditar?: string;
  /** Vuelve a emitirla (la configuración de VERI*FACTU cambió mientras se emitía). */
  onReintentar?: () => void;
  /** Factura ya registrada: hacer una rectificativa. */
  onRectificativa?: () => void;
  ocupado?: boolean;
  fmt: (n: number) => string;
}

/**
 * Error de VERI*FACTU al emitir o al guardar una factura: el texto del
 * servidor y, al lado, la salida que tiene (la ficha del cliente, los datos de
 * la empresa, la serie, volver a emitirla, una rectificativa) y, con un cliente
 * sin NIF, la propuesta de hacerla simplificada si cabe.
 */
export default function AvisoErrorVerifactu({
  error,
  id,
  clienteId,
  borradorGuardado,
  verbo,
  propuesta,
  onSimplificada,
  hrefEditar,
  onReintentar,
  onRectificativa,
  ocupado,
  fmt,
}: Props) {
  // Un 422, un 409 de la configuración o del NIF, o un fallo interno: la emisión se deshace entera.
  const noEmitida = borradorGuardado && error.arreglo !== 'rectificativa';
  return (
    <div id={id} role="alert" tabIndex={-1} className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 focus:outline-none">
      <WarningCircle size={20} weight="duotone" className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 space-y-2">
        <p>{error.mensaje}</p>
        {noEmitida && <p>No se ha emitido ni ha gastado número: el borrador sigue guardado.</p>}

        {error.arreglo === 'cliente' && clienteId && (
          <p>
            <EnOtraPestana href={`/dashboard/clientes/${encodeURIComponent(clienteId)}`}>Abrir la ficha del cliente</EnOtraPestana>.
            {borradorGuardado && ` Cuando la corrijas, vuelve aquí y pulsa otra vez «${verbo}».`}
          </p>
        )}
        {error.arreglo === 'empresa' && (
          <p>
            <EnOtraPestana href="/dashboard/empresa">Abrir los datos de la empresa</EnOtraPestana>.
            {borradorGuardado && ` Cuando los corrijas, vuelve aquí y pulsa otra vez «${verbo}».`}
          </p>
        )}
        {error.arreglo === 'serie' && (
          <p>
            Elige otra serie en la factura o <EnOtraPestana href="/dashboard/configuracion/series">crea una en Configuración &gt; Series</EnOtraPestana>.
          </p>
        )}
        {error.arreglo === 'reintentar' && onReintentar && (
          <button type="button" className={boton} disabled={ocupado} onClick={onReintentar}>
            Intentarlo otra vez
          </button>
        )}
        {error.arreglo === 'rectificativa' && onRectificativa && (
          <button type="button" className={boton} disabled={ocupado} onClick={onRectificativa}>
            Hacer una rectificativa
          </button>
        )}

        {propuesta && (onSimplificada || hrefEditar) && (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
            <p>
              <span className="font-semibold">Cabe como simplificada (F2):</span> suma {fmt(propuesta.total)} con IVA.
              {propuesta.soloAlgunasActividades &&
                ` Como pasa de ${fmt(LIMITE_SIMPLIFICADA_GENERAL)}, solo vale si tu actividad admite simplificadas de hasta 3.000 €.`}
            </p>
            {onSimplificada && (
              <button type="button" className={boton} disabled={ocupado} onClick={onSimplificada}>
                Cambiarla a simplificada
              </button>
            )}
            {!onSimplificada && hrefEditar && (
              <p>
                <Link href={hrefEditar} className="font-medium underline underline-offset-2">
                  Editar el borrador
                </Link>{' '}
                y cambia el tipo de factura a «Simplificada / ticket (F2)».
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
