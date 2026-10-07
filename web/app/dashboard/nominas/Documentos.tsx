'use client';

import { useRef, useState } from 'react';
import { DownloadSimple, FilePdf, Trash, UploadSimple } from '@phosphor-icons/react';
import { apiDownload, apiFetch, companyPath, errorMessage } from '@/lib/api';
import { botonSecundario, campo, etiqueta, fechaEs, periodoTexto, type Nomina } from './comun';

/**
 * PDF de la gestoria de un mes (nominas, RLC y RNT), en el archivo privado.
 * Solo los ven quienes tienen nominas:read; el archivo general no los muestra.
 */

export interface DocumentoNomina {
  id: string;
  clase: 'nomina' | 'rlc' | 'rnt';
  ejercicio: number;
  mes: number;
  nominaId: string | null;
  trabajador: string | null;
  archivoNombre: string;
  archivoTamanio: number;
  observaciones: string | null;
  uploadedAt: string;
}

const CLASES: Record<string, string> = { nomina: 'Nómina', rlc: 'RLC', rnt: 'RNT' };
const MAX_PDF = 4 * 1024 * 1024;
const tamano = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Sube un PDF del mes (multipart: archivo, tipo, nominaId). */
export async function subirPdf(ejercicio: number, mes: number, archivo: File, tipo: string, nominaId?: string): Promise<DocumentoNomina> {
  if (archivo.size > MAX_PDF) throw new Error('El PDF ocupa más de 4 MB: súbelo por trabajador o comprímelo.');
  const d = new FormData();
  d.append('archivo', archivo);
  d.append('tipo', tipo);
  if (nominaId) d.append('nominaId', nominaId);
  return apiFetch<DocumentoNomina>(companyPath(`/nominas/periodos/${ejercicio}/${mes}/documentos`), { method: 'POST', body: d });
}

export const descargarPdf = (d: DocumentoNomina) => apiDownload(companyPath(`/nominas/documentos/${d.id}/descargar`), d.archivoNombre);

export function Documentos({
  ejercicio,
  mes,
  documentos,
  nominas,
  escribir,
  onCambio,
  onMensaje,
}: {
  ejercicio: number;
  mes: number;
  documentos: DocumentoNomina[];
  nominas: Nomina[];
  escribir: boolean;
  onCambio: () => void;
  onMensaje: (tipo: 'ok' | 'error', texto: string) => void;
}) {
  const [tipo, setTipo] = useState('nomina');
  const [nominaId, setNominaId] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const subir = async (f: File | undefined) => {
    if (!f) return;
    setOcupado(true);
    try {
      const d = await subirPdf(ejercicio, mes, f, tipo, tipo === 'nomina' && nominaId ? nominaId : undefined);
      onMensaje('ok', `${CLASES[d.clase]} ${d.trabajador ? `de ${d.trabajador} ` : ''}guardada en el archivo (${d.archivoNombre}).`);
      setNominaId('');
      onCambio();
    } catch (e) {
      onMensaje('error', errorMessage(e));
    } finally {
      setOcupado(false);
      if (input.current) input.current.value = '';
    }
  };

  const anular = async (d: DocumentoNomina) => {
    if (!window.confirm(`¿Quitar ${d.archivoNombre} del archivo?`)) return;
    try {
      await apiFetch(companyPath(`/nominas/documentos/${d.id}`), { method: 'DELETE' });
      onMensaje('ok', `${d.archivoNombre} quitado del archivo.`);
      onCambio();
    } catch (e) {
      onMensaje('error', errorMessage(e));
    }
  };

  const descargar = async (d: DocumentoNomina) => {
    try {
      await descargarPdf(d);
    } catch (e) {
      onMensaje('error', errorMessage(e));
    }
  };

  const zip = async () => {
    try {
      await apiDownload(companyPath(`/nominas/documentos/zip?ejercicio=${ejercicio}&mes=${mes}`), `nominas_${ejercicio}_${String(mes).padStart(2, '0')}.zip`);
    } catch (e) {
      onMensaje('error', errorMessage(e));
    }
  };

  const vivas = nominas.filter((n) => n.estado !== 'ANULADA');

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4" aria-labelledby="docs-titulo">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="docs-titulo" className="font-semibold text-slate-900">
          Documentos de la gestoría
        </h2>
        {documentos.length > 0 && (
          <button type="button" onClick={zip} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline">
            <DownloadSimple size={16} /> Todo en ZIP
          </button>
        )}
      </div>

      {documentos.length === 0 ? (
        <p className="text-sm text-slate-500">Todavía no hay PDF de {periodoTexto(ejercicio, mes)}.</p>
      ) : (
        <ul className="divide-y divide-slate-100 text-sm">
          {documentos.map((d) => (
            <li key={d.id} className="flex items-center gap-2 py-2">
              <FilePdf size={20} className="shrink-0 text-red-600" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-slate-800" title={d.archivoNombre}>
                  <span className="font-medium">{CLASES[d.clase] ?? d.clase}</span>
                  {d.trabajador ? ` · ${d.trabajador}` : d.clase === 'nomina' ? ' · todo el mes' : ''}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {d.archivoNombre} · {tamano(d.archivoTamanio)} · {fechaEs(String(d.uploadedAt).slice(0, 10))}
                </p>
              </div>
              <button type="button" onClick={() => descargar(d)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" title={`Descargar ${d.archivoNombre}`} aria-label={`Descargar ${d.archivoNombre}`}>
                <DownloadSimple size={18} />
              </button>
              {escribir && (
                <button type="button" onClick={() => anular(d)} className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Quitar del archivo" aria-label={`Quitar ${d.archivoNombre}`}>
                  <Trash size={18} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {escribir && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="doc-tipo" className={etiqueta}>
                Documento
              </label>
              <select id="doc-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} className={campo}>
                <option value="nomina">Nómina (PDF)</option>
                <option value="rlc">RLC (recibo de liquidación de cotizaciones)</option>
                <option value="rnt">RNT (relación nominal de trabajadores)</option>
              </select>
            </div>
            {tipo === 'nomina' && (
              <div>
                <label htmlFor="doc-nomina" className={etiqueta}>
                  De
                </label>
                <select id="doc-nomina" value={nominaId} onChange={(e) => setNominaId(e.target.value)} className={campo}>
                  <option value="">Todos los trabajadores (un PDF del mes)</option>
                  {vivas.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.empleado?.nombreCompleto ?? n.empleadoId}
                      {n.tipo !== 'ORDINARIA' ? ` (${n.tipo.toLowerCase()})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <label className={`${botonSecundario} cursor-pointer ${ocupado ? 'pointer-events-none opacity-50' : ''}`}>
            <UploadSimple size={16} />
            {ocupado ? 'Subiendo...' : 'Subir PDF'}
            <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" disabled={ocupado} onChange={(e) => subir(e.target.files?.[0])} />
          </label>
          <p className="text-xs text-slate-500">PDF, JPG o PNG de hasta 4 MB. Si el mismo fichero ya está en el archivo, no se sube dos veces.</p>
        </div>
      )}
    </section>
  );
}
