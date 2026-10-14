'use client';

import { useEffect } from 'react';
import { ArrowCounterClockwise, CheckCircle, Plus, Trash, WarningCircle } from '@phosphor-icons/react';
import { CuentaLinea } from '@/components/contabilidad/CuentaLinea';
import type { CatalogoCuentas } from '@/lib/subcuentas';
import { euros, porcentaje, type NivelValidacion } from '@/lib/lecturas';
import {
  cuadre,
  hayCambios,
  lineaVacia,
  marcaVigente,
  TIPOS_IVA_VENTA,
  type CampoForm,
  type ErrorCorreccion,
  type EstadoCorreccion,
  type LineaCorreccion,
  type MarcasCorreccion,
} from '@/lib/correccionVenta';

/**
 * Lector de ventas: «Corregir los datos» de una factura mal leída o
 * «Rellenarla a mano» cuando no se ha podido leer (lib/correccionVenta.ts).
 *
 * Se corrigen el número, las fechas, el concepto, las líneas (descripción,
 * base, tipo de IVA y cuenta), la retención y el total. El cuadre se recalcula
 * al momento, con el mismo reparto del IVA que el servidor. Los datos que el
 * lector no pudo confirmar van en ámbar (o en rojo) y la marca se apaga al
 * cambiarlos. «Volver a lo leído» deshace todo, también las cuentas.
 *
 * A 375 px cada línea es una tarjeta; con sitio (container query del bloque),
 * descripción, base, IVA y «Quitar» van en una fila.
 */

interface Props {
  /** Lo leído (vacío si se rellena a mano): con esto se ve qué se ha cambiado. */
  leido: EstadoCorreccion;
  valor: EstadoCorreccion;
  onCambio: (e: EstadoCorreccion) => void;
  /** Las marcas de la lectura (lib/correccionVenta: marcasDeLaLectura). */
  marcas: MarcasCorreccion;
  /** Rellenada a mano: no hay nada leído a lo que volver. */
  aMano: boolean;
  /** Empresa establecida en España (si no, las ventas van sin IVA español). */
  espanola: boolean;
  /** Las bases pueden ir en negativo (rectificativa o abono leído). */
  negativos: boolean;
  catalogo: CatalogoCuentas;
  puedeCrearCuenta: boolean;
  /** La cuenta de una línea sin cuenta elegida, y por qué («la de ventas»). */
  cuentaPorDefecto: (tipoIva: number) => { codigo: string; texto: string };
  /** El error que hay que enseñar junto a su campo (de la comprobación o del servidor). */
  error: ErrorCorreccion | null;
  /** Sube con cada error nuevo: el foco va a su campo. */
  intento: number;
  /** «Volver a lo leído», ya confirmado. */
  onVolver: () => void;
  disabled?: boolean;
}

const campoBase =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100 disabled:text-slate-500 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50 data-[lector=revisar]:border-amber-500 data-[lector=revisar]:bg-amber-50 data-[lector=error]:border-red-500 data-[lector=error]:bg-red-50';
const etiqueta = 'mb-1 block text-sm font-medium text-slate-700';
const ayuda = 'mt-1 text-xs text-slate-500';

/** Líneas: tarjeta en estrecho; con 34rem de bloque, una fila (las clases van enteras para Tailwind). */
const L = {
  contenedor: 'flex flex-col gap-3 [container-name:cvlineas] [container-type:inline-size]',
  fila: 'grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-3 [@container_cvlineas_(min-width:34rem)]:grid-cols-[minmax(0,1fr)_8.5rem_7.5rem_2.75rem] [@container_cvlineas_(min-width:34rem)]:items-end',
  descripcion: 'col-span-2 [@container_cvlineas_(min-width:34rem)]:col-span-1',
  quitar: 'col-span-2 flex justify-end [@container_cvlineas_(min-width:34rem)]:col-span-1',
  cuenta: 'col-span-full',
};

/** Id del control de cada campo (details.campo del servidor o de la comprobación). */
export function idDelCampo(campo: string, e: EstadoCorreccion): string {
  const fijo: Record<string, string> = {
    correcciones: 'cv-form',
    'correcciones.numero': 'cv-numero',
    serie: 'cv-numero',
    'correcciones.fechaEmision': 'cv-fecha',
    'correcciones.fechaVencimiento': 'cv-venc',
    'correcciones.concepto': 'cv-concepto',
    'correcciones.lineas': 'cv-lineas',
    'correcciones.tipoRetencion': 'cv-retencion',
    'correcciones.total': 'cv-total',
  };
  if (fijo[campo]) return fijo[campo];
  const m = /^(?:correcciones\.)?lineas\.(\d+)(?:\.(descripcion|base|tipoIva|cuenta))?$/.exec(campo);
  if (m) {
    const l = e.lineas[Number(m[1])];
    if (!l) return 'cv-lineas';
    const parte = m[2] === 'tipoIva' ? 'iva' : m[2] === 'descripcion' ? 'desc' : m[2] === 'cuenta' ? 'cuenta' : 'base';
    return `cv-linea-${l.clave}-${parte}`;
  }
  return 'cv-form';
}

export default function CorreccionVenta({
  leido,
  valor: e,
  onCambio,
  marcas,
  aMano,
  espanola,
  negativos,
  catalogo,
  puedeCrearCuenta,
  cuentaPorDefecto,
  error,
  intento,
  onVolver,
  disabled,
}: Props) {
  const q = cuadre(e);
  const cambiado = hayCambios(leido, e) || e.lineas.some((l) => l.cuenta);
  const idError = error ? idDelCampo(error.campo, e) : null;

  // Tras un error, su campo se pone a la vista y recibe el foco.
  useEffect(() => {
    if (!intento || !idError) return;
    const el = document.getElementById(idError);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.focus({ preventScroll: true });
    // Solo con cada error nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intento]);

  /** aria-invalid y, con el error, su mensaje; si no, la marca de la lectura mientras siga con el valor leído. */
  const marca = (id: string, campoMarca: CampoForm | null) => {
    if (idError === id) return { 'aria-invalid': true as const, 'aria-describedby': `${id}-error` };
    const nivel: NivelValidacion | undefined = campoMarca ? marcaVigente(marcas, campoMarca, leido, e) : undefined;
    return nivel ? { 'aria-invalid': false as const, 'data-lector': nivel, 'aria-describedby': 'cv-marcas' } : { 'aria-invalid': false as const };
  };
  const mensaje = (id: string) =>
    idError === id && error ? (
      <p id={`${id}-error`} className="mt-1 flex items-start gap-1 text-sm text-red-700">
        <WarningCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>{error.mensaje}</span>
      </p>
    ) : null;

  const poner = (c: Partial<EstadoCorreccion>) => onCambio({ ...e, ...c });
  const ponerLinea = (clave: number, c: Partial<LineaCorreccion>) => poner({ lineas: e.lineas.map((l) => (l.clave === clave ? { ...l, ...c } : l)) });
  const quitarLinea = (clave: number) => {
    const i = e.lineas.findIndex((l) => l.clave === clave);
    poner({ lineas: e.lineas.filter((l) => l.clave !== clave) });
    // El foco va a la línea de al lado (o a «Añadir línea»), no se pierde.
    requestAnimationFrame(() => {
      const sig = e.lineas[i + 1] ?? e.lineas[i - 1];
      document.getElementById(sig && sig.clave !== clave ? `cv-linea-${sig.clave}-desc` : 'cv-anadir')?.focus();
    });
  };
  const anadirLinea = () => {
    const nueva = lineaVacia(espanola ? (e.lineas[e.lineas.length - 1]?.tipoIva ?? 21) : 0);
    poner({ lineas: [...e.lineas, nueva] });
    requestAnimationFrame(() => document.getElementById(`cv-linea-${nueva.clave}-desc`)?.focus());
  };
  const volver = () => {
    if (cambiado && !window.confirm('Se deshacen los cambios y se vuelve a lo que se leyó en la factura, con las cuentas de siempre. ¿Seguir?')) return;
    onVolver();
  };

  const hayMarcas = Object.values(marcas).some(Boolean);
  const diferencia = q.diferencia;

  return (
    <section id="cv-form" tabIndex={-1} aria-labelledby="cv-titulo" className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4 focus:outline-none">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id="cv-titulo" className="font-semibold text-slate-900">
            {aMano ? 'Datos de la factura' : 'Corregir los datos'}
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            {aMano
              ? 'Escríbelos mirando el archivo. Se registra como una venta leída, con su número y sin VERI*FACTU.'
              : 'Cambia lo que esté mal. Se vuelve a comprobar todo al registrarla, y queda anotado qué has corregido.'}
          </p>
        </div>
        {!aMano && (
          <button
            type="button"
            onClick={volver}
            disabled={disabled}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 sm:min-h-0"
          >
            <ArrowCounterClockwise size={16} aria-hidden="true" /> Volver a lo leído
          </button>
        )}
      </div>

      {hayMarcas && (
        <p id="cv-marcas" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Lo que el lector no ha podido confirmar va marcado: en ámbar, lo que conviene comprobar con la factura; en rojo, lo que falta o no cuadra. La marca se quita al
          cambiar el dato.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="cv-numero" className={etiqueta}>
            Número de factura *
          </label>
          <input
            id="cv-numero"
            value={e.numero}
            maxLength={60}
            autoComplete="off"
            disabled={disabled}
            onChange={(ev) => poner({ numero: ev.target.value })}
            {...marca('cv-numero', 'correcciones.numero')}
            className={`${campoBase} font-mono`}
          />
          <p className={ayuda}>Tal como aparece en la factura (por ejemplo, F2026/0012).</p>
          {mensaje('cv-numero')}
        </div>
        <div>
          <label htmlFor="cv-fecha" className={etiqueta}>
            Fecha de la factura *
          </label>
          <input
            id="cv-fecha"
            type="date"
            value={e.fechaEmision}
            disabled={disabled}
            onChange={(ev) => poner({ fechaEmision: ev.target.value })}
            {...marca('cv-fecha', 'correcciones.fechaEmision')}
            className={campoBase}
          />
          {mensaje('cv-fecha')}
        </div>
        <div>
          <label htmlFor="cv-venc" className={etiqueta}>
            Vencimiento
          </label>
          <input
            id="cv-venc"
            type="date"
            value={e.fechaVencimiento}
            disabled={disabled}
            onChange={(ev) => poner({ fechaVencimiento: ev.target.value })}
            {...marca('cv-venc', 'correcciones.fechaVencimiento')}
            className={campoBase}
          />
          <p className={ayuda}>Déjalo vacío si la factura no lo indica.</p>
          {mensaje('cv-venc')}
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="cv-concepto" className={etiqueta}>
            Concepto
          </label>
          <input
            id="cv-concepto"
            value={e.concepto}
            maxLength={500}
            disabled={disabled}
            onChange={(ev) => poner({ concepto: ev.target.value })}
            {...marca('cv-concepto', 'correcciones.concepto')}
            className={campoBase}
          />
          <p className={ayuda}>Va en las observaciones y en las líneas que dejes sin descripción.</p>
          {mensaje('cv-concepto')}
        </div>
      </div>

      <fieldset id="cv-lineas" tabIndex={-1} aria-describedby={idError === 'cv-lineas' ? 'cv-lineas-error' : undefined} className="min-w-0 focus:outline-none">
        <legend className="font-semibold text-slate-900">{e.lineas.length === 1 ? 'Línea de la factura' : 'Líneas de la factura'}</legend>
        <p className="mb-3 mt-0.5 text-sm text-slate-600">
          Base sin IVA de cada línea{negativos ? ' (en negativo si resta, como en la factura)' : ''}. El IVA se calcula por cada tipo, igual que al registrarla.
        </p>
        <div className={L.contenedor}>
          {e.lineas.map((l, i) => {
            const id = `cv-linea-${l.clave}`;
            return (
              <div key={l.clave} className={L.fila}>
                <div className={L.descripcion}>
                  <label htmlFor={`${id}-desc`} className={etiqueta}>
                    Descripción <span className="sr-only">de la línea {i + 1}</span>
                  </label>
                  <input
                    id={`${id}-desc`}
                    value={l.descripcion}
                    maxLength={500}
                    disabled={disabled}
                    placeholder={e.concepto.trim() || 'La del concepto'}
                    onChange={(ev) => ponerLinea(l.clave, { descripcion: ev.target.value })}
                    {...marca(`${id}-desc`, null)}
                    className={campoBase}
                  />
                  {mensaje(`${id}-desc`)}
                </div>
                <div>
                  <label htmlFor={`${id}-base`} className={etiqueta}>
                    Base <span className="sr-only">de la línea {i + 1}</span>
                  </label>
                  <input
                    id={`${id}-base`}
                    inputMode="decimal"
                    autoComplete="off"
                    value={l.base}
                    placeholder="0,00"
                    disabled={disabled}
                    onChange={(ev) => ponerLinea(l.clave, { base: ev.target.value })}
                    {...marca(`${id}-base`, `linea:${l.clave}.base`)}
                    className={`${campoBase} text-right font-mono`}
                  />
                  {mensaje(`${id}-base`)}
                </div>
                <div>
                  <label htmlFor={`${id}-iva`} className={etiqueta}>
                    IVA <span className="sr-only">de la línea {i + 1}</span>
                  </label>
                  <select
                    id={`${id}-iva`}
                    value={l.tipoIva}
                    disabled={disabled || !espanola}
                    onChange={(ev) => ponerLinea(l.clave, { tipoIva: Number(ev.target.value) })}
                    {...marca(`${id}-iva`, `linea:${l.clave}.tipoIva`)}
                    className={campoBase}
                  >
                    {(espanola ? TIPOS_IVA_VENTA : [0]).map((t) => (
                      <option key={t} value={t}>
                        {t === 0 ? (espanola ? 'Exento' : 'Sin IVA') : porcentaje(t)}
                      </option>
                    ))}
                  </select>
                  {mensaje(`${id}-iva`)}
                </div>
                <div className={L.quitar}>
                  <button
                    type="button"
                    onClick={() => quitarLinea(l.clave)}
                    disabled={disabled || e.lineas.length === 1}
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-40 sm:min-h-[40px] sm:min-w-[40px]"
                    aria-label={`Quitar la línea ${i + 1}`}
                    title="Quitar la línea"
                  >
                    <Trash size={18} aria-hidden="true" />
                  </button>
                </div>
                <div className={L.cuenta}>
                  <CuentaLinea
                    tipo="venta"
                    catalogo={catalogo}
                    valor={l.cuenta}
                    onCambiar={(codigo) => ponerLinea(l.clave, { cuenta: codigo })}
                    porDefecto={cuentaPorDefecto(l.tipoIva)}
                    linea={i + 1}
                    id={`${id}-cuenta`}
                    puedeCrear={puedeCrearCuenta}
                    invalido={idError === `${id}-cuenta`}
                    disabled={disabled}
                  />
                  {mensaje(`${id}-cuenta`)}
                </div>
              </div>
            );
          })}
        </div>
        {idError === 'cv-lineas' && error && (
          <p id="cv-lineas-error" className="mt-2 flex items-start gap-1 text-sm text-red-700">
            <WarningCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{error.mensaje}</span>
          </p>
        )}
        <button
          id="cv-anadir"
          type="button"
          onClick={anadirLinea}
          disabled={disabled || e.lineas.length >= 50}
          className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-accent-600 hover:text-accent-700 disabled:opacity-50 sm:min-h-0"
        >
          <Plus size={16} aria-hidden="true" /> Añadir línea
        </button>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(espanola || e.tipoRetencion.trim() !== '0') && (
          <div>
            <label htmlFor="cv-retencion" className={etiqueta}>
              Retención de IRPF (%)
            </label>
            <input
              id="cv-retencion"
              inputMode="decimal"
              autoComplete="off"
              value={e.tipoRetencion}
              disabled={disabled}
              onChange={(ev) => poner({ tipoRetencion: ev.target.value })}
              {...marca('cv-retencion', 'correcciones.tipoRetencion')}
              className={`${campoBase} text-right font-mono`}
            />
            <p className={ayuda}>Una sola para toda la factura. Pon 0 si no lleva.</p>
            {mensaje('cv-retencion')}
          </div>
        )}
        <div>
          <label htmlFor="cv-total" className={etiqueta}>
            Total a cobrar *
          </label>
          <input
            id="cv-total"
            inputMode="decimal"
            autoComplete="off"
            value={e.total}
            placeholder="0,00"
            disabled={disabled}
            onChange={(ev) => poner({ total: ev.target.value })}
            {...marca('cv-total', 'correcciones.total')}
            className={`${campoBase} text-right font-mono`}
          />
          <p className={ayuda}>El que pone la factura: con el IVA y ya descontada la retención.</p>
          {mensaje('cv-total')}
        </div>
      </div>

      {/* Cuadre al momento: lo anuncia el lector de pantalla sin mover el foco. */}
      <div
        role="status"
        className={`rounded-lg border p-3 text-sm ${
          !q.completo || !Number.isFinite(q.escrito)
            ? 'border-slate-200 bg-slate-50 text-slate-700'
            : q.cuadra
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-amber-200 bg-amber-50 text-amber-800'
        }`}
      >
        {!q.completo ? (
          <p>Escribe la base de cada línea para ver si cuadra con el total.</p>
        ) : (
          <>
            <p className="flex items-start gap-2">
              {Number.isFinite(q.escrito) &&
                (q.cuadra ? (
                  <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
                ) : (
                  <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
                ))}
              <span>
                Las líneas dan <span className="font-semibold">{euros(q.calculado)}</span>
                {!Number.isFinite(q.escrito)
                  ? '. Escribe el total de la factura para comprobarlo.'
                  : q.cuadra
                    ? `; has escrito ${euros(q.escrito)}: cuadra.`
                    : `; has escrito ${euros(q.escrito)}: ${diferencia > 0 ? 'faltan' : 'sobran'} ${euros(Math.abs(diferencia))}.`}
              </span>
            </p>
            <ul className="mt-1.5 space-y-0.5 pl-[26px] text-xs">
              {q.porTipo.map((t) => (
                <li key={t.tipoIva}>
                  {t.tipoIva === 0 ? `Base ${espanola ? 'exenta' : 'sin IVA'}: ${euros(t.base)}` : `Base al ${porcentaje(t.tipoIva)}: ${euros(t.base)} · IVA ${euros(t.cuota)}`}
                </li>
              ))}
              {q.retencion !== 0 && <li>Retención de IRPF: {euros(-q.retencion)}</li>}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
