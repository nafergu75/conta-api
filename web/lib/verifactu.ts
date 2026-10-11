'use client';

import { useEffect, useState } from 'react';
import { ApiError, apiFetch, companyPath } from './api';

/**
 * Red de seguridad de VERI*FACTU (lo que devuelve GET /verifactu/red-seguridad).
 *
 * Desde el 1-1-2027 (hora de España) una empresa española sin VERI*FACTU
 * activo no puede emitir facturas desde la app. Los borradores y las proformas
 * se siguen guardando. La regla vive en el backend
 * (services/verifactu/redSeguridad.ts): aquí solo se avisa y se deshabilita el
 * botón de emitir. Si esto no se puede cargar, no se bloquea nada en pantalla:
 * el servidor lo vuelve a comprobar al emitir.
 */
export interface EstadoRedSeguridad {
  /** false: empresa extranjera, en el SII o foral (la red no le afecta). */
  aplica: boolean;
  exclusion: 'SII' | 'FORAL' | null;
  /** El SII está marcado en los ajustes fiscales, pero ningún administrador ha aprobado la exclusión. */
  siiSinAprobar?: boolean;
  /** Desde cuándo bloquea (AAAA-MM-DD, hora de Madrid). */
  inicio: string;
  redActiva: boolean;
  verifactuActivo: boolean;
  /** true: ahora mismo no se puede emitir. */
  bloquea: boolean;
  /** Por qué no se puede emitir (para el botón «Pasar a factura»). */
  motivo: string | null;
  /** Aviso previo para Ventas (desde el 1-12-2026), o null. */
  aviso: string | null;
}

/** details.codigo del 409 que da el servidor al emitir sin VERI*FACTU activo. */
export const CODIGO_VERIFACTU_INACTIVO = 'VERIFACTU_INACTIVO';

/** Estado de la red para la empresa activa. null mientras carga o si no se pudo leer. */
export function useRedSeguridad(): EstadoRedSeguridad | null {
  const [estado, setEstado] = useState<EstadoRedSeguridad | null>(null);
  useEffect(() => {
    let vivo = true;
    apiFetch<EstadoRedSeguridad>(companyPath('/verifactu/red-seguridad'))
      .then((e) => vivo && setEstado(e))
      .catch(() => vivo && setEstado(null));
    return () => {
      vivo = false;
    };
  }, []);
  return estado;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «2027-01-01» -> «1 de enero de 2027». */
export function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split('-');
  const mes = MESES[Number(m) - 1];
  return mes ? `${Number(d)} de ${mes} de ${a}` : iso;
}

/** Referencia del BOE con la forma BOE-A-AAAA-NNNNN (la misma regla que el servidor). */
export function esReferenciaBoe(texto: string): boolean {
  return /^BOE-A-\d{4}-\d{1,6}$/.test(texto.trim().toUpperCase());
}

const DIA_MADRID = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Hoy en España (AAAA-MM-DD), sea cual sea la hora del navegador: la fecha con la que cuenta la AEAT. */
export function hoyEspana(ahora: Date = new Date()): string {
  return DIA_MADRID.format(ahora);
}

/** Tope de una factura simplificada (F2): 3.000 € con el IVA incluido. */
export const LIMITE_SIMPLIFICADA = 3000;

/**
 * Guarda los datos de la empresa (PUT /legal-config). Si ya hay facturas
 * emitidas y se cambia el NIF (o se pasa a autónomo o se deja de serlo), el
 * servidor pide que un administrador lo confirme (409 CONFIRMAR_CAMBIO_NIF):
 * se pregunta con su texto y, si acepta, se vuelve a enviar confirmándolo.
 */
export async function guardarDatosEmpresa<T>(datos: object): Promise<T> {
  const enviar = (cuerpo: object) =>
    apiFetch<T>(companyPath('/legal-config'), { method: 'PUT', body: JSON.stringify(cuerpo) });
  try {
    return await enviar(datos);
  } catch (e) {
    const codigo = e instanceof ApiError && e.detalles && typeof e.detalles === 'object' ? (e.detalles as { codigo?: unknown }).codigo : undefined;
    if (!(e instanceof ApiError) || e.status !== 409 || codigo !== 'CONFIRMAR_CAMBIO_NIF') throw e;
    if (!window.confirm(e.message)) {
      throw new ApiError('No se ha guardado nada: los datos de la empresa siguen como estaban.', 409, e.detalles);
    }
    return enviar({ ...datos, confirmarCambioNif: true });
  }
}
