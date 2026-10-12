'use client';

import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { Plus } from '@phosphor-icons/react';
import { Tooltip } from '@/app/dashboard/components/Tooltip';
import { apiFetch, campoDelError, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { hoyEspana } from '@/lib/verifactu';
import { eur, fechaEs, importeEnCampo, leerImporte } from '@/lib/arranque';
import { Bloque, boton, botonSecundario, campo, Cifra, Cifras, Dialogo, Nota } from '../arranque/comun';

/**
 * Inmovilizado: los bienes de la empresa, lo amortizado y lo que les queda.
 * La amortización se calcula mes a mes (lineal, por días) y se apunta como
 * asientos en borrador que se aprueban en el Motor contable. Los bienes que
 * vienen de la gestoría ya traen lo amortizado hasta el 31-12-2026.
 */

interface Activo {
  id: string;
  descripcion: string;
  subcuentaBien: string;
  subcuentaAmortAcum: string;
  subcuentaDotacion: string;
  fechaAlta: string;
  fechaInicioAmortizacion: string;
  fechaBaja: string | null;
  coste: number;
  valorResidual: number;
  coeficiente: number;
  amortAcumuladaInicial: number;
  dotado: number;
  amortizacionTotal: number;
  valorNeto: number;
  ultimoMesDotado: string | null;
  editable: boolean;
  activo: boolean;
  traidoDeLaGestoria: boolean;
}

interface Mes {
  periodo: string;
  importe: number;
  bienes: number;
  asiento: { id: string; numero: string } | null;
}

interface Lista {
  activos: Activo[];
  totales: { coste: number; amortizacion: number; valorNeto: number };
  pendiente: Mes[];
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesTexto = (p: string) => `${MESES[Number(p.slice(5, 7)) - 1] ?? p} de ${p.slice(0, 4)}`;

interface Ficha {
  descripcion: string;
  subcuentaBien: string;
  subcuentaAmortAcum: string;
  subcuentaDotacion: string;
  fechaAlta: string;
  fechaInicioAmortizacion: string;
  coste: string;
  valorResidual: string;
  amortAcumuladaInicial: string;
  fechaAmortAcumulada: string;
  coeficiente: string;
}

const FICHA_VACIA: Ficha = {
  descripcion: '',
  subcuentaBien: '',
  subcuentaAmortAcum: '',
  subcuentaDotacion: '',
  fechaAlta: '',
  fechaInicioAmortizacion: '',
  coste: '',
  valorResidual: '',
  amortAcumuladaInicial: '',
  fechaAmortAcumulada: '',
  coeficiente: '',
};

/** Alta o cambio de un bien. */
function FormActivo({ activo, onCerrar, onGuardado }: { activo: Activo | null; onCerrar: () => void; onGuardado: (texto: string) => void }) {
  const [f, setF] = useState<Ficha>(
    activo
      ? {
          descripcion: activo.descripcion,
          subcuentaBien: activo.subcuentaBien,
          subcuentaAmortAcum: activo.subcuentaAmortAcum,
          subcuentaDotacion: activo.subcuentaDotacion,
          fechaAlta: activo.fechaAlta,
          fechaInicioAmortizacion: activo.fechaInicioAmortizacion,
          coste: importeEnCampo(activo.coste),
          valorResidual: importeEnCampo(activo.valorResidual || null),
          amortAcumuladaInicial: importeEnCampo(activo.amortAcumuladaInicial || null),
          fechaAmortAcumulada: '',
          coeficiente: String(activo.coeficiente).replace('.', ','),
        }
      : { ...FICHA_VACIA, fechaAlta: hoyEspana() },
  );
  const [error, setError] = useState('');
  const [campoMal, setCampoMal] = useState<string | undefined>();
  const [ocupado, setOcupado] = useState(false);
  const set = (k: keyof Ficha) => (e: ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const mal = (k: string) => (campoMal === k ? { 'aria-invalid': true as const } : {});

  const guardar = async () => {
    setError('');
    setCampoMal(undefined);
    const importe = (t: string) => (t.trim() ? leerImporte(t) : null);
    const cuerpo = {
      descripcion: f.descripcion.trim(),
      subcuentaBien: f.subcuentaBien.trim(),
      ...(f.subcuentaAmortAcum.trim() ? { subcuentaAmortAcum: f.subcuentaAmortAcum.trim() } : {}),
      ...(f.subcuentaDotacion.trim() ? { subcuentaDotacion: f.subcuentaDotacion.trim() } : {}),
      fechaAlta: f.fechaAlta,
      ...(f.fechaInicioAmortizacion ? { fechaInicioAmortizacion: f.fechaInicioAmortizacion } : {}),
      coste: importe(f.coste),
      valorResidual: importe(f.valorResidual) ?? 0,
      amortAcumuladaInicial: importe(f.amortAcumuladaInicial) ?? 0,
      ...(f.fechaAmortAcumulada ? { fechaAmortAcumulada: f.fechaAmortAcumulada } : {}),
      coeficiente: f.coeficiente.trim() ? Number(f.coeficiente.replace(',', '.')) : null,
    };
    setOcupado(true);
    try {
      if (activo) await apiFetch(companyPath(`/inmovilizado/${activo.id}`), { method: 'PUT', body: JSON.stringify(cuerpo) });
      else await apiFetch(companyPath('/inmovilizado'), { method: 'POST', body: JSON.stringify(cuerpo) });
      onGuardado(activo ? 'Bien actualizado.' : 'Bien dado de alta.');
    } catch (e) {
      setError(errorMessage(e));
      setCampoMal(campoDelError(e));
      setOcupado(false);
    }
  };

  const etiqueta = 'block text-xs font-medium text-slate-600';
  const caja = `${campo} aria-[invalid=true]:border-red-500`;
  return (
    <Dialogo titulo={activo ? `Cambiar «${activo.descripcion}»` : 'Nuevo bien'} onCerrar={ocupado ? () => undefined : onCerrar} ancho="max-w-2xl">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={`${etiqueta} sm:col-span-2`}>
          Qué es
          <input className={caja} value={f.descripcion} placeholder="Por ejemplo, furgoneta Renault Kangoo" onChange={set('descripcion')} {...mal('descripcion')} />
        </label>
        <label className={etiqueta}>
          Cuenta del bien (20, 21, 22 o 23)
          <input inputMode="numeric" className={caja} value={f.subcuentaBien} placeholder="2180000001" onChange={set('subcuentaBien')} {...mal('subcuentaBien')} />
        </label>
        <label className={etiqueta}>
          Coste
          <input inputMode="decimal" className={caja} value={f.coste} onChange={set('coste')} {...mal('coste')} />
        </label>
        <label className={etiqueta}>
          Fecha de alta
          <input type="date" className={caja} value={f.fechaAlta} onChange={set('fechaAlta')} {...mal('fechaAlta')} />
        </label>
        <label className={etiqueta}>
          % de amortización al año
          <input inputMode="decimal" className={caja} value={f.coeficiente} placeholder="Por ejemplo, 16" onChange={set('coeficiente')} {...mal('coeficiente')} />
        </label>
      </div>
      <details className="mt-3 rounded-lg border border-slate-200 p-3 text-sm">
        <summary className="cursor-pointer font-medium text-slate-700">Más datos (si los sabes)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className={etiqueta}>
            Empieza a amortizarse el
            <input type="date" className={caja} value={f.fechaInicioAmortizacion} onChange={set('fechaInicioAmortizacion')} {...mal('fechaInicioAmortizacion')} />
            <span className="mt-1 block font-normal text-slate-500">Vacío: el día del alta.</span>
          </label>
          <label className={etiqueta}>
            Valor residual
            <input inputMode="decimal" className={caja} value={f.valorResidual} placeholder="0,00" onChange={set('valorResidual')} {...mal('valorResidual')} />
          </label>
          <label className={etiqueta}>
            Ya amortizado antes
            <input inputMode="decimal" className={caja} value={f.amortAcumuladaInicial} placeholder="0,00" onChange={set('amortAcumuladaInicial')} {...mal('amortAcumuladaInicial')} />
          </label>
          <label className={etiqueta}>
            Fecha de lo ya amortizado
            <input type="date" className={caja} value={f.fechaAmortAcumulada} onChange={set('fechaAmortAcumulada')} {...mal('fechaAmortAcumulada')} />
          </label>
          <label className={etiqueta}>
            Cuenta de amortización acumulada (28…)
            <input inputMode="numeric" className={caja} value={f.subcuentaAmortAcum} placeholder="La que corresponde" onChange={set('subcuentaAmortAcum')} {...mal('subcuentaAmortAcum')} />
          </label>
          <label className={etiqueta}>
            Cuenta del gasto de amortización (68…)
            <input inputMode="numeric" className={caja} value={f.subcuentaDotacion} placeholder="La que corresponde" onChange={set('subcuentaDotacion')} {...mal('subcuentaDotacion')} />
          </label>
        </div>
      </details>
      {error && (
        <div className="mt-3">
          <Nota tipo="error">{error}</Nota>
        </div>
      )}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
        <button type="button" className={boton} disabled={ocupado} onClick={guardar}>
          {ocupado ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className={botonSecundario} disabled={ocupado} onClick={onCerrar}>
          Cancelar
        </button>
      </div>
    </Dialogo>
  );
}

export default function InmovilizadoPage() {
  const user = getUser();
  const puedeEditar = tieneAlgunPermiso(user, ['contabilidad:write']);
  const [datos, setDatos] = useState<Lista | null>(null);
  const [todos, setTodos] = useState(false);
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState('');
  const [editando, setEditando] = useState<Activo | null | 'nuevo'>(null);
  const [hasta, setHasta] = useState(hoyEspana().slice(0, 7));
  const [anular, setAnular] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setDatos(await apiFetch<Lista>(companyPath(`/inmovilizado${todos ? '?todos=1' : ''}`)));
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [todos]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const accion = async (hacer: () => Promise<{ texto?: string } | unknown>, texto?: string) => {
    setOcupado(true);
    setError('');
    setHecho('');
    try {
      const r = (await hacer()) as { texto?: string } | null;
      setHecho(r?.texto ?? texto ?? 'Hecho.');
      await cargar();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOcupado(false);
    }
  };

  const darDeBaja = (a: Activo) => {
    const fecha = window.prompt(`Fecha de baja de «${a.descripcion}» (AAAA-MM-DD):`, hoyEspana());
    if (!fecha) return;
    accion(() => apiFetch(companyPath(`/inmovilizado/${a.id}/baja`), { method: 'POST', body: JSON.stringify({ fechaBaja: fecha.trim() }) }), 'Bien dado de baja.');
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-24">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Inmovilizado</h1>
          <Tooltip text="Lineal y por días: cada mes se amortiza la parte del año que le toca, sin pasar nunca del coste menos el valor residual." />
        </div>
        <p className="mt-2 text-slate-600">
          Los bienes de la empresa (vehículos, ordenadores, mobiliario…), lo amortizado y lo que les queda. La amortización se calcula mes a mes y queda en borrador para que la
          apruebes en el Motor contable.
        </p>
      </div>

      {hecho && <Nota tipo="bien">{hecho}</Nota>}
      {error && <Nota tipo="error">{error}</Nota>}

      {datos && (
        <>
          <Cifras>
            <Cifra titulo="Coste" valor={eur.format(datos.totales.coste)} />
            <Cifra titulo="Amortizado" valor={eur.format(datos.totales.amortizacion)} />
            <Cifra titulo="Valor que les queda" valor={eur.format(datos.totales.valorNeto)} />
            <Cifra titulo="Bienes" valor={datos.activos.length} />
          </Cifras>

          {puedeEditar && (
            <Bloque titulo="Amortización">
              {datos.pendiente.length > 0 ? (
                <Nota tipo="aviso">
                  Falta por apuntar la amortización de {datos.pendiente.map((m) => `${mesTexto(m.periodo)} (${eur.format(m.importe)})`).join(', ')}.
                </Nota>
              ) : (
                <p className="text-sm text-slate-600">No falta amortización por apuntar hasta este mes.</p>
              )}
              <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="block text-xs font-medium text-slate-600">
                  Calcular hasta
                  <input type="month" className={campo} value={hasta} onChange={(e) => setHasta(e.target.value)} />
                </label>
                <button
                  type="button"
                  className={boton}
                  disabled={ocupado || !hasta}
                  onClick={() => accion(() => apiFetch(companyPath('/inmovilizado/dotaciones'), { method: 'POST', body: JSON.stringify({ hasta }) }))}
                >
                  Calcular la amortización
                </button>
              </div>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-slate-600">Anular la amortización de un mes</summary>
                <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <label className="block text-xs font-medium text-slate-600">
                    Mes
                    <input type="month" className={campo} value={anular} onChange={(e) => setAnular(e.target.value)} />
                  </label>
                  <button
                    type="button"
                    className={botonSecundario}
                    disabled={ocupado || !anular}
                    onClick={() => {
                      if (window.confirm(`¿Anular la amortización de ${mesTexto(anular)}? Se podrá volver a calcular.`)) {
                        accion(() => apiFetch(companyPath(`/inmovilizado/dotaciones/${anular}/anular`), { method: 'POST' }));
                      }
                    }}
                  >
                    Anular ese mes
                  </button>
                </div>
              </details>
            </Bloque>
          )}

          <Bloque
            titulo="Bienes"
            extra={
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} /> Ver también los dados de baja
                </label>
                {puedeEditar && (
                  <button type="button" className={`${boton} px-3 py-1.5`} onClick={() => setEditando('nuevo')}>
                    <Plus size={16} /> Nuevo bien
                  </button>
                )}
              </div>
            }
          >
            {datos.activos.length === 0 ? (
              <p className="text-sm text-slate-500">Todavía no hay bienes. Los de la gestoría llegan al traer la contabilidad de 2026, con su ficha de inmovilizado.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {datos.activos.map((a) => (
                  <li key={a.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-medium text-slate-900">
                        {a.descripcion}
                        {!a.activo && <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">De baja el {fechaEs(a.fechaBaja)}</span>}
                        {a.traidoDeLaGestoria && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">De la gestoría</span>}
                      </p>
                      <p className="text-xs text-slate-600">
                        <span className="font-mono">{a.subcuentaBien}</span> · alta {fechaEs(a.fechaAlta)} · {a.coeficiente.toLocaleString('es-ES')} % al año
                        {a.ultimoMesDotado ? ` · amortizado hasta ${mesTexto(a.ultimoMesDotado)}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm sm:justify-end">
                      <span className="text-slate-600">
                        Coste <span className="font-medium tabular-nums text-slate-900">{eur.format(a.coste)}</span>
                      </span>
                      <span className="text-slate-600">
                        Amortizado <span className="font-medium tabular-nums text-slate-900">{eur.format(a.amortizacionTotal)}</span>
                      </span>
                      <span className="text-slate-600">
                        Queda <span className="font-semibold tabular-nums text-slate-900">{eur.format(a.valorNeto)}</span>
                      </span>
                      {puedeEditar && a.activo && (
                        <span className="flex gap-3">
                          {a.editable && (
                            <button type="button" className="text-xs font-medium text-emerald-700 hover:underline" onClick={() => setEditando(a)}>
                              Cambiar
                            </button>
                          )}
                          <button type="button" className="text-xs font-medium text-red-600 hover:underline" disabled={ocupado} onClick={() => darDeBaja(a)}>
                            Dar de baja
                          </button>
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Bloque>
        </>
      )}

      {editando && (
        <FormActivo
          activo={editando === 'nuevo' ? null : editando}
          onCerrar={() => setEditando(null)}
          onGuardado={(t) => {
            setEditando(null);
            setHecho(t);
            cargar();
          }}
        />
      )}
    </div>
  );
}
