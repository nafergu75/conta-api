'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, companyPath, errorMessage } from './api';

/**
 * Subcuentas contables: las de cada cliente y proveedor (430, 400 y 410) y las
 * de gasto e ingreso que se eligen en cada linea de una factura.
 *
 * Rutas del backend (todas bajo /companies/:companyId):
 *  - /cuentas-linea              cuentas de gasto o de ingreso para las lineas
 *  - /informes-contables/...     buscador de terceros y su saldo contable
 *  - /reglas-contables/longitud-subcuentas
 */

// ---------------------------------------------------------------------------
// Cuentas de gasto e ingreso por linea
// ---------------------------------------------------------------------------

/** gasto: grupo 6. venta: 70x (incluye 705). servicio: solo 705. */
export type TipoCuentaLinea = 'gasto' | 'venta' | 'servicio';

export interface CuentaElegible {
  codigo: string;
  nombre: string;
  /** Cuenta de la que cuelga (null en las de 3 digitos). */
  madre: string | null;
  /** Creada por la empresa o traida de su plan anterior. */
  propia: boolean;
}

/** GET /cuentas-linea?tipo= */
export interface ListadoCuentasLinea {
  tipo: TipoCuentaLinea;
  porDefecto: string;
  /** Digitos de las subcuentas nuevas. */
  longitud: number;
  /** Las que pueden ir en la linea de una factura. */
  cuentas: CuentaElegible[];
  /**
   * Las de uso contable (descuentos y devoluciones, sueldos, amortizaciones...):
   * solo llegan a quien tiene Contabilidad «Modificar» y al administrador; a los
   * demas, vacia.
   */
  otras?: CuentaElegible[];
}

/** GET /cuentas-linea/siguiente */
export interface PropuestaSubcuenta {
  tipo: TipoCuentaLinea;
  madre: string;
  nombreMadre: string;
  longitud: number;
  codigo: string;
}

/** POST /cuentas-linea */
export interface SubcuentaCreada {
  id: string;
  codigo: string;
  nombre: string;
  madre: string;
  tipo: TipoCuentaLinea;
}

export interface CatalogoCuentas {
  listado: ListadoCuentasLinea | null;
  cargando: boolean;
  error: string;
  /** Nombre de una cuenta del catalogo (o null si no esta). */
  nombreDe: (codigo: string | null | undefined) => string | null;
  /** Anade al catalogo una subcuenta recien creada (sin volver a pedirlo todo). */
  anadir: (c: SubcuentaCreada) => void;
  recargar: () => void;
}

/**
 * Cuentas activas del plan para las lineas de una factura (una sola peticion
 * por formulario: todas las lineas comparten el catalogo).
 */
export function useCuentasLinea(tipo: TipoCuentaLinea, activo = true): CatalogoCuentas {
  const [listado, setListado] = useState<ListadoCuentasLinea | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    setCargando(true);
    apiFetch<ListadoCuentasLinea>(companyPath(`/cuentas-linea?tipo=${tipo}`))
      .then((l) => {
        if (!vigente) return;
        setListado(l);
        setError('');
      })
      .catch((e) => vigente && setError(errorMessage(e)))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [tipo, activo, vuelta]);

  const nombreDe = useCallback(
    (codigo: string | null | undefined) =>
      codigo ? ([...(listado?.cuentas ?? []), ...(listado?.otras ?? [])].find((c) => c.codigo === codigo)?.nombre ?? null) : null,
    [listado],
  );

  const anadir = useCallback((c: SubcuentaCreada) => {
    setListado((l) =>
      l && !l.cuentas.some((x) => x.codigo === c.codigo)
        ? { ...l, cuentas: [...l.cuentas, { codigo: c.codigo, nombre: c.nombre, madre: c.madre, propia: true }].sort((a, b) => a.codigo.localeCompare(b.codigo)) }
        : l,
    );
  }, []);

  const recargar = useCallback(() => setVuelta((n) => n + 1), []);

  return { listado, cargando, error, nombreDe, anadir, recargar };
}

/** Sin tildes y en minusculas, para buscar «electricidad» con «electricidád». */
export const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ---------------------------------------------------------------------------
// Clientes y proveedores con su subcuenta
// ---------------------------------------------------------------------------

export type TipoFicha = 'cliente' | 'proveedor';

/** GET /informes-contables/buscar-tercero */
export interface TerceroEncontrado {
  tipo: TipoFicha;
  id: string;
  nombre: string;
  nif: string | null;
  subcuentas: string[];
}

export function buscarTerceros(q: string, tipo?: TipoFicha): Promise<TerceroEncontrado[]> {
  const p = new URLSearchParams({ q });
  if (tipo) p.set('tipo', tipo);
  return apiFetch<TerceroEncontrado[]>(companyPath(`/informes-contables/buscar-tercero?${p}`));
}

/** Enlaces al mayor de un cliente o proveedor (Libro mayor y Mayor de clientes/proveedores). */
export function enlaceLibroMayor(tipo: TipoFicha, id: string): string {
  return `/dashboard/informes?tipo=mayor&tercero=${encodeURIComponent(id)}&tipoTercero=${tipo}`;
}

export function enlaceMayorTerceros(tipo: TipoFicha, id: string): string {
  return `/dashboard/mayor-terceros?tipo=${tipo === 'cliente' ? 'clientes' : 'proveedores'}&tercero=${encodeURIComponent(id)}`;
}

/** Que es cada subcuenta de tercero, para leerla: 43000012 -> «clientes». */
export function tipoDeSubcuenta(codigo: string): 'clientes' | 'compras' | 'servicios' | null {
  if (codigo.startsWith('430')) return 'clientes';
  if (codigo.startsWith('400')) return 'compras';
  if (codigo.startsWith('410')) return 'servicios';
  return null;
}

// ---------------------------------------------------------------------------
// Longitud de las subcuentas (Configuracion)
// ---------------------------------------------------------------------------

/** GET y PUT /reglas-contables/longitud-subcuentas */
export interface LongitudSubcuentas {
  longitud: number;
  guardada: boolean;
  bloqueada: boolean;
  motivo: string | null;
  minimo: number;
  maximo: number;
}
