'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle, Clock, Eye, XCircle, type Icon as IconoPhosphor } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { formatoImporte } from '@/lib/moneda';
import { conflictoGasto, enlaceRecibidaTarde, fechaCorta, type Rectificar303, textoPeriodoModelo } from '@/lib/compras';
import { ConfirmationModal } from '@/components/dashboard/ConfirmationModal';
import { ToastContainer, type ToastType } from '@/components/dashboard/Toast';

/**
 * Motor contable: listado de asientos. Por defecto enseña los que esperan
 * aprobación (borradores, como los del lector de gastos, y pendientes de
 * revisar). GET /accounting/journal-entries devuelve los asientos con sus
 * lineas, sin debe ni haber sumados: se suman aqui.
 */

interface LineaAsiento {
  debe: number | string | null;
  haber: number | string | null;
}

interface Asiento {
  id: string;
  numeroAsiento: string;
  fecha: string;
  descripcion?: string;
  estado: string;
  origen?: string;
  invoiceId?: string | null;
  invoiceType?: string | null;
  lineas?: LineaAsiento[];
}

const APROBABLES = ['DRAFT', 'PENDING_REVIEW'];

const ESTADO_CONFIG: Record<string, { color: string; icon: IconoPhosphor; label: string; ayuda: string }> = {
  DRAFT: {
    color: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: Clock,
    label: 'Borrador',
    ayuda: 'Todavía no cuenta en la contabilidad: revísalo y apruébalo.',
  },
  PENDING_REVIEW: {
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    icon: Eye,
    label: 'Pendiente de revisar',
    ayuda: 'Espera a que alguien lo revise y lo apruebe.',
  },
  POSTED: {
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: CheckCircle,
    label: 'En firme',
    ayuda: 'Ya cuenta en la contabilidad.',
  },
  REVERSED: {
    color: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: XCircle,
    label: 'Anulado',
    ayuda: 'Asiento anulado: no cuenta en la contabilidad.',
  },
  SUSTITUIDO: {
    color: 'bg-slate-100 text-slate-700 border-slate-200',
    icon: XCircle,
    label: 'Retirado (2026 lo lleva la gestoría)',
    ayuda: 'Asiento de 2026 hecho en la app que se retiró al traer la contabilidad de la gestoría: no cuenta y no se puede aprobar ni cambiar.',
  },
};

const ORIGEN: Record<string, string> = {
  FACTURA_INGRESO: 'Factura de venta',
  FACTURA_GASTO: 'Factura de gasto',
  TESORERIA: 'Tesorería',
  AJUSTE_MANUAL: 'Asiento manual',
  APERTURA: 'Apertura',
  APERTURA_AJUSTE: 'Ajuste de la apertura',
  AMORTIZACION: 'Amortización',
  HISTORICO: 'Diario de la gestoría',
  HISTORICO_APERTURA: 'Apertura de la gestoría',
  HISTORICO_REGULARIZACION: 'Regularización de la gestoría',
  HISTORICO_CIERRE: 'Cierre de la gestoría',
};

/** 'PENDIENTES' junta borradores y pendientes de revisar (el servidor filtra un estado cada vez). */
type FiltroEstado = 'PENDIENTES' | '' | 'DRAFT' | 'PENDING_REVIEW' | 'POSTED' | 'REVERSED';

const num = (v: unknown) => Number(v) || 0;
const importe = (n: number) => formatoImporte(n, 'EUR', { sinSimbolo: true });
/** La fecha llega como ISO (DateTime): se toma el dia tal cual, sin pasar por la hora local. */
const fecha = (iso: string) => fechaCorta(String(iso ?? '').slice(0, 10)) || '—';
const sumas = (a: Asiento) => ({
  debe: (a.lineas ?? []).reduce((s, l) => s + num(l.debe), 0),
  haber: (a.lineas ?? []).reduce((s, l) => s + num(l.haber), 0),
});
const estadoDe = (estado: string) =>
  ESTADO_CONFIG[estado] ?? { color: 'bg-slate-100 text-slate-700 border-slate-200', icon: Clock, label: estado || 'Sin estado', ayuda: '' };

const campo =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600 focus:border-accent-600';

export default function MotorContablePage() {
  const puedeAprobar = tieneAlgunPermiso(getUser(), ['contabilidad:write']);

  const [asientos, setAsientos] = useState<Asiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [estado, setEstado] = useState<FiltroEstado>('PENDIENTES');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [confirmar, setConfirmar] = useState<{ asiento: Asiento | null; cargando: boolean }>({ asiento: null, cargando: false });
  // Borrador de un gasto cuyo trimestre ya esta presentado: se corrige en la factura.
  const [recibidaTarde, setRecibidaTarde] = useState<{ mensaje: string; facturaId: string; numero: string } | null>(null);
  // Abono que reduce el IVA de un 303 ya presentado: se aprueba si se confirma.
  const [rectificar303, setRectificar303] = useState<{ mensaje: string; asiento: Asiento; datos: Rectificar303; facturaId: string | null } | null>(null);
  const [toasts, setToasts] = useState<Array<{ id: string; type: ToastType; title: string; message?: string }>>([]);

  const cargar = useCallback(async () => {
    const pedir = (e: string) => {
      const params = new URLSearchParams();
      if (e) params.set('estado', e);
      if (desde) params.set('desde', desde);
      if (hasta) params.set('hasta', hasta);
      return apiFetch<Asiento[]>(companyPath(`/accounting/journal-entries?${params}`));
    };
    try {
      setLoading(true);
      const listas = await Promise.all(estado === 'PENDIENTES' ? APROBABLES.map(pedir) : [pedir(estado)]);
      const todos = listas.flatMap((l) => (Array.isArray(l) ? l : []));
      // Los que esperan aprobacion primero; dentro de cada grupo, los mas recientes arriba.
      todos.sort((a, b) => {
        const pa = APROBABLES.includes(a.estado) ? 0 : 1;
        const pb = APROBABLES.includes(b.estado) ? 0 : 1;
        return pa - pb || String(b.fecha).localeCompare(String(a.fecha));
      });
      setAsientos(todos);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [estado, desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const addToast = (type: ToastType, title: string, message?: string) => {
    const id = Math.random().toString(36).slice(2, 11);
    setToasts((prev) => [...prev, { id, type, title, message }]);
  };

  const aprobar = async (confirmado?: Asiento) => {
    const a = confirmado ?? confirmar.asiento;
    if (!a) return;
    if (!confirmado) setConfirmar({ asiento: a, cargando: true });
    setRecibidaTarde(null);
    setRectificar303(null);
    try {
      await apiFetch(companyPath(`/accounting/journal-entries/${encodeURIComponent(a.id)}/approve`), {
        method: 'POST',
        body: JSON.stringify({
          observaciones: 'Aprobado desde el listado del Motor contable',
          // «Registrar y avisarme de rectificar el 303»: el abono reduce el IVA de un 303 ya presentado.
          ...(confirmado ? { confirmaRectificar303: true } : {}),
        }),
      });
      addToast(
        'success',
        'Asiento aprobado',
        a.origen === 'FACTURA_GASTO' ? 'La factura ya cuenta en el IVA y en los modelos.' : 'El asiento ya está en firme.',
      );
      setConfirmar({ asiento: null, cargando: false });
      await cargar();
    } catch (err) {
      const c = conflictoGasto(err);
      if (c?.rectificar303) {
        setRectificar303({ mensaje: errorMessage(err), asiento: a, datos: c.rectificar303, facturaId: c.facturaId });
        setConfirmar({ asiento: null, cargando: false });
        return;
      }
      if (c?.fechaRegistro && c.facturaId) {
        // No es un fallo que se arregle reintentando: hay que poner la fecha en la factura.
        setRecibidaTarde({ mensaje: errorMessage(err), facturaId: c.facturaId, numero: a.numeroAsiento });
        setConfirmar({ asiento: null, cargando: false });
        return;
      }
      addToast('error', 'No se pudo aprobar', errorMessage(err));
      setConfirmar({ asiento: a, cargando: false });
    }
  };

  const enlaceFactura = (a: Asiento) =>
    a.invoiceId
      ? a.invoiceType === 'GASTO' || a.origen === 'FACTURA_GASTO'
        ? `/dashboard/compras/${a.invoiceId}`
        : `/dashboard/facturas/${a.invoiceId}`
      : null;

  const pendientes = asientos.filter((a) => APROBABLES.includes(a.estado)).length;

  const BotonAprobar = ({ a }: { a: Asiento }) =>
    puedeAprobar && APROBABLES.includes(a.estado) ? (
      <button
        type="button"
        onClick={() => setConfirmar({ asiento: a, cargando: false })}
        className="inline-flex items-center gap-1 rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-accent-700"
      >
        <CheckCircle size={16} /> Aprobar
      </button>
    ) : null;

  return (
    <div className="mx-auto max-w-6xl p-4 pb-24 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Motor contable</h1>
        <p className="mt-2 text-slate-600">
          Asientos de las facturas. Los que están en borrador (por ejemplo, los del lector de gastos) no cuentan en el IVA ni en los
          modelos hasta que los apruebes.
        </p>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}

      {/* Filtros */}
      <div className="mb-6 grid grid-cols-1 gap-4 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-3">
        <div>
          <label htmlFor="mc-estado" className="mb-1 block text-sm font-medium text-slate-700">
            Estado
          </label>
          <select id="mc-estado" value={estado} onChange={(e) => setEstado(e.target.value as FiltroEstado)} className={campo}>
            <option value="PENDIENTES">Pendientes de aprobar</option>
            <option value="DRAFT">Borrador</option>
            <option value="PENDING_REVIEW">Pendiente de revisar</option>
            <option value="POSTED">En firme</option>
            <option value="REVERSED">Anulado</option>
            <option value="">Todos</option>
          </select>
        </div>
        <div>
          <label htmlFor="mc-desde" className="mb-1 block text-sm font-medium text-slate-700">
            Desde
          </label>
          <input id="mc-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={campo} />
        </div>
        <div>
          <label htmlFor="mc-hasta" className="mb-1 block text-sm font-medium text-slate-700">
            Hasta
          </label>
          <input id="mc-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={campo} />
        </div>
      </div>

      {rectificar303 && (
        <div role="alert" className="mb-4 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p>
            <span className="font-semibold">No se ha aprobado el asiento {rectificar303.asiento.numeroAsiento}.</span> {rectificar303.mensaje}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => aprobar(rectificar303.asiento)}
              className="rounded-lg bg-rose-600 px-3 py-1.5 font-semibold text-white hover:bg-rose-700"
            >
              Aprobar y avisarme de rectificar el 303
            </button>
            {/* Por el art. 80 cuenta la fecha en que llegó: si llegó más tarde, se pone esa en la factura. */}
            {rectificar303.datos.campo === 'fechaRegistro' && rectificar303.facturaId && (
              <Link href={enlaceRecibidaTarde(rectificar303.facturaId)} className="font-semibold text-amber-900 underline">
                Me llegó más tarde: poner la fecha de recepción
              </Link>
            )}
            {rectificar303.datos.enlace && (
              <Link href={rectificar303.datos.enlace} className="inline-flex items-center gap-1 font-semibold text-amber-900 underline">
                Ver el 303{rectificar303.datos.periodo ? ` del ${textoPeriodoModelo(rectificar303.datos.ejercicio, rectificar303.datos.periodo)}` : ''} <ArrowRight size={14} />
              </Link>
            )}
            <button type="button" onClick={() => setRectificar303(null)} className="font-medium text-amber-800 hover:underline">
              Cerrar
            </button>
          </div>
        </div>
      )}

      {recibidaTarde && (
        <div role="alert" className="mb-4 flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p>
            <span className="font-semibold">No se ha aprobado el asiento {recibidaTarde.numero}.</span> {recibidaTarde.mensaje}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href={enlaceRecibidaTarde(recibidaTarde.facturaId)} className="inline-flex items-center gap-1 font-semibold text-amber-900 underline">
              Poner la fecha en que la recibiste <ArrowRight size={14} />
            </Link>
            <button type="button" onClick={() => setRecibidaTarde(null)} className="font-medium text-amber-800 hover:underline">
              Cerrar
            </button>
          </div>
        </div>
      )}

      {!loading && pendientes > 0 && (
        <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {pendientes === 1 ? 'Hay 1 asiento esperando tu aprobación.' : `Hay ${pendientes} asientos esperando tu aprobación.`}
          {!puedeAprobar && ' Para aprobarlos hace falta el permiso de escritura en Contabilidad.'}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Cargando asientos...</div>
        ) : asientos.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            {estado === 'PENDIENTES' ? 'No hay asientos esperando aprobación.' : 'No hay asientos con este filtro.'}
          </div>
        ) : (
          <>
            {/* Escritorio: tabla */}
            <table className="hidden w-full text-sm lg:table">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Asiento</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Fecha</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Concepto</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Debe</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">Haber</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-700">Estado</th>
                  <th className="px-4 py-3 text-right font-semibold text-slate-700">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {asientos.map((a) => {
                  const cfg = estadoDe(a.estado);
                  const Icono = cfg.icon;
                  const s = sumas(a);
                  const fac = enlaceFactura(a);
                  return (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-mono text-slate-700 break-all">{a.numeroAsiento}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600">{fecha(a.fecha)}</td>
                      <td className="px-4 py-3 text-slate-700">
                        <div className="break-words">{a.descripcion || '—'}</div>
                        <div className="text-xs text-slate-500">
                          {ORIGEN[a.origen ?? ''] ?? a.origen}
                          {fac && (
                            <>
                              {' · '}
                              <Link href={fac} className="text-blue-600 hover:underline">
                                Ver la factura
                              </Link>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono whitespace-nowrap text-slate-700">{importe(s.debe)}</td>
                      <td className="px-4 py-3 text-right font-mono whitespace-nowrap text-slate-700">{importe(s.haber)}</td>
                      <td className="px-4 py-3">
                        <span title={cfg.ayuda} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${cfg.color}`}>
                          <Icono size={14} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-3">
                          <Link href={`/dashboard/motor-contable/${a.id}`} className="inline-flex items-center gap-1 font-medium whitespace-nowrap text-blue-600 hover:text-blue-800">
                            Ver <ArrowRight size={14} />
                          </Link>
                          <BotonAprobar a={a} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Movil y tablet: tarjetas */}
            <ul className="divide-y divide-slate-200 lg:hidden">
              {asientos.map((a) => {
                const cfg = estadoDe(a.estado);
                const Icono = cfg.icon;
                const s = sumas(a);
                const fac = enlaceFactura(a);
                return (
                  <li key={a.id} className="space-y-2 p-4 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono font-semibold text-slate-900 break-all">{a.numeroAsiento}</p>
                        <p className="text-slate-600">
                          {fecha(a.fecha)} · {ORIGEN[a.origen ?? ''] ?? a.origen}
                        </p>
                      </div>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${cfg.color}`}>
                        <Icono size={14} />
                        {cfg.label}
                      </span>
                    </div>
                    {a.descripcion && <p className="text-slate-700 break-words">{a.descripcion}</p>}
                    <p className="font-mono text-slate-700">
                      Debe {importe(s.debe)} · Haber {importe(s.haber)}
                    </p>
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <Link href={`/dashboard/motor-contable/${a.id}`} className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-800">
                        Ver el asiento <ArrowRight size={14} />
                      </Link>
                      {fac && (
                        <Link href={fac} className="font-medium text-blue-600 hover:text-blue-800">
                          Ver la factura
                        </Link>
                      )}
                      <BotonAprobar a={a} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <ConfirmationModal
        isOpen={!!confirmar.asiento}
        title="Aprobar asiento"
        message={
          confirmar.asiento?.origen === 'FACTURA_GASTO'
            ? `¿Aprobar el asiento ${confirmar.asiento.numeroAsiento}? Quedará en firme y la factura contará en el IVA y en los modelos.`
            : `¿Aprobar el asiento ${confirmar.asiento?.numeroAsiento ?? ''}? Quedará en firme.`
        }
        confirmLabel="Aprobar"
        cancelLabel="Cancelar"
        isLoading={confirmar.cargando}
        onConfirm={() => aprobar()}
        onCancel={() => setConfirmar({ asiento: null, cargando: false })}
      />

      <ToastContainer toasts={toasts} onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  );
}
