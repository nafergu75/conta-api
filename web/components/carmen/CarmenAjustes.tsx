'use client';

import { useEffect, useId, useState } from 'react';
import { CheckCircle, Robot, WarningCircle } from '@phosphor-icons/react';
import { errorMessage } from '@/lib/api';
import { getToken, getUser, tieneAlgunPermiso } from '@/lib/auth';
import {
  EVENTO_AJUSTES_CARMEN,
  estadoCarmen,
  euros,
  gastoIA,
  guardarAjustesCarmen,
  leerAjustesCarmen,
  momento,
  usoCarmen,
  type AjustesCarmen,
  type UsoCarmen,
  type UsoMesCarmen,
} from '@/lib/carmen';

const campo =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-60';

/**
 * Ajustes de Carmen en «Datos de la empresa», solo para el administrador de la
 * empresa: el interruptor de la IA (apagada por defecto en cada empresa), lo
 * gastado este mes y los topes. Las cifras y las fichas funcionan siempre; la
 * IA solo atiende dudas generales y nunca recibe datos de la empresa.
 */
export function CarmenAjustesEmpresa() {
  const [admin, setAdmin] = useState(false);

  // La sesión vive en localStorage: se mira tras montar (si no, desajuste de hidratación).
  useEffect(() => {
    setAdmin(getToken() !== 'demo-local-sin-backend' && tieneAlgunPermiso(getUser(), ['admin:empresa']));
  }, []);

  if (!admin) return null;
  return <Ajustes />;
}

function Ajustes() {
  const id = useId();
  const [ajustes, setAjustes] = useState<AjustesCarmen | null>(null);
  const [uso, setUso] = useState<UsoCarmen | null>(null);
  const [usoMes, setUsoMes] = useState<UsoMesCarmen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const [cambiandoIA, setCambiandoIA] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [tope, setTope] = useState('');
  const [dias, setDias] = useState('90');

  const cargarUso = () => {
    usoCarmen()
      .then(setUso)
      .catch(() => setUso(null));
    estadoCarmen()
      .then((e) => setUsoMes(e.usoMes ?? null))
      .catch(() => setUsoMes(null));
  };

  useEffect(() => {
    leerAjustesCarmen()
      .then((a) => {
        setAjustes(a);
        setTope(a.topeConsultasDia ? String(a.topeConsultasDia) : '');
        setDias(String(a.conservarDias));
      })
      .catch((e) => setError(errorMessage(e)));
    cargarUso();
  }, []);

  // Si se llega desde el enlace de Carmen (#carmen-ia), se baja hasta aquí cuando ya está pintado.
  useEffect(() => {
    if (ajustes && window.location.hash === '#carmen-ia') document.getElementById('carmen-ia')?.scrollIntoView({ block: 'start' });
  }, [ajustes]);

  const avisarVentana = () => window.dispatchEvent(new Event(EVENTO_AJUSTES_CARMEN));

  const cambiarIA = async () => {
    if (!ajustes) return;
    setCambiandoIA(true);
    setMensaje(null);
    try {
      const a = await guardarAjustesCarmen({ iaActiva: !ajustes.iaActiva });
      setAjustes((previo) => (previo ? { ...previo, ...a } : previo));
      setMensaje({ ok: true, texto: a.iaActiva ? 'IA activada en esta empresa.' : 'IA desactivada en esta empresa.' });
      avisarVentana();
      cargarUso();
    } catch (e) {
      setMensaje({ ok: false, texto: errorMessage(e) });
    } finally {
      setCambiandoIA(false);
    }
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ajustes) return;
    const topeNum = tope.trim() ? Number(tope) : null;
    const diasNum = Number(dias);
    if (topeNum !== null && (!Number.isInteger(topeNum) || topeNum < 1 || topeNum > ajustes.topeGeneralDia)) {
      setMensaje({
        ok: false,
        texto: `El máximo de preguntas al día tiene que estar entre 1 y ${ajustes.topeGeneralDia}, o vacío para usar el general.`,
      });
      return;
    }
    if (!Number.isInteger(diasNum) || diasNum < 7 || diasNum > 90) {
      setMensaje({ ok: false, texto: 'Las conversaciones se guardan entre 7 y 90 días.' });
      return;
    }
    setGuardando(true);
    setMensaje(null);
    try {
      const a = await guardarAjustesCarmen({ topeConsultasDia: topeNum, conservarDias: diasNum });
      setAjustes((previo) => (previo ? { ...previo, ...a } : previo));
      setMensaje({ ok: true, texto: 'Ajustes de Carmen guardados.' });
      avisarVentana();
      cargarUso();
    } catch (err) {
      setMensaje({ ok: false, texto: errorMessage(err) });
    } finally {
      setGuardando(false);
    }
  };

  const porcentaje = usoMes ? Math.min(100, Math.max(0, usoMes.porcentajeMes)) : 0;

  return (
    <section id="carmen-ia" aria-labelledby={`${id}-titulo`} className="mx-auto max-w-4xl scroll-mt-4 px-4 pb-8 md:px-6">
      <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <Robot size={26} weight="duotone" className="mt-0.5 shrink-0 text-emerald-700" aria-hidden="true" />
          <div>
            <h2 id={`${id}-titulo`} className="font-semibold text-slate-900">
              Asistente Carmen: IA para dudas generales
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Carmen responde con tus datos y con fichas revisadas sin usar IA. Si activas la IA, las dudas generales que no estén en las
              fichas se mandan a un modelo de Anthropic (Claude Haiku) sin ningún dato de la empresa: ni cifras, ni nombres de clientes o
              proveedores, ni NIF, IBAN o sueldos. Sus respuestas salen marcadas como orientativas.
            </p>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            No se han podido cargar los ajustes de Carmen: {error}
          </p>
        )}
        {!ajustes && !error && (
          <p role="status" className="text-sm text-slate-500">
            Cargando ajustes…
          </p>
        )}

        {ajustes && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="min-w-0">
                <p id={`${id}-ia`} className="text-sm font-semibold text-slate-900">
                  IA para dudas generales
                </p>
                <p id={`${id}-ia-estado`} className="text-xs text-slate-600">
                  {ajustes.iaActiva ? 'Activada en esta empresa.' : 'Desactivada en esta empresa.'}
                  {ajustes.actualizadoEn ? ` Último cambio: ${momento(ajustes.actualizadoEn)}.` : ''}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={ajustes.iaActiva}
                aria-label="IA para dudas generales"
                aria-describedby={`${id}-ia-estado`}
                onClick={cambiarIA}
                disabled={cambiandoIA}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:opacity-50 dark:focus-visible:ring-offset-black ${ajustes.iaActiva ? 'bg-emerald-600' : 'bg-slate-400'}`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-block h-6 w-6 rounded-full bg-neutral-50 shadow transition-transform ${ajustes.iaActiva ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </div>

            {!ajustes.llmActivoPlataforma && (
              <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                La IA de Carmen está apagada en toda la plataforma. Aunque la actives aquí, no responderá hasta que se encienda.
              </p>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-medium text-slate-500">Esta empresa, este mes</p>
                {uso ? (
                  <>
                    <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{gastoIA(uso.gastoEmpresaMesEur)}</p>
                    <p className="text-xs text-slate-600">
                      {uso.consultasEmpresaMes.toLocaleString('es-ES')} {uso.consultasEmpresaMes === 1 ? 'pregunta' : 'preguntas'} a la IA ·
                      hoy {uso.consultasEmpresaHoy} de {uso.topeEmpresaDia}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">Sin datos de uso.</p>
                )}
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-medium text-slate-500">Presupuesto común de la IA (todas las empresas)</p>
                {usoMes ? (
                  <>
                    <p className={`mt-1 text-lg font-semibold tabular-nums ${usoMes.avisoTope ? 'text-amber-700' : 'text-slate-900'}`}>
                      {gastoIA(usoMes.gastoMesEur)} de {euros(usoMes.topeMesEur)}
                    </p>
                    <div
                      role="progressbar"
                      aria-label="Presupuesto de la IA gastado este mes"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(porcentaje)}
                      aria-valuetext={`${usoMes.porcentajeMes.toLocaleString('es-ES')} %`}
                      className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"
                    >
                      <div
                        className={`h-full rounded-full ${usoMes.avisoTope ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${porcentaje}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      {usoMes.avisoTope
                        ? 'Queda poco: al llegar al tope, la IA se para hasta el día 1. Tus datos y las fichas siguen funcionando.'
                        : 'Al llegar al tope, la IA se para hasta el día 1; tus datos y las fichas siguen funcionando.'}
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-slate-500">Sin datos de gasto.</p>
                )}
              </div>
            </div>

            <form onSubmit={guardar} className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor={`${id}-tope`} className="block text-sm font-medium text-slate-700">
                  Máximo de preguntas a la IA al día en esta empresa
                </label>
                <input
                  id={`${id}-tope`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={ajustes.topeGeneralDia}
                  value={tope}
                  onChange={(e) => setTope(e.target.value)}
                  placeholder={`${ajustes.topeGeneralDia} (el general)`}
                  aria-describedby={`${id}-tope-ayuda`}
                  className={campo}
                  disabled={guardando}
                />
                <p id={`${id}-tope-ayuda`} className="mt-1 text-xs text-slate-500">
                  Vacío, el general ({ajustes.topeGeneralDia}). Además, cada persona tiene su propio máximo diario.
                </p>
              </div>
              <div>
                <label htmlFor={`${id}-dias`} className="block text-sm font-medium text-slate-700">
                  Días que se guardan las conversaciones
                </label>
                <input
                  id={`${id}-dias`}
                  type="number"
                  inputMode="numeric"
                  min={7}
                  max={90}
                  value={dias}
                  onChange={(e) => setDias(e.target.value)}
                  aria-describedby={`${id}-dias-ayuda`}
                  className={campo}
                  disabled={guardando}
                />
                <p id={`${id}-dias-ayuda`} className="mt-1 text-xs text-slate-500">
                  Entre 7 y 90. Cada persona ve solo las suyas y puede borrarlas antes.
                </p>
              </div>
              <div className="md:col-span-2 flex justify-end">
                <button
                  type="submit"
                  disabled={guardando}
                  className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {guardando ? 'Guardando…' : 'Guardar ajustes de Carmen'}
                </button>
              </div>
            </form>
          </>
        )}

        {mensaje && (
          <p
            role={mensaje.ok ? 'status' : 'alert'}
            className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${mensaje.ok ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
          >
            {mensaje.ok ? <CheckCircle size={18} aria-hidden="true" /> : <WarningCircle size={18} aria-hidden="true" />} {mensaje.texto}
          </p>
        )}
      </div>
    </section>
  );
}
