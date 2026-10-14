'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Info } from '@phosphor-icons/react';
import { getCompanyId } from '@/lib/auth';
import { plantillaPorCasilla, RUTA_AJUSTES_FACTURACION, type MotivoPlantilla } from '@/lib/plantillasFactura';

/**
 * Aviso discreto (no es un error) encima de las líneas de Nueva factura: la
 * serie elegida es la A o la B, no tiene plantilla elegida y usa la estándar
 * porque su casilla de Configuración > Facturación está sin marcar
 * (`motivoPlantilla` 'sinIeepnr' o 'sinCeramica', lo dice el servidor). Dice
 * qué casilla marcar, con el enlace. En cualquier otro caso no sale.
 *
 * Quien usa la serie A o la B para otra cosa lo puede ocultar para esa serie y
 * esa empresa en este navegador. Si el navegador no deja guardarlo, se oculta
 * solo hasta salir de la página.
 */
export default function AvisoPlantillaSerie({ codigo, motivo }: { codigo: string; motivo?: MotivoPlantilla | string }) {
  const casilla = plantillaPorCasilla(motivo);
  const [clave, setClave] = useState<string | null>(null);
  // Hasta leer el navegador no se enseña: así no parpadea si estaba oculto.
  const [oculto, setOculto] = useState(true);

  useEffect(() => {
    const k = `conta:aviso-plantilla:${getCompanyId()}:${codigo}`;
    setClave(k);
    try {
      setOculto(window.localStorage.getItem(k) === '1');
    } catch {
      setOculto(false);
    }
  }, [codigo]);

  if (!casilla || oculto) return null;

  const ocultar = () => {
    try {
      if (clave) window.localStorage.setItem(clave, '1');
    } catch {
      // Sin almacenamiento (ventana privada, bloqueado): se oculta solo ahora.
    }
    setOculto(true);
  };

  return (
    <div role="note" className="flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-sky-200 bg-sky-50 px-5 py-2 text-sm text-sky-900">
      <p className="flex min-w-0 flex-1 basis-64 gap-2">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          Esta serie usa la plantilla Estándar. Para facturar con las columnas de la plantilla {casilla.plantilla} ({casilla.que}), marca «{casilla.casilla}» en{' '}
          <Link href={RUTA_AJUSTES_FACTURACION} className="font-medium underline">
            Configuración &gt; Facturación
          </Link>
          .
        </span>
      </p>
      <button
        type="button"
        onClick={ocultar}
        aria-label={`No mostrar más este aviso en la serie ${codigo}`}
        className="ml-6 shrink-0 rounded px-1.5 py-1 text-xs font-medium underline hover:bg-black/5 sm:-my-1 sm:ml-0"
      >
        No mostrar más
      </button>
    </div>
  );
}
