'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, ShieldSlash } from '@phosphor-icons/react';
import { apiFetch, campoDelError, errorMessage } from '@/lib/api';
import { esReferenciaBoe } from '@/lib/verifactu';

/**
 * Interruptor de la red de seguridad de VERI*FACTU (solo administrador global).
 *
 * Con la red activa, desde el 1-1-2027 (hora de España) ninguna empresa
 * española sin VERI*FACTU activo puede emitir facturas. Se desactiva solo si el
 * BOE publica el aplazamiento: hay que escribir su referencia y el motivo, y el
 * cambio queda en la auditoría. El backend lo vuelve a comprobar todo.
 */

interface EstadoInterruptor {
  activa: boolean;
  motivo: string | null;
  referenciaBoe: string | null;
  /** Email de quien hizo el último cambio. */
  cambiadoPor: string | null;
  cambiadoEn: string | null;
}

const RUTA = '/admin/verifactu/red-seguridad';

const CLASE_INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-600';
const BASE_BOTON =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const BOTON_SECUNDARIO = `${BASE_BOTON} border-slate-200 text-slate-700 hover:bg-slate-50`;
const BOTON_PELIGRO = `${BASE_BOTON} border-rose-200 text-rose-700 hover:bg-rose-50`;
const BOTON_VERDE = `${BASE_BOTON} border-emerald-200 text-emerald-700 hover:bg-slate-50`;

/** "15 de octubre de 2026 a las 10:30" (hora de España). */
function fechaYHora(iso: string): string {
  const d = new Date(iso);
  const dia = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' });
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  return `${dia} a las ${hora}`;
}

export default function RedSeguridadVerifactu() {
  const [estado, setEstado] = useState<EstadoInterruptor | null>(null);
  const [errorCarga, setErrorCarga] = useState('');
  const [desactivando, setDesactivando] = useState(false);
  const [referencia, setReferencia] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [campoError, setCampoError] = useState<string | undefined>();
  const [aviso, setAviso] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    setErrorCarga('');
    apiFetch<EstadoInterruptor>(RUTA)
      .then(setEstado)
      .catch((e) => setErrorCarga(errorMessage(e)));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cerrarFormulario = () => {
    setDesactivando(false);
    setReferencia('');
    setMotivo('');
    setError('');
    setCampoError(undefined);
  };

  const enviar = async (cuerpo: { activa: boolean; referenciaBoe?: string; motivo?: string }, hecho: string) => {
    setGuardando(true);
    setError('');
    setCampoError(undefined);
    setAviso('');
    try {
      setEstado(await apiFetch<EstadoInterruptor>(RUTA, { method: 'PUT', body: JSON.stringify(cuerpo) }));
      cerrarFormulario();
      setAviso(hecho);
    } catch (e) {
      setError(errorMessage(e));
      setCampoError(campoDelError(e));
    } finally {
      setGuardando(false);
    }
  };

  const desactivar = () => {
    const ref = referencia.trim().toUpperCase();
    if (!esReferenciaBoe(ref)) {
      setCampoError('referenciaBoe');
      return setError('Escribe la referencia del BOE que publica el aplazamiento, con la forma BOE-A-AAAA-NNNNN (por ejemplo, BOE-A-2026-24840).');
    }
    if (!motivo.trim()) {
      setCampoError('motivo');
      return setError('Explica por qué se desactiva el bloqueo.');
    }
    if (
      !window.confirm(
        `Vas a desactivar el bloqueo para todas las empresas (${ref}).\n\n` +
          'Desde el 1 de enero de 2027 se podrán emitir facturas sin VERI*FACTU. Las empresas que ya lo tengan activo lo siguen teniendo. ¿Continuar?',
      )
    ) {
      return;
    }
    void enviar({ activa: false, referenciaBoe: ref, motivo: motivo.trim() }, 'Bloqueo desactivado. El cambio queda registrado en la auditoría.');
  };

  const reactivar = () => {
    if (!window.confirm('¿Volver a activar el bloqueo? Desde el 1 de enero de 2027 las empresas españolas sin VERI*FACTU activo no podrán emitir facturas.')) return;
    void enviar({ activa: true }, 'Bloqueo activado de nuevo.');
  };

  return (
    <section aria-labelledby="titulo-red-verifactu" className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 id="titulo-red-verifactu" className="flex items-center gap-2 font-semibold text-slate-900">
            {estado && !estado.activa ? (
              <ShieldSlash size={18} weight="duotone" className="text-amber-600" aria-hidden />
            ) : (
              <ShieldCheck size={18} weight="duotone" className="text-emerald-600" aria-hidden />
            )}
            Bloqueo de emisión sin VERI*FACTU desde el 1 de enero de 2027
          </h2>
          {estado && !estado.activa ? (
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              El bloqueo está desactivado: desde el 1 de enero de 2027 las empresas españolas podrán emitir facturas aunque no tengan
              VERI*FACTU activo. Las que ya lo tengan activo lo siguen usando.
            </p>
          ) : (
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              Desde el 1 de enero de 2027 (hora de España), las empresas españolas que no tengan VERI*FACTU activo no podrán emitir facturas
              desde la app. Los borradores y las proformas se siguen guardando. No afecta a las empresas de EE. UU. ni de Hong Kong.
            </p>
          )}
        </div>
        {estado && (
          <span
            className={`inline-flex shrink-0 items-center self-start whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              estado.activa ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}
          >
            {estado.activa ? 'Activado' : 'Desactivado'}
          </span>
        )}
      </div>

      {errorCarga ? (
        <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 text-sm text-rose-700">
          No se ha podido leer el estado del bloqueo: {errorCarga}
          <button type="button" onClick={cargar} className={BOTON_SECUNDARIO}>
            Reintentar
          </button>
        </div>
      ) : !estado ? (
        <div className="mt-3 h-9 animate-pulse rounded-lg bg-slate-100" aria-busy="true" />
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {!estado.activa && (
            <dl className="grid gap-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 sm:grid-cols-[auto_1fr] sm:gap-x-4">
              <dt className="font-medium">Referencia del BOE</dt>
              <dd className="break-words">{estado.referenciaBoe ?? '—'}</dd>
              <dt className="font-medium">Motivo</dt>
              <dd className="break-words">{estado.motivo ?? '—'}</dd>
            </dl>
          )}
          {estado.cambiadoEn && (
            <p className="text-xs text-slate-500">
              Último cambio: {fechaYHora(estado.cambiadoEn)}
              {estado.cambiadoPor ? `, por ${estado.cambiadoPor}` : ''}.
            </p>
          )}

          {aviso && (
            <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              {aviso}
            </p>
          )}

          {estado.activa && !desactivando && (
            <div>
              <button type="button" onClick={() => setDesactivando(true)} className={BOTON_PELIGRO}>
                <ShieldSlash size={14} aria-hidden /> Desactivar
              </button>
            </div>
          )}

          {estado.activa && desactivando && (
            <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm text-slate-700">
                Desactívalo solo si el BOE ha publicado el aplazamiento. Desactivar el bloqueo no apaga VERI*FACTU en las empresas que ya lo tengan
                activo.
              </p>
              <div>
                <label htmlFor="red-ref-boe" className="mb-1 block text-sm font-medium text-slate-700">
                  Referencia del BOE
                </label>
                <input
                  id="red-ref-boe"
                  value={referencia}
                  onChange={(e) => setReferencia(e.target.value)}
                  placeholder="BOE-A-2026-12345"
                  autoComplete="off"
                  aria-invalid={campoError === 'referenciaBoe'}
                  className={`${CLASE_INPUT} sm:max-w-xs`}
                />
              </div>
              <div>
                <label htmlFor="red-motivo" className="mb-1 block text-sm font-medium text-slate-700">
                  Motivo
                </label>
                <textarea
                  id="red-motivo"
                  rows={2}
                  maxLength={500}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej.: el Real Decreto publicado hoy aplaza VERI*FACTU a 2028."
                  aria-invalid={campoError === 'motivo'}
                  className={CLASE_INPUT}
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-rose-700">
                  {error}
                </p>
              )}
              {/* En el móvil, a la izquierda: a la derecha están los botones flotantes de Carmen y del menú,
                  y un aviso que aparece encima empujaría «Desactivar el bloqueo» debajo de ellos. */}
              <div className="flex flex-wrap justify-start gap-2 sm:justify-end">
                <button type="button" onClick={cerrarFormulario} disabled={guardando} className={BOTON_SECUNDARIO}>
                  Cancelar
                </button>
                <button type="button" onClick={desactivar} disabled={guardando} className={BOTON_PELIGRO}>
                  {guardando ? 'Guardando…' : 'Desactivar el bloqueo'}
                </button>
              </div>
            </div>
          )}

          {!estado.activa && (
            <div className="flex flex-col gap-2">
              {error && (
                <p role="alert" className="text-sm text-rose-700">
                  {error}
                </p>
              )}
              <div>
                <button type="button" onClick={reactivar} disabled={guardando} className={BOTON_VERDE}>
                  <ShieldCheck size={14} aria-hidden /> {guardando ? 'Guardando…' : 'Volver a activar'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
