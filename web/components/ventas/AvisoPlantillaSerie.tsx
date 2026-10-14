'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowSquareOut, Info } from '@phosphor-icons/react';
import { getCompanyId } from '@/lib/auth';
import { plantillaPorCasilla, RUTA_AJUSTES_FACTURACION, type MotivoPlantilla } from '@/lib/plantillasFactura';

const RUTA_SERIES = '/dashboard/configuracion/series';

/**
 * Aviso discreto (no es un error) encima de las líneas de Nueva factura: la
 * serie elegida es la A o la B, no tiene plantilla elegida y usa la estándar
 * porque su casilla de Configuración > Facturación está sin marcar
 * (`motivoPlantilla` 'sinIeepnr' o 'sinCeramica', lo dice el servidor). Dice
 * qué casilla marcar y, si la serie es para otra cosa, que se le puede elegir
 * la «Estándar» en Configuración > Series (así deja de salir para todos). En
 * cualquier otro caso no sale.
 *
 * Los enlaces se abren en una pestaña nueva: la factura a medio hacer no se pierde.
 * Quien usa la serie A o la B para otra cosa también lo puede ocultar para esa
 * serie y esa empresa en este navegador. Si el navegador no deja guardarlo, se
 * oculta solo hasta salir de la página.
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
          Esta serie usa la plantilla estándar. Para facturar con las columnas de la plantilla {casilla.plantilla} ({casilla.que}), marca «{casilla.casilla}» en{' '}
          <EnlaceOtraPestana href={RUTA_AJUSTES_FACTURACION}>Configuración &gt; Facturación</EnlaceOtraPestana>. Si la serie {codigo} es para otra cosa, elige
          en ella la plantilla «Estándar» en <EnlaceOtraPestana href={RUTA_SERIES}>Configuración &gt; Series</EnlaceOtraPestana> y este aviso dejará de salir.
        </span>
      </p>
      <button
        type="button"
        onClick={ocultar}
        aria-label={`No mostrar más este aviso en la serie ${codigo}`}
        className="ml-6 shrink-0 rounded px-1.5 py-1 text-xs font-medium underline hover:bg-black/5 dark:hover:bg-white/10 sm:-my-1 sm:ml-0"
      >
        No mostrar más
      </button>
    </div>
  );
}

/** Enlace que se abre en una pestaña nueva (lo dice el icono y, para el lector de pantalla, el texto oculto). */
function EnlaceOtraPestana({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap font-medium underline">
      {children}
      <ArrowSquareOut size={12} className="ml-0.5 inline align-baseline" aria-hidden="true" />
      <span className="sr-only"> (se abre en una pestaña nueva)</span>
    </Link>
  );
}
