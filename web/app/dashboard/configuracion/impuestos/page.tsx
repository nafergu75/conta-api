'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Percent } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import {
  claseBoton,
  fechaCorta,
  MESES,
  puedeEditar,
  puedeVer,
  QUIEN_EDITA,
  type AjustesFiscales,
  type ModeloPrevisto,
} from '@/lib/configuracion';
import { AvisoSoloLectura, CabeceraBloque, Etiqueta, Mensaje, SinAcceso, type MensajeConfig } from '../componentes';
import { useConfiguracion } from '../contexto';

/**
 * Ajustes fiscales (solo empresas establecidas en España): lo que cambia el
 * calendario de modelos. Gran empresa obliga al SII; el SII o REDEME, a
 * declarar el IVA cada mes. Debajo, los modelos que salen en el ejercicio con
 * los valores que se estan eligiendo (vista previa sin guardar).
 * Ver: impuestos:read; cambiar: impuestos:write.
 */

interface Valores {
  periodicidadIva: 'TRIMESTRAL' | 'MENSUAL';
  redeme: boolean;
  sii: boolean;
  granEmpresa: boolean;
}

const valoresDe = (a: AjustesFiscales): Valores => ({
  periodicidadIva: a.periodicidadIva,
  redeme: a.redeme,
  sii: a.sii,
  granEmpresa: a.granEmpresa,
});

/** Aplica las reglas al cambiar un valor, igual que el servidor (asi nunca se envia una combinacion imposible). */
function conReglas(v: Valores): Valores {
  const r = { ...v };
  if (r.granEmpresa) r.sii = true;
  if (r.sii || r.redeme) r.periodicidadIva = 'MENSUAL';
  return r;
}

/** Periodo legible: '1T' -> '1.er trimestre', '05' -> 'Mayo', '0A' -> 'Anual'. */
function nombrePeriodo(m: ModeloPrevisto): string {
  if (m.periodo === '0A') return 'Anual';
  const t = /^([1-4])T$/.exec(m.periodo);
  if (t) return `${t[1]}.${t[1] === '1' || t[1] === '3' ? 'er' : 'º'} trimestre`;
  const mes = /^(0[1-9]|1[0-2])$/.test(m.periodo) ? MESES[Number(m.periodo) - 1] : null;
  return mes ?? m.periodoEtiqueta;
}

const iguales = (a: Valores, b: Valores) =>
  a.periodicidadIva === b.periodicidadIva && a.redeme === b.redeme && a.sii === b.sii && a.granEmpresa === b.granEmpresa;

export default function ImpuestosPage() {
  const { user, listo, espanola, empresaLeida } = useConfiguracion();
  const ver = puedeVer(user, 'impuestos');
  const editar = puedeEditar(user, 'impuestos');

  const [ajustes, setAjustes] = useState<AjustesFiscales | null>(null);
  const [valores, setValores] = useState<Valores | null>(null);
  const [modelos, setModelos] = useState<ModeloPrevisto[] | null>(null);
  const [ejercicio, setEjercicio] = useState<number | null>(null);
  const [cargandoVista, setCargandoVista] = useState(false);
  const [mensaje, setMensaje] = useState<MensajeConfig>(null);
  const [errorCarga, setErrorCarga] = useState('');
  const [guardando, setGuardando] = useState(false);
  const peticion = useRef(0);

  useEffect(() => {
    // Se espera a saber el pais; si no se ha podido leer, el servidor decide (409 si no es española).
    if (!listo || !ver || !empresaLeida || espanola === false) return;
    apiFetch<AjustesFiscales>(companyPath('/ajustes-fiscales'))
      .then((a) => {
        setAjustes(a);
        setValores(valoresDe(a));
        setModelos(a.calendario.modelos);
        setEjercicio(a.calendario.ejercicio);
      })
      .catch((e) => setErrorCarga(errorMessage(e)));
  }, [listo, ver, empresaLeida, espanola]);

  // Vista previa del calendario con los valores aun sin guardar (no escribe nada).
  useEffect(() => {
    if (!ajustes || !valores) return;
    if (iguales(valores, valoresDe(ajustes))) {
      peticion.current++; // la vista previa que estuviera en camino ya no vale
      setCargandoVista(false);
      setModelos(ajustes.calendario.modelos);
      setEjercicio(ajustes.calendario.ejercicio);
      return;
    }
    const n = ++peticion.current;
    setCargandoVista(true);
    const t = setTimeout(() => {
      apiFetch<{ ejercicio: number; modelos: ModeloPrevisto[] }>(companyPath('/ajustes-fiscales/vista-previa'), {
        method: 'POST',
        body: JSON.stringify(valores),
      })
        .then((r) => {
          if (n !== peticion.current) return;
          setModelos(r.modelos);
          setEjercicio(r.ejercicio);
        })
        .catch((e) => n === peticion.current && setMensaje({ ok: false, texto: errorMessage(e) }))
        .finally(() => n === peticion.current && setCargandoVista(false));
    }, 300);
    return () => clearTimeout(t);
  }, [valores, ajustes]);

  const cambiar = (cambio: Partial<Valores>) => setValores((v) => (v ? conReglas({ ...v, ...cambio }) : v));

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valores) return;
    setGuardando(true);
    setMensaje(null);
    try {
      const r = await apiFetch<AjustesFiscales & { aviso: string | null }>(companyPath('/ajustes-fiscales'), {
        method: 'PUT',
        body: JSON.stringify(valores),
      });
      setAjustes(r);
      setValores(valoresDe(r));
      setModelos(r.calendario.modelos);
      setEjercicio(r.calendario.ejercicio);
      setMensaje({
        ok: true,
        texto: (
          <>
            Ajustes guardados. El calendario de modelos ya los sigue.
            {r.aviso && <span className="mt-1 block">{r.aviso}</span>}
          </>
        ),
      });
    } catch (ex) {
      setMensaje({ ok: false, texto: errorMessage(ex) });
    } finally {
      setGuardando(false);
    }
  };

  if (!listo) return null;

  const cabecera = (
    <CabeceraBloque
      icono={Percent}
      titulo="Ajustes fiscales"
      descripcion="Cómo declara la empresa sus impuestos. De esto depende qué modelos te recuerda la app y cuándo vencen."
    />
  );

  if (espanola === false) {
    return (
      <>
        {cabecera}
        <p role="status" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          Esta empresa no está establecida en España, así que no presenta modelos de la AEAT y no tiene ajustes fiscales. Si tiene establecimiento
          permanente en España, su país tiene que ser España (en{' '}
          <Link href="/dashboard/empresa" className="font-medium underline">
            Datos de la empresa
          </Link>
          ).
        </p>
      </>
    );
  }

  const off = !editar || guardando;
  const cambiado = !!ajustes && !!valores && !iguales(valores, valoresDe(ajustes));

  return (
    <>
      {cabecera}
      {!ver ? (
        <SinAcceso texto="Para ver los ajustes fiscales necesitas permiso de impuestos en esta empresa." />
      ) : !ajustes || !valores ? (
        errorCarga ? <Mensaje mensaje={{ ok: false, texto: errorCarga }} /> : <p className="text-sm text-slate-500">Cargando…</p>
      ) : (
        <form onSubmit={guardar} className="space-y-6">
          {!editar && <AvisoSoloLectura quien={QUIEN_EDITA.impuestos} />}
          {!ajustes.guardado && editar && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Todavía no has revisado estos ajustes: son los habituales de una pyme (IVA trimestral, sin SII). Si es tu caso, pulsa «Guardar» para dejarlo
              confirmado.
            </p>
          )}

          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 md:p-5">
            <fieldset>
              <legend className="font-semibold text-slate-900">IVA (modelo 303)</legend>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(
                  [
                    ['TRIMESTRAL', 'Cada trimestre', 'Lo habitual en pymes y autónomos.'],
                    ['MENSUAL', 'Cada mes', 'Obligatorio con el SII o la inscripción en REDEME.'],
                  ] as const
                ).map(([valor, titulo, ayuda]) => {
                  const bloqueado = valor === 'TRIMESTRAL' && (valores.sii || valores.redeme);
                  return (
                    <label
                      key={valor}
                      className={`flex items-start gap-3 rounded-lg border p-3 ${
                        valores.periodicidadIva === valor ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200'
                      } ${bloqueado ? 'opacity-60' : ''}`}
                    >
                      <input
                        type="radio"
                        name="periodicidadIva"
                        value={valor}
                        checked={valores.periodicidadIva === valor}
                        onChange={() => cambiar({ periodicidadIva: valor })}
                        disabled={off || bloqueado}
                        className="mt-1 h-4 w-4 accent-emerald-600"
                      />
                      <span className="text-sm">
                        <span className="font-medium text-slate-900">{titulo}</span>
                        <span className="block text-slate-600">{ayuda}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="space-y-3">
              <Casilla
                marcada={valores.redeme}
                onCambio={(v) => cambiar({ redeme: v })}
                disabled={off}
                titulo="Inscrita en REDEME"
                ayuda="Registro de devolución mensual: pides cada mes la devolución del IVA. Obliga a declarar el IVA cada mes."
              />
              <Casilla
                marcada={valores.sii}
                onCambio={(v) => cambiar({ sii: v })}
                disabled={off || valores.granEmpresa}
                titulo="Lleva los libros de IVA por el SII"
                ayuda={
                  valores.granEmpresa
                    ? 'Una gran empresa tiene que llevarlos por el SII.'
                    : 'Suministro inmediato de información. Obliga a declarar el IVA cada mes y quita los modelos 390 y 347.'
                }
              />
              <Casilla
                marcada={valores.granEmpresa}
                onCambio={(v) => cambiar({ granEmpresa: v })}
                disabled={off}
                titulo="Gran empresa"
                ayuda="Más de 6.010.121,04 € de volumen de operaciones el año anterior. Obliga al SII y a presentar cada mes también el 111 y el 115."
              />
            </div>

            <div className="space-y-2 border-t border-slate-100 pt-4">
              <p className="text-sm font-medium text-slate-700">Todavía no se aplican en los asientos</p>
              {['Recargo de equivalencia', 'Criterio de caja', 'Prorrata'].map((t) => (
                <label key={t} className="flex items-center gap-3 text-sm text-slate-500">
                  <input type="checkbox" checked={false} disabled readOnly className="h-4 w-4" />
                  {t} <Etiqueta tono="gris">No disponible aún</Etiqueta>
                </label>
              ))}
            </div>

            {ajustes.autonomo && (
              <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                La empresa es de un autónomo: en lugar del Impuesto sobre Sociedades (200) sale el pago fraccionado del IRPF (modelo 130), que de momento
                se rellena a mano.
              </p>
            )}
          </section>

          <section aria-labelledby="calendario" className="rounded-xl border border-slate-200 bg-white">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 md:px-5">
              <h2 id="calendario" className="font-semibold text-slate-900">
                Modelos de {ejercicio ?? ''} {cambiado ? 'con estos cambios' : ''}
              </h2>
              {cargandoVista && <span className="text-xs text-slate-500">Calculando…</span>}
            </header>
            {!modelos || modelos.length === 0 ? (
              <p className="px-4 py-4 text-sm text-slate-500 md:px-5">No sale ningún modelo.</p>
            ) : (
              <ul className="divide-y divide-slate-100" aria-busy={cargandoVista}>
                {modelos.map((m) => (
                  <li key={`${m.codigo}-${m.periodo}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm md:px-5">
                    <span className="w-12 font-mono font-semibold text-slate-900">{m.codigo}</span>
                    <span className="w-28 text-slate-700">{nombrePeriodo(m)}</span>
                    <span className="min-w-0 flex-1 text-slate-600">{m.descripcion}</span>
                    {m.rellenoManual && <Etiqueta tono="ambar">Se rellena a mano</Etiqueta>}
                    <span className="text-xs text-slate-500">Vence el {fechaCorta(m.fechaVencimiento)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500 md:px-5">
              Al guardar, los modelos ya presentados no cambian: el calendario nuevo se aplica desde el primer periodo libre.
            </p>
          </section>

          <Mensaje mensaje={mensaje} onCerrar={() => setMensaje(null)} />

          {editar && (
            <div className="flex justify-end">
              <button type="submit" disabled={guardando} className={claseBoton}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          )}
        </form>
      )}
    </>
  );
}

function Casilla({
  marcada,
  onCambio,
  disabled,
  titulo,
  ayuda,
}: {
  marcada: boolean;
  onCambio: (v: boolean) => void;
  disabled: boolean;
  titulo: string;
  ayuda: string;
}) {
  return (
    <label className="flex items-start gap-3">
      <input type="checkbox" checked={marcada} onChange={(e) => onCambio(e.target.checked)} disabled={disabled} className="mt-1 h-4 w-4 accent-emerald-600" />
      <span className="text-sm">
        <span className="font-medium text-slate-900">{titulo}</span>
        <span className="block text-slate-600">{ayuda}</span>
      </span>
    </label>
  );
}
