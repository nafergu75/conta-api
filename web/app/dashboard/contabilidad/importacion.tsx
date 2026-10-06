'use client';

import { useRef, type ReactNode } from 'react';
import { FileXls, UploadSimple, Warning, WarningCircle } from '@phosphor-icons/react';

/**
 * Piezas comunes de las importaciones contables (puesta en marcha): subida del
 * fichero, mapeo de columnas, avisos y formato de importes.
 */

export const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
export const num = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fechaEs = (f: string) => (f ? f.split('-').reverse().join('/') : '');

export interface Columna {
  indice: number;
  letra: string;
  titulo: string;
  ejemplo: string;
}

export interface Lectura {
  formato: string;
  filaCabecera: number;
  columnas: Columna[];
  mapeo: Record<string, number>;
  separadorDecimal: ',' | '.';
  convencionSigno?: 'deudor' | 'naturaleza';
  filasDescartadas: Array<{ fila: number; motivo: string }>;
  agregadasOmitidas?: string[];
  mayorPorCuenta?: boolean;
}

export interface NecesitaMapeo {
  necesitaMapeo: true;
  mensaje: string;
  columnas: Columna[];
  mapeo?: Record<string, number>;
}

/** Ajustes de lectura que el usuario puede cambiar; vacio = lo detecta el servidor. */
export interface AjustesLectura {
  mapeo?: Record<string, number>;
  filaCabecera?: number;
  convencionSigno: 'auto' | 'deudor' | 'naturaleza';
  separadorDecimal: '' | ',' | '.';
}

export const AJUSTES_INICIALES: AjustesLectura = { convencionSigno: 'auto', separadorDecimal: '' };

export function esNecesitaMapeo(v: unknown): v is NecesitaMapeo {
  return !!v && typeof v === 'object' && (v as NecesitaMapeo).necesitaMapeo === true;
}

/** FormData con el fichero, los ajustes de lectura y las opciones de la importacion. */
export function formulario(archivo: File, ajustes: AjustesLectura, opciones: Record<string, string | number | boolean | undefined>): FormData {
  const d = new FormData();
  d.append('archivo', archivo);
  if (ajustes.mapeo) d.append('mapeo', JSON.stringify(ajustes.mapeo));
  if (ajustes.filaCabecera !== undefined) d.append('filaCabecera', String(ajustes.filaCabecera));
  d.append('convencionSigno', ajustes.convencionSigno);
  if (ajustes.separadorDecimal) d.append('separadorDecimal', ajustes.separadorDecimal);
  for (const [k, v] of Object.entries(opciones)) {
    if (v === undefined || v === '' || v === false) continue;
    d.append(k, v === true ? '1' : String(v));
  }
  return d;
}

export function SubidaFichero({
  archivo,
  ocupado,
  texto,
  ayuda,
  onElegir,
}: {
  archivo: File | null;
  ocupado: boolean;
  texto: string;
  ayuda: string;
  onElegir: (f: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <label
      className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center transition hover:border-emerald-400 hover:bg-emerald-50"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) onElegir(f);
      }}
    >
      {archivo ? <FileXls size={30} className="mb-2 text-emerald-600" /> : <UploadSimple size={30} className="mb-2 text-slate-400" />}
      <span className="text-sm font-medium text-slate-900">{ocupado ? 'Leyendo el fichero...' : archivo ? archivo.name : texto}</span>
      <span className="mt-1 text-xs text-slate-500">{archivo ? 'Haz clic o arrastra otro fichero para cambiarlo' : ayuda}</span>
      <input
        ref={input}
        type="file"
        accept=".xlsx,.xls,.csv,.txt"
        disabled={ocupado}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onElegir(f);
          if (input.current) input.current.value = '';
        }}
      />
    </label>
  );
}

export function Mensajes({ errores = [], avisos = [] }: { errores?: string[]; avisos?: string[] }) {
  if (!errores.length && !avisos.length) return null;
  return (
    <div className="space-y-2">
      {errores.map((e) => (
        <p key={e} role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <WarningCircle size={18} className="mt-0.5 shrink-0" /> <span>{e}</span>
        </p>
      ))}
      {avisos.map((a) => (
        <p key={a} className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <Warning size={18} className="mt-0.5 shrink-0" /> <span>{a}</span>
        </p>
      ))}
    </div>
  );
}

export function Dato({ titulo, valor, tono = 'normal' }: { titulo: string; valor: ReactNode; tono?: 'normal' | 'bien' | 'mal' }) {
  const color = tono === 'bien' ? 'text-emerald-700' : tono === 'mal' ? 'text-red-700' : 'text-slate-900';
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-500">{titulo}</p>
      <p className={`mt-1 text-base font-semibold tabular-nums ${color}`}>{valor}</p>
    </div>
  );
}

/**
 * Editor del mapeo de columnas. Muestra lo detectado y deja cambiar cada dato;
 * al tocar algo, el mapeo pasa a ser manual (se envia completo al servidor).
 */
export function MapeoColumnas({
  campos,
  columnas,
  mapeoDetectado,
  filaDetectada,
  ajustes,
  abierto,
  conSigno,
  onCambiar,
}: {
  campos: Array<[string, string]>;
  columnas: Columna[];
  mapeoDetectado: Record<string, number>;
  filaDetectada: number;
  ajustes: AjustesLectura;
  abierto: boolean;
  conSigno?: boolean;
  onCambiar: (a: AjustesLectura) => void;
}) {
  const mapeo = ajustes.mapeo ?? mapeoDetectado;
  const fila = ajustes.filaCabecera ?? filaDetectada;
  const resumen = campos
    .filter(([k]) => mapeo[k] !== undefined)
    .map(([k, t]) => `${t} → ${columnas[mapeo[k]]?.letra ?? '?'}`)
    .join(' · ');
  const select = 'w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500';

  return (
    <details open={abierto} className="rounded-lg border border-slate-200 bg-white">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm text-slate-700">
        <span className="font-medium text-slate-900">Columnas del fichero</span>
        <span className="ml-2 break-words text-slate-500">{resumen || 'sin reconocer'} (cambiar)</span>
      </summary>
      <div className="space-y-4 border-t border-slate-100 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {campos.map(([k, t]) => (
            <label key={k} className="block text-xs font-medium text-slate-600">
              {t}
              <select
                className={`mt-1 ${select}`}
                value={mapeo[k] ?? ''}
                onChange={(e) => {
                  const nuevo = { ...mapeo };
                  if (e.target.value === '') delete nuevo[k];
                  else nuevo[k] = Number(e.target.value);
                  onCambiar({ ...ajustes, mapeo: nuevo, filaCabecera: fila });
                }}
              >
                <option value="">— No está en el fichero</option>
                {columnas.map((c) => (
                  <option key={c.indice} value={c.indice}>
                    {c.letra} · {c.titulo}
                    {c.ejemplo ? ` (ej. ${c.ejemplo})` : ''}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-xs font-medium text-slate-600">
            Fila de títulos
            <input
              type="number"
              min={0}
              className={`mt-1 ${select}`}
              value={fila}
              onChange={(e) => onCambiar({ ...ajustes, mapeo, filaCabecera: Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Decimales
            <select className={`mt-1 ${select}`} value={ajustes.separadorDecimal} onChange={(e) => onCambiar({ ...ajustes, separadorDecimal: e.target.value as AjustesLectura['separadorDecimal'] })}>
              <option value="">Automático</option>
              <option value=",">Coma (1.234,56)</option>
              <option value=".">Punto (1,234.56)</option>
            </select>
          </label>
          {conSigno && (
            <label className="block text-xs font-medium text-slate-600">
              Signo del saldo (si hay una sola columna)
              <select className={`mt-1 ${select}`} value={ajustes.convencionSigno} onChange={(e) => onCambiar({ ...ajustes, convencionSigno: e.target.value as AjustesLectura['convencionSigno'] })}>
                <option value="auto">Automático</option>
                <option value="deudor">Positivo deudor, negativo acreedor</option>
                <option value="naturaleza">Todo en positivo (según la cuenta)</option>
              </select>
            </label>
          )}
        </div>
        <p className="text-xs text-slate-500">La fila 0 significa que el fichero no tiene títulos. Si tocas algo, se usa tu elección en lugar de la detección automática.</p>
        {ajustes.mapeo && (
          <button type="button" onClick={() => onCambiar({ ...AJUSTES_INICIALES })} className="text-xs font-medium text-emerald-700 hover:underline">
            Volver a la detección automática
          </button>
        )}
      </div>
    </details>
  );
}

export function FilasDescartadas({ filas }: { filas: Array<{ fila: number; motivo: string }> }) {
  if (!filas.length) return null;
  return (
    <details className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">
      <summary className="cursor-pointer text-slate-600">{filas.length} fila(s) del fichero no se han podido leer</summary>
      <ul className="mt-2 space-y-1 text-xs text-slate-600">
        {filas.map((f) => (
          <li key={f.fila}>
            Fila {f.fila}: {f.motivo}
          </li>
        ))}
      </ul>
    </details>
  );
}

export const boton =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50';
export const botonSecundario =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50';
export const campo =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500';
