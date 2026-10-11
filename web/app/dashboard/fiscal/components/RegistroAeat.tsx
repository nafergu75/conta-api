'use client';

import { useState } from 'react';
import { DownloadSimple, WarningCircle, Info } from '@phosphor-icons/react';
import { apiDownload, errorMessage } from '@/lib/api';
import { formatoImporte } from '@/lib/moneda';

/**
 * Piezas comunes de los borradores de los modelos 349, 180 y 202. Lo que se
 * enseña sale del fichero que se presenta: el servidor lo genera con el diseño
 * de registro de la AEAT y lo vuelve a leer campo a campo.
 */

/** Un campo del registro, tal como lo lee el servidor del fichero generado. */
export interface CampoLeido {
  id: string;
  pos: number;
  lon: number;
  tipo: 'Num' | 'N' | 'An' | 'A' | 'Blanco';
  descripcion: string;
  casilla?: string;
  crudo: string;
  valor: string | number;
}

export interface Columna {
  id: string;
  descripcion: string;
  pos: number;
  lon: number;
}

const eur = (n: number) => formatoImporte(n, 'EUR');

/** Valor legible: importes en euros, porcentajes con %, el resto tal cual. */
export function valorLegible(c: { lon: number; valor: string | number }, id = ''): string {
  if (typeof c.valor === 'number') {
    if (c.lon <= 5 || /porcentaje/i.test(id)) return `${c.valor.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
    return eur(c.valor);
  }
  const v = String(c.valor ?? '').trim();
  // Los recuentos van con ceros a la izquierda en el fichero: en pantalla, sin ellos.
  if (/^numero(Operadores|Rectificaciones|Perceptores)$/.test(id) && /^\d+$/.test(v)) return String(Number(v));
  return v === '' ? '—' : v;
}

/** Posiciones de un campo en el registro ("76-77"). */
export const posiciones = (c: { pos: number; lon: number }) => (c.lon === 1 ? `${c.pos}` : `${c.pos}-${c.pos + c.lon - 1}`);

/** Campos de un registro (declarante, página...) como casillas, con sus posiciones del diseño. */
export function CamposRegistro({ campos, ocultar = [] }: { campos: CampoLeido[]; ocultar?: string[] }) {
  const visibles = campos.filter((c) => !ocultar.includes(c.id));
  return (
    <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {visibles.map((c) => (
        <div key={c.id} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <dt className="text-xs text-slate-600">
            {c.casilla ? <span className="mr-1 font-semibold text-slate-800">[{c.casilla}]</span> : null}
            {c.descripcion}
            <span className="ml-1 text-slate-400">({posiciones(c)})</span>
          </dt>
          <dd className="mt-1 break-words font-mono text-sm font-semibold text-slate-900">{valorLegible(c, c.id)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Registros de tipo 2 (operadores, perceptores...) con las columnas del diseño. */
export function TablaRegistros({
  columnas,
  filas,
  vacio,
  principales,
}: {
  columnas: Columna[];
  filas: Array<Record<string, string | number>>;
  vacio: string;
  /** Columnas que van en la cabecera de cada ficha en el móvil. */
  principales: string[];
}) {
  if (filas.length === 0) return <p className="text-sm text-slate-500">{vacio}</p>;
  const celda = (col: Columna, v: string | number | undefined) => valorLegible({ lon: col.lon, valor: v ?? '' }, col.id);
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left align-bottom text-xs text-slate-600">
              {columnas.map((c) => (
                <th key={c.id} className="px-2 py-2 font-medium" title={`Posiciones ${posiciones(c)}`}>
                  {c.descripcion}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i} className="border-b border-slate-100">
                {columnas.map((c) => (
                  <td key={c.id} className={`whitespace-nowrap px-2 py-2 font-mono text-xs ${typeof f[c.id] === 'number' ? 'text-right' : ''}`}>
                    {celda(c, f[c.id])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-3 md:hidden">
        {filas.map((f, i) => (
          <li key={i} className="rounded-lg border border-slate-200 p-3 text-sm">
            <p className="break-words font-medium text-slate-900">
              {principales.map((k) => celda(columnas.find((c) => c.id === k) ?? { id: k, descripcion: k, pos: 0, lon: 99 }, f[k])).join(' · ')}
            </p>
            <dl className="mt-2 grid grid-cols-1 gap-1">
              {columnas
                .filter((c) => !principales.includes(c.id))
                .map((c) => (
                  <div key={c.id} className="flex justify-between gap-3">
                    <dt className="text-xs text-slate-500">{c.descripcion}</dt>
                    <dd className="text-right font-mono text-xs text-slate-900">{celda(c, f[c.id])}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Lo que impide el fichero (rojo) y lo que conviene revisar (ámbar). */
export function AvisosBorrador({ errores, avisos }: { errores: string[]; avisos: string[] }) {
  if (!errores.length && !avisos.length) return null;
  return (
    <div className="space-y-3">
      {errores.length > 0 && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="flex items-center gap-2 font-semibold">
            <WarningCircle size={18} /> Falta esto para poder descargar el fichero
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            {errores.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {avisos.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="flex items-center gap-2 font-semibold">
            <Info size={18} /> Revisa
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            {avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Botón de descarga del fichero para importar en la sede de la AEAT. */
export function DescargarFichero({ ruta, nombre, bloqueado }: { ruta: string; nombre: string; bloqueado: boolean }) {
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState('');
  const descargar = async () => {
    setDescargando(true);
    setError('');
    try {
      await apiDownload(ruta, nombre);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDescargando(false);
    }
  };
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={descargar}
        disabled={bloqueado || descargando}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        <DownloadSimple size={18} />
        {descargando ? 'Preparando el fichero…' : 'Descargar fichero para la sede'}
      </button>
      <p className="text-xs text-slate-500">
        {bloqueado ? 'Completa lo que falta para poder descargarlo.' : 'Es un borrador: impórtalo en la sede de la AEAT, revísalo allí y preséntalo.'}
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

/** Ejercicios del selector: el siguiente (la app hace los modelos de 2027 en adelante) y los cuatro anteriores. */
export function ejerciciosBorrador(hoy: Date = new Date()): number[] {
  return Array.from({ length: 5 }, (_, i) => hoy.getFullYear() + 1 - i);
}

export function Seccion({ titulo, children, extra }: { titulo: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-slate-900">{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

export const ESTADO_MODELO: Record<string, string> = { vigente: 'Sin presentar', expirado: 'Sin presentar', presentado: 'Presentado', omitido: 'Omitido' };
