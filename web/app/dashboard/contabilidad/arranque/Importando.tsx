'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle, CircleNotch, MinusCircle, Circle } from '@phosphor-icons/react';
import { ApiError, errorMessage } from '@/lib/api';
import { ANIO_GESTORIA, arranqueApi, numero, type ComprobacionesArranque, type EstadoFase } from '@/lib/arranque';
import { Bloque, boton, botonPeligro, MensajeComprobacion, Nota } from './comun';

/** Reintentos seguidos de una fase que falla por la conexión antes de pararse a preguntar. */
const REINTENTOS = 2;

/**
 * Importación por fases: llama a «aplicar» hasta que la carga termina. Cada
 * llamada hace una fase (o un trozo del diario) y queda apuntada en el
 * servidor, así que un corte no pierde nada: «Seguir» continúa donde se quedó.
 */
export function Importando({
  cargaId,
  version,
  fasesIniciales,
  nombres,
  puedeAplicar,
  automatico,
  onTerminada,
  onDeshacer,
}: {
  cargaId: string;
  version: number;
  fasesIniciales: EstadoFase[];
  nombres: Record<string, string>;
  /** Administrador de la empresa: puede seguir y deshacer. */
  puedeAplicar: boolean;
  /** Empieza solo (recién confirmada). Si no, espera a «Seguir». */
  automatico: boolean;
  onTerminada: () => void;
  onDeshacer: () => void;
}) {
  const [fases, setFases] = useState<EstadoFase[]>(fasesIniciales);
  const [enMarcha, setEnMarcha] = useState(false);
  const [error, setError] = useState('');
  const [final, setFinal] = useState<{ hecho: string; comprobaciones: ComprobacionesArranque | null } | null>(null);
  const parar = useRef(false);
  // Una sola vuelta a la vez (en desarrollo, React monta dos veces).
  const corriendo = useRef(false);

  const seguir = useCallback(async () => {
    if (corriendo.current) return;
    corriendo.current = true;
    setEnMarcha(true);
    setError('');
    parar.current = false;
    let fallos = 0;
    try {
      while (!parar.current) {
        try {
          const r = await arranqueApi.aplicar(cargaId);
          fallos = 0;
          setFases(r.fases);
          if (r.terminada) {
            setFinal({ hecho: r.hecho, comprobaciones: r.comprobaciones });
            break;
          }
        } catch (e) {
          // Corte de conexión o del servidor: se reintenta un par de veces; lo demás se enseña.
          const reintentable = e instanceof ApiError && (e.status === 0 || e.status >= 500);
          if (reintentable && ++fallos <= REINTENTOS) {
            await new Promise((ok) => setTimeout(ok, 1500 * fallos));
            continue;
          }
          throw e;
        }
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      corriendo.current = false;
      setEnMarcha(false);
    }
  }, [cargaId]);

  useEffect(() => {
    parar.current = false;
    if (automatico && puedeAplicar) seguir();
    return () => {
      parar.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hechas = fases.filter((f) => f.estado !== 'PENDIENTE').length;
  const actual = fases.find((f) => f.estado === 'PENDIENTE');
  const porcentaje = fases.length ? Math.round((hechas / fases.length) * 100) : 0;

  if (final) {
    return (
      <div className="space-y-4">
        {final.comprobaciones ? (
          <MensajeComprobacion nivel={final.comprobaciones.nivel} mensaje={final.hecho} puntos={final.comprobaciones.puntos} />
        ) : (
          <Nota tipo="bien">{final.hecho}</Nota>
        )}
        <details className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <summary className="cursor-pointer font-medium text-slate-700">Qué se ha hecho, fase a fase</summary>
          <ul className="mt-2 space-y-1.5">
            {fases.map((f) => (
              <li key={f.fase} className="text-slate-700">
                <span className="font-medium text-slate-900">{nombres[f.fase] ?? f.fase}:</span> {f.estado === 'OMITIDA' ? 'nada que hacer.' : (f.resultado ?? 'hecho.')}
              </li>
            ))}
          </ul>
        </details>
        <button type="button" className={boton} onClick={onTerminada}>
          Ver la contabilidad traída
        </button>
      </div>
    );
  }

  return (
    <Bloque titulo={`Importando la contabilidad de ${ANIO_GESTORIA} (versión ${version})`}>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={porcentaje} aria-label="Avance de la importación">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${porcentaje}%` }} />
      </div>
      <ol className="mt-4 space-y-2">
        {fases.map((f) => {
          const esActual = actual?.fase === f.fase;
          return (
            <li key={f.fase} className="flex gap-2 text-sm">
              {f.estado === 'HECHA' ? (
                <CheckCircle size={20} weight="fill" className="shrink-0 text-emerald-600" />
              ) : f.estado === 'OMITIDA' ? (
                <MinusCircle size={20} className="shrink-0 text-slate-400" />
              ) : esActual && enMarcha ? (
                <CircleNotch size={20} className="shrink-0 animate-spin text-emerald-600" />
              ) : (
                <Circle size={20} className="shrink-0 text-slate-300" />
              )}
              <div className="min-w-0">
                <p className={f.estado === 'PENDIENTE' && !esActual ? 'text-slate-500' : 'font-medium text-slate-900'}>
                  {nombres[f.fase] ?? f.fase}
                  {esActual && f.total ? ` · ${numero(f.cursor ?? 0)} de ${numero(f.total)}` : ''}
                </p>
                {f.resultado && <p className="break-words text-slate-600">{f.resultado}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      {!enMarcha && !error && !automatico && (
        <div className="mt-4">
          <Nota tipo="aviso">La importación se quedó a medias. Lo hecho está guardado: sigue donde se quedó o deshaz lo aplicado.</Nota>
        </div>
      )}
      {error && (
        <div className="mt-4">
          <Nota tipo="error">{error} Lo hecho hasta ahora está guardado: puedes seguir o deshacerlo.</Nota>
        </div>
      )}
      {enMarcha ? (
        <p className="mt-4 text-sm text-slate-600">No cierres esta página hasta que termine. Si se corta, al volver podrás seguir donde se quedó.</p>
      ) : puedeAplicar ? (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button type="button" className={boton} onClick={seguir}>
            Seguir
          </button>
          <button type="button" className={botonPeligro} onClick={onDeshacer}>
            Deshacer lo aplicado
          </button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-600">Solo un administrador de la empresa puede seguir con la importación o deshacerla.</p>
      )}
    </Bloque>
  );
}
