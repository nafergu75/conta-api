'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Info, Percent } from '@phosphor-icons/react';
import { ConfirmationModal } from '@/components/dashboard/ConfirmationModal';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { hoyIso } from '@/lib/anios';
import {
  claseBoton,
  claseCampo,
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
 * calendario de modelos. Gran empresa y REDEME obligan al SII, y el SII y el
 * IVA mensual van siempre juntos (las mismas reglas que el servidor). Debajo,
 * los modelos que salen en el ejercicio con los valores que se estan eligiendo
 * (vista previa sin guardar), con su estado, desde cuando se aplicaria el
 * cambio y el aviso del servidor.
 *
 * El cambio vale desde el primer trimestre que aun no ha empezado. «Aplicar
 * desde» lo adelanta a un trimestre ya empezado del año en curso (aplicarDesde
 * del servidor), con confirmacion.
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

/**
 * Aplica las reglas al cambiar un valor, igual que el servidor (asi nunca se
 * envia una combinacion imposible): gran empresa y REDEME llevan el SII, y el
 * SII y el IVA mensual van juntos. Devuelve tambien que se ha marcado o
 * desmarcado solo y por que, para decirlo en pantalla.
 */
function conReglas(v: Valores, cambio: Partial<Valores>): { valores: Valores; explicacion: string | null } {
  const r = { ...v, ...cambio };
  const antes = v;
  if (r.granEmpresa || r.redeme) r.sii = true;
  if (cambio.periodicidadIva === 'MENSUAL') r.sii = true;
  if (cambio.sii === false) r.periodicidadIva = 'TRIMESTRAL';
  if (r.sii) r.periodicidadIva = 'MENSUAL';

  const marcoSii = r.sii && !antes.sii;
  const pasoAMensual = r.periodicidadIva === 'MENSUAL' && antes.periodicidadIva !== 'MENSUAL';
  let explicacion: string | null = null;
  if (cambio.granEmpresa === true && (marcoSii || pasoAMensual)) {
    explicacion =
      'Hemos marcado también el SII y el IVA mensual: una gran empresa tiene que llevar los libros por el SII, y con el SII el IVA se declara cada mes.';
  } else if (cambio.redeme === true && (marcoSii || pasoAMensual)) {
    explicacion =
      'Hemos marcado también el SII y el IVA mensual: las empresas inscritas en REDEME llevan los libros por el SII, y con el SII el IVA se declara cada mes.';
  } else if (cambio.periodicidadIva === 'MENSUAL' && marcoSii) {
    explicacion =
      'Hemos marcado también el SII: el IVA mensual solo es para quien lleva los libros por el SII (gran empresa, REDEME o SII voluntario). Si no es tu caso, deja el IVA trimestral.';
  } else if (cambio.sii === true && pasoAMensual) {
    explicacion = 'Con el SII el IVA se declara cada mes: hemos pasado el IVA a mensual.';
  } else if (cambio.sii === false && antes.periodicidadIva === 'MENSUAL') {
    explicacion = 'Sin el SII el IVA se declara cada trimestre: hemos pasado el IVA a trimestral.';
  }
  return { valores: r, explicacion };
}

/** Estado de un modelo del calendario, con su etiqueta (vigente no lleva). */
const ESTADO_MODELO: Record<string, { texto: string; tono: 'verde' | 'gris' | 'rojo' } | undefined> = {
  presentado: { texto: 'Presentado', tono: 'verde' },
  omitido: { texto: 'No se presenta', tono: 'gris' },
  expirado: { texto: 'Plazo vencido', tono: 'rojo' },
};

const NOMBRE_TRIMESTRE: Record<string, string> = { '01': '1.er trimestre', '04': '2.º trimestre', '07': '3.er trimestre', '10': '4.º trimestre' };

/** Hoy en España (AAAA-MM-DD), que es lo que usa el servidor. */
const hoyEspana = () => hoyIso();

/**
 * Trimestres del año en curso que ya han empezado: a esos se puede adelantar el
 * cambio con «Aplicar desde». El que empieza hoy o despues ya lo coge solo.
 */
function trimestresEmpezados(hoy: string): string[] {
  const anio = hoy.slice(0, 4);
  return ['01', '04', '07', '10'].map((m) => `${anio}-${m}-01`).filter((f) => f < hoy);
}

const nombreInicio = (f: string) => `${NOMBRE_TRIMESTRE[f.slice(5, 7)] ?? ''} (desde el ${fechaCorta(f)})`;

/** Periodo legible: '1T' -> '1.er trimestre', '05' -> 'Mayo', '0A' -> 'Anual'. */
function nombrePeriodo(m: ModeloPrevisto): string {
  if (m.periodo === '0A') return 'Anual';
  const t = /^([1-4])T$/.exec(m.periodo);
  if (t) return `${t[1]}.${t[1] === '1' || t[1] === '3' ? 'er' : 'º'} trimestre`;
  const pago = /^([1-3])P$/.exec(m.periodo);
  if (pago) return `${pago[1]}.${pago[1] === '2' ? 'º' : 'er'} pago`;
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
  // Por que se ha marcado algo solo (SII, IVA mensual).
  const [explicacion, setExplicacion] = useState<string | null>(null);
  // '' = desde el primer trimestre que no ha empezado (lo normal).
  const [aplicarDesde, setAplicarDesde] = useState('');
  // De la vista previa: desde cuando se aplicaria y que avisa el servidor.
  const [aplicadoDesde, setAplicadoDesde] = useState<string | null | undefined>(undefined);
  const [avisoVista, setAvisoVista] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  // Fecha de inicio en la app ('' = sin fecha: todo se lleva en la app).
  const [inicio, setInicio] = useState('');
  const peticion = useRef(0);
  const hoy = hoyEspana();
  const anioHoy = Number(hoy.slice(0, 4));
  // Calendario que se enseña: el de este año o el del que viene.
  const [anioCalendario, setAnioCalendario] = useState(anioHoy);
  const empezados = trimestresEmpezados(hoy);

  useEffect(() => {
    // Se espera a saber el pais; si no se ha podido leer, el servidor decide (409 si no es española).
    if (!listo || !ver || !empresaLeida || espanola === false) return;
    apiFetch<AjustesFiscales>(companyPath('/ajustes-fiscales'))
      .then((a) => {
        setAjustes(a);
        setValores(valoresDe(a));
        setInicio(a.inicioEnApp ?? '');
        setModelos(a.calendario.modelos);
        setEjercicio(a.calendario.ejercicio);
      })
      .catch((e) => setErrorCarga(errorMessage(e)));
  }, [listo, ver, empresaLeida, espanola]);

  // Vista previa del calendario con los valores aun sin guardar, o del año que viene (no escribe nada).
  useEffect(() => {
    if (!ajustes || !valores) return;
    if (iguales(valores, valoresDe(ajustes)) && !aplicarDesde && anioCalendario === ajustes.calendario.ejercicio) {
      peticion.current++; // la vista previa que estuviera en camino ya no vale
      setCargandoVista(false);
      setModelos(ajustes.calendario.modelos);
      setEjercicio(ajustes.calendario.ejercicio);
      setAplicadoDesde(undefined);
      setAvisoVista(null);
      return;
    }
    const n = ++peticion.current;
    setCargandoVista(true);
    const t = setTimeout(() => {
      apiFetch<{ ejercicio: number; modelos: ModeloPrevisto[]; aplicadoDesde?: string | null; aviso?: string | null }>(
        companyPath('/ajustes-fiscales/vista-previa'),
        {
          method: 'POST',
          body: JSON.stringify({ ...valores, ...(aplicarDesde ? { aplicarDesde } : {}), ...(anioCalendario !== anioHoy ? { ejercicio: anioCalendario } : {}) }),
        },
      )
        .then((r) => {
          if (n !== peticion.current) return;
          setModelos(r.modelos);
          setEjercicio(r.ejercicio);
          setAplicadoDesde(r.aplicadoDesde);
          setAvisoVista(r.aviso ?? null);
        })
        .catch((e) => n === peticion.current && setMensaje({ ok: false, texto: errorMessage(e) }))
        .finally(() => n === peticion.current && setCargandoVista(false));
    }, 300);
    return () => clearTimeout(t);
  }, [valores, ajustes, aplicarDesde, anioCalendario, anioHoy]);

  const cambiar = (cambio: Partial<Valores>) => {
    if (!valores) return;
    const r = conReglas(valores, cambio);
    setValores(r.valores);
    setExplicacion(r.explicacion);
  };

  // Adelantar el cambio a un trimestre ya empezado se confirma antes.
  const alEnviar = (e: React.FormEvent) => {
    e.preventDefault();
    if (aplicarDesde) setConfirmar(true);
    else guardar();
  };

  const guardar = async () => {
    if (!valores) return;
    setGuardando(true);
    setMensaje(null);
    try {
      const r = await apiFetch<AjustesFiscales & { aviso: string | null }>(companyPath('/ajustes-fiscales'), {
        method: 'PUT',
        body: JSON.stringify({
          ...valores,
          ...(aplicarDesde ? { aplicarDesde } : {}),
          // Solo si ha cambiado: vacía, se quita.
          ...(inicio !== (ajustes?.inicioEnApp ?? '') ? { inicioEnApp: inicio || null } : {}),
        }),
      });
      setAjustes(r);
      setValores(valoresDe(r));
      setInicio(r.inicioEnApp ?? '');
      setAnioCalendario(r.calendario.ejercicio);
      setModelos(r.calendario.modelos);
      setEjercicio(r.calendario.ejercicio);
      setExplicacion(null);
      setAplicarDesde('');
      setAplicadoDesde(undefined);
      setAvisoVista(null);
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
      setConfirmar(false);
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
  // Desde cuando se aplicaria, dicho en una frase (solo con la vista previa a la vista).
  const textoAplicado =
    aplicadoDesde === undefined || cargandoVista
      ? null
      : aplicadoDesde === null
        ? `Este año ya no cambia: el calendario nuevo se aplicará desde el 1 de enero de ${(ejercicio ?? Number(hoy.slice(0, 4))) + 1}.`
        : `El calendario nuevo se aplicará desde el ${fechaCorta(aplicadoDesde)}.`;

  return (
    <>
      {cabecera}
      {!ver ? (
        <SinAcceso texto="Para ver los ajustes fiscales necesitas permiso de impuestos en esta empresa." />
      ) : !ajustes || !valores ? (
        errorCarga ? <Mensaje mensaje={{ ok: false, texto: errorCarga }} /> : <p className="text-sm text-slate-500">Cargando…</p>
      ) : (
        <form onSubmit={alEnviar} className="space-y-6">
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
                    [
                      'TRIMESTRAL',
                      'Cada trimestre',
                      valores.sii ? 'Con el SII no se puede: desmarca antes el SII.' : 'Lo habitual en pymes y autónomos.',
                    ],
                    ['MENSUAL', 'Cada mes', 'Solo con el SII (gran empresa, REDEME o SII voluntario). Al elegirlo se marca también el SII.'],
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
                ayuda="Registro de devolución mensual: pides cada mes la devolución del IVA. Obliga a llevar los libros por el SII y a declarar el IVA cada mes."
              />
              <Casilla
                marcada={valores.sii}
                onCambio={(v) => cambiar({ sii: v })}
                disabled={off || valores.granEmpresa || valores.redeme}
                titulo="Lleva los libros de IVA por el SII"
                ayuda={
                  valores.granEmpresa
                    ? 'Una gran empresa tiene que llevarlos por el SII.'
                    : valores.redeme
                      ? 'Con REDEME hay que llevarlos por el SII.'
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

            {explicacion && (
              <p role="status" className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                <Info size={18} className="mt-0.5 shrink-0" />
                <span>{explicacion}</span>
              </p>
            )}

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

          <section aria-labelledby="inicio-app" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 md:p-5">
            <h2 id="inicio-app" className="font-semibold text-slate-900">
              Fecha de inicio en la app
            </h2>
            <p className="text-sm text-slate-600">
              El día desde el que llevas la contabilidad aquí. Los modelos de periodos que terminaron antes no salen como pendientes: los presentó otra
              persona (tu gestoría, por ejemplo).
            </p>
            {!ajustes.inicioEnApp && ajustes.inicioDeducido && (
              <p className="text-sm text-slate-600">
                Si la dejas vacía, la app cuenta desde el {ajustes.inicioDeducido.split('-').reverse().join('/')}: el primer día con datos de la empresa
                o, si todavía no tiene ninguno, el día en que se dio de alta.
              </p>
            )}
            <div className="flex flex-wrap items-end gap-3">
              <label htmlFor="inicio-en-app" className="block text-sm font-medium text-slate-700">
                Empiezo a usar la app el
                <input
                  id="inicio-en-app"
                  type="date"
                  min="1990-01-01"
                  max={`${anioHoy + 1}-12-31`}
                  value={inicio}
                  onChange={(e) => setInicio(e.target.value)}
                  disabled={off}
                  className={`${claseCampo} max-w-xs`}
                />
              </label>
              {inicio && !off && (
                <button type="button" onClick={() => setInicio('')} className="mb-2 text-sm font-medium text-blue-700 hover:text-blue-800">
                  Quitar la fecha
                </button>
              )}
            </div>
            {inicio !== (ajustes.inicioEnApp ?? '') && <p className="text-sm text-amber-900">Pulsa «Guardar» para que el calendario la tenga en cuenta.</p>}
            <p className="text-sm text-slate-600">
              ¿Algún modelo ya presentado fuera de la app sigue saliendo como pendiente? Márcalo en{' '}
              <Link href="/dashboard/fiscal/estado" className="font-medium text-blue-700 underline">
                Fiscal &gt; Estado fiscal
              </Link>
              , uno a uno o todo un año.
            </p>
          </section>

          <section aria-labelledby="calendario" className="rounded-xl border border-slate-200 bg-white">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 md:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="calendario" className="font-semibold text-slate-900">
                  Modelos de
                </h2>
                <label htmlFor="anio-calendario" className="sr-only">
                  Año del calendario
                </label>
                <select
                  id="anio-calendario"
                  value={anioCalendario}
                  onChange={(e) => setAnioCalendario(Number(e.target.value))}
                  className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm font-semibold text-slate-900"
                >
                  {[anioHoy + 1, anioHoy].map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                {cambiado && <span className="font-semibold text-slate-900">con estos cambios</span>}
              </div>
              {cargandoVista && <span className="text-xs text-slate-500">Calculando…</span>}
            </header>
            {!modelos || modelos.length === 0 ? (
              <p className="px-4 py-4 text-sm text-slate-500 md:px-5">No sale ningún modelo.</p>
            ) : (
              <ul className="divide-y divide-slate-100" aria-busy={cargandoVista}>
                {modelos.map((m) => {
                  const estado = m.estado ? ESTADO_MODELO[m.estado] : undefined;
                  return (
                    <li key={`${m.codigo}-${m.periodo}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm md:px-5">
                      <span className="w-12 font-mono font-semibold text-slate-900">{m.codigo}</span>
                      <span className="w-28 text-slate-700">{nombrePeriodo(m)}</span>
                      <span className="min-w-0 basis-full text-slate-600 sm:basis-0 sm:flex-1">{m.descripcion}</span>
                      {m.rellenoManual && <Etiqueta tono="ambar">Se rellena a mano</Etiqueta>}
                      {estado && <Etiqueta tono={estado.tono}>{estado.texto}</Etiqueta>}
                      <span className="text-xs text-slate-500">
                        {m.estado === 'expirado' ? 'Venció' : 'Vence'} el {fechaCorta(m.fechaVencimiento)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="space-y-2 border-t border-slate-100 px-4 py-3 text-xs text-slate-600 md:px-5">
              {textoAplicado && <p className="font-medium text-slate-800">{textoAplicado}</p>}
              {avisoVista && !cargandoVista && (
                <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-900">
                  {avisoVista}
                </p>
              )}
              <p>
                Los modelos presentados u omitidos no cambian. Lo normal es que un cambio de régimen valga desde el primer trimestre que todavía no ha
                empezado.
              </p>
            </div>
          </section>

          {editar && empezados.length > 0 && (
            <section aria-labelledby="aplicar-desde" className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
              <h2 id="aplicar-desde" className="font-semibold text-slate-900">
                Aplicar desde
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Si el cambio vale desde un trimestre que ya ha empezado (por ejemplo, eres gran empresa desde enero y lo configuras ahora), elige desde
                cuál. Los modelos de esos trimestres que no estén presentados se rehacen con el calendario nuevo.
              </p>
              <label htmlFor="aplicar-desde-select" className="mt-3 block text-sm font-medium text-slate-700">
                ¿Desde cuándo vale?
              </label>
              <select
                id="aplicar-desde-select"
                value={aplicarDesde}
                onChange={(e) => setAplicarDesde(e.target.value)}
                disabled={off}
                className={`${claseCampo} max-w-md`}
              >
                <option value="">Desde el primer trimestre que no ha empezado (lo normal)</option>
                {empezados.map((f) => (
                  <option key={f} value={f}>
                    {nombreInicio(f)}
                  </option>
                ))}
              </select>
              {aplicarDesde && (
                <p className="mt-2 text-sm text-amber-900">
                  Al guardar te pediremos que lo confirmes: cambia modelos de periodos que ya han empezado.
                </p>
              )}
            </section>
          )}

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

      <ConfirmationModal
        isOpen={confirmar}
        title={aplicarDesde ? `Aplicar el cambio desde el ${fechaCorta(aplicarDesde)}` : 'Aplicar el cambio'}
        message={
          'Ese trimestre ya ha empezado. Los modelos que no estén presentados ni omitidos desde esa fecha se quitan y se rehacen con el calendario nuevo; ' +
          'los presentados no se tocan. Hazlo solo si el régimen nuevo vale de verdad desde entonces. Si dudas, consúltalo con tu asesor.'
        }
        details={avisoVista ? <p>{avisoVista}</p> : undefined}
        confirmLabel="Sí, aplicar desde esa fecha"
        isDangerous
        isLoading={guardando}
        onConfirm={guardar}
        onCancel={() => setConfirmar(false)}
      />
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
