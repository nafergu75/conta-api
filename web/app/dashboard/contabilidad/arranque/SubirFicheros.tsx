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
const COMPRIMIDO = /\.(zip|rar|7z)$/i;

/**
 * Reparte los ficheros para que ninguna petición pase de TAM_DIRECTO (el
 * servidor corta las de más de unos 4,5 MB): los grandes, por trozos; los
 * pequeños, juntos mientras quepan. Los que ya no caben van por trozos si su
 * formato lo admite y, si no (.xlsm, .ods, .pdf), en otra petición.
 */
function repartir(lista: File[]): { trozos: File[]; lotes: File[][] } {
  const trozos = lista.filter((f) => f.size > TAM_DIRECTO);
  const lotes: File[][] = [[]];
  const peso = (l: File[]) => l.reduce((s, f) => s + f.size, 0);
  for (const f of lista.filter((x) => x.size <= TAM_DIRECTO).sort((a, b) => a.size - b.size)) {
    if (peso(lotes[0]) + f.size <= TAM_DIRECTO) lotes[0].push(f);
    else if (EXTENSION_TROZOS.test(f.name)) trozos.push(f);
    else {
      const hueco = lotes.slice(1).find((l) => peso(l) + f.size <= TAM_DIRECTO);
      if (hueco) hueco.push(f);
      else lotes.push([f]);
    }
  }
  return { trozos, lotes };
}

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

  const subir = async (todos: File[]) => {
    if (!todos.length || ocupado) return;
    setError('');
    // Los que no valen se avisan sin bloquear la subida de los demás.
    const avisos: string[] = [];
    const nombres = (fs: File[]) => fs.map((f) => `«${f.name}»`).join(', ');
    const comprimidos = todos.filter((f) => COMPRIMIDO.test(f.name));
    if (comprimidos.length) {
      avisos.push(
        `${nombres(comprimidos)} ${comprimidos.length === 1 ? 'es un fichero comprimido: ábrelo' : 'son ficheros comprimidos: ábrelos'} (botón derecho › Extraer todo) y suelta aquí los Excel o CSV que trae${comprimidos.length === 1 ? '' : 'n'}.`,
      );
    }
    const otros = todos.filter((f) => !COMPRIMIDO.test(f.name) && !EXTENSION_VALIDA.test(f.name));
    if (otros.length) avisos.push(`${nombres(otros)}: no se ${otros.length === 1 ? 'ha subido' : 'han subido'}. Sube los listados en Excel (.xlsx, .xls), CSV, TXT o las tablas de ContaPlus (.dbf).`);
    const enormes = todos.filter((f) => EXTENSION_VALIDA.test(f.name) && f.size > TAM_MAXIMO);
    if (enormes.length) avisos.push(`${nombres(enormes)}: pesa demasiado (máximo ${TAM_MAXIMO / 1024 / 1024} MB).`);
    const grandesSinTrozos = todos.filter((f) => EXTENSION_VALIDA.test(f.name) && f.size <= TAM_MAXIMO && f.size > TAM_DIRECTO && !EXTENSION_TROZOS.test(f.name));
    if (grandesSinTrozos.length) avisos.push(`${nombres(grandesSinTrozos)}: es muy grande para este formato. Guárdalo como .xlsx o .csv y súbelo otra vez.`);
    const lista = todos.filter((f) => EXTENSION_VALIDA.test(f.name) && f.size <= TAM_MAXIMO && !grandesSinTrozos.includes(f));
    if (!lista.length) {
      setError(avisos.join(' ') || 'No hay ningún fichero que subir.');
      return;
    }
    if (lista.length > MAX_FICHEROS) {
      setError(`Como mucho ${MAX_FICHEROS} ficheros a la vez.`);
      return;
    }
    setOcupado(true);
    try {
      const { trozos, lotes } = repartir(lista);
      const ids: string[] = [];
      for (const f of trozos) ids.push(await subirPorTrozos(f, (p) => setProgreso(`Subiendo «${f.name}»: ${p} %`)));
      setProgreso(lista.length === 1 ? 'Leyendo el fichero…' : `Leyendo ${lista.length} ficheros…`);
      // Cada petición, por debajo del límite del servidor; todas van al mismo borrador.
      let r: RespuestaCarga | null = null;
      for (let i = 0; i < Math.max(lotes.length, 1); i++) {
        const lote = lotes[i] ?? [];
        if (!lote.length && (i > 0 || !ids.length)) continue;
        r = await arranqueApi.subir(lote, i === 0 ? ids : [], ajustes);
      }
      // Lo que se ha dejado fuera viaja con la respuesta y lo enseña el resumen (esta zona puede desaparecer al terminar).
      if (r) onSubido(avisos.length ? { ...r, avisos: [...avisos, ...(r.avisos ?? [])] } : r);
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
            Varios a la vez · Excel, CSV o tablas de ContaPlus (.dbf) · hasta {TAM_MAXIMO / 1024 / 1024} MB cada uno · si vienen en un ZIP, descomprímelo antes
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
