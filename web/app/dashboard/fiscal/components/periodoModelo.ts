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
 * Lo que se elige se escribe en la URL: al volver atrás se abre en lo mismo.
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
  const [ejercicio, setEjercicio] = useElegido(anioDeTexto(sp?.get('ejercicio')), ejercicioAnualAPresentar(hoyIso(), a.primeroReal), 'ejercicio');
  return { ejercicio, setEjercicio, anios: a.aniosModelos([ejercicio]), listo: a.listo };
}

export interface PeriodoModelo extends EjercicioModelo {
  periodo: string;
  setPeriodo: (p: string) => void;
}

/**
 * Periodo que se abre al cambiar de año: el último que ya se puede presentar.
 * El año en curso, el último trimestre (o mes) terminado, o el primero si aún
 * no ha terminado ninguno; un año pasado, el 4T (o diciembre); uno futuro, el
 * 1T (o enero). Se mantiene si se miraba por meses o por trimestres.
 */
export function periodoAlCambiarDeAnio(ejercicio: number, periodoActual: string, hoy: string = hoyIso()): string {
  const anioHoy = Number(hoy.slice(0, 4));
  if (!periodoActual.endsWith('T')) {
    if (ejercicio < anioHoy) return '12';
    if (ejercicio > anioHoy) return '01';
    return String(Math.max(1, Number(hoy.slice(5, 7)) - 1)).padStart(2, '0');
  }
  const terminado = trimestreAPresentar(hoy);
  if (ejercicio === terminado.ejercicio) return `${terminado.trimestre}T`;
  return ejercicio < anioHoy ? '4T' : '1T';
}

/**
 * Modelos trimestrales (303, 111, 115, 349): el último trimestre terminado,
 * nunca antes del primer año que se lleva en la app (un año de la gestoría
 * tiene datos de la carga, pero sus modelos los presentó ella).
 */
export function usePeriodoTrimestral(): PeriodoModelo {
  const sp = useSearchParams();
  const a = useAniosEmpresa();
  const porDefecto = trimestreAPresentar(hoyIso(), a.primeroApp);
  const t = Number(sp?.get('trimestre'));
  const periodoUrl = normalizarPeriodo(sp?.get('periodo')) ?? (t >= 1 && t <= 4 ? `${t}T` : null);
  const ejercicioUrl = anioDeTexto(sp?.get('ejercicio'));
  const [ejercicio, elegirEjercicio] = useElegido(ejercicioUrl, porDefecto.ejercicio, 'ejercicio');
  // Con otro año en la URL pero sin periodo: el 4T de un año ya terminado o el 1T del año en curso.
  const periodoDefecto =
    ejercicioUrl === null || ejercicioUrl === porDefecto.ejercicio ? `${porDefecto.trimestre}T` : ejercicioUrl < a.actual ? '4T' : '1T';
  const [periodo, setPeriodo] = useElegido(periodoUrl, periodoDefecto, 'periodo');
  // Al cambiar de año se abre su último periodo que se puede presentar (en
  // enero, de 2026 el 4T; de 2027, el 1T), no el mismo trimestre del otro año.
  const setEjercicio = (e: number) => {
    setPeriodo(periodoAlCambiarDeAnio(e, periodo));
    elegirEjercicio(e);
  };
  return { ejercicio, setEjercicio, periodo, setPeriodo, anios: a.aniosModelos([ejercicio]), listo: a.listo };
}
