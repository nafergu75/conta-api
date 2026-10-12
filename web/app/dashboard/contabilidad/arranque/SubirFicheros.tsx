'use client';

import { useRef, useState } from 'react';
import { FileArrowUp } from '@phosphor-icons/react';
import { errorMessage } from '@/lib/api';
import { arranqueApi, type AjustesCarga, type RespuestaCarga } from '@/lib/arranque';
import { subirPorTrozos, TAM_DIRECTO, TAM_MAXIMO } from '../importacion';
import { Nota } from './comun';

const ACEPTA = '.xlsx,.xlsm,.xls,.ods,.csv,.txt,.dbf,.pdf';
const EXTENSION_VALIDA = /\.(xlsx|xlsm|xls|ods|csv|txt|dbf|pdf)$/i;
/** Las que admite la subida por trozos (ficheros grandes). */
const EXTENSION_TROZOS = /\.(xlsx|xls|csv|txt|dbf)$/i;
const MAX_FICHEROS = 20;

/**
 * Zona para soltar o elegir varios ficheros de la gestoría a la vez. Los
 * pequeños van en la misma petición; los grandes, antes por trozos. Al
 * terminar, el servidor los guarda en el borrador y lo analiza.
 */
export function SubirFicheros({
  ajustes,
  onSubido,
  compacta = false,
  texto = 'Suelta aquí los ficheros de la gestoría o haz clic para elegirlos',
}: {
  ajustes?: AjustesCarga;
  onSubido: (r: RespuestaCarga) => void;
  compacta?: boolean;
  texto?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState(false);
  const [progreso, setProgreso] = useState('');
  const [error, setError] = useState('');
  const [encima, setEncima] = useState(false);

  const subir = async (lista: File[]) => {
    if (!lista.length || ocupado) return;
    setError('');
    const malos = lista.filter((f) => !EXTENSION_VALIDA.test(f.name));
    if (malos.length) {
      setError(`${malos.map((f) => `«${f.name}»`).join(', ')}: sube los listados en Excel (.xlsx, .xls), CSV, TXT o las tablas de ContaPlus (.dbf).`);
      return;
    }
    if (lista.length > MAX_FICHEROS) {
      setError(`Como mucho ${MAX_FICHEROS} ficheros a la vez.`);
      return;
    }
    const enormes = lista.filter((f) => f.size > TAM_MAXIMO);
    if (enormes.length) {
      setError(`${enormes.map((f) => `«${f.name}»`).join(', ')} pesa demasiado (máximo ${TAM_MAXIMO / 1024 / 1024} MB).`);
      return;
    }
    const grandesSinTrozos = lista.filter((f) => f.size > TAM_DIRECTO && !EXTENSION_TROZOS.test(f.name));
    if (grandesSinTrozos.length) {
      setError(`${grandesSinTrozos.map((f) => `«${f.name}»`).join(', ')} es muy grande para este formato: guárdalo como .xlsx o .csv y súbelo otra vez.`);
      return;
    }
    setOcupado(true);
    try {
      const pequenos = lista.filter((f) => f.size <= TAM_DIRECTO);
      const ids: string[] = [];
      for (const f of lista.filter((x) => x.size > TAM_DIRECTO)) {
        ids.push(await subirPorTrozos(f, (p) => setProgreso(`Subiendo «${f.name}»: ${p} %`)));
      }
      setProgreso(lista.length === 1 ? 'Leyendo el fichero…' : `Leyendo ${lista.length} ficheros…`);
      onSubido(await arranqueApi.subir(pequenos, ids, ajustes));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOcupado(false);
      setProgreso('');
    }
  };

  return (
    <div className="space-y-2">
      <label
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition ${
          encima ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 bg-slate-50 hover:border-emerald-400'
        } ${compacta ? 'p-4' : 'p-8'} ${ocupado ? 'cursor-wait opacity-80' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setEncima(true);
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => {
          e.preventDefault();
          setEncima(false);
          subir(Array.from(e.dataTransfer.files ?? []));
        }}
      >
        <FileArrowUp size={compacta ? 24 : 34} className={`mb-2 ${encima ? 'text-emerald-600' : 'text-slate-400'}`} />
        <span className="text-sm font-medium text-slate-900">{ocupado ? progreso || 'Subiendo…' : texto}</span>
        {!ocupado && (
          <span className="mt-1 text-xs text-slate-500">
            Varios a la vez · Excel, CSV o tablas de ContaPlus (.dbf) · hasta {TAM_MAXIMO / 1024 / 1024} MB cada uno
          </span>
        )}
        <input
          ref={input}
          type="file"
          multiple
          accept={ACEPTA}
          disabled={ocupado}
          className="sr-only"
          onChange={(e) => {
            const lista = Array.from(e.target.files ?? []);
            if (input.current) input.current.value = '';
            subir(lista);
          }}
        />
      </label>
      {error && <Nota tipo="error">{error}</Nota>}
    </div>
  );
}
