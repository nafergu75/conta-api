'use client';

import { useState } from 'react';
import { FileXls, Trash } from '@phosphor-icons/react';
import { fechaEs, NOMBRE_CAMPO, TIPOS_ELEGIBLES, type AjustesCarga, type FicheroCarga, type HojaAnalizada } from '@/lib/arranque';
import { boton, botonSecundario, campo, Nota } from './comun';

type AjusteHoja = NonNullable<AjustesCarga['hojas']>[string];

const tamano = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`);

/** Qué tan seguro está el reconocimiento, en palabras. */
function seguridad(h: HojaAnalizada): string | null {
  if (h.elegidoAMano) return 'Elegido por ti';
  if (h.dudosa || h.tipo === 'DESCONOCIDO') return null;
  return h.confianza >= 0.85 ? 'Reconocido con seguridad' : 'Reconocido';
}

/** Elegir a mano la columna de cada dato que falta. */
function Mapeo({ hoja, onAplicar, ocupado }: { hoja: HojaAnalizada; onAplicar: (a: AjusteHoja) => void; ocupado: boolean }) {
  const columnas = hoja.error?.columnas ?? [];
  const faltan = hoja.error?.faltan ?? [];
  const [elegidas, setElegidas] = useState<Record<string, string>>({});
  const listo = faltan.every((f) => elegidas[f] !== undefined && elegidas[f] !== '');
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-sm text-slate-700">Indica en qué columna está cada dato. El resto de columnas ya están reconocidas.</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {faltan.map((f) => (
          <label key={f} className="block text-xs font-medium text-slate-600">
            {NOMBRE_CAMPO[f] ?? f}
            <select className={campo} value={elegidas[f] ?? ''} onChange={(e) => setElegidas((x) => ({ ...x, [f]: e.target.value }))}>
              <option value="">Elige la columna…</option>
              {columnas.map((c) => (
                <option key={c.indice} value={c.indice}>
                  {c.letra} · {c.titulo || 'sin título'}
                  {c.ejemplo ? ` (ej. ${c.ejemplo})` : ''}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <button
        type="button"
        disabled={!listo || ocupado}
        className={`${boton} mt-3`}
        onClick={() => {
          const mapeo: Record<string, number> = { ...hoja.mapeo };
          for (const f of faltan) mapeo[f] = Number(elegidas[f]);
          onAplicar({ ...(hoja.elegidoAMano ? { tipo: hoja.tipo } : {}), mapeo });
        }}
      >
        Usar estas columnas
      </button>
    </div>
  );
}

/** Tarjeta de una hoja (o de un CSV): qué es, de qué programa parece y qué se ha leído. */
export function HojaTarjeta({
  hoja,
  puedeEditar,
  ocupado,
  onAjuste,
}: {
  hoja: HojaAnalizada;
  puedeEditar: boolean;
  ocupado: boolean;
  onAjuste: (id: string, a: AjusteHoja | null) => void;
}) {
  const [cambiando, setCambiando] = useState(false);
  const nombre = hoja.hoja && hoja.hoja !== hoja.fichero ? `${hoja.fichero} › ${hoja.hoja}` : hoja.fichero;
  const seg = seguridad(hoja);
  const tipoMarcado = hoja.elegidoAMano ? { tipo: hoja.tipo } : {};

  return (
    <li className={`rounded-lg border p-3 sm:p-4 ${hoja.excluida ? 'border-slate-200 bg-slate-50 opacity-75' : hoja.error || hoja.dudosa ? 'border-amber-200 bg-white' : 'border-slate-200 bg-white'}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="break-words text-xs text-slate-500">{nombre}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
            {hoja.excluida ? <span className="line-through">{hoja.nombreTipo}</span> : hoja.tipo === 'DESCONOCIDO' ? 'Sin reconocer' : hoja.nombreTipo}
            {seg && !hoja.excluida && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">{seg}</span>}
            {hoja.excluida && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">No se usa</span>}
          </p>
          {!hoja.excluida && (
            <p className="mt-1 text-sm text-slate-700">
              {[hoja.textoPrograma, hoja.resumen, hoja.fechaCorte ? `a ${fechaEs(hoja.fechaCorte)}` : null].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        {puedeEditar && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {!hoja.excluida && (
              <button type="button" disabled={ocupado} className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50" onClick={() => setCambiando((v) => !v)}>
                Cambiar tipo
              </button>
            )}
            <button
              type="button"
              disabled={ocupado}
              className="text-xs font-medium text-slate-600 hover:underline disabled:opacity-50"
              onClick={() => onAjuste(hoja.id, hoja.excluida ? (hoja.elegidoAMano ? tipoMarcado : null) : { ...tipoMarcado, excluida: true })}
            >
              {hoja.excluida ? 'Volver a usar esta hoja' : 'No usar esta hoja'}
            </button>
          </div>
        )}
      </div>

      {!hoja.excluida && hoja.dudosa && hoja.candidatos.length > 0 && (
        <div className="mt-3">
          <p className="text-sm text-amber-800">No está claro qué listado es. ¿Cuál de estos?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {hoja.candidatos.slice(0, 2).map((c) => (
              <button key={c.tipo} type="button" disabled={!puedeEditar || ocupado} className={botonSecundario} onClick={() => onAjuste(hoja.id, { tipo: c.tipo })}>
                {c.nombre}
              </button>
            ))}
            <button type="button" disabled={!puedeEditar || ocupado} className="text-sm font-medium text-slate-600 hover:underline" onClick={() => setCambiando(true)}>
              Otro…
            </button>
          </div>
        </div>
      )}

      {cambiando && puedeEditar && (
        <label className="mt-3 block max-w-sm text-xs font-medium text-slate-600">
          ¿Qué listado es?
          <select
            className={campo}
            value={hoja.tipo === 'DESCONOCIDO' ? '' : hoja.tipo}
            disabled={ocupado}
            onChange={(e) => {
              setCambiando(false);
              if (e.target.value === '__auto') onAjuste(hoja.id, null);
              else if (e.target.value) onAjuste(hoja.id, { tipo: e.target.value });
            }}
          >
            <option value="">Elige…</option>
            {TIPOS_ELEGIBLES.map(([t, n]) => (
              <option key={t} value={t}>
                {n}
              </option>
            ))}
            {hoja.elegidoAMano && <option value="__auto">Lo que reconozca la app</option>}
          </select>
        </label>
      )}

      {!hoja.excluida && hoja.avisos.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-amber-800">
          {hoja.avisos.map((a) => (
            <li key={a} className="break-words">
              · {a}
            </li>
          ))}
        </ul>
      )}

      {!hoja.excluida && hoja.error && (
        <div className="mt-3">
          <Nota tipo={hoja.error.necesitaMapeo ? 'aviso' : 'error'}>{hoja.error.mensaje}</Nota>
          {hoja.error.necesitaMapeo && puedeEditar && <Mapeo hoja={hoja} ocupado={ocupado} onAplicar={(a) => onAjuste(hoja.id, a)} />}
        </div>
      )}

    </li>
  );
}

/** Ficheros del borrador, con «Quitar». */
export function ListaFicheros({ ficheros, puedeEditar, ocupado, onQuitar }: { ficheros: FicheroCarga[]; puedeEditar: boolean; ocupado: boolean; onQuitar: (sha: string, nombre: string) => void }) {
  return (
    <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
      {ficheros.map((f) => (
        <li key={f.sha256} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <FileXls size={18} className="shrink-0 text-emerald-600" />
            <span className="truncate text-slate-800" title={f.nombre}>
              {f.nombre}
            </span>
            <span className="shrink-0 text-xs text-slate-500">{tamano(f.tamano)}</span>
          </span>
          {puedeEditar && (
            <button
              type="button"
              disabled={ocupado}
              onClick={() => onQuitar(f.sha256, f.nombre)}
              className="inline-flex shrink-0 items-center gap-1 rounded p-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              aria-label={`Quitar ${f.nombre}`}
            >
              <Trash size={16} /> <span className="hidden sm:inline">Quitar</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
