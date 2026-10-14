'use client';

import type { ReactNode } from 'react';
import { Plus, Trash } from '@phosphor-icons/react';
import { simboloMoneda } from '@/lib/moneda';
import { formatoCantidad, leerCantidad, paraEditar } from '@/lib/plantillasFactura';
import {
  cantidadDeUnidad,
  CALIDAD_MAX,
  FORMATO_MAX,
  NOMBRE_UNIDAD_PRECIO,
  propuestaCajas,
  propuestaM2,
  propuestaPeso,
  propuestaPiezas,
  UNIDADES_PRECIO,
  type ArticuloCeramica,
  type UnidadPrecio,
} from '@/lib/ceramica';

/**
 * Líneas de una factura con la plantilla B (cerámica y materiales de
 * construcción), como la factura NZ013_2026: palets, cajas, m², piezas,
 * formato, descripción (con su texto adicional), calidad, peso, la unidad del
 * precio, el precio y el importe (la cantidad de esa unidad por el precio:
 * 5,04 m² × 12,25 = 61,74; 20 piezas × 26,50 = 530,00).
 *
 * Al elegir un producto se proponen su formato, la unidad del precio y, desde
 * las cajas, los m² y las piezas (m² y piezas por caja del artículo); desde
 * los m² o las piezas escritos, las cajas que hacen falta; y el peso, desde la
 * cantidad (kg por unidad del precio). Siguen a lo que se escribe mientras no
 * se toquen a mano; si se tocan y no coinciden, el enlace «Usar 5,04» vuelve a
 * la propuesta.
 *
 * El cargo de palets de madera (líneas con cargoPalets) va aparte, debajo: la
 * cantidad de palets, el precio de cada uno, su IVA y su cuenta. En el PDF va
 * en el pie.
 *
 * Una tarjeta por línea con sus etiquetas a la vista (en el móvil, en la
 * tableta y en el escritorio). Es controlado: las líneas y los importes los
 * calcula quien lo usa (Nueva factura).
 */

export interface LineaCeramicaForm {
  clave: number;
  productoServicioId: string;
  descripcion: string;
  /** La cantidad que se cobra: los m² (por m²) o las piezas (por pieza o por unidad). La pone el componente. */
  cantidad: string;
  precioUnitario: string;
  tipoIva: number;
  textoAdicional: string;
  palets: string;
  cajas: string;
  metros2: string;
  piezas: string;
  formato: string;
  calidad: string;
  pesoKg: string;
  unidadPrecio: UnidadPrecio;
  /** Es el cargo de palets de madera (va en el pie del PDF). */
  cargoPalets?: boolean;
  /** Se escribieron a mano y ya no siguen a la propuesta. */
  cajasTocadas?: boolean;
  m2Tocados?: boolean;
  piezasTocadas?: boolean;
  pesoTocado?: boolean;
}

export interface ProductoCeramica extends ArticuloCeramica {
  id: string;
  referencia: string;
  descripcion: string;
  bloqueado: boolean;
  formato?: string | null;
}

const leer = (t: string) => {
  const n = leerCantidad(t);
  return n === null || Number.isNaN(n) ? null : n;
};

/** La cantidad de la línea según la unidad del precio (null si falta). */
export function cantidadCeramica(l: Pick<LineaCeramicaForm, 'unidadPrecio' | 'metros2' | 'piezas'>): number | null {
  return cantidadDeUnidad(l.unidadPrecio, { metros2: leer(l.metros2), piezas: leer(l.piezas) });
}

/** Lo que se propone para la línea (null en lo que no hay propuesta). */
export function propuestasCeramica(l: LineaCeramicaForm, p: ArticuloCeramica | undefined) {
  const cajas = leer(l.cajas);
  return {
    metros2: propuestaM2(cajas, p),
    piezas: propuestaPiezas(cajas, p),
    peso: propuestaPeso(cantidadCeramica(l), p),
  };
}

/**
 * La línea con las propuestas aplicadas donde no se ha escrito a mano.
 * `origen`: lo que se acaba de escribir (desde los m² o las piezas se
 * proponen las cajas). Pone también la cantidad (la de la unidad del precio).
 */
export function seguirPropuestasCeramica<L extends LineaCeramicaForm>(l: L, p: ArticuloCeramica | undefined, origen?: 'metros2' | 'piezas'): L {
  let out: L = { ...l };
  if (!out.cargoPalets) {
    if (origen && !out.cajasTocadas) {
      const c = origen === 'metros2' ? propuestaCajas(leer(out.metros2), p?.metros2PorCaja) : propuestaCajas(leer(out.piezas), p?.piezasPorCaja);
      if (c !== null) out = { ...out, cajas: paraEditar(c) };
    }
    const pr = propuestasCeramica(out, p);
    if (!out.m2Tocados && pr.metros2 !== null) out = { ...out, metros2: paraEditar(pr.metros2) };
    if (!out.piezasTocadas && pr.piezas !== null) out = { ...out, piezas: paraEditar(pr.piezas) };
    const peso = propuestaPeso(cantidadCeramica(out), p);
    if (!out.pesoTocado && peso !== null) out = { ...out, pesoKg: paraEditar(peso) };
    const cantidad = cantidadCeramica(out);
    out = { ...out, cantidad: cantidad === null ? '' : paraEditar(cantidad) };
  }
  return out;
}

/** El valor escrito coincide con la propuesta (o no hay propuesta). */
const coincide = (texto: string, propuesta: number | null) => propuesta === null || leer(texto) === propuesta;

/** Marca de error del campo que señala el servidor o la comprobación. */
type Marca = (...campos: string[]) => { 'aria-invalid': boolean; 'aria-describedby'?: string };

const campo =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50';
const etiqueta = 'mb-1 block text-xs font-medium text-slate-600';
const enlace = 'mt-1 whitespace-nowrap text-xs font-medium text-blue-700 underline';

export default function LineasCeramica({
  lineas,
  productos,
  importes,
  moneda,
  fmt,
  onCambiar,
  onElegirProducto,
  onQuitar,
  onAnadirCargo,
  marca,
  iva,
  cuenta,
}: {
  lineas: LineaCeramicaForm[];
  productos: ProductoCeramica[];
  /** Importe de cada línea (cantidad × precio), en el orden de `lineas`. */
  importes: number[];
  moneda: string;
  fmt: (n: number) => string;
  onCambiar: (clave: number, cambios: Partial<LineaCeramicaForm>) => void;
  onElegirProducto: (clave: number, id: string) => void;
  onQuitar: (clave: number) => void;
  /** Añade una línea de cargo de palets de madera. */
  onAnadirCargo: () => void;
  marca: Marca;
  /** El IVA de la línea (desplegable o «Sin IVA»). */
  iva: (l: LineaCeramicaForm, i: number) => ReactNode;
  /** La cuenta de ingresos de la línea (CuentaLinea). */
  cuenta: (l: LineaCeramicaForm, i: number) => ReactNode;
}) {
  const productoDe = (l: LineaCeramicaForm) => productos.find((p) => p.id === l.productoServicioId);
  const simbolo = simboloMoneda(moneda);
  /** Cambio de una medida o de la unidad: lo que no se ha escrito a mano sigue a la propuesta. */
  const cambiar = (l: LineaCeramicaForm, cambios: Partial<LineaCeramicaForm>, origen?: 'metros2' | 'piezas') => {
    const nueva = seguirPropuestasCeramica({ ...l, ...cambios }, productoDe(l), origen);
    const { clave: _c, ...resto } = nueva;
    void _c;
    onCambiar(l.clave, resto);
  };
  const normales = lineas.map((l, i) => ({ l, i })).filter(({ l }) => !l.cargoPalets);
  const cargos = lineas.map((l, i) => ({ l, i })).filter(({ l }) => l.cargoPalets);
  const quitar = (l: LineaCeramicaForm, n: number, que: string) => (
    <button
      type="button"
      aria-label={`Quitar ${que} ${n}`}
      disabled={lineas.length === 1}
      onClick={() => onQuitar(l.clave)}
      className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
    >
      <Trash size={16} />
    </button>
  );
  /** Una casilla numérica con su etiqueta, su marca de error y, si toca, el enlace a la propuesta. */
  const numero = (
    l: LineaCeramicaForm,
    i: number,
    k: 'palets' | 'cajas' | 'metros2' | 'piezas' | 'pesoKg',
    texto: string,
    aria: string,
    onChange: (v: string) => void,
    propuesta?: { valor: number | null; mostrar: boolean; titulo: string; onUsar: () => void },
  ) => (
    <div>
      <label htmlFor={`linea-${i}-${k}`} className={etiqueta}>
        {texto}
      </label>
      <input
        id={`linea-${i}-${k}`}
        aria-label={aria}
        {...marca(`lineas.${i}.${k}`)}
        inputMode={k === 'palets' || k === 'cajas' ? 'numeric' : 'decimal'}
        className={`${campo} text-right tabular-nums`}
        value={l[k]}
        onChange={(e) => onChange(e.target.value)}
      />
      {propuesta?.mostrar && propuesta.valor !== null && (
        <button type="button" className={enlace} title={propuesta.titulo} aria-label={`${propuesta.titulo}: ${formatoCantidad(propuesta.valor)}`} onClick={propuesta.onUsar}>
          Usar {formatoCantidad(propuesta.valor)}
        </button>
      )}
    </div>
  );

  return (
    <div>
      <ul className="divide-y divide-slate-200">
        {normales.map(({ l, i }, k) => {
          const n = k + 1;
          const p = productoDe(l);
          const pr = propuestasCeramica(l, p);
          const datosProducto = [
            p?.metros2PorCaja ? `${formatoCantidad(p.metros2PorCaja, 4)} m² por caja` : null,
            p?.piezasPorCaja ? `${formatoCantidad(p.piezasPorCaja, 0)} piezas por caja` : null,
            p?.pesoKgPorUnidad !== null && p?.pesoKgPorUnidad !== undefined
              ? `${formatoCantidad(p.pesoKgPorUnidad, 4)} kg por ${NOMBRE_UNIDAD_PRECIO[(p.unidadPrecio as UnidadPrecio) ?? 'UNIDAD'] ?? 'unidad'}`
              : null,
          ].filter(Boolean);
          const unidadPiezas = l.unidadPrecio === 'UNIDAD' ? 'Uds' : 'Piezas';
          return (
            <li key={l.clave} role="group" aria-label={`Línea ${n}`} className="px-4 py-4 md:px-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-700">Línea {n}</span>
                {quitar(l, n, 'la línea')}
              </div>
              {/* Primera fila: producto y descripción, la unidad del precio, el precio y el importe. */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-[minmax(0,1fr)_8.5rem_7.5rem_7.5rem] lg:items-start">
                <div className="col-span-2 space-y-2 sm:col-span-3 lg:col-span-1">
                  <div>
                    <label htmlFor={`linea-${i}-producto`} className={etiqueta}>
                      Producto
                    </label>
                    <select
                      id={`linea-${i}-producto`}
                      aria-label={`Producto de la línea ${n}`}
                      className={campo}
                      value={l.productoServicioId}
                      onChange={(e) => onElegirProducto(l.clave, e.target.value)}
                    >
                      <option value="">Libre</option>
                      {productos
                        .filter((x) => !x.bloqueado || x.id === l.productoServicioId)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.referencia} — {x.descripcion}
                          </option>
                        ))}
                    </select>
                    {datosProducto.length > 0 && <p className="mt-1 text-xs text-slate-500">{datosProducto.join(' · ')}</p>}
                  </div>
                  <div>
                    <label htmlFor={`linea-${i}-descripcion`} className={etiqueta}>
                      Descripción
                    </label>
                    <input
                      id={`linea-${i}-descripcion`}
                      aria-label={`Descripción de la línea ${n}`}
                      {...marca(`lineas.${i}.descripcion`)}
                      className={campo}
                      value={l.descripcion}
                      onChange={(e) => onCambiar(l.clave, { descripcion: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor={`linea-${i}-unidadPrecio`} className={etiqueta}>
                    El precio va por
                  </label>
                  <select
                    id={`linea-${i}-unidadPrecio`}
                    aria-label={`Unidad del precio de la línea ${n}`}
                    {...marca(`lineas.${i}.unidadPrecio`)}
                    className={campo}
                    value={l.unidadPrecio}
                    onChange={(e) => cambiar(l, { unidadPrecio: e.target.value as UnidadPrecio })}
                  >
                    {UNIDADES_PRECIO.map((u) => (
                      <option key={u} value={u}>
                        {NOMBRE_UNIDAD_PRECIO[u]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`linea-${i}-precioUnitario`} className={etiqueta}>
                    Precio ({simbolo}/{NOMBRE_UNIDAD_PRECIO[l.unidadPrecio]})
                  </label>
                  <input
                    id={`linea-${i}-precioUnitario`}
                    aria-label={`Precio por ${NOMBRE_UNIDAD_PRECIO[l.unidadPrecio]} de la línea ${n} en ${moneda}`}
                    {...marca(`lineas.${i}.precioUnitario`)}
                    inputMode="decimal"
                    className={`${campo} text-right tabular-nums`}
                    value={l.precioUnitario}
                    onChange={(e) => onCambiar(l.clave, { precioUnitario: e.target.value })}
                  />
                </div>
                <div>
                  <span className={etiqueta}>Importe</span>
                  <output
                    aria-label={`Importe de la línea ${n}`}
                    className={`block rounded-lg border border-transparent px-1 py-2 text-right font-mono text-sm font-semibold tabular-nums ${importes[i] < 0 ? 'text-red-700' : 'text-slate-900'}`}
                  >
                    {fmt(importes[i] ?? 0)}
                  </output>
                  <p className="text-right text-xs text-slate-500">
                    {formatoCantidad(cantidadCeramica(l) ?? 0)} {l.unidadPrecio === 'M2' ? 'm²' : l.unidadPrecio === 'PIEZA' ? 'piezas' : 'uds'} × precio
                  </p>
                </div>
              </div>

              {/* Segunda fila: las medidas de la tabla del PDF. */}
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {numero(l, i, 'palets', 'Palets', `Palets de la línea ${n}`, (v) => onCambiar(l.clave, { palets: v }))}
                {numero(l, i, 'cajas', 'Cajas', `Cajas de la línea ${n}`, (v) => cambiar(l, { cajas: v, cajasTocadas: true }))}
                {numero(l, i, 'metros2', 'M²', `Metros cuadrados de la línea ${n}`, (v) => cambiar(l, { metros2: v, m2Tocados: true }, 'metros2'), {
                  valor: pr.metros2,
                  mostrar: !!l.m2Tocados && !coincide(l.metros2, pr.metros2),
                  titulo: `Volver a calcular los m² de la línea ${n}: cajas × m² por caja`,
                  onUsar: () => cambiar(l, { m2Tocados: false }),
                })}
                {numero(l, i, 'piezas', unidadPiezas, `${unidadPiezas} de la línea ${n}`, (v) => cambiar(l, { piezas: v, piezasTocadas: true }, 'piezas'), {
                  valor: pr.piezas,
                  mostrar: !!l.piezasTocadas && !coincide(l.piezas, pr.piezas),
                  titulo: `Volver a calcular las piezas de la línea ${n}: cajas × piezas por caja`,
                  onUsar: () => cambiar(l, { piezasTocadas: false }),
                })}
                <div>
                  <label htmlFor={`linea-${i}-formato`} className={etiqueta}>
                    Formato
                  </label>
                  <input
                    id={`linea-${i}-formato`}
                    aria-label={`Formato de la línea ${n}`}
                    {...marca(`lineas.${i}.formato`)}
                    maxLength={FORMATO_MAX}
                    placeholder="23,3x120"
                    className={campo}
                    value={l.formato}
                    onChange={(e) => onCambiar(l.clave, { formato: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor={`linea-${i}-calidad`} className={etiqueta}>
                    Calidad
                  </label>
                  <input
                    id={`linea-${i}-calidad`}
                    aria-label={`Calidad de la línea ${n}`}
                    {...marca(`lineas.${i}.calidad`)}
                    maxLength={CALIDAD_MAX}
                    placeholder="1"
                    className={campo}
                    value={l.calidad}
                    onChange={(e) => onCambiar(l.clave, { calidad: e.target.value })}
                  />
                </div>
                {numero(l, i, 'pesoKg', 'Peso (kg)', `Peso en kg de la línea ${n}`, (v) => cambiar(l, { pesoKg: v, pesoTocado: true }), {
                  valor: pr.peso,
                  mostrar: !!l.pesoTocado && !coincide(l.pesoKg, pr.peso),
                  titulo: `Volver a calcular el peso de la línea ${n}: cantidad × kg por unidad`,
                  onUsar: () => cambiar(l, { pesoTocado: false }),
                })}
              </div>

              {/* Debajo: el texto adicional (sale bajo la descripción en el PDF), el IVA y la cuenta de ingresos. */}
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-start lg:grid-cols-[minmax(0,1.3fr)_8rem_minmax(0,1fr)]">
                <div className="sm:col-span-2 lg:col-span-1">
                  <label htmlFor={`linea-${i}-textoAdicional`} className={etiqueta}>
                    Texto adicional <span className="font-normal text-slate-500">(opcional)</span>
                  </label>
                  <textarea
                    id={`linea-${i}-textoAdicional`}
                    aria-label={`Texto adicional de la línea ${n}, bajo la descripción`}
                    {...marca(`lineas.${i}.textoAdicional`)}
                    rows={2}
                    maxLength={500}
                    placeholder="Bajo la descripción: PORCELANICO RECTIFICADO…"
                    className={`${campo} text-xs`}
                    value={l.textoAdicional}
                    onChange={(e) => onCambiar(l.clave, { textoAdicional: e.target.value })}
                  />
                </div>
                <div>{iva(l, i)}</div>
                <div className="min-w-0 sm:pt-5">{cuenta(l, i)}</div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Cargo de palets de madera: va en el pie del PDF. */}
      <div className="border-t border-slate-200 bg-slate-50 px-4 py-4 md:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-slate-700">Palets de madera</p>
            <p className="text-xs text-slate-600">Se cobran aparte y salen en el pie de la factura, con su IVA y su cuenta.</p>
          </div>
          <button
            type="button"
            onClick={onAnadirCargo}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            <Plus size={16} aria-hidden="true" /> Añadir palets de madera
          </button>
        </div>
        {cargos.length > 0 && (
          <ul className="mt-3 space-y-3">
            {cargos.map(({ l, i }, k) => {
              const n = k + 1;
              return (
                <li key={l.clave} role="group" aria-label={`Cargo de palets ${n}`} className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_7.5rem_7.5rem_2.25rem] sm:items-start">
                    <div className="col-span-2 sm:col-span-1">
                      <label htmlFor={`linea-${i}-descripcion`} className={etiqueta}>
                        Texto
                      </label>
                      <input
                        id={`linea-${i}-descripcion`}
                        aria-label={`Texto del cargo de palets ${n}`}
                        {...marca(`lineas.${i}.descripcion`)}
                        className={campo}
                        value={l.descripcion}
                        onChange={(e) => onCambiar(l.clave, { descripcion: e.target.value })}
                      />
                    </div>
                    <div>
                      <label htmlFor={`linea-${i}-cantidad`} className={etiqueta}>
                        Palets
                      </label>
                      <input
                        id={`linea-${i}-cantidad`}
                        aria-label={`Número de palets del cargo ${n}`}
                        {...marca(`lineas.${i}.cantidad`)}
                        inputMode="numeric"
                        className={`${campo} text-right tabular-nums`}
                        value={l.cantidad}
                        onChange={(e) => onCambiar(l.clave, { cantidad: e.target.value })}
                      />
                    </div>
                    <div>
                      <label htmlFor={`linea-${i}-precioUnitario`} className={etiqueta}>
                        Precio ({simbolo}/palet)
                      </label>
                      <input
                        id={`linea-${i}-precioUnitario`}
                        aria-label={`Precio de cada palet del cargo ${n} en ${moneda}`}
                        {...marca(`lineas.${i}.precioUnitario`)}
                        inputMode="decimal"
                        className={`${campo} text-right tabular-nums`}
                        value={l.precioUnitario}
                        onChange={(e) => onCambiar(l.clave, { precioUnitario: e.target.value })}
                      />
                    </div>
                    <div>
                      <span className={etiqueta}>Importe</span>
                      <output
                        aria-label={`Importe del cargo de palets ${n}`}
                        className={`block rounded-lg border border-transparent px-1 py-2 text-right font-mono text-sm font-semibold tabular-nums ${importes[i] < 0 ? 'text-red-700' : 'text-slate-900'}`}
                      >
                        {fmt(importes[i] ?? 0)}
                      </output>
                    </div>
                    <div className="flex justify-end sm:pt-5">{quitar(l, n, 'el cargo de palets')}</div>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-start">
                    <div>{iva(l, i)}</div>
                    <div className="min-w-0 sm:pt-5">{cuenta(l, i)}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
