'use client';

import { useEffect, useRef, useState } from 'react';
import { MagnifyingGlass, Plus, Trash, X } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { formatoImporte, parseImporte } from '@/lib/moneda';
import {
  CAUSA_INFO,
  CAUSAS_RECTIFICACION,
  calcularTotales,
  type CausaRectificacion,
  type DatosParaRectificar,
  fechaCorta,
  type OriginalesBuscadas,
  TIPOS_IVA_GASTO,
} from '@/lib/compras';
import {
  conOriginalDeFuera,
  type EstadoRectificacion,
  type LineaOriginal,
  lineasDeDatos,
  nuevaClave,
  originalDeCandidata,
  originalDeFuera,
  soloBaja,
} from '@/lib/rectificativasGasto';

/**
 * Bloque «Rectificación» del formulario de Compras (abono o factura
 * rectificativa de un proveedor): por diferencias o por sustitución, causa y
 * motivo, si reduce o aumenta, qué factura rectifica (de la app, de fuera de
 * la app o un periodo) y, con una original de fuera, si ya se le pagó.
 *
 * Al elegir una factura de la app se piden sus datos (GET /:id/rectificar):
 * lo pendiente, lo que se puede abonar y sus líneas (para la sustitución).
 */

const campoBase =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600 focus:border-accent-600 disabled:bg-slate-100 disabled:cursor-not-allowed aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50';
const etiqueta = 'block text-sm font-medium text-slate-700 mb-1';
const ayuda = 'mt-1 text-xs text-slate-500';
const opcion = (activa: boolean) =>
  `flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${activa ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`;

type Marca = (...campos: string[]) => { 'aria-invalid': boolean; 'aria-describedby': string | undefined };

interface Props {
  valor: EstadoRectificacion;
  onCambio: (e: EstadoRectificacion) => void;
  /** Proveedor ya dado de alta (para buscar sus facturas). null: nuevo o sin elegir. */
  proveedorId: string | null;
  /** El total que se registra es negativo (abono): se pregunta si la original de fuera ya está pagada. */
  esAbono: boolean;
  /** Datos de la única original de la app (los pide este bloque); null si no hay una sola. */
  datos: DatosParaRectificar | null;
  onDatos: (d: DatosParaRectificar | null) => void;
  marca: Marca;
  monedaCuenta: string;
  /** Lector: número de la factura que rectifica tal como se leyó (para buscarla). */
  numeroLeido?: string | null;
}

export default function BloqueRectificacion({ valor: e, onCambio, proveedorId, esAbono, datos, onDatos, marca, monedaCuenta, numeroLeido }: Props) {
  const fmt = (n: number) => formatoImporte(n, monedaCuenta);
  const cambiar = (c: Partial<EstadoRectificacion>) => onCambio({ ...e, ...c });
  const causa = e.causa ? CAUSA_INFO[e.causa] : null;
  const admitePeriodo = !!causa?.admitePeriodo && e.tipo === 'I';
  const deApp = e.originales.filter((o) => o.origen === 'app');
  const unaDeApp = e.que === 'facturas' && e.originales.length === 1 && deApp.length === 1 ? deApp[0] : null;

  // Datos de la original de la app (si es una sola): pendiente, abono maximo y lineas.
  const [errorDatos, setErrorDatos] = useState('');
  const idUnica = unaDeApp?.id ?? null;
  const onDatosRef = useRef(onDatos);
  onDatosRef.current = onDatos;
  useEffect(() => {
    if (!idUnica) {
      onDatosRef.current(null);
      return;
    }
    if (datos?.original.id === idUnica) return;
    let vivo = true;
    setErrorDatos('');
    apiFetch<DatosParaRectificar>(companyPath(`/expense-invoices/${encodeURIComponent(idUnica)}/rectificar`))
      .then((d) => vivo && onDatosRef.current(d))
      .catch((err) => {
        if (!vivo) return;
        setErrorDatos(errorMessage(err));
        onDatosRef.current(null);
      });
    return () => {
      vivo = false;
    };
  }, [idUnica, datos?.original.id]);

  // Sustitucion con una original de la app: sus lineas (solo lectura).
  useEffect(() => {
    if (e.tipo !== 'S' || !datos || datos.original.id !== idUnica || e.lineasOriginalDeApp) return;
    onCambio({ ...e, lineasOriginal: lineasDeDatos(datos), lineasOriginalDeApp: true });
    // Solo al llegar los datos o al pasar a sustitucion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e.tipo, datos, idUnica]);

  const elegirCausa = (v: string) => {
    const c = v as CausaRectificacion | '';
    const info = c ? CAUSA_INFO[c] : null;
    cambiar({
      causa: c,
      // Una devolucion o un descuento solo restan.
      ...(info?.soloBaja && e.tipo === 'I' ? { sentido: 'REDUCE' as const } : {}),
      // El periodo solo vale para un rappel o un descuento por volumen.
      ...(!info?.admitePeriodo && e.que === 'periodo' ? { que: 'facturas' as const } : {}),
    });
  };

  const elegirTipo = (t: 'I' | 'S') => {
    if (t === 'S') {
      // Por sustitucion: una sola factura concreta (no un periodo) y sus lineas
      // (las de la app llegan con sus datos; las de fuera se escriben).
      const deFuera = e.originales[0]?.origen !== 'app';
      const escritas = !e.lineasOriginalDeApp && e.lineasOriginal.length ? e.lineasOriginal : [{ clave: nuevaClave(), descripcion: '', cantidad: '1', precio: '', tipoIva: 21, tipoRetencion: 0 }];
      cambiar({
        tipo: 'S',
        que: 'facturas',
        originales: e.originales.slice(0, 1),
        lineasOriginal: deFuera ? escritas : [],
        lineasOriginalDeApp: false,
      });
    } else {
      cambiar({ tipo: 'I', sentido: e.sentido ?? (soloBaja(e) ? 'REDUCE' : null) });
    }
  };

  const quitarOriginal = (clave: number) => {
    const quitada = e.originales.find((o) => o.clave === clave);
    cambiar({
      originales: e.originales.filter((o) => o.clave !== clave),
      ...(quitada?.origen === 'app' && e.lineasOriginalDeApp ? { lineasOriginal: [], lineasOriginalDeApp: false } : {}),
    });
  };

  const sustitucion = e.tipo === 'S';
  const caben = !sustitucion || e.originales.length === 0;

  return (
    <section id="fr-bloque" tabIndex={-1} className="rounded-xl border border-violet-200 bg-white p-4 focus:outline-none md:p-6">
      <h2 className="mb-1 text-base font-semibold text-slate-900">Rectificación</h2>
      <p className="mb-4 text-sm text-slate-600">
        Un abono o una factura rectificativa del proveedor: resta (o suma) de la factura que rectifica, en la contabilidad, en el IVA y en lo que le debes.
      </p>

      {/* Tipo */}
      <fieldset className="mb-5">
        <legend className={etiqueta}>¿Cómo viene la rectificativa? *</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className={opcion(e.tipo === 'I')}>
            <input id="fr-tipo-I" type="radio" name="fr-tipo" checked={e.tipo === 'I'} onChange={() => elegirTipo('I')} className="mt-0.5 accent-emerald-600" {...marca('rectificativa.tipo')} />
            <span>
              <span className="font-medium">Por diferencias</span>
              <span className="block text-xs text-slate-500">Trae solo lo que cambia: lo devuelto, el descuento o la diferencia de precio.</span>
            </span>
          </label>
          <label className={opcion(e.tipo === 'S')}>
            <input type="radio" name="fr-tipo" checked={e.tipo === 'S'} onChange={() => elegirTipo('S')} className="mt-0.5 accent-emerald-600" />
            <span>
              <span className="font-medium">Por sustitución</span>
              <span className="block text-xs text-slate-500">Trae la factura corregida entera: la app calcula la diferencia con la original.</span>
            </span>
          </label>
        </div>
        {!e.tipo && <p className="mt-1 text-xs text-amber-700">Elige una de las dos: según cuál sea, los importes restan o sustituyen a los de la original.</p>}
      </fieldset>

      {/* Causa y motivo */}
      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="fr-causa" className={etiqueta}>
            Causa *
          </label>
          <select id="fr-causa" value={e.causa} onChange={(ev) => elegirCausa(ev.target.value)} {...marca('rectificativa.causa')} className={campoBase}>
            <option value="">Elige la causa…</option>
            {CAUSAS_RECTIFICACION.map((c) => (
              <option key={c} value={c}>
                {CAUSA_INFO[c].texto}
              </option>
            ))}
          </select>
          <p className={ayuda}>Las rectificativas por impago o concurso del proveedor no se registran aquí: consúltalo con tu asesor.</p>
        </div>
        <div>
          <label htmlFor="fr-motivo" className={etiqueta}>
            Motivo
          </label>
          <input
            id="fr-motivo"
            value={e.motivo}
            maxLength={500}
            onChange={(ev) => cambiar({ motivo: ev.target.value })}
            placeholder="Como lo explica el proveedor"
            {...marca('rectificativa.motivo')}
            className={campoBase}
          />
        </div>
      </div>

      {/* Sentido (por diferencias) */}
      {e.tipo === 'I' && (
        <fieldset id="fr-sentido" tabIndex={-1} className="mb-5 focus:outline-none" {...marca('rectificativa.sentido')}>
          <legend className={etiqueta}>¿Qué hace con el importe? *</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className={opcion(e.sentido === 'REDUCE')}>
              <input type="radio" name="fr-sentido" checked={e.sentido === 'REDUCE'} onChange={() => cambiar({ sentido: 'REDUCE' })} className="mt-0.5 accent-emerald-600" />
              <span className="font-medium">Reduce el importe (abono)</span>
            </label>
            <label className={`${opcion(e.sentido === 'AUMENTA')} ${soloBaja(e) ? 'cursor-not-allowed opacity-60' : ''}`}>
              <input
                type="radio"
                name="fr-sentido"
                checked={e.sentido === 'AUMENTA'}
                disabled={soloBaja(e)}
                onChange={() => cambiar({ sentido: 'AUMENTA' })}
                className="mt-0.5 accent-emerald-600"
              />
              <span className="font-medium">Lo aumenta</span>
            </label>
          </div>
          <p className={ayuda}>
            {soloBaja(e)
              ? 'Una devolución, un descuento o un rappel siempre restan.'
              : 'Escribe los importes en positivo. Si una línea va al revés que las demás (por ejemplo, al cambiar el tipo de IVA), escríbela con el signo menos.'}
          </p>
        </fieldset>
      )}

      {/* Que rectifica */}
      <fieldset id="fr-que" tabIndex={-1} className="focus:outline-none" {...marca('rectificativa.originales')}>
        <legend className={etiqueta}>¿Qué rectifica? *</legend>
        {admitePeriodo && (
          <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className={opcion(e.que === 'facturas')}>
              <input type="radio" name="fr-que" checked={e.que === 'facturas'} onChange={() => cambiar({ que: 'facturas' })} className="mt-0.5 accent-emerald-600" />
              <span className="font-medium">Una o varias facturas</span>
            </label>
            <label className={opcion(e.que === 'periodo')}>
              <input type="radio" name="fr-que" checked={e.que === 'periodo'} onChange={() => cambiar({ que: 'periodo' })} className="mt-0.5 accent-emerald-600" />
              <span>
                <span className="font-medium">Un periodo</span>
                <span className="block text-xs text-slate-500">Rappel o descuento por volumen sobre las compras de unas fechas.</span>
              </span>
            </label>
          </div>
        )}

        {e.que === 'periodo' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="fr-desde" className={etiqueta}>
                Desde *
              </label>
              <input
                id="fr-desde"
                type="date"
                value={e.periodo.desde}
                onChange={(ev) => cambiar({ periodo: { ...e.periodo, desde: ev.target.value } })}
                {...marca('rectificativa.periodo')}
                className={campoBase}
              />
            </div>
            <div>
              <label htmlFor="fr-hasta" className={etiqueta}>
                Hasta *
              </label>
              <input
                id="fr-hasta"
                type="date"
                value={e.periodo.hasta}
                onChange={(ev) => cambiar({ periodo: { ...e.periodo, hasta: ev.target.value } })}
                {...marca('rectificativa.periodo.hasta')}
                className={campoBase}
              />
            </div>
            <p className="text-xs text-slate-500 sm:col-span-2">
              Si el periodo abarca varios meses, la app reparte el importe por meses según lo que le compraste a este proveedor cada mes (lo necesita el modelo 349).
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {e.originales.length > 0 && (
              <ul className="flex flex-col gap-2">
                {e.originales.map((o, i) => (
                  <li key={o.clave} className="rounded-lg border border-slate-200 p-3">
                    {o.origen === 'app' ? (
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="min-w-0 text-sm text-slate-900">
                          <span className="font-medium">{o.numero || o.numeroCompleto}</span>
                          <span className="text-slate-600">
                            {' '}
                            del {fechaCorta(o.fecha)}
                            {o.numeroCompleto ? ` (registro ${o.numeroCompleto})` : ''}
                            {o.total !== undefined ? ` · ${fmt(o.total)}` : ''}
                          </span>
                        </p>
                        <BotonQuitar onClick={() => quitarOriginal(o.clave)} texto={`Quitar la factura ${o.numero || o.numeroCompleto}`} />
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_11rem_auto] sm:items-end">
                        <div>
                          <label htmlFor={`fr-onum-${o.clave}`} className={etiqueta}>
                            Nº de la factura que rectifica *
                          </label>
                          <input
                            id={`fr-onum-${o.clave}`}
                            value={o.numero}
                            maxLength={60}
                            onChange={(ev) => cambiar({ originales: e.originales.map((x) => (x.clave === o.clave ? { ...x, numero: ev.target.value } : x)) })}
                            {...marca(`rectificativa.originales.${i}.numero`)}
                            className={campoBase}
                            autoComplete="off"
                          />
                        </div>
                        <div>
                          <label htmlFor={`fr-ofecha-${o.clave}`} className={etiqueta}>
                            Su fecha *
                          </label>
                          <input
                            id={`fr-ofecha-${o.clave}`}
                            type="date"
                            value={o.fecha}
                            onChange={(ev) => cambiar({ originales: e.originales.map((x) => (x.clave === o.clave ? { ...x, fecha: ev.target.value } : x)) })}
                            {...marca(`rectificativa.originales.${i}.fecha`)}
                            className={campoBase}
                          />
                        </div>
                        <BotonQuitar onClick={() => quitarOriginal(o.clave)} texto="Quitar esta factura" />
                        <p className="text-xs text-slate-500 sm:col-span-3">No está en la app (por ejemplo, una factura de 2026 que llevaste fuera).</p>
                      </div>
                    )}
                    {e.originales.length > 1 && (
                      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 sm:max-w-md">
                        <div>
                          <label htmlFor={`fr-obase-${o.clave}`} className="mb-1 block text-xs font-medium text-slate-600">
                            Base que le toca
                          </label>
                          <input
                            id={`fr-obase-${o.clave}`}
                            inputMode="decimal"
                            value={o.base}
                            placeholder="Automático"
                            onChange={(ev) => cambiar({ originales: e.originales.map((x) => (x.clave === o.clave ? { ...x, base: ev.target.value } : x)) })}
                            {...marca(`rectificativa.originales.${i}.base`)}
                            className={`${campoBase} text-right`}
                          />
                        </div>
                        <div>
                          <label htmlFor={`fr-ocuota-${o.clave}`} className="mb-1 block text-xs font-medium text-slate-600">
                            IVA que le toca
                          </label>
                          <input
                            id={`fr-ocuota-${o.clave}`}
                            inputMode="decimal"
                            value={o.cuota}
                            placeholder="Automático"
                            onChange={(ev) => cambiar({ originales: e.originales.map((x) => (x.clave === o.clave ? { ...x, cuota: ev.target.value } : x)) })}
                            {...marca(`rectificativa.originales.${i}.cuota`)}
                            className={`${campoBase} text-right`}
                          />
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {e.originales.length > 1 && (
              <p className="text-xs text-slate-500">
                Reparto entre las facturas: déjalo en «Automático» y la app lo reparte según lo que quede pendiente de cada una. Si lo escribes, la suma tiene que dar la base y el IVA del
                abono.
              </p>
            )}

            {caben && <BuscadorOriginales proveedorId={proveedorId} yaElegidas={deApp.map((o) => o.id ?? '')} numeroLeido={numeroLeido} onElegir={(c) => cambiar({ originales: [...e.originales, originalDeCandidata(c)] })} />}
            {caben && (
              <button
                type="button"
                onClick={() => cambiar({ originales: [...e.originales, originalDeFuera(e.originales.length === 0 && numeroLeido ? numeroLeido : '')] })}
                className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-accent-600 hover:text-accent-700"
              >
                <Plus size={16} /> {e.originales.length ? 'Añadir otra factura que no está en la app' : 'No está en la app: escribir su número y fecha'}
              </button>
            )}
          </div>
        )}
      </fieldset>

      {/* Datos de la original de la app */}
      {errorDatos && <p className="mt-3 text-sm text-rose-700">{errorDatos}</p>}
      {datos && unaDeApp && datos.original.id === unaDeApp.id && (
        <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          {datos.original.numero ?? datos.original.numeroCompleto}: total {fmt(datos.original.totalFactura)}
          {datos.rectificativas.length > 0 && `, ya rectificada en ${fmt(datos.yaRectificado)} (${datos.rectificativas.map((r) => r.numero ?? r.numeroCompleto).join(', ')})`}. Pendiente de pago:{' '}
          {fmt(datos.pendiente)}. Puedes abonar como mucho {fmt(datos.abonoMaximo)}.
          {datos.pendiente <= 0 && ' Ya está pagada: lo que abone quedará a tu favor.'}
        </p>
      )}

      {/* ¿Ya pagada? (original de fuera) */}
      {esAbono && conOriginalDeFuera(e) && (
        <fieldset id="fr-yapagada" tabIndex={-1} className="mt-5 focus:outline-none" {...marca('rectificativa.yaPagada')}>
          <legend className={etiqueta}>¿Ya has pagado {e.originales.filter((o) => o.origen === 'fuera').length > 1 ? 'esas facturas' : `la ${e.originales.find((o) => o.origen === 'fuera')?.numero.trim() || 'factura'}`}? *</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className={opcion(e.yaPagada === true)}>
              <input type="radio" name="fr-yapagada" checked={e.yaPagada === true} onChange={() => cambiar({ yaPagada: true })} className="mt-0.5 accent-emerald-600" />
              <span>
                <span className="font-medium">Sí, queda a mi favor</span>
                <span className="block text-xs text-slate-500">El proveedor te lo devolverá o lo descontará de otra factura.</span>
              </span>
            </label>
            <label className={opcion(e.yaPagada === false)}>
              <input type="radio" name="fr-yapagada" checked={e.yaPagada === false} onChange={() => cambiar({ yaPagada: false })} className="mt-0.5 accent-emerald-600" />
              <span>
                <span className="font-medium">No, se descuenta de lo que le debo</span>
                <span className="block text-xs text-slate-500">Le pagarás esa factura con el abono ya restado.</span>
              </span>
            </label>
          </div>
        </fieldset>
      )}
    </section>
  );
}

function BotonQuitar({ onClick, texto }: { onClick: () => void; texto: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={texto} title={texto} className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600">
      <Trash size={18} />
    </button>
  );
}

/** Busca entre las facturas del proveedor (GET /originales): las del mismo número y las parecidas; sin número, las últimas. */
function BuscadorOriginales({
  proveedorId,
  yaElegidas,
  numeroLeido,
  onElegir,
}: {
  proveedorId: string | null;
  yaElegidas: string[];
  numeroLeido?: string | null;
  onElegir: (c: OriginalesBuscadas['candidatas'][number]) => void;
}) {
  const [q, setQ] = useState(numeroLeido ?? '');
  const [r, setR] = useState<OriginalesBuscadas | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');
  const peticion = useRef(0);

  useEffect(() => {
    if (!proveedorId) {
      setR(null);
      return;
    }
    const n = ++peticion.current;
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const res = await apiFetch<OriginalesBuscadas>(companyPath(`/expense-invoices/originales?supplierId=${encodeURIComponent(proveedorId)}&numero=${encodeURIComponent(q.trim())}`));
        if (n === peticion.current) {
          setR(res);
          setError('');
        }
      } catch (err) {
        if (n === peticion.current) setError(errorMessage(err));
      } finally {
        if (n === peticion.current) setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, proveedorId]);

  if (!proveedorId) {
    return <p className="text-sm text-slate-600">Elige antes el proveedor (arriba) para buscar sus facturas. Si es nuevo o la factura no está en la app, escribe su número y su fecha.</p>;
  }
  const lista = (r?.candidatas ?? []).filter((c) => !yaElegidas.includes(c.id));
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="fr-buscar" className="text-sm font-medium text-slate-700">
        Busca la factura por su número
      </label>
      <div className="relative">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input id="fr-buscar" value={q} onChange={(ev) => setQ(ev.target.value)} placeholder="Número que puso el proveedor" className={`${campoBase} pl-9 pr-9`} autoComplete="off" />
        {q && (
          <button type="button" onClick={() => setQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label="Limpiar la búsqueda">
            <X size={16} />
          </button>
        )}
      </div>
      {error && <p className="text-sm text-rose-700">{error}</p>}
      <ul className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200">
        {buscando && !r && <li className="px-3 py-2 text-sm text-slate-500">Buscando...</li>}
        {r && lista.length === 0 && (
          <li className="px-3 py-2 text-sm text-slate-500">{q.trim() ? 'No hay ninguna factura de este proveedor con ese número.' : 'Este proveedor no tiene más facturas en la app.'}</li>
        )}
        {lista.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => onElegir(c)} className="flex w-full flex-wrap items-baseline justify-between gap-x-3 px-3 py-2 text-left text-sm hover:bg-slate-50">
              <span className="font-medium text-slate-900">
                {c.numero ?? c.numeroCompleto}
                {c.exacta && <span className="ml-2 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Coincide</span>}
              </span>
              <span className="text-xs text-slate-500">
                {fechaCorta(c.fecha)} · registro {c.numeroCompleto} · {formatoImporte(c.total, 'EUR')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Sustitución: las líneas de la factura original. Si es de la app, de solo
 * lectura; si no, se escriben para que la app calcule la diferencia.
 */
export function LineasOriginal({
  lineas,
  deApp,
  onCambio,
  marca,
  monedaCuenta,
  numero,
}: {
  lineas: LineaOriginal[];
  deApp: boolean;
  onCambio: (ls: LineaOriginal[]) => void;
  marca: Marca;
  monedaCuenta: string;
  numero: string;
}) {
  const fmt = (n: number) => formatoImporte(n, monedaCuenta);
  const valores = lineas.map((l) => ({ cantidad: parseImporte(l.cantidad), precioUnitario: parseImporte(l.precio), tipoIva: l.tipoIva, tipoRetencion: l.tipoRetencion }));
  const ok = valores.every((v) => Number.isFinite(v.cantidad) && Number.isFinite(v.precioUnitario));
  const t = ok ? calcularTotales(valores) : null;
  const cambiar = (clave: number, c: Partial<LineaOriginal>) => onCambio(lineas.map((l) => (l.clave === clave ? { ...l, ...c } : l)));
  return (
    <section id="fr-lorig" tabIndex={-1} className="rounded-xl border border-slate-200 bg-white p-4 focus:outline-none md:p-6" {...marca('rectificativa.importesOriginales')}>
      <h2 className="mb-1 text-base font-semibold text-slate-900">Factura original{numero ? ` (${numero})` : ''}</h2>
      <p className="mb-4 text-sm text-slate-600">
        {deApp ? 'Sus importes, tal como están registrados.' : 'No está en la app: escribe sus líneas tal como estaban, para calcular la diferencia con la corregida.'}
      </p>
      {deApp ? (
        <ul className="divide-y divide-slate-100 text-sm">
          {lineas.map((l) => (
            <li key={l.clave} className="flex flex-wrap justify-between gap-x-3 py-1.5">
              <span className="min-w-0 break-words text-slate-900">{l.descripcion}</span>
              <span className="font-mono text-slate-600">
                {l.cantidad} × {fmt(parseImporte(l.precio))} · IVA {l.tipoIva} %{l.tipoRetencion ? ` · IRPF ${l.tipoRetencion} %` : ''}
              </span>
            </li>
          ))}
          {lineas.length === 0 && <li className="py-1.5 text-slate-500">Cargando sus líneas...</li>}
        </ul>
      ) : (
        <div className="flex flex-col gap-3">
          {lineas.map((l, i) => (
            <div key={l.clave} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-12 md:items-end">
              <div className="col-span-2 md:col-span-5">
                <label htmlFor={`fr-ldesc-${l.clave}`} className="mb-1 block text-xs font-medium text-slate-600">
                  Descripción
                </label>
                <input id={`fr-ldesc-${l.clave}`} value={l.descripcion} onChange={(ev) => cambiar(l.clave, { descripcion: ev.target.value })} className={campoBase} />
              </div>
              <div className="md:col-span-2">
                <label htmlFor={`fr-lcant-${l.clave}`} className="mb-1 block text-xs font-medium text-slate-600">
                  Cantidad
                </label>
                <input id={`fr-lcant-${l.clave}`} inputMode="decimal" value={l.cantidad} onChange={(ev) => cambiar(l.clave, { cantidad: ev.target.value })} className={`${campoBase} text-right`} />
              </div>
              <div className="md:col-span-2">
                <label htmlFor={`fr-lprecio-${l.clave}`} className="mb-1 block text-xs font-medium text-slate-600">
                  Precio (sin IVA)
                </label>
                <input
                  id={`fr-lprecio-${l.clave}`}
                  inputMode="decimal"
                  value={l.precio}
                  placeholder="0,00"
                  onChange={(ev) => cambiar(l.clave, { precio: ev.target.value })}
                  {...marca(`rectificativa.importesOriginales.lineas.${i}.precioUnitario`)}
                  className={`${campoBase} text-right`}
                />
              </div>
              <div className="md:col-span-2">
                <label htmlFor={`fr-liva-${l.clave}`} className="mb-1 block text-xs font-medium text-slate-600">
                  IVA
                </label>
                <select id={`fr-liva-${l.clave}`} value={l.tipoIva} onChange={(ev) => cambiar(l.clave, { tipoIva: Number(ev.target.value) })} className={campoBase}>
                  {TIPOS_IVA_GASTO.map((t) => (
                    <option key={t} value={t}>
                      {t} %
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end md:col-span-1">
                <BotonQuitar onClick={() => onCambio(lineas.length > 1 ? lineas.filter((x) => x.clave !== l.clave) : lineas)} texto={`Quitar la línea ${i + 1} de la original`} />
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onCambio([...lineas, { clave: nuevaClave(), descripcion: '', cantidad: '1', precio: '', tipoIva: lineas[lineas.length - 1]?.tipoIva ?? 21, tipoRetencion: 0 }])}
            className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-accent-600 hover:text-accent-700"
          >
            <Plus size={16} /> Añadir línea
          </button>
        </div>
      )}
      {t && lineas.length > 0 && (
        <p className="mt-3 text-sm text-slate-700">
          Base {fmt(t.base)} · IVA {fmt(t.iva)}
          {t.retencion ? ` · IRPF −${fmt(t.retencion)}` : ''} · <span className="font-semibold">Total {fmt(t.total)}</span>
        </p>
      )}
    </section>
  );
}
