'use client';

import Link from 'next/link';
import { euros, gastoIA } from '@/lib/carmen';
import { useCarmen } from './CarmenProvider';
import type { Variante } from './CarmenConversacion';

/** Aviso que exige el art. 50 del Reglamento de IA: siempre visible en la ventana. */
export const AVISO_CARMEN =
  'Carmen es un asistente automático. Las cifras salen de tu contabilidad; la IA solo responde dudas generales y no ve tus datos.';

export const RUTA_AJUSTES_CARMEN = '/dashboard/empresa#carmen-ia';

/**
 * Pie de la ventana: el aviso fijo, por qué no está la IA (apagada, desactivada
 * en la empresa o sin saldo) y, para los administradores, el gasto del mes con
 * el enlace a los ajustes.
 */
export function CarmenPie({ variante }: { variante: Variante }) {
  const { estado, cerrar, enPagina } = useCarmen();
  const uso = estado?.usoMes;
  const motivo = estado && !estado.iaDisponible ? estado.motivo : undefined;
  const sinSaldo = !!motivo && motivo.startsWith('tope');

  // Desde la ventana, el enlace a los ajustes la cierra para que se vea la pantalla.
  const alIrAjustes = () => {
    if (!enPagina) cerrar();
  };

  return (
    <div
      className={`shrink-0 space-y-1 bg-white px-3 pt-1 text-[11px] leading-snug text-slate-500 pb-[max(0.75rem,env(safe-area-inset-bottom))] ${variante === 'pagina' ? 'pr-[4.5rem] md:pr-3' : ''}`}
    >
      <div className={`space-y-1 ${variante === 'pagina' ? 'mx-auto max-w-3xl' : ''}`}>
        <p>{AVISO_CARMEN}</p>
        {sinSaldo && (
          <p role="status" className="rounded-md bg-amber-50 px-2 py-1 text-amber-900">
            {estado?.textoMotivo} Mientras, sigo respondiendo con tus datos y con las fichas.
          </p>
        )}
        {motivo && !sinSaldo && (
          <p>
            {motivo === 'desactivada_empresa' ? 'La IA para dudas generales no está activada en esta empresa. ' : ''}
            Para dudas que no estén en mis fichas, consulta a tu asesor.
          </p>
        )}
        {uso && (
          <p className={uso.avisoTope ? 'text-amber-800' : ''}>
            IA este mes: {gastoIA(uso.gastoMesEur)} de {euros(uso.topeMesEur)}
            {uso.avisoTope ? ` (${uso.porcentajeMes.toLocaleString('es-ES')} % gastado)` : ''}
            {' · '}
            <Link
              href={RUTA_AJUSTES_CARMEN}
              onClick={alIrAjustes}
              className="font-medium text-emerald-700 underline underline-offset-2 hover:no-underline"
            >
              {motivo === 'desactivada_empresa' ? 'Activar la IA' : 'Ajustes de Carmen'}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
