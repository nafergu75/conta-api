'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, companyPath } from './api';
import { getCompanyId } from './auth';
import { anioEspana, PRIMERO_RESPALDO, rangoAnios } from './anios';

/**
 * Años de la empresa activa para los desplegables (GET /anios). Se piden una
 * vez por empresa y se guardan mientras dure la página (al cambiar de empresa
 * la página se recarga). Lo puede leer cualquier miembro de la empresa.
 *
 * Si la petición falla o da 403, se usa de actual − 4 a actual + 1, para que el
 * selector nunca se quede vacío.
 */

export type EstadoEjercicio = 'ABIERTO' | 'CERRADO' | 'CERRADO_SIN_ASIENTOS';

export interface AniosEmpresa {
  /** Primer año con algo en la app (ejercicio, factura, asiento, banco o nómina); sin nada, el actual. */
  primero: number;
  /** Año en curso en España. */
  actual: number;
  /** Años con algún dato, de mayor a menor. */
  conDatos: number[];
  /** Ejercicios dados de alta, de mayor a menor, con su estado. */
  ejercicios: Array<{ anio: number; estado: EstadoEjercicio }>;
}

const pedidos = new Map<string, Promise<AniosEmpresa | null>>();
const leidos = new Map<string, AniosEmpresa | null>();

function pedir(companyId: string): Promise<AniosEmpresa | null> {
  let p = pedidos.get(companyId);
  if (!p) {
    p = apiFetch<AniosEmpresa>(companyPath('/anios'))
      .then((a) => (a && Number.isInteger(a.primero) && Number.isInteger(a.actual) ? a : null))
      .catch(() => null)
      .then((a) => {
        leidos.set(companyId, a);
        return a;
      });
    pedidos.set(companyId, p);
  }
  return p;
}

/** Olvida los años guardados (por ejemplo, tras crear un ejercicio o importar históricos). */
export function refrescarAniosEmpresa(): void {
  pedidos.clear();
  leidos.clear();
}

function empresaActiva(): string {
  try {
    return getCompanyId();
  } catch {
    return '';
  }
}

export interface UsoAniosEmpresa {
  /** Ya se sabe el primer año (de la empresa o, si falló, el de respaldo). */
  listo: boolean;
  /** No se han podido leer los años de la empresa: se usa el rango de respaldo. */
  respaldo: boolean;
  primero: number;
  actual: number;
  conDatos: number[];
  ejercicios: AniosEmpresa['ejercicios'];
  /** Filtros generales: del primero al actual + `extra` (1 por defecto), con los años con datos y los de `incluir`. */
  anios: (incluir?: Array<number | null | undefined>, extra?: number) => number[];
  /** Modelos de la AEAT: del primero al actual, con los de `incluir`. */
  aniosModelos: (incluir?: Array<number | null | undefined>) => number[];
}

export function useAniosEmpresa(): UsoAniosEmpresa {
  const [estado, setEstado] = useState<{ companyId: string; datos: AniosEmpresa | null; listo: boolean }>(() => {
    const id = empresaActiva();
    return { companyId: id, datos: leidos.get(id) ?? null, listo: leidos.has(id) };
  });

  useEffect(() => {
    const id = empresaActiva();
    if (leidos.has(id)) {
      setEstado({ companyId: id, datos: leidos.get(id) ?? null, listo: true });
      return;
    }
    let vivo = true;
    pedir(id).then((datos) => vivo && setEstado({ companyId: id, datos, listo: true }));
    return () => {
      vivo = false;
    };
  }, []);

  const actual = estado.datos?.actual ?? anioEspana();
  const primero = estado.datos ? Math.min(estado.datos.primero, actual) : PRIMERO_RESPALDO(actual);
  const conDatos = estado.datos?.conDatos ?? [];

  const anios = useCallback(
    (incluir: Array<number | null | undefined> = [], extra = 1) => rangoAnios({ primero, actual, extra, incluir: [...conDatos, ...incluir] }),
    [primero, actual, conDatos],
  );
  // En los modelos no se ofrecen años futuros aunque tengan datos (no se pueden presentar).
  const aniosModelos = useCallback(
    (incluir: Array<number | null | undefined> = []) =>
      rangoAnios({ primero, actual, extra: 0, incluir: [...conDatos.filter((a) => a <= actual), ...incluir] }),
    [primero, actual, conDatos],
  );

  return {
    listo: estado.listo,
    respaldo: estado.listo && !estado.datos,
    primero,
    actual,
    conDatos,
    ejercicios: estado.datos?.ejercicios ?? [],
    anios,
    aniosModelos,
  };
}

/**
 * Valor que se abre por defecto hasta que la persona elige otro (o el que trae
 * la URL). El de por defecto se recalcula solo cuando se saben los años de la
 * empresa, sin una segunda petición con el valor provisional.
 */
export function useElegido<T>(desdeUrl: T | null, porDefecto: T): [T, (v: T) => void, boolean] {
  const [elegido, setElegido] = useState<T | null>(desdeUrl);
  return [elegido ?? porDefecto, setElegido, elegido !== null];
}
