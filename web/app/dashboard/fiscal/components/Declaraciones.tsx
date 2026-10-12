'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowCounterClockwise, ClockCounterClockwise, FilePlus, WarningCircle } from '@phosphor-icons/react';
import { ApiError, apiDownload, apiFetch, companyPath, errorMessage } from '@/lib/api';
import { formatoImporte } from '@/lib/moneda';
import { fechaCorta } from '@/lib/compras';
import { FormPresentar } from './FormPresentar';

/**
 * Historial de declaraciones de un modelo y periodo (igual en las diez
 * pantallas de modelos): lo presentado, la declaración que se está
 * preparando y las acciones posibles (presentar, preparar una complementaria o
 * sustitutiva, elegir los registros de una complementaria, cancelarla).
 */

export type CodigoModelo = '303' | '111' | '115' | '202' | '390' | '200' | '347' | '349' | '180' | '190';
type Tipo = 'N' | 'C' | 'S';

interface DeclaracionHistorial {
  id: string;
  secuencia: number;
  tipo: Tipo;
  tipoTexto: string;
  estado: 'preparada' | 'presentada' | 'anulada';
  numero: string | null;
  justificante: string | null;
  justificanteAnterior: string | null;
  fechaPresentacion: string | null;
  resultadoAnterior: number | null;
  resultado: number | null;
  numeroRegistros: number | null;
  /** Email de quien la marcó como presentada. */
  presentadoPorNombre?: string | null;
}

interface RegistroDeclaracion {
  clave: string;
  nombre: string;
  importe: number;
  presentado: boolean;
  incluido: boolean;
}

export interface Historial {
  codigo: string;
  ejercicio: number;
  periodo: string;
  clase: 'autoliquidacion' | 'informativa';
  nombres: Record<Tipo, string>;
  estado: 'sin-presentar' | 'presentada' | 'en-curso';
  rectificaciones: Array<'C' | 'S'>;
  presentadoSinHistorial: boolean;
  declaraciones: DeclaracionHistorial[];
  enCurso: {
    tipo: Tipo;
    tipoTexto: string;
    numero: string | null;
    justificanteAnterior: string | null;
    resultadoAnterior: number | null;
    registros: string[] | null;
    /** Sustitutiva de una informativa: números que hay que dar de baja en la sede antes de presentarla. */
    bajas?: string[];
    /** Lo que hay que hacer en la sede antes de presentar (o null). */
    aviso?: string | null;
  } | null;
  registros: RegistroDeclaracion[] | null;
  /** 190 sin permiso de Nóminas: por qué no sale la lista de perceptores. */
  avisoRegistros?: string;
}

const eur = (n: number) => formatoImporte(Number(n) || 0, 'EUR');

/** "1.234,56" -> 1234.56; '' -> null; NaN si no es un importe. */
function leerImporte(texto: string): number | null {
  const t = texto.trim().replace(/\s/g, '');
  if (!t) return null;
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  return /^\d+(\.\d{1,2})?$/.test(normal) ? Number(normal) : NaN;
}

/** Ruta del historial de un modelo y periodo. */
const rutaHistorial = (codigo: string, ejercicio: number, periodo?: string) =>
  companyPath(`/tax-models/${codigo}/declaraciones?ejercicio=${ejercicio}${periodo ? `&periodo=${periodo}` : ''}`);

/**
 * Descarga el fichero de un modelo informativo (347, 349, 180, 190). Si la
 * declaración aún no tiene número identificativo, la app se lo pone antes
 * (operación de escritura) y vuelve a pedir el fichero; así todas las
 * descargas de la misma declaración llevan el mismo número.
 */
export async function descargarConNumero(codigo: CodigoModelo, ejercicio: number, periodo: string | undefined, ruta: string, nombre: string): Promise<void> {
  try {
    await apiDownload(ruta, nombre);
  } catch (e) {
    const sinNumero = e instanceof ApiError && e.status === 409 && (e.detalles as { motivo?: string } | undefined)?.motivo === 'SIN_NUMERO';
    if (!sinNumero) throw e;
    await apiFetch(companyPath(`/tax-models/${codigo}/declaraciones/numero`), {
      method: 'POST',
      body: JSON.stringify({ ejercicio, ...(periodo ? { periodo } : {}) }),
    });
    await apiDownload(ruta, nombre);
  }
}

interface Props {
  codigo: CodigoModelo;
  ejercicio: number;
  /** Periodo con su código (1T, 05, 1P...); sin él, el modelo es anual. */
  periodo?: string;
  /** 303: opciones de la pantalla (tipo de declaración, cuotas a compensar, cuenta) que se presentan. */
  opcionesPresentar?: Record<string, string>;
  /** Tras presentar, preparar o cancelar: para volver a cargar el borrador. */
  onCambio?: () => void;
  /** Recargar el historial cuando cambie (el padre lo sube al recalcular). */
  recarga?: number;
}

export function Declaraciones({ codigo, ejercicio, periodo, opcionesPresentar, onCambio, recarga = 0 }: Props) {
  const [h, setH] = useState<Historial | null>(null);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [preparando, setPreparando] = useState<'C' | 'S' | null>(null);
  const [anterior, setAnterior] = useState('');
  const [ingresado, setIngresado] = useState('');
  const [devolucion, setDevolucion] = useState('');

  const cargar = useCallback(async () => {
    try {
      setError('');
      setH(await apiFetch<Historial>(rutaHistorial(codigo, ejercicio, periodo)));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [codigo, ejercicio, periodo]);

  // Otro modelo o periodo: se empieza de cero.
  useEffect(() => {
    setPreparando(null);
    setMensaje('');
  }, [codigo, ejercicio, periodo]);

  useEffect(() => {
    void cargar();
  }, [cargar, recarga]);

  const cuerpo = { ejercicio, ...(periodo ? { periodo } : {}) };
  const tras = async (texto: string) => {
    setMensaje(texto);
    await cargar();
    onCambio?.();
  };

  const preparar = async () => {
    if (!preparando) return;
    const resultadoAnterior = leerImporte(ingresado);
    const devolucionAcordada = leerImporte(devolucion);
    if (Number.isNaN(resultadoAnterior) || Number.isNaN(devolucionAcordada)) {
      setError('Escribe los importes con coma para los céntimos (por ejemplo, 1250,50).');
      return;
    }
    try {
      setOcupado(true);
      setError('');
      await apiFetch(companyPath(`/tax-models/${codigo}/declaraciones/rectificacion`), {
        method: 'POST',
        body: JSON.stringify({
          ...cuerpo,
          tipo: preparando,
          ...(anterior.trim() ? { justificanteAnterior: anterior.trim() } : {}),
          ...(resultadoAnterior !== null ? { resultadoAnterior } : {}),
          ...(devolucionAcordada !== null ? { devolucionAcordada } : {}),
        }),
      });
      setPreparando(null);
      setAnterior('');
      setIngresado('');
      setDevolucion('');
      await tras(`Preparada la ${h?.nombres[preparando] ?? 'declaración'}. El borrador de arriba ya la refleja.`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOcupado(false);
    }
  };

  const cancelar = async () => {
    try {
      setOcupado(true);
      setError('');
      const q = new URLSearchParams({ ejercicio: String(ejercicio), ...(periodo ? { periodo } : {}) });
      await apiFetch(companyPath(`/tax-models/${codigo}/declaraciones/rectificacion?${q.toString()}`), { method: 'DELETE' });
      await tras('Cancelada. Se vuelve a ver lo que se presentó.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOcupado(false);
    }
  };

  const cambiarRegistro = async (clave: string, incluir: boolean) => {
    if (!h?.registros) return;
    const elegidos = h.registros.filter((r) => (r.clave === clave ? incluir : r.incluido)).map((r) => r.clave);
    try {
      setOcupado(true);
      setError('');
      setH(
        await apiFetch<Historial>(companyPath(`/tax-models/${codigo}/declaraciones/rectificacion/registros`), {
          method: 'PUT',
          body: JSON.stringify({ ...cuerpo, registros: elegidos }),
        }),
      );
      onCambio?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOcupado(false);
    }
  };

  if (!h) {
    return error ? (
      <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        {error}
      </p>
    ) : null;
  }

  const visibles = h.declaraciones.filter((d) => d.estado !== 'preparada');
  // El 390 es un resumen anual: con él no se ingresa nada.
  const conIngresado = h.clase === 'autoliquidacion' && codigo !== '390';
  const sinAnteriorEnApp = h.presentadoSinHistorial || !h.declaraciones.some((d) => d.estado === 'presentada');

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 md:p-6" aria-labelledby={`decl-${codigo}`}>
      <div className="flex items-center gap-2">
        <ClockCounterClockwise size={20} className="text-slate-600" aria-hidden />
        <h3 id={`decl-${codigo}`} className="font-semibold text-slate-900">
          Declaraciones presentadas
        </h3>
      </div>

      {visibles.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2 pr-3 font-medium">Nº</th>
                <th className="py-2 pr-3 font-medium">Tipo</th>
                {h.clase === 'informativa' && <th className="py-2 pr-3 font-medium">Número identificativo</th>}
                <th className="py-2 pr-3 font-medium">Justificante</th>
                <th className="py-2 pr-3 font-medium">Fecha</th>
                <th className="py-2 pr-3 font-medium">Presentada por</th>
                {(h.clase === 'informativa' || conIngresado) && (
                  <th className="py-2 pr-3 text-right font-medium">{h.clase === 'informativa' ? 'Registros' : 'Ingresado'}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {visibles.map((d) => (
                <tr key={d.id} className={`border-b border-slate-100 ${d.estado === 'anulada' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                  <td className="py-2 pr-3">{d.secuencia}</td>
                  <td className="py-2 pr-3">
                    {d.tipoTexto}
                    {d.estado === 'anulada' && <span className="ml-1 no-underline">(anulada)</span>}
                  </td>
                  {h.clase === 'informativa' && <td className="py-2 pr-3 font-mono">{d.numero ?? '—'}</td>}
                  <td className="py-2 pr-3 font-mono">{d.justificante ?? '—'}</td>
                  <td className="py-2 pr-3">{fechaCorta(d.fechaPresentacion) || '—'}</td>
                  <td className="max-w-[12rem] truncate py-2 pr-3" title={d.presentadoPorNombre ?? undefined}>
                    {d.presentadoPorNombre ?? '—'}
                  </td>
                  {(h.clase === 'informativa' || conIngresado) && (
                    <td className="py-2 pr-3 text-right font-mono">
                      {h.clase === 'informativa' ? (d.numeroRegistros ?? '—') : d.resultado !== null ? eur(d.resultado) : '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          {h.presentadoSinHistorial
            ? 'Este modelo se marcó como presentado antes de que la app guardara el historial. Si preparas una complementaria o sustitutiva, pasa a ser la primera de la lista.'
            : 'Todavía no se ha presentado ninguna declaración de este periodo.'}
        </p>
      )}

      {h.enCurso && (h.enCurso.tipo !== 'N' || h.enCurso.numero) && (
        <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          <p className="font-medium">
            {h.enCurso.tipo === 'N' ? 'Declaración en preparación' : `Preparando una ${h.enCurso.tipoTexto}`}
          </p>
          <ul className="space-y-1">
            {h.enCurso.numero && (
              <li>
                Número identificativo: <span className="font-mono">{h.enCurso.numero}</span>
              </li>
            )}
            {h.enCurso.justificanteAnterior && (
              <li>
                Declaración anterior: <span className="font-mono">{h.enCurso.justificanteAnterior}</span>
              </li>
            )}
            {conIngresado && h.enCurso.resultadoAnterior !== null && h.enCurso.tipo !== 'N' && <li>Ya ingresado con las anteriores: {eur(h.enCurso.resultadoAnterior)}</li>}
          </ul>
          {h.enCurso.aviso && (
            <p role="note" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
              <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden /> {h.enCurso.aviso}
            </p>
          )}
          {h.enCurso.tipo !== 'N' && (
            <button
              type="button"
              onClick={cancelar}
              disabled={ocupado}
              className="inline-flex items-center gap-2 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm font-medium text-blue-900 hover:bg-blue-100 disabled:opacity-60"
            >
              <ArrowCounterClockwise size={16} aria-hidden /> Cancelar la {h.enCurso.tipoTexto}
            </button>
          )}
        </div>
      )}

      {!h.registros && h.avisoRegistros && h.enCurso?.tipo === 'C' && (
        <p role="note" className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          {h.avisoRegistros}
        </p>
      )}

      {h.registros && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-800">Registros que van en la complementaria</legend>
          <p className="text-xs text-slate-500">
            Solo van los que se quedaron fuera de la declaración anterior. La app marca los que no estaban; puedes cambiarlo. Si lo que quieres es corregir datos
            ya declarados, cancela y prepara una sustitutiva.
          </p>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {h.registros.map((r) => (
              <li key={r.clave} className="flex items-center gap-3 px-3 py-2">
                <input
                  id={`reg-${r.clave}`}
                  type="checkbox"
                  checked={r.incluido}
                  disabled={ocupado}
                  onChange={(e) => void cambiarRegistro(r.clave, e.target.checked)}
                />
                <label htmlFor={`reg-${r.clave}`} className="min-w-0 flex-1 text-sm text-slate-800">
                  {r.nombre}
                  {r.presentado && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">ya presentado</span>}
                </label>
                <span className="font-mono text-sm text-slate-700">{eur(r.importe)}</span>
              </li>
            ))}
          </ul>
        </fieldset>
      )}

      {h.estado === 'presentada' && h.rectificaciones.length > 0 && !preparando && (
        <div className="flex flex-wrap gap-2">
          {h.rectificaciones.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setError('');
                setPreparando(t);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            >
              <FilePlus size={18} aria-hidden /> Preparar una {h.nombres[t]}
            </button>
          ))}
        </div>
      )}

      {preparando && (
        <div className="space-y-3 rounded-lg border border-slate-200 p-3">
          <p className="text-sm text-slate-700">
            {preparando === 'S'
              ? h.clase === 'informativa'
                ? 'La sustitutiva reemplaza a la declaración anterior y lleva todo de nuevo. Antes de presentarla hay que dar de baja la anterior en la sede de la AEAT: la app te dirá qué números.'
                : 'La sustitutiva reemplaza a la declaración anterior y lleva todo de nuevo.'
              : h.clase === 'informativa'
                ? 'La complementaria solo lleva los registros que faltaron en la anterior.'
                : 'La app toma el justificante de la anterior y lo ya ingresado, y el borrador lo descuenta.'}
          </p>
          {sinAnteriorEnApp && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="decl-anterior" className="block text-sm font-medium text-slate-700">
                  Número de la declaración anterior
                </label>
                <input
                  id="decl-anterior"
                  maxLength={13}
                  value={anterior}
                  onChange={(e) => setAnterior(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, ''))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                  placeholder="13 caracteres"
                />
              </div>
              {h.clase === 'autoliquidacion' && codigo !== '390' && (
                <div>
                  <label htmlFor="decl-ingresado" className="block text-sm font-medium text-slate-700">
                    {codigo === '303' ? 'Resultado [69] de la anterior' : 'Lo que se ingresó con la anterior'}
                  </label>
                  <input
                    id="decl-ingresado"
                    inputMode="decimal"
                    value={ingresado}
                    onChange={(e) => setIngresado(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                    placeholder="0,00"
                  />
                </div>
              )}
            </div>
          )}
          {(codigo === '303' || codigo === '200') && (
            <div className="sm:w-1/2">
              <label htmlFor="decl-devolucion" className="block text-sm font-medium text-slate-700">
                Devolución ya acordada por la AEAT {codigo === '303' ? '[109]' : '[01584]'} (si la hubo)
              </label>
              <input
                id="decl-devolucion"
                inputMode="decimal"
                value={devolucion}
                onChange={(e) => setDevolucion(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                placeholder="0,00"
              />
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={preparar}
              disabled={ocupado}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {ocupado ? 'Preparando…' : `Preparar la ${h.nombres[preparando]}`}
            </button>
            <button type="button" onClick={() => setPreparando(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
              Volver
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden /> {error}
        </p>
      )}
      {mensaje && (
        <p role="status" className="text-sm text-slate-700">
          {mensaje}
        </p>
      )}

      {h.estado !== 'presentada' && (
        <FormPresentar
          codigo={codigo}
          ejercicio={ejercicio}
          periodo={periodo}
          opciones={opcionesPresentar}
          titulo={h.enCurso && h.enCurso.tipo !== 'N' ? `Marcar la ${h.enCurso.tipoTexto} como presentada` : undefined}
          onSuccess={() => void tras('Marcada como presentada. Desde ahora se enseña lo que se presentó.')}
        />
      )}
    </section>
  );
}
