'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, companyPath } from './api';
import { getCompanyId } from './auth';
import { hoyIso, PRIMERO_RESPALDO, rangoAnios } from './anios';
import { ponerEnUrl } from './urlEstado';

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
  /** Primer año que se lleva en la app (fecha de inicio; nunca un año de la gestoría). Servidores anteriores no lo mandan. */
  primeroEnApp?: number;
  /** Años que llevó la gestoría (Traer la contabilidad de 2026). */
  aniosGestoria?: number[];
}

const SIN_ANIOS: number[] = [];
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

/**
 * Hoy en España (AAAA-MM-DD) que cambia solo al pasar la medianoche de Madrid,
 * aunque la página siga abierta: se comprueba cada minuto y al volver a la
 * pestaña. Así el 1 de enero los años y los plazos pasan al año nuevo sin
 * recargar.
 */
export function useHoyIso(): string {
  const [hoy, setHoy] = useState(() => hoyIso());
  useEffect(() => {
    const comprobar = () => setHoy((antes) => {
      const ahora = hoyIso();
      return ahora === antes ? antes : ahora;
    });
    const reloj = window.setInterval(comprobar, 60_000);
    document.addEventListener('visibilitychange', comprobar);
    window.addEventListener('focus', comprobar);
    return () => {
      window.clearInterval(reloj);
      document.removeEventListener('visibilitychange', comprobar);
      window.removeEventListener('focus', comprobar);
    };
  }, []);
  return hoy;
}

export interface UsoAniosEmpresa {
  /** Ya se sabe el primer año (de la empresa o, si falló, el de respaldo). */
  listo: boolean;
  /** No se han podido leer los años de la empresa: se usa el rango de respaldo. */
  respaldo: boolean;
  /** Primer año para los rangos: el de la empresa, como mucho el actual. */
  primero: number;
  /**
   * Primer año de la empresa tal como lo da el servidor, aunque sea posterior
   * al actual (una empresa que empieza en 2027 y hoy es 2026). Es el que vale
   * para decidir qué plazos y periodos le tocan.
   */
  primeroReal: number;
  /**
   * Primer año que se lleva en la app: como primeroReal, pero sin los años que
   * llevó la gestoría (tienen datos de la carga, pero sus modelos los presenta
   * ella). Es el que abren por defecto el 303 y el Estado fiscal.
   */
  primeroApp: number;
  /** Años que llevó la gestoría: sus modelos no se descargan ni se presentan desde aquí. */
  aniosGestoria: number[];
  actual: number;
  conDatos: number[];
  ejercicios: AniosEmpresa['ejercicios'];
  /** Filtros generales: del primero al actual + `extra` (1 por defecto), con los años con datos y los de `incluir`. */
  anios: (incluir?: Array<number | null | undefined>, extra?: number) => number[];
  /** Modelos de la AEAT: del primero al actual, con los de `incluir`. */
  aniosModelos: (incluir?: Array<number | null | undefined>) => number[];
  /** Vuelve a leer los años (tras crear, cerrar o reabrir un ejercicio). */
  recargar: () => void;
}

export function useAniosEmpresa(): UsoAniosEmpresa {
  const [estado, setEstado] = useState<{ companyId: string; datos: AniosEmpresa | null; listo: boolean }>(() => {
    const id = empresaActiva();
    return { companyId: id, datos: leidos.get(id) ?? null, listo: leidos.has(id) };
  });

  const [version, setVersion] = useState(0);
  const anioHoy = Number(useHoyIso().slice(0, 4));

  useEffect(() => {
    const id = empresaActiva();
    // Lo guardado de antes de medianoche del 31-12 ya no vale: el servidor
    // tiene que volver a decir los años (el actual cambia y quizá el primero).
    if ((leidos.get(id)?.actual ?? anioHoy) < anioHoy) {
      pedidos.delete(id);
      leidos.delete(id);
    }
    if (leidos.has(id)) {
      setEstado({ companyId: id, datos: leidos.get(id) ?? null, listo: true });
      return;
    }
    let vivo = true;
    pedir(id).then((datos) => vivo && setEstado({ companyId: id, datos, listo: true }));
    return () => {
      vivo = false;
    };
  }, [version, anioHoy]);

  const recargar = useCallback(() => {
    refrescarAniosEmpresa();
    setVersion((v) => v + 1);
  }, []);

  // El año de hoy en Madrid manda aunque la respuesta guardada sea de ayer.
  const actual = Math.max(estado.datos?.actual ?? 0, anioHoy);
  const primero = estado.datos ? Math.min(estado.datos.primero, actual) : PRIMERO_RESPALDO(actual);
  const primeroReal = estado.datos ? estado.datos.primero : primero;
  const primeroApp = estado.datos && Number.isInteger(estado.datos.primeroEnApp) ? Math.max(primeroReal, estado.datos.primeroEnApp as number) : primeroReal;
  const aniosGestoria = estado.datos?.aniosGestoria ?? SIN_ANIOS;
  const conDatos = estado.datos?.conDatos ?? [];

  const anios = useCallback(
    (incluir: Array<number | null | undefined> = [], extra = 1) => rangoAnios({ primero, actual, extra, incluir: [...conDatos, ...incluir] }),
    [primero, actual, conDatos],
  );
  // En los modelos no se ofrecen años futuros aunque tengan datos (no se pueden
  // presentar), salvo el primero de una empresa que aún no ha empezado: es el
  // que abren sus modelos.
  const aniosModelos = useCallback(
    (incluir: Array<number | null | undefined> = []) =>
      rangoAnios({
        primero,
        actual,
        extra: 0,
        incluir: [...conDatos.filter((a) => a <= actual), ...(primeroReal > actual ? [primeroReal] : []), ...incluir],
      }),
    [primero, primeroReal, actual, conDatos],
  );

  return {
    listo: estado.listo,
    respaldo: estado.listo && !estado.datos,
    primero,
    primeroReal,
    primeroApp,
    aniosGestoria,
    actual,
    conDatos,
    ejercicios: estado.datos?.ejercicios ?? [],
    anios,
    aniosModelos,
    recargar,
  };
}

/**
 * Valor que se abre por defecto hasta que la persona elige otro (o el que trae
 * la URL). El de por defecto se recalcula solo cuando se saben los años de la
 * empresa, sin una segunda petición con el valor provisional.
 *
 * Con `param`, lo elegido se escribe también en la URL (?ejercicio=2025): al
 * volver atrás a la pantalla, se abre en lo mismo.
 */
export function useElegido<T extends string | number>(desdeUrl: T | null, porDefecto: T, param?: string): [T, (v: T) => void, boolean] {
  const [elegido, setElegido] = useState<T | null>(desdeUrl);
  const elegir = useCallback(
    (v: T) => {
      setElegido(v);
      if (param) ponerEnUrl({ [param]: v });
    },
    [param],
  );
  return [elegido ?? porDefecto, elegir, elegido !== null];
}
