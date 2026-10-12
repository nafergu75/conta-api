'use client';

import { useEffect, useState } from 'react';
import { apiFetch, companyPath } from './api';
import { hoyIso } from './anios';
import { diasEntre, enlaceModelo, proximosVencimientos, textoPeriodoModelo, type VencimientoAeat } from './aeatCalendar';
import { useAniosEmpresa, useHoyIso } from './useAniosEmpresa';

/** Fila del calendario de modelos del servidor (GET /impuestos/modelos). */
export interface ModeloImpuestoResumen {
  id: string;
  codigo: string;
  descripcion: string;
  ejercicio: number;
  /** '1T'..'4T', '01'..'12', '1P'..'3P' o '0A'. */
  periodo: string;
  periodoEtiqueta: string;
  estado: 'vigente' | 'expirado' | 'presentado' | 'omitido';
  /** Último día para presentarlo (AAAA-MM-DD), ya pasado al día hábil. */
  fechaVencimiento: string;
  diasHastaVencimiento?: number;
  diasDesdeVencimiento?: number;
  tieneBorrador: boolean;
  /** 'fuera-app': marcado como presentado fuera de la app (gestoría, sede...). */
  origen?: 'autorrelleno' | 'manual-mixto' | 'fuera-app' | null;
  rellenoManual?: boolean;
}

export type PestanaModelos = 'activos' | 'omitidos' | 'presentados';

/** Calendario de modelos de un ejercicio, tal como lo calcula el servidor. */
export function leerModelosImpuesto(ejercicio: number, tab: PestanaModelos = 'activos'): Promise<ModeloImpuestoResumen[]> {
  return apiFetch<ModeloImpuestoResumen[]>(companyPath(`/impuestos/modelos?ejercicio=${ejercicio}&tab=${tab}`));
}

/** Un modelo del servidor en el formato de las tarjetas de plazos. */
export function aVencimiento(m: ModeloImpuestoResumen, hoy: string = hoyIso()): VencimientoAeat {
  return {
    id: m.id,
    modelo: `Modelo ${m.codigo}`,
    periodo: textoPeriodoModelo(m.ejercicio, m.periodo),
    fechaVencimiento: m.fechaVencimiento,
    diasFaltantes: diasEntre(hoy, m.fechaVencimiento),
    enlace: enlaceModelo(m.codigo, m.ejercicio, m.periodo),
  };
}

/**
 * Próximos plazos de la AEAT de la empresa: los modelos en plazo del año
 * pasado y de este, con las fechas del servidor (día hábil, ajustes fiscales y
 * fecha de inicio en la app). Los años anteriores al primero de la empresa no
 * se piden. Los que ya vencieron sin presentar no salen aquí: se cuentan
 * aparte (`vencidos`) para avisar y mandar a Estado fiscal. Si no se pueden
 * leer (sin permiso de impuestos, por ejemplo), se usa el calendario general.
 */
export interface Vencimientos {
  vencimientos: VencimientoAeat[] | null;
  /** Modelos del año pasado y de este con el plazo ya vencido y sin presentar (0 con el calendario general). */
  vencidos: number;
  delServidor: boolean;
}

export function useVencimientosAeat(n = 4, activo = true): Vencimientos {
  const { listo, primeroReal, actual } = useAniosEmpresa();
  // Al cambiar el día (medianoche de Madrid) se recalculan los días que faltan.
  const hoy = useHoyIso();
  const [estado, setEstado] = useState<Vencimientos>({ vencimientos: null, vencidos: 0, delServidor: false });

  useEffect(() => {
    if (!activo || !listo) return;
    let vivo = true;
    // Nunca antes del primer año de la empresa (sin recortarlo al actual): a
    // una empresa que empieza el año que viene no se le pide nada todavía y
    // se le enseñan sus primeros plazos del calendario general.
    const anios = [actual - 1, actual].filter((a) => a >= primeroReal);
    if (!anios.length) {
      setEstado({ vencimientos: proximosVencimientos(hoy, n, primeroReal), vencidos: 0, delServidor: false });
      return;
    }
    Promise.all(anios.map((a) => leerModelosImpuesto(a, 'activos')))
      .then((listas) => {
        if (!vivo) return;
        const todos = listas.flat();
        const proximos = todos
          .filter((m) => m.estado === 'vigente')
          .sort((a, b) => a.fechaVencimiento.localeCompare(b.fechaVencimiento) || a.codigo.localeCompare(b.codigo))
          .slice(0, n)
          .map((m) => aVencimiento(m, hoy));
        setEstado({ vencimientos: proximos, vencidos: todos.filter((m) => m.estado === 'expirado').length, delServidor: true });
      })
      .catch(() => vivo && setEstado({ vencimientos: proximosVencimientos(hoy, n, primeroReal), vencidos: 0, delServidor: false }));
    return () => {
      vivo = false;
    };
  }, [activo, listo, primeroReal, actual, n, hoy]);

  return estado;
}
