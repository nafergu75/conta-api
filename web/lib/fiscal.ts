'use client';

import { useEffect, useState } from 'react';
import { apiFetch, companyPath, errorMessage } from './api';

/**
 * Tipo de operacion de IVA de las facturas de venta (lo que devuelve
 * GET /income-invoices/tipos-operacion). La regla vive en el backend
 * (domain/tipo-operacion.model.ts): aqui solo se pinta.
 */

export interface TipoOperacionInfo {
  codigo: string;
  etiqueta: string;
  etiquetaCorta: string;
  etiquetaEn: string;
  llevaCuota: boolean;
  admiteRetencion: boolean;
  tiposFacturaProhibidos: string[];
  exigeSupuesto: boolean;
  admiteReferencia: boolean;
}

export interface Supuesto {
  codigo: string;
  causa?: string;
  etiqueta: string;
  referenciaLegal: string | null;
}

export interface AvisoFiscal {
  codigo: string;
  mensaje: string;
}

export interface ContextoFiscal {
  /** false: empresa no establecida en Espana. Sus facturas van sin IVA, en su moneda y en ingles. */
  empresaEspanola: boolean;
  pais: string;
  idiomaPdf: 'es' | 'en';
  monedaCuenta: string;
  monedasFactura: Array<{ codigo: string; nombre: string; simbolo: string }>;
  tipos: TipoOperacionInfo[];
  supuestosExencion: Supuesto[];
  supuestosIsp: Supuesto[];
  paisesUe: string[];
  sugerencia?: { tipoOperacion: string | null; avisos: AvisoFiscal[] };
  avisosCliente?: AvisoFiscal[];
}

/** Etiqueta corta para listados y fichas (la misma que el backend). */
export const ETIQUETA_CORTA: Record<string, string> = {
  NACIONAL: 'Nacional',
  INTRACOMUNITARIA: 'Intracom.',
  EXPORTACION: 'Export.',
  SERVICIOS_EXTRANJERO: 'No sujeta',
  EXENTA: 'Exenta',
  ISP_NACIONAL: 'ISP',
  EMPRESA_EXTRANJERA: 'Sin IVA',
};

export const ETIQUETA_LARGA: Record<string, string> = {
  NACIONAL: 'Nacional (con IVA)',
  INTRACOMUNITARIA: 'Entrega intracomunitaria exenta (art. 25 LIVA)',
  EXPORTACION: 'Exportación exenta (art. 21 LIVA)',
  SERVICIOS_EXTRANJERO: 'Servicios a cliente extranjero, no sujeta (arts. 69-70 LIVA)',
  EXENTA: 'Exenta (art. 20 LIVA y otros)',
  ISP_NACIONAL: 'Inversión del sujeto pasivo (art. 84.Uno.2.º LIVA)',
  EMPRESA_EXTRANJERA: 'Sin IVA (empresa no establecida en España)',
};

/**
 * Paises para la ficha de la empresa y del cliente (ISO-2). Los de la UE
 * deciden la entrega intracomunitaria; el resto, la exportacion.
 */
export const PAISES: Array<[string, string]> = [
  ['ES', 'España'],
  ['US', 'Estados Unidos'],
  ['HK', 'Hong Kong'],
  ['DE', 'Alemania'],
  ['AT', 'Austria'],
  ['BE', 'Bélgica'],
  ['BG', 'Bulgaria'],
  ['CY', 'Chipre'],
  ['HR', 'Croacia'],
  ['DK', 'Dinamarca'],
  ['SK', 'Eslovaquia'],
  ['SI', 'Eslovenia'],
  ['EE', 'Estonia'],
  ['FI', 'Finlandia'],
  ['FR', 'Francia'],
  ['GR', 'Grecia'],
  ['HU', 'Hungría'],
  ['IE', 'Irlanda'],
  ['IT', 'Italia'],
  ['LV', 'Letonia'],
  ['LT', 'Lituania'],
  ['LU', 'Luxemburgo'],
  ['MT', 'Malta'],
  ['NL', 'Países Bajos'],
  ['PL', 'Polonia'],
  ['PT', 'Portugal'],
  ['CZ', 'República Checa'],
  ['RO', 'Rumanía'],
  ['SE', 'Suecia'],
  ['AD', 'Andorra'],
  ['AR', 'Argentina'],
  ['AU', 'Australia'],
  ['BR', 'Brasil'],
  ['CA', 'Canadá'],
  ['CL', 'Chile'],
  ['CN', 'China'],
  ['CO', 'Colombia'],
  ['AE', 'Emiratos Árabes Unidos'],
  ['GI', 'Gibraltar'],
  ['IN', 'India'],
  ['JP', 'Japón'],
  ['MA', 'Marruecos'],
  ['MX', 'México'],
  ['NO', 'Noruega'],
  ['PE', 'Perú'],
  ['GB', 'Reino Unido'],
  ['SG', 'Singapur'],
  ['CH', 'Suiza'],
  ['TR', 'Turquía'],
  ['UY', 'Uruguay'],
];

export const PAISES_UE = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
]);

export const nombrePais = (codigo: string | null | undefined): string =>
  PAISES.find(([c]) => c === (codigo ?? '').toUpperCase())?.[1] ?? (codigo ?? '');

/** NIF-IVA con el prefijo de un Estado de la UE (FR..., DE..., EL para Grecia). Solo ayuda: el backend decide. */
export function pareceNifIvaUe(nif: string | null | undefined): boolean {
  const n = String(nif ?? '').toUpperCase().replace(/[\s.\-]/g, '');
  const m = /^([A-Z]{2})[0-9A-Z+*]{2,12}$/.exec(n);
  if (!m || !/\d/.test(n.slice(2))) return false;
  const prefijo = m[1] === 'EL' ? 'GR' : m[1];
  return PAISES_UE.has(prefijo) || m[1] === 'XI';
}

/**
 * Contexto fiscal de la empresa (y la sugerencia para un cliente): si es
 * espanola, sus tipos de operacion, monedas y moneda de cuenta. Si falla la
 * carga, `error` y contexto null: nunca se da por hecho que la empresa es
 * espanola.
 */
export function useContextoFiscal(customerId?: string): {
  contexto: ContextoFiscal | null;
  cargando: boolean;
  error: string;
} {
  const [contexto, setContexto] = useState<ContextoFiscal | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    const q = customerId ? `?customerId=${encodeURIComponent(customerId)}` : '';
    apiFetch<ContextoFiscal>(companyPath(`/income-invoices/tipos-operacion${q}`))
      .then((c) => {
        if (!vivo) return;
        setContexto(c);
        setError('');
      })
      .catch((e) => {
        if (!vivo) return;
        setError(errorMessage(e));
      })
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [customerId]);
  return { contexto, cargando, error };
}
