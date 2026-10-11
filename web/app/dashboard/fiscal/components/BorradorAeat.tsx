'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { CaretDown, CaretLeft, CaretRight, Download, WarningCircle } from '@phosphor-icons/react';
import { apiDownload, companyPath, errorMessage } from '@/lib/api';
import { ejerciciosSeleccionables } from '@/lib/aeatCalendar';
import { AvisosModelo } from './AvisosModelo';

/**
 * Piezas comunes de los borradores del 347, 390 y 200 con el diseño oficial de
 * la AEAT. Lo que se enseña sale del mismo cálculo que el fichero que se
 * descarga (GET /impuestos/borradores/:modelo y .../fichero).
 */

export interface CasillaDetalle {
  casilla: string;
  descripcion: string;
  valor: number | string;
}

export interface PaginaBorrador {
  codigo: string;
  titulo: string;
  detalle: CasillaDetalle[];
}

export const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

/** Ruta del borrador o de su fichero con los parámetros que tengan valor. */
export function rutaBorrador(modelo: string, ejercicio: number, parametros: Record<string, string | number | boolean | undefined> = {}, fichero = false): string {
  const q = new URLSearchParams({ ejercicio: String(ejercicio) });
  for (const [k, v] of Object.entries(parametros)) {
    if (v !== undefined && v !== '' && v !== false) q.set(k, String(v));
  }
  return companyPath(`/impuestos/borradores/${modelo}${fichero ? '/fichero' : ''}?${q.toString()}`);
}

export function CabeceraBorrador({ titulo, subtitulo, diseno }: { titulo: string; subtitulo: string; diseno: ReactNode }) {
  return (
    <div>
      <Link href="/dashboard/fiscal" className="mb-4 inline-flex items-center gap-2 text-blue-600 hover:text-blue-700">
        <CaretLeft size={20} />
        Volver a Fiscal
      </Link>
      <h1 className="text-3xl font-bold text-slate-900">{titulo}</h1>
      <p className="mt-2 text-slate-600">{subtitulo}</p>
      <p className="mt-1 text-xs text-slate-500">{diseno}</p>
    </div>
  );
}

export function SelectorEjercicio({ ejercicio, onChange }: { ejercicio: number; onChange: (e: number) => void }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      Ejercicio
      <select value={ejercicio} onChange={(e) => onChange(parseInt(e.target.value, 10))} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm">
        {ejerciciosSeleccionables().map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Errores (impiden descargar el fichero) en rojo y avisos en ámbar. */
export function ErroresYAvisos({ errores, advertencias, ejercicio }: { errores: string[]; advertencias: string[]; ejercicio: number }) {
  return (
    <>
      {errores.length > 0 && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="mb-2 font-semibold">Falta esto para poder descargar el fichero:</p>
          <ul className="space-y-1">
            {errores.map((e) => (
              <li key={e} className="flex gap-2">
                <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden /> <span>{e}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <AvisosModelo avisos={advertencias} ejercicio={ejercicio} />
    </>
  );
}

/** Una página del modelo con sus casillas oficiales. */
export function PaginaCasillas({ pagina, formato }: { pagina: PaginaBorrador; formato?: Record<string, (v: number | string) => string> }) {
  const [abierta, setAbierta] = useState(true);
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <button type="button" onClick={() => setAbierta(!abierta)} className="flex w-full items-center justify-between gap-2 p-4 text-left" aria-expanded={abierta}>
        <span className="font-semibold text-slate-900">{pagina.titulo}</span>
        <span className="flex items-center gap-2 text-xs text-slate-500">
          {pagina.detalle.length} casillas
          {abierta ? <CaretDown size={16} aria-hidden /> : <CaretRight size={16} aria-hidden />}
        </span>
      </button>
      {abierta && (
        <div className="overflow-x-auto border-t border-slate-100 px-4 pb-4">
          {pagina.detalle.length === 0 ? (
            <p className="pt-3 text-sm text-slate-500">Todas las casillas de esta página van a cero o en blanco.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th className="w-20 py-2 text-left font-medium">Casilla</th>
                  <th className="py-2 text-left font-medium">Concepto</th>
                  <th className="py-2 text-right font-medium">Importe</th>
                </tr>
              </thead>
              <tbody>
                {pagina.detalle.map((c) => (
                  <tr key={c.casilla} className="border-b border-slate-100">
                    <td className="py-2 font-mono text-slate-600">[{c.casilla}]</td>
                    <td className="py-2 text-slate-800">{c.descripcion}</td>
                    <td className="py-2 text-right font-medium tabular-nums">
                      {formato?.[c.casilla] ? formato[c.casilla](c.valor) : typeof c.valor === 'number' ? eur.format(c.valor) : c.valor}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}

/** Botón de descarga del fichero para importar en la sede de la AEAT. */
export function DescargarFichero({ ruta, nombre, bloqueado, texto = 'Descargar fichero para la AEAT' }: { ruta: string; nombre: string; bloqueado: boolean; texto?: string }) {
  const [error, setError] = useState('');
  const [descargando, setDescargando] = useState(false);
  const descargar = async () => {
    setError('');
    setDescargando(true);
    try {
      await apiDownload(ruta, nombre);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDescargando(false);
    }
  };
  return (
    <div>
      <button
        type="button"
        onClick={descargar}
        disabled={bloqueado || descargando}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        <Download size={18} />
        {descargando ? 'Preparando el fichero…' : texto}
      </button>
      {bloqueado && <p className="mt-2 text-sm text-slate-600">Completa lo que falta (arriba, en rojo) para poder descargarlo.</p>}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function Cargando() {
  return (
    <div className="space-y-4">
      <div className="h-10 w-32 animate-pulse rounded-lg bg-slate-200" />
      <div className="h-96 animate-pulse rounded-lg bg-slate-200" />
    </div>
  );
}

export function ErrorCarga({ mensaje }: { mensaje: string }) {
  return (
    <div className="space-y-4">
      <Link href="/dashboard/fiscal" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700">
        <CaretLeft size={20} />
        Volver a Fiscal
      </Link>
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-red-800">{mensaje}</p>
      </div>
    </div>
  );
}

/** Tarjeta de una cifra resumen. */
export function Cifra({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-600">{etiqueta}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{valor}</p>
      {nota && <p className="mt-1 text-xs text-slate-500">{nota}</p>}
    </div>
  );
}
