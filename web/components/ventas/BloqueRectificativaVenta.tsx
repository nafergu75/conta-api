'use client';

import { useEffect, useRef, useState } from 'react';
import { MagnifyingGlass, Plus, Trash, WarningCircle, X } from '@phosphor-icons/react';
import { errorMessage } from '@/lib/api';
import { formatoImporte } from '@/lib/moneda';
import {
  buscarOriginales,
  type CandidataOriginalVenta,
  conDatos,
  type DatosParaRectificarVenta,
  type EstadoRectificativaVenta,
  GRUPOS_MOTIVO,
  infoMotivo,
  type MotivoVenta,
  type OpcionesRectificativa,
  type OriginalesBuscadasVenta,
  type OriginalVentaForm,
  originalDeCandidata,
  originalDeFuera,
  originalDePartida,
  type ParteReparto,
  type PartidaFueraVenta,
  sustitucionPosible,
  TEXTO_TIPO_R,
  tipoFacturaDe,
} from '@/lib/rectificativasVenta';

/**
 * Bloque «¿Qué rectificas?» de una rectificativa o abono de venta: la factura
 * o facturas que se rectifican (de la app, de fuera de la app o un periodo),
 * el motivo (que decide el tipo R1-R4; R5 en un ticket), la forma (por
 * diferencias o por sustitución) y la explicación que sale en el PDF.
 *
 * Es controlado: el estado lo guarda quien lo usa (Nueva factura o el lector),
 * que también pide los datos de cada original de la app (useDatosOriginales)
 * y se los pasa en `datos`. Los campos llevan los nombres que usa el servidor
 * en details.campo («rectificativa.originales.0.numero»...), con `marca`.
 *
 * `compacto`: para el lector, sin la introducción ni el filtro por fechas.
 * El lector además pregunta la forma a su manera (`sinForma`) y busca la
 * original en toda la empresa (`buscarEnTodas`).
 */

type Marca = (...campos: string[]) => { 'aria-invalid': boolean; 'aria-describedby'?: string };

interface Props {
  valor: EstadoRectificativaVenta;
  onCambio: (e: EstadoRectificativaVenta) => void;
  opciones: OpcionesRectificativa | null;
  /** No se han podido cargar los motivos. */
  errorOpciones?: string;
  onReintentarOpciones?: () => void;
  /** «Rectificativa de un ticket» (R5): solo se buscan simplificadas. */
  ticket: boolean;
  /** Cliente de la factura (elegido a mano o el de la original); null si aún no hay. */
  clienteId: string | null;
  /** Datos de cada original de la app, por id (GET /:id/rectificar). */
  datos: Record<string, DatosParaRectificarVenta>;
  erroresDatos?: Record<string, string>;
  /** Reparto que sale de las líneas, por id de original (con varias). */
  reparto?: Record<string, ParteReparto>;
  /** La rectificativa lleva retención: el reparto la pide también. */
  conRetencion?: boolean;
  /** Moneda de la contabilidad (totales de las facturas y reparto). */
  monedaCuenta: string;
  marca: Marca;
  compacto?: boolean;
  /** Lector: número de la factura rectificada tal como se leyó (para buscarla). */
  numeroLeido?: string | null;
  /** Lector: admite la sustitución de una factura que no está en la app (pide sus importes aparte). */
  sustitucionDeFuera?: boolean;
  /** Último error con el campo que lo causa: el texto se repite junto a ese campo. */
  error?: { campo?: string; mensaje: string } | null;
  /** Sin «¿Cómo la rectificas?»: quien lo usa pregunta la forma (el lector, junto al signo de los importes). */
  sinForma?: boolean;
  /**
   * Lector: busca en todas las facturas emitidas de la empresa, sin filtrar por
   * el cliente leído ni por ticket (la original decide el cliente). `clienteId`
   * sigue sirviendo para sus facturas de 2026 pendientes («No está en la app»).
   */
  buscarEnTodas?: boolean;
  /** Ayuda del reparto entre varias facturas, si no sale de las líneas. */
  textoReparto?: string;
}

const campo =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50';
const etiqueta = 'mb-1 block text-sm font-medium text-slate-700';
const ayuda = 'mt-1 text-xs text-slate-500';
const opcion = (activa: boolean, desactivada = false) =>
  `flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${desactivada ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${
    activa ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
  }`;
const fechaCorta = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
/** Importe para escribir en un campo: con coma decimal y sin miles. */
const enCampo = (n: number) => n.toFixed(2).replace('.', ',');

export default function BloqueRectificativaVenta({
  valor: e,
  onCambio,
  opciones,
  errorOpciones,
  onReintentarOpciones,
  ticket,
  clienteId,
  datos,
  erroresDatos = {},
  reparto,
  conRetencion = false,
  monedaCuenta,
  marca,
  compacto = false,
  numeroLeido,
  sustitucionDeFuera = false,
  error,
  sinForma = false,
  buscarEnTodas = false,
  textoReparto,
}: Props) {
  const fmt = (n: number) => formatoImporte(n, monedaCuenta);
  /** El mensaje del error, junto al campo que lo causa (el campo ya lo lee el lector de pantalla con aria-describedby). */
  const mensaje = (...campos: string[]) =>
    error?.campo && campos.includes(error.campo) ? (
      <p aria-hidden="true" className="mt-1 text-sm text-red-700">
        {error.mensaje}
      </p>
    ) : null;
  const cambiar = (c: Partial<EstadoRectificativaVenta>) => onCambio({ ...e, ...c });
  const info = infoMotivo(opciones, e.motivo);
  const tipoR = tipoFacturaDe(e.motivo, ticket, opciones);
  const originales = e.originales.map((o) => (o.id ? conDatos(o, datos[o.id]) : o));
  const deApp = originales.filter((o) => o.origen === 'app');
  // Todas las de la app son del mismo cliente: el de la primera.
  const clienteFijo = deApp.find((o) => o.customerId)?.customerId ?? null;
  const clienteBusqueda = clienteFijo ?? clienteId ?? null;
  // En el lector se busca en toda la empresa hasta que se elige una de la app.
  const clienteDelBuscador = buscarEnTodas ? clienteFijo : clienteBusqueda;
  const varias = e.que === 'facturas' && e.originales.length > 1;

  const sust = sustitucionPosible(e, datos, info);
  const unaDeFuera = e.que === 'facturas' && e.originales.length === 1 && e.originales[0].origen === 'fuera';
  const sustituible = sust.posible || (sustitucionDeFuera && unaDeFuera && !info?.soloDiferencias);
  const porqueNoSustituir = sust.posible ? '' : sustitucionDeFuera && unaDeFuera ? (info?.soloDiferencias ? sust.porque : '') : sust.porque;

  // Si deja de poder hacerse por sustitución (otra factura, un periodo, un impago...), vuelve a «por diferencias».
  const onCambioRef = useRef(onCambio);
  onCambioRef.current = onCambio;
  useEffect(() => {
    if (e.forma === 'S' && !sustituible) onCambioRef.current({ ...e, forma: 'I' });
    // Solo cuando cambia si se puede.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e.forma, sustituible]);

  const elegirMotivo = (v: string, derecho = false) => {
    const m = (v === 'ERROR' && derecho ? 'ERROR_DERECHO' : v) as MotivoVenta | '';
    const i = infoMotivo(opciones, m);
    cambiar({
      motivo: m,
      ...(i?.soloDiferencias ? { forma: 'I' as const } : {}),
      // El periodo solo vale para un rappel o un descuento por volumen.
      ...(e.que === 'periodo' && i && !i.admitePeriodo ? { que: 'facturas' as const } : {}),
    });
  };

  const elegirQue = (que: 'facturas' | 'periodo') =>
    cambiar({ que, ...(que === 'periodo' ? { forma: 'I' as const, ...(info && !info.admitePeriodo ? { motivo: '' as const } : {}) } : {}) });

  const quitar = (clave: number) => cambiar({ originales: e.originales.filter((o) => o.clave !== clave) });
  const cambiarOriginal = (clave: number, c: Partial<OriginalVentaForm>) =>
    cambiar({ originales: e.originales.map((o) => (o.clave === clave ? { ...o, ...c } : o)) });

  const [mostrarFuera, setMostrarFuera] = useState(false);
  const caben = e.forma !== 'S' || e.originales.length === 0;
  const algunoConPeriodo = !opciones || opciones.motivos.some((m) => m.admitePeriodo && m.disponible);
  const noDisponibles = (opciones?.motivos ?? []).filter((m) => !m.disponible);
  const motivoEnSelect = e.motivo === 'ERROR_DERECHO' ? 'ERROR' : e.motivo;
  // Un motivo nuevo del servidor que no está en ningún grupo sale al final (ERROR_DERECHO va con la casilla de «Error»).
  const agrupados = new Set<string>([...GRUPOS_MOTIVO.flatMap((g) => g.motivos), 'ERROR_DERECHO']);
  const sueltos = (opciones?.motivos ?? []).map((m) => m.codigo).filter((c) => !agrupados.has(c));

  return (
    <section id="rv-bloque" aria-labelledby="rv-titulo" className={`space-y-5 rounded-xl border border-violet-200 bg-white ${compacto ? 'p-4' : 'p-4 md:p-5'}`}>
      <div>
        <h2 id="rv-titulo" className="font-semibold text-slate-900">
          {ticket ? '¿Qué ticket rectificas?' : '¿Qué rectificas?'}
        </h2>
        {!compacto && (
          <p className="mt-1 text-sm text-slate-600">
            {ticket
              ? 'Busca el ticket o la factura simplificada. La rectificativa va en su propia serie, distinta de la R.'
              : 'Busca la factura que corriges. Puedes elegir varias del mismo cliente o, para un rappel, un periodo.'}
          </p>
        )}
      </div>

      {/* Facturas que se rectifican o periodo */}
      <fieldset id="rv-originales" tabIndex={-1} className="space-y-3 focus:outline-none" {...marca('rectificativa.originales', 'rectificativa')}>
        <legend className={etiqueta}>{ticket ? 'Ticket que rectificas' : 'Factura que rectificas'} *</legend>
        {algunoConPeriodo && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className={opcion(e.que === 'facturas')}>
              <input type="radio" name="rv-que" checked={e.que === 'facturas'} onChange={() => elegirQue('facturas')} className="mt-0.5" />
              <span className="font-medium">{ticket ? 'Uno o varios tickets' : 'Una o varias facturas'}</span>
            </label>
            <label className={opcion(e.que === 'periodo')}>
              <input type="radio" name="rv-que" checked={e.que === 'periodo'} onChange={() => elegirQue('periodo')} className="mt-0.5" />
              <span>
                <span className="font-medium">Un periodo</span>
                <span className="block text-xs text-slate-500">Rappel o descuento sobre lo vendido entre dos fechas.</span>
              </span>
            </label>
          </div>
        )}

        {e.que === 'periodo' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="rv-desde" className={etiqueta}>
                Desde *
              </label>
              <input
                id="rv-desde"
                type="date"
                className={campo}
                value={e.periodo.desde}
                onChange={(ev) => cambiar({ periodo: { ...e.periodo, desde: ev.target.value } })}
                {...marca('rectificativa.periodo', 'rectificativa.periodo.desde')}
              />
            </div>
            <div>
              <label htmlFor="rv-hasta" className={etiqueta}>
                Hasta *
              </label>
              <input
                id="rv-hasta"
                type="date"
                className={campo}
                value={e.periodo.hasta}
                onChange={(ev) => cambiar({ periodo: { ...e.periodo, hasta: ev.target.value } })}
                {...marca('rectificativa.periodo.hasta')}
              />
            </div>
            <p className="text-xs text-slate-500 sm:col-span-2">El periodo sale en la factura en lugar del número de cada venta. Elige también el cliente de la rectificativa.</p>
            <div className="sm:col-span-2">{mensaje('rectificativa.periodo', 'rectificativa.periodo.desde', 'rectificativa.periodo.hasta')}</div>
          </div>
        ) : (
          <div className="space-y-3">
            {originales.length > 0 && (
              <ul className="space-y-2">
                {originales.map((o, i) => (
                  <li key={o.clave} id={`rv-original-${i}`} tabIndex={-1} className="rounded-lg border border-slate-200 p-3 focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {o.origen === 'app' ? (
                      <OriginalDeApp o={o} d={o.id ? datos[o.id] : undefined} error={o.id ? erroresDatos[o.id] : undefined} fmt={fmt} onQuitar={() => quitar(o.clave)} />
                    ) : (
                      <OriginalDeFuera o={o} i={i} fmt={fmt} marca={marca} onCambio={(c) => cambiarOriginal(o.clave, c)} onQuitar={() => quitar(o.clave)} />
                    )}
                    {varias && (
                      <Reparto o={o} i={i} propuesto={o.id ? reparto?.[o.id] : undefined} conRetencion={conRetencion} marca={marca} onCambio={(c) => cambiarOriginal(o.clave, c)} />
                    )}
                    {mensaje(...['', '.numero', '.fecha', '.base', '.cuota', '.retencion'].map((s) => `rectificativa.originales.${i}${s}`))}
                  </li>
                ))}
              </ul>
            )}
            {varias && (
              <p className="text-xs text-slate-500">
                {textoReparto ??
                  'Reparto: sale de las líneas de cada factura. Cámbialo solo si quieres repartirlo de otra forma; la suma tiene que dar lo mismo que la rectificativa.'}
              </p>
            )}

            {caben && (
              <BuscadorOriginalesVenta
                ticket={buscarEnTodas ? null : ticket}
                customerId={clienteDelBuscador}
                yaElegidas={deApp.map((o) => o.id ?? '')}
                numeroInicial={e.originales.length === 0 ? numeroLeido ?? '' : ''}
                compacto={compacto}
                monedaCuenta={monedaCuenta}
                onElegir={(c) => cambiar({ originales: [...e.originales, originalDeCandidata(c)] })}
              />
            )}
            {caben && (
              <div>
                <button
                  type="button"
                  aria-expanded={mostrarFuera}
                  aria-controls="rv-fuera"
                  onClick={() => setMostrarFuera((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline"
                >
                  <Plus size={16} /> No está en la app
                </button>
                {mostrarFuera && (
                  <FacturaDeFuera
                    clienteId={clienteBusqueda}
                    ticket={ticket}
                    yaElegidas={e.originales.filter((o) => o.origen === 'fuera').map((o) => o.partidaId ?? '')}
                    monedaCuenta={monedaCuenta}
                    onElegirPartida={(p) => {
                      cambiar({ originales: [...e.originales, originalDePartida(p)] });
                      setMostrarFuera(false);
                    }}
                    onEscribir={() => {
                      cambiar({ originales: [...e.originales, originalDeFuera(e.originales.length === 0 && numeroLeido ? numeroLeido : '')] });
                      setMostrarFuera(false);
                    }}
                  />
                )}
              </div>
            )}
            {e.forma === 'S' && e.originales.length === 1 && <p className="text-xs text-slate-500">Por sustitución se corrige una sola factura.</p>}
          </div>
        )}
        {mensaje('rectificativa.originales', 'rectificativa')}
      </fieldset>

      {/* Motivo y forma */}
      <div className={`grid grid-cols-1 gap-5 ${sinForma ? '' : 'lg:grid-cols-2'}`}>
        <div>
          <label htmlFor="rv-motivo" className={etiqueta}>
            Motivo *
          </label>
          {!opciones ? (
            errorOpciones ? (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                No se han podido cargar los motivos: {errorOpciones}{' '}
                {onReintentarOpciones && (
                  <button type="button" onClick={onReintentarOpciones} className="font-medium underline">
                    Reintentar
                  </button>
                )}
              </p>
            ) : (
              <select id="rv-motivo" className={campo} disabled>
                <option>Cargando los motivos…</option>
              </select>
            )
          ) : (
            <select id="rv-motivo" className={campo} value={motivoEnSelect} onChange={(ev) => elegirMotivo(ev.target.value)} {...marca('rectificativa.motivo', 'tipoFactura')}>
              <option value="">Elige el motivo…</option>
              {[...GRUPOS_MOTIVO, { titulo: 'Más motivos', motivos: sueltos }].map((g) => {
                const lista = g.motivos.map((m) => opciones.motivos.find((x) => x.codigo === m)).filter((m): m is NonNullable<typeof m> => !!m);
                if (!lista.length) return null;
                return (
                  <optgroup key={g.titulo} label={g.titulo}>
                    {lista.map((m) => (
                      <option key={m.codigo} value={m.codigo} disabled={!m.disponible || (e.que === 'periodo' && !m.admitePeriodo)}>
                        {m.texto}
                        {!m.disponible ? ' (todavía no disponible)' : ''}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          )}
          {(e.motivo === 'ERROR' || e.motivo === 'ERROR_DERECHO') && opciones?.motivos.some((m) => m.codigo === 'ERROR_DERECHO' && m.disponible) && (
            <label className="mt-2 flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" className="mt-0.5" checked={e.motivo === 'ERROR_DERECHO'} onChange={(ev) => elegirMotivo('ERROR', ev.target.checked)} />
              <span>
                Fue un error al aplicar la ley (por ejemplo, un tipo de IVA equivocado por interpretar mal la norma), no un error al escribir los datos.
              </span>
            </label>
          )}
          {mensaje('rectificativa.motivo', 'tipoFactura')}
          {info?.ayuda && <p className={ayuda}>{info.ayuda}</p>}
          {tipoR && (
            <p className="mt-1 text-xs text-slate-600">
              Para Hacienda (VERI*FACTU) es una {tipoR}: {TEXTO_TIPO_R[tipoR]}
              {info?.articulo && !ticket ? ` (${info.articulo})` : ''}.
            </p>
          )}
          {info?.aviso && (
            <p className="mt-2 flex gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              <WarningCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" /> {info.aviso}
            </p>
          )}
          {e.que === 'periodo' && <p className={ayuda}>Con un periodo, el motivo es un descuento o un rappel.</p>}
          {noDisponibles.length > 0 && !compacto && (
            <ul className="mt-2 space-y-1 text-xs text-slate-500">
              {noDisponibles.map((m) => (
                <li key={m.codigo}>
                  {m.texto}: {m.aviso ?? 'todavía no se puede hacer desde aquí.'}
                </li>
              ))}
            </ul>
          )}
        </div>

        {!sinForma && (
          <fieldset id="rv-forma" tabIndex={-1} className="focus:outline-none" {...marca('rectificativa.forma')}>
            <legend className={etiqueta}>¿Cómo la rectificas? *</legend>
            <div className="grid grid-cols-1 gap-2">
              <label className={opcion(e.forma === 'I')}>
                <input id="rv-forma-I" type="radio" name="rv-forma" checked={e.forma === 'I'} onChange={() => cambiar({ forma: 'I' })} className="mt-0.5" />
                <span>
                  <span className="font-medium">Por diferencias</span>
                  <span className="block text-xs text-slate-500">Solo lo que cambia: lo devuelto o descontado, en negativo.</span>
                </span>
              </label>
              <label className={opcion(e.forma === 'S', !sustituible)}>
                <input
                  type="radio"
                  name="rv-forma"
                  checked={e.forma === 'S'}
                  disabled={!sustituible}
                  onChange={() => cambiar({ forma: 'S' })}
                  aria-describedby={!sustituible && porqueNoSustituir ? 'rv-forma-porque' : undefined}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Por sustitución</span>
                  <span className="block text-xs text-slate-500">La factura corregida entera, en positivo. Se registra la diferencia con la original.</span>
                </span>
              </label>
            </div>
            {!sustituible && porqueNoSustituir && (
              <p id="rv-forma-porque" className={ayuda}>
                {porqueNoSustituir}
              </p>
            )}
            {mensaje('rectificativa.forma')}
          </fieldset>
        )}
      </div>

      <div>
        <label htmlFor="rv-explicacion" className={etiqueta}>
          Explicación de la causa *
        </label>
        <textarea
          id="rv-explicacion"
          rows={2}
          maxLength={500}
          className={campo}
          value={e.explicacion}
          placeholder="Por ejemplo: el cliente devolvió 2 cajas del pedido 1234"
          onChange={(ev) => cambiar({ explicacion: ev.target.value })}
          {...marca('rectificativa.explicacion')}
        />
        {mensaje('rectificativa.explicacion')}
        <p className={ayuda}>
          {compacto ? 'Queda guardada con la rectificativa. Si la factura trae el motivo, ya lo hemos puesto.' : 'Sale en la factura junto al número de la que rectificas. Hace falta para pasarla a factura.'}
        </p>
      </div>
    </section>
  );
}

function BotonQuitar({ onClick, texto }: { onClick: () => void; texto: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={texto}
      title={texto}
      className="shrink-0 rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
    >
      <Trash size={18} />
    </button>
  );
}

function OriginalDeApp({
  o,
  d,
  error,
  fmt,
  onQuitar,
}: {
  o: OriginalVentaForm;
  d: DatosParaRectificarVenta | undefined;
  error?: string;
  fmt: (n: number) => string;
  onQuitar: () => void;
}) {
  const nombre = o.numero || 'la factura';
  return (
    <div className="space-y-1">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm text-slate-900">
          <span className="font-semibold">{o.numero || 'Cargando la factura…'}</span>
          {o.fecha && <span className="text-slate-600"> del {fechaCorta(o.fecha)}</span>}
          {o.cliente && <span className="block break-words text-slate-600 sm:inline"> · {o.cliente}</span>}
        </p>
        <BotonQuitar onClick={onQuitar} texto={`Quitar ${nombre}`} />
      </div>
      {o.total !== undefined && (
        <p className="text-xs text-slate-600">
          Total {fmt(o.total)}
          {o.restante !== undefined && o.restante !== o.total && <> · queda por rectificar {fmt(o.restante)}</>}
          {d && d.rectificativas.length > 0 && <> · ya rectificada con {d.rectificativas.map((r) => r.numeroCompleto).join(', ')}</>}
          {d && <> · pendiente de cobro {fmt(d.pendienteCobro)}</>}
        </p>
      )}
      {d && !d.rectificable && d.motivoNoRectificable && (
        <p role="alert" className="text-sm text-red-700">
          {d.motivoNoRectificable}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          No se han podido cargar sus datos: {error} Quítala y vuelve a elegirla.
        </p>
      )}
    </div>
  );
}

function OriginalDeFuera({
  o,
  i,
  fmt,
  marca,
  onCambio,
  onQuitar,
}: {
  o: OriginalVentaForm;
  i: number;
  fmt: (n: number) => string;
  marca: Marca;
  onCambio: (c: Partial<OriginalVentaForm>) => void;
  onQuitar: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_11rem_auto] sm:items-end">
      <div>
        <label htmlFor={`rv-original-${i}-numero`} className={etiqueta}>
          Número de la factura *
        </label>
        <input
          id={`rv-original-${i}-numero`}
          className={campo}
          value={o.numero}
          maxLength={60}
          autoComplete="off"
          onChange={(ev) => onCambio({ numero: ev.target.value, partidaId: null, pendientePartida: undefined })}
          {...marca(`rectificativa.originales.${i}`, `rectificativa.originales.${i}.numero`)}
        />
      </div>
      <div>
        <label htmlFor={`rv-original-${i}-fecha`} className={etiqueta}>
          Su fecha *
        </label>
        <input
          id={`rv-original-${i}-fecha`}
          type="date"
          className={campo}
          value={o.fecha}
          onChange={(ev) => onCambio({ fecha: ev.target.value })}
          {...marca(`rectificativa.originales.${i}.fecha`)}
        />
      </div>
      <BotonQuitar onClick={onQuitar} texto={`Quitar la factura ${o.numero.trim() || i + 1}`} />
      <p className="text-xs text-slate-500 sm:col-span-3">
        {o.partidaId
          ? `De la carga de 2026${o.pendientePartida !== undefined ? `, pendiente de cobro ${fmt(o.pendientePartida)}` : ''}: el abono rebaja lo que te debe por ella.`
          : 'No está en la app (por ejemplo, una factura de 2026 que llevaste fuera).'}
      </p>
    </div>
  );
}

function Reparto({
  o,
  i,
  propuesto,
  conRetencion,
  marca,
  onCambio,
}: {
  o: OriginalVentaForm;
  i: number;
  propuesto?: ParteReparto;
  conRetencion: boolean;
  marca: Marca;
  onCambio: (c: Partial<OriginalVentaForm>) => void;
}) {
  const campos: Array<['base' | 'cuota' | 'retencion', string]> = [
    ['base', 'Base que le toca'],
    ['cuota', 'IVA que le toca'],
    ...(conRetencion ? [['retencion', 'Retención'] as ['retencion', string]] : []),
  ];
  return (
    <div className={`mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 ${conRetencion ? 'sm:grid-cols-3' : ''} sm:max-w-lg`}>
      {campos.map(([k, texto]) => (
        <div key={k}>
          <label htmlFor={`rv-original-${i}-${k}`} className="mb-1 block text-xs font-medium text-slate-600">
            {texto}
          </label>
          <input
            id={`rv-original-${i}-${k}`}
            inputMode="decimal"
            className={`${campo} text-right font-mono`}
            value={o[k]}
            placeholder={propuesto ? enCampo(propuesto[k]) : 'Escríbelo'}
            onChange={(ev) => onCambio({ [k]: ev.target.value })}
            {...marca(`rectificativa.originales.${i}.${k}`)}
          />
        </div>
      ))}
    </div>
  );
}

/** Busca entre las facturas emitidas (GET /originales): por número, cliente o NIF y, si se quiere, entre dos fechas. */
function BuscadorOriginalesVenta({
  ticket,
  customerId,
  yaElegidas,
  numeroInicial,
  compacto,
  monedaCuenta,
  onElegir,
}: {
  /** null: tickets y facturas (el lector no sabe todavía si rectifica un ticket). */
  ticket: boolean | null;
  customerId: string | null;
  yaElegidas: string[];
  numeroInicial: string;
  compacto: boolean;
  monedaCuenta: string;
  onElegir: (c: CandidataOriginalVenta) => void;
}) {
  const [q, setQ] = useState(numeroInicial);
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [r, setR] = useState<OriginalesBuscadasVenta | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');
  const peticion = useRef(0);
  const fmt = (n: number) => formatoImporte(n, monedaCuenta);

  useEffect(() => {
    const n = ++peticion.current;
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        // El número leído por el lector se busca como número (coincidencia exacta primero).
        const porNumero = !!numeroInicial && q.trim() === numeroInicial.trim();
        const res = await buscarOriginales({ ...(porNumero ? { numero: q } : { q }), customerId, desde, hasta, ...(ticket === null ? {} : { ticket }), take: 10 });
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
  }, [q, desde, hasta, customerId, ticket, numeroInicial]);

  const lista = (r?.candidatas ?? []).filter((c) => !yaElegidas.includes(c.id));
  const algo = q.trim() || desde || hasta;
  return (
    <div className="space-y-2">
      <label htmlFor="rv-buscar" className="block text-sm font-medium text-slate-700">
        {ticket ? 'Busca el ticket por número, cliente o fecha' : 'Busca la factura por número, cliente o fecha'}
      </label>
      <div className="relative">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          id="rv-buscar"
          type="search"
          value={q}
          onChange={(ev) => setQ(ev.target.value)}
          placeholder={customerId ? 'Número de la factura' : 'Número, nombre o NIF del cliente'}
          className={`${campo} pl-9 pr-9`}
          autoComplete="off"
          aria-describedby="rv-buscar-ayuda"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            aria-label="Limpiar la búsqueda"
          >
            <X size={16} />
          </button>
        )}
      </div>
      <p id="rv-buscar-ayuda" className="text-xs text-slate-500">
        {customerId ? 'Solo salen las del cliente de esta rectificativa.' : 'Salen las facturas ya emitidas de cualquier serie, también las registradas con el lector.'}
      </p>
      {!compacto && (
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <div>
            <label htmlFor="rv-buscar-desde" className="mb-1 block text-xs font-medium text-slate-600">
              Emitida desde
            </label>
            <input id="rv-buscar-desde" type="date" className={campo} value={desde} onChange={(ev) => setDesde(ev.target.value)} />
          </div>
          <div>
            <label htmlFor="rv-buscar-hasta" className="mb-1 block text-xs font-medium text-slate-600">
              Hasta
            </label>
            <input id="rv-buscar-hasta" type="date" className={campo} value={hasta} onChange={(ev) => setHasta(ev.target.value)} />
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <ul aria-label="Facturas encontradas" aria-busy={buscando} className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
        {buscando && !r && <li className="px-3 py-2 text-sm text-slate-500">Buscando…</li>}
        {r && lista.length === 0 && (
          <li className="px-3 py-2 text-sm text-slate-500">
            {algo
              ? `${ticket ? 'No hay ningún ticket emitido' : 'No hay ninguna factura emitida'} que coincida. Si no está en la app, usa «No está en la app».`
              : ticket
                ? 'No hay tickets emitidos que se puedan rectificar.'
                : 'No hay facturas emitidas que se puedan rectificar.'}
          </li>
        )}
        {lista.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              disabled={!c.rectificable}
              onClick={() => onElegir(c)}
              aria-describedby={!c.rectificable ? `rv-cand-${c.id}` : undefined}
              className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-transparent"
            >
              <span className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                {c.numeroCompleto}
                {c.exacta && (
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Coincide</span>
                )}
                {c.origen === 'lector' && <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-normal text-slate-600">Registrada con el lector</span>}
              </span>
              <span className="break-words text-xs text-slate-600">
                {fechaCorta(c.fechaEmision)} · {c.cliente} · {fmt(c.totalFactura)}
                {c.restante !== c.totalFactura && ` · queda ${fmt(c.restante)}`}
                {c.sustituidaPor && ` · sustituida por ${c.sustituidaPor}`}
              </span>
              {!c.rectificable && c.motivoNoRectificable && (
                <span id={`rv-cand-${c.id}`} className="text-xs text-red-700">
                  {c.motivoNoRectificable}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * «No está en la app»: las facturas de 2026 del cliente que trajo la carga y
 * siguen pendientes de cobro (el abono rebaja su pendiente), o el número y la
 * fecha a mano.
 */
function FacturaDeFuera({
  clienteId,
  ticket,
  yaElegidas,
  monedaCuenta,
  onElegirPartida,
  onEscribir,
}: {
  clienteId: string | null;
  ticket: boolean;
  yaElegidas: string[];
  monedaCuenta: string;
  onElegirPartida: (p: PartidaFueraVenta) => void;
  onEscribir: () => void;
}) {
  const [partidas, setPartidas] = useState<PartidaFueraVenta[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!clienteId) {
      setPartidas(null);
      return;
    }
    let vivo = true;
    buscarOriginales({ customerId: clienteId, ticket, take: 1 })
      .then((r) => vivo && setPartidas(r.partidasFuera ?? []))
      .catch((err) => vivo && (setPartidas([]), setError(errorMessage(err))));
    return () => {
      vivo = false;
    };
  }, [clienteId, ticket]);
  const lista = (partidas ?? []).filter((p) => !yaElegidas.includes(p.partidaId));
  return (
    <div id="rv-fuera" className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      {clienteId ? (
        partidas === null ? (
          <p className="text-sm text-slate-500">Buscando sus facturas de 2026 pendientes…</p>
        ) : lista.length > 0 ? (
          <>
            <p className="text-sm text-slate-700">Facturas de 2026 de este cliente que trajo la carga y siguen pendientes de cobro:</p>
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
              {lista.map((p) => (
                <li key={p.partidaId}>
                  <button
                    type="button"
                    onClick={() => onElegirPartida(p)}
                    className="flex w-full flex-wrap items-baseline justify-between gap-x-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-900">{p.numero}</span>
                    <span className="text-xs text-slate-600">
                      {p.fecha ? `${fechaCorta(p.fecha)} · ` : ''}pendiente {formatoImporte(p.pendiente, monedaCuenta)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-slate-600">Este cliente no tiene facturas de 2026 pendientes de cobro en la carga.</p>
        )
      ) : (
        <p className="text-sm text-slate-600">Elige antes el cliente para ver sus facturas de 2026 pendientes de cobro, o escribe el número y la fecha.</p>
      )}
      {error && <p className="text-xs text-red-700">{error}</p>}
      <button type="button" onClick={onEscribir} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline">
        <Plus size={16} /> Escribir su número y su fecha
      </button>
    </div>
  );
}
