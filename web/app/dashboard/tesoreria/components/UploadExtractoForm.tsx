'use client';

import { useRef, useState } from 'react';
import { CheckCircle, FileXls, UploadSimple, WarningCircle, X } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';

/**
 * Sube un extracto en Excel (.xlsx, .xls) o CSV tal como lo descarga el banco.
 * Primero se lee y se enseña una vista previa (columnas detectadas, periodo,
 * movimientos nuevos y repetidos); solo al confirmar se guarda.
 */

interface Fila {
  fila: number;
  fecha: string;
  importe: number;
  concepto: string;
  saldo?: number;
}

interface Lectura {
  formato: string;
  columnas: Record<string, string>;
  avisos: string[];
  total: number;
  desde: string;
  hasta: string;
  entradas: number;
  salidas: number;
  nuevos?: number;
  repetidos: number;
  importados?: number;
  muestra?: Fila[];
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const fecha = (iso: string) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('es-ES') : '');

const NOMBRE_CAMPO: Record<string, string> = {
  fecha: 'Fecha',
  fechaValor: 'Fecha valor',
  concepto: 'Concepto',
  importe: 'Importe',
  cargo: 'Cargo',
  abono: 'Abono',
  saldo: 'Saldo',
  referencia: 'Referencia',
};

export function UploadExtractoForm({ accountId, onSuccess }: { accountId: string; onSuccess?: (r: Lectura) => void }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<Lectura | null>(null);
  const [hecho, setHecho] = useState<Lectura | null>(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState<'' | 'leyendo' | 'importando'>('');
  const input = useRef<HTMLInputElement>(null);

  const ruta = (vistaPrevia: boolean) =>
    companyPath(`/treasury/bank-accounts/${accountId}/statements/archivo${vistaPrevia ? '?vistaPrevia=1' : ''}`);

  const enviar = (f: File, vistaPrevia: boolean) => {
    const datos = new FormData();
    datos.append('archivo', f);
    return apiFetch<Lectura>(ruta(vistaPrevia), { method: 'POST', body: datos });
  };

  const reiniciar = () => {
    setArchivo(null);
    setVista(null);
    setError('');
    if (input.current) input.current.value = '';
  };

  const elegir = async (f: File | undefined) => {
    if (!f) return;
    setArchivo(f);
    setVista(null);
    setHecho(null);
    setError('');
    setOcupado('leyendo');
    try {
      setVista(await enviar(f, true));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOcupado('');
    }
  };

  const importar = async () => {
    if (!archivo) return;
    setOcupado('importando');
    setError('');
    try {
      const r = await enviar(archivo, false);
      setHecho(r);
      onSuccess?.(r);
      reiniciar();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOcupado('');
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
      <h3 className="font-semibold text-slate-900">Subir extracto bancario</h3>

      {!vista && (
        <label
          className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-8 transition hover:border-blue-400 hover:bg-blue-50"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            elegir(e.dataTransfer.files?.[0]);
          }}
        >
          <UploadSimple size={32} className="mb-2 text-slate-400" />
          <span className="text-sm font-medium text-slate-900">
            {ocupado === 'leyendo' ? 'Leyendo el extracto...' : 'Haz clic o arrastra el extracto'}
          </span>
          <span className="mt-1 text-xs text-slate-500">Excel (.xlsx, .xls) o CSV, tal como lo descarga el banco</span>
          <input
            ref={input}
            type="file"
            accept=".xlsx,.xls,.csv,.txt"
            onChange={(e) => elegir(e.target.files?.[0])}
            disabled={ocupado !== ''}
            className="sr-only"
          />
        </label>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <WarningCircle size={20} className="shrink-0 text-red-600" />
          <span className="flex-1">{error}</span>
          {vista === null && archivo && (
            <button onClick={reiniciar} className="font-medium underline">
              Elegir otro
            </button>
          )}
        </div>
      )}

      {vista && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <FileXls size={20} className="text-emerald-600" /> {archivo?.name}
            </p>
            <button onClick={reiniciar} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Descartar">
              <X size={18} />
            </button>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-slate-500">Periodo</dt>
              <dd className="font-medium text-slate-900">
                {fecha(vista.desde)} – {fecha(vista.hasta)}
              </dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-slate-500">Movimientos</dt>
              <dd className="font-medium text-slate-900 tabular-nums">{vista.total}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-slate-500">Entradas</dt>
              <dd className="font-medium text-emerald-700 tabular-nums">{eur.format(vista.entradas)}</dd>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <dt className="text-slate-500">Salidas</dt>
              <dd className="font-medium text-slate-900 tabular-nums">{eur.format(vista.salidas)}</dd>
            </div>
          </dl>

          <p className="text-sm text-slate-700">
            Se {vista.nuevos === 1 ? 'importará' : 'importarán'} <strong>{vista.nuevos}</strong> {plural(vista.nuevos ?? 0, 'movimiento nuevo', 'movimientos nuevos')}.
            {vista.repetidos > 0 &&
              (vista.repetidos === 1 ? ' 1 ya estaba importado y se omite.' : ` ${vista.repetidos} ya estaban importados y se omiten.`)}
          </p>

          <p className="text-xs text-slate-500">
            Columnas leídas:{' '}
            {Object.entries(vista.columnas)
              .map(([campo, titulo]) => `${NOMBRE_CAMPO[campo] ?? campo} = «${titulo}»`)
              .join(' · ')}
          </p>

          {vista.avisos.map((a) => (
            <p key={a} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <WarningCircle size={18} className="shrink-0" /> {a}
            </p>
          ))}

          {vista.muestra && vista.muestra.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[480px] text-sm">
                <caption className="sr-only">Primeros movimientos del extracto</caption>
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Fecha</th>
                    <th className="px-3 py-2 font-medium">Concepto</th>
                    <th className="px-3 py-2 text-right font-medium">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vista.muestra.map((f) => (
                    <tr key={f.fila}>
                      <td className="px-3 py-2 tabular-nums">{fecha(f.fecha)}</td>
                      <td className="px-3 py-2">{f.concepto}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${f.importe < 0 ? 'text-slate-900' : 'text-emerald-700'}`}>
                        {eur.format(f.importe)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {vista.total > vista.muestra.length && (
                <p className="bg-slate-50 px-3 py-2 text-xs text-slate-500">y {vista.total - vista.muestra.length} más</p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button onClick={reiniciar} disabled={ocupado !== ''} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
              Cancelar
            </button>
            <button
              onClick={importar}
              disabled={ocupado !== '' || !vista.nuevos}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {ocupado === 'importando'
                ? 'Importando...'
                : vista.nuevos
                  ? `Importar ${vista.nuevos} ${plural(vista.nuevos, 'movimiento', 'movimientos')}`
                  : 'Nada nuevo que importar'}
            </button>
          </div>
        </div>
      )}

      {hecho && (
        <p role="status" className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <CheckCircle size={20} className="text-green-600" />
          {hecho.importados} {plural(hecho.importados ?? 0, 'movimiento importado', 'movimientos importados')}
          {hecho.repetidos > 0 ? ` (${hecho.repetidos} ${plural(hecho.repetidos, 'repetido omitido', 'repetidos omitidos')})` : ''}. Ya puedes conciliarlos.
        </p>
      )}
    </div>
  );
}
