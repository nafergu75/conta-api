'use client';

import { useSearchParams } from 'next/navigation';
import { anioDeTexto, hoyIso } from '@/lib/anios';
import { ejercicioAnualAPresentar, trimestreAPresentar } from '@/lib/aeatCalendar';
import { useAniosEmpresa, useElegido } from '@/lib/useAniosEmpresa';
import { normalizarPeriodo } from './SelectorPeriodoRetenciones';

/**
 * Ejercicio y periodo con los que se abre un modelo de la AEAT (spec
 * arranque-2027, A.1):
 *
 *  - el de la URL (?ejercicio=2026&periodo=4T, desde el calendario, Nóminas o
 *    Carmen), que sale en la lista aunque no esté;
 *  - si no, el que toca presentar, pero nunca antes del primer año de la
 *    empresa en la app.
 *
 * Los años van del primero de la empresa al actual. `listo` dice si ya se
 * conocen: hasta entonces no se pide el modelo, para no pedirlo dos veces.
 * Las pantallas que lo usan van dentro de un <Suspense> (useSearchParams).
 */

export interface EjercicioModelo {
  ejercicio: number;
  setEjercicio: (e: number) => void;
  anios: number[];
  listo: boolean;
}

/** Modelos anuales (390, 190, 347, 200, 180): se presentan por el ejercicio anterior. */
export function useEjercicioAnual(): EjercicioModelo {
  const sp = useSearchParams();
  const a = useAniosEmpresa();
  const [ejercicio, setEjercicio] = useElegido(anioDeTexto(sp?.get('ejercicio')), ejercicioAnualAPresentar(hoyIso(), a.primeroReal));
  return { ejercicio, setEjercicio, anios: a.aniosModelos([ejercicio]), listo: a.listo };
}

export interface PeriodoModelo extends EjercicioModelo {
  periodo: string;
  setPeriodo: (p: string) => void;
}

/** Modelos trimestrales (303, 111, 115, 349): el último trimestre terminado. */
export function usePeriodoTrimestral(): PeriodoModelo {
  const sp = useSearchParams();
  const a = useAniosEmpresa();
  const porDefecto = trimestreAPresentar(hoyIso(), a.primeroReal);
  const t = Number(sp?.get('trimestre'));
  const periodoUrl = normalizarPeriodo(sp?.get('periodo')) ?? (t >= 1 && t <= 4 ? `${t}T` : null);
  const ejercicioUrl = anioDeTexto(sp?.get('ejercicio'));
  const [ejercicio, setEjercicio] = useElegido(ejercicioUrl, porDefecto.ejercicio);
  // Con otro año en la URL pero sin periodo: el 4T de un año ya terminado o el 1T del año en curso.
  const periodoDefecto =
    ejercicioUrl === null || ejercicioUrl === porDefecto.ejercicio ? `${porDefecto.trimestre}T` : ejercicioUrl < a.actual ? '4T' : '1T';
  const [periodo, setPeriodo] = useElegido(periodoUrl, periodoDefecto);
  return { ejercicio, setEjercicio, periodo, setPeriodo, anios: a.aniosModelos([ejercicio]), listo: a.listo };
}
