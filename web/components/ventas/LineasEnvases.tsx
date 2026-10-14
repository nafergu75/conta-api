'use client';

import type { ReactNode } from 'react';
import { Trash } from '@phosphor-icons/react';
import { simboloMoneda } from '@/lib/moneda';
import { formatoCantidad, leerCantidad, paraEditar, propuestaKg, propuestaUds } from '@/lib/plantillasFactura';

/**
 * Líneas de una factura con la plantilla A (envases), como la factura
 * NZ004_26: Concepto (producto, descripción y texto adicional), Packs, Uds, KG
 * Plástico, IEEPNR, Precio/ud y Total. Debajo de cada una, el IVA y la cuenta
 * de ingresos.
 *
 * Al elegir un producto con unidades por pack, las Uds se proponen como
 * packs × unidades; si lleva IEEPNR, los kg como uds × kg por unidad. Siguen
 * a los packs y a las uds mientras no se escriban a mano; si se escriben,
 * «Volver a calcular» devuelve la propuesta.
 *
 * En el escritorio ancho es una tabla; en el móvil y la tableta, una tarjeta
 * por línea con sus etiquetas a la vista. Es controlado: las líneas, el IEEPNR
 * de cada una y los totales los calcula quien lo usa (Nueva factura).
 */

export interface LineaEnvasesForm {
  clave: number;
  productoServicioId: string;
  descripcion: string;
  /** Las Uds (la cantidad de la línea). */
  cantidad: string;
  precioUnitario: string;
  tipoIva: number;
  packs: string;
  kgPlastico: string;
  textoAdicional: string;
  /** Las Uds se escribieron a mano: ya no siguen a los packs. */
  udsTocadas?: boolean;
  /** Los kg se escribieron a mano: ya no siguen a las uds. */
  kgTocados?: boolean;
}

export interface ProductoEnvases {
  id: string;
  referencia: string;
  descripcion: string;
  bloqueado: boolean;
  unidadesPorPack?: number | null;
  kgPlasticoUnidad?: number | null;
  llevaIeepnr?: boolean;
}

/** Uds que se proponen para la línea (null si no hay propuesta). */
export function udsPropuestas(l: Pick<LineaEnvasesForm, 'packs'>, p: ProductoEnvases | undefined): number | null {
  const packs = leerCantidad(l.packs);
  return packs === null || Number.isNaN(packs) ? null : propuestaUds(packs, p?.unidadesPorPack);
}

/** Kg que se proponen para la línea (null si el producto no lleva IEEPNR o no hay uds). */
export function kgPropuestos(l: Pick<LineaEnvasesForm, 'cantidad'>, p: ProductoEnvases | undefined): number | null {
  if (!p?.llevaIeepnr) return null;
  const uds = leerCantidad(l.cantidad);
  return uds === null || Number.isNaN(uds) ? null : propuestaKg(uds, p.kgPlasticoUnidad);
}

/** La línea con las propuestas aplicadas donde no se ha escrito a mano. */
export function seguirPropuestas<L extends LineaEnvasesForm>(l: L, p: ProductoEnvases | undefined): L {
  let out = l;
  const uds = udsPropuestas(out, p);
  if (!out.udsTocadas && uds !== null) out = { ...out, cantidad: paraEditar(uds) };
  const kg = kgPropuestos(out, p);
  if (!out.kgTocados && kg !== null) out = { ...out, kgPlastico: paraEditar(kg) };
  return out;
}

/** El valor escrito coincide con la propuesta (o no hay propuesta). */
const coincide = (texto: string, propuesta: number | null) => propuesta === null || leerCantidad(texto) === propuesta;

/** Marca de error del campo que señala el servidor o la comprobación. */
type Marca = (...campos: string[]) => { 'aria-invalid': boolean; 'aria-describedby'?: string };

const campo =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50';
/** Etiqueta a la vista en la tarjeta (móvil y tableta); en la tabla la da la cabecera. */
const etiqueta = 'mb-1 block text-xs font-medium text-slate-600 lg:sr-only';
/** Columnas de la tabla (escritorio ancho). */
const COLUMNAS = 'lg:grid-cols-[minmax(0,1fr)_5rem_6rem_6.5rem_5.5rem_6.5rem_7rem_2.25rem]';

export default function LineasEnvases({
  lineas,
  productos,
  ieepnr,
  totales,
  moneda,
  fmt,
  onCambiar,
  onElegirProducto,
  onQuitar,
  marca,
  iva,
  cuenta,
}: {
  lineas: LineaEnvasesForm[];
  productos: ProductoEnvases[];
  /** IEEPNR de cada línea, ya calculado (0 si no se repercute). */
  ieepnr: number[];
  /** TOTAL del artículo de cada línea: uds × precio, sin el IEEPNR. */
  totales: number[];
  moneda: string;
  fmt: (n: number) => string;
  onCambiar: (clave: number, cambios: Partial<LineaEnvasesForm>) => void;
  onElegirProducto: (clave: number, id: string) => void;
  onQuitar: (clave: number) => void;
  marca: Marca;
  /** El IVA de la línea (desplegable o «Sin IVA»). */
  iva: (l: LineaEnvasesForm, i: number) => ReactNode;
  /** La cuenta de ingresos de la línea (CuentaLinea). */
  cuenta: (l: LineaEnvasesForm, i: number) => ReactNode;
}) {
  const productoDe = (l: LineaEnvasesForm) => productos.find((p) => p.id === l.productoServicioId);

  /** Cambio de packs o de uds: lo que no se ha escrito a mano sigue a la propuesta. */
  const cambiarConPropuestas = (l: LineaEnvasesForm, cambios: Partial<LineaEnvasesForm>) => {
    const nueva = seguirPropuestas({ ...l, ...cambios }, productoDe(l));
    onCambiar(l.clave, { ...cambios, cantidad: nueva.cantidad, kgPlastico: nueva.kgPlastico });
  };

  return (
    <div>
      {/* Cabecera de la tabla: solo en el escritorio ancho (las casillas llevan su nombre con la línea). */}
      <div aria-hidden="true" className={`hidden gap-3 border-b border-slate-200 bg-slate-50 px-5 py-2 text-sm font-medium text-slate-600 lg:grid ${COLUMNAS}`}>
        <span>Concepto</span>
        <span className="text-right">Packs</span>
        <span className="text-right">Uds</span>
        <span className="text-right">KG Plástico</span>
        <span className="text-right">IEEPNR</span>
        <span className="text-right">Precio/ud ({simboloMoneda(moneda)})</span>
        <span className="text-right">Total</span>
        <span />
      </div>
      <ul className="divide-y divide-slate-200">
        {lineas.map((l, i) => {
          const n = i + 1;
          const p = productoDe(l);
          const uds = udsPropuestas(l, p);
          const kg = kgPropuestos(l, p);
          const recalcularUds = !!l.udsTocadas && !coincide(l.cantidad, uds);
          const recalcularKg = !!l.kgTocados && !coincide(l.kgPlastico, kg);
          const datosProducto = [
            p?.unidadesPorPack ? `${formatoCantidad(p.unidadesPorPack, 0)} uds por pack` : null,
            p?.llevaIeepnr && p.kgPlasticoUnidad !== null && p.kgPlasticoUnidad !== undefined
              ? `${formatoCantidad(p.kgPlasticoUnidad, 6)} kg de plástico por ud`
              : p && !p.llevaIeepnr
                ? 'sin IEEPNR'
                : null,
          ].filter(Boolean);
          const quitar = (
            <button
              type="button"
              aria-label={`Quitar la línea ${n}`}
              disabled={lineas.length === 1}
              onClick={() => onQuitar(l.clave)}
              className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
            >
              <Trash size={16} />
            </button>
          );
          return (
            <li key={l.clave} role="group" aria-label={`Línea ${n}`} className="px-4 py-4 md:px-5 lg:py-3">
              <div className="mb-2 flex items-center justify-between lg:hidden">
                <span className="text-sm font-semibold text-slate-700">Línea {n}</span>
                {quitar}
              </div>
              <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:items-start ${COLUMNAS}`}>
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
                      Concepto
                    </label>
                    <input
                      id={`linea-${i}-descripcion`}
                      aria-label={`Concepto de la línea ${n}`}
                      {...marca(`lineas.${i}.descripcion`)}
                      className={campo}
                      value={l.descripcion}
                      onChange={(e) => onCambiar(l.clave, { descripcion: e.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor={`linea-${i}-textoAdicional`} className={etiqueta}>
                      Texto adicional <span className="font-normal text-slate-500">(opcional)</span>
                    </label>
                    <textarea
                      id={`linea-${i}-textoAdicional`}
                      aria-label={`Texto adicional de la línea ${n}, bajo el concepto`}
                      {...marca(`lineas.${i}.textoAdicional`)}
                      rows={2}
                      maxLength={500}
                      placeholder="Bajo el concepto: código RPA, formato, graduación…"
                      className={`${campo} text-xs`}
                      value={l.textoAdicional}
                      onChange={(e) => onCambiar(l.clave, { textoAdicional: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor={`linea-${i}-packs`} className={etiqueta}>
                    Packs
                  </label>
                  <input
                    id={`linea-${i}-packs`}
                    aria-label={`Packs de la línea ${n}`}
                    {...marca(`lineas.${i}.packs`)}
                    inputMode="numeric"
                    className={`${campo} text-right tabular-nums`}
                    value={l.packs}
                    onChange={(e) => cambiarConPropuestas(l, { packs: e.target.value })}
                  />
                </div>

                <div>
                  <label htmlFor={`linea-${i}-cantidad`} className={etiqueta}>
                    Uds
                  </label>
                  <input
                    id={`linea-${i}-cantidad`}
                    aria-label={`Uds de la línea ${n}`}
                    {...marca(`lineas.${i}.cantidad`)}
                    inputMode="decimal"
                    className={`${campo} text-right tabular-nums`}
                    value={l.cantidad}
                    onChange={(e) => cambiarConPropuestas(l, { cantidad: e.target.value, udsTocadas: uds !== null || l.udsTocadas })}
                  />
                  {recalcularUds && uds !== null && (
                    <button
                      type="button"
                      className="mt-1 text-xs font-medium text-blue-700 underline"
                      aria-label={`Volver a calcular las uds de la línea ${n}: ${formatoCantidad(uds)}`}
                      onClick={() => cambiarConPropuestas(l, { udsTocadas: false })}
                    >
                      Volver a calcular
                    </button>
                  )}
                </div>

                <div>
                  <label htmlFor={`linea-${i}-kgPlastico`} className={etiqueta}>
                    KG Plástico
                  </label>
                  <input
                    id={`linea-${i}-kgPlastico`}
                    aria-label={`Kg de plástico no reciclado de la línea ${n}`}
                    {...marca(`lineas.${i}.kgPlastico`)}
                    inputMode="decimal"
                    className={`${campo} text-right tabular-nums`}
                    value={l.kgPlastico}
                    onChange={(e) => onCambiar(l.clave, { kgPlastico: e.target.value, kgTocados: kg !== null || l.kgTocados })}
                  />
                  {recalcularKg && kg !== null && (
                    <button
                      type="button"
                      className="mt-1 text-xs font-medium text-blue-700 underline"
                      aria-label={`Volver a calcular los kg de la línea ${n}: ${formatoCantidad(kg)}`}
                      onClick={() => onCambiar(l.clave, { kgTocados: false, kgPlastico: paraEditar(kg) })}
                    >
                      Volver a calcular
                    </button>
                  )}
                </div>

                <div>
                  <span className={etiqueta}>IEEPNR</span>
                  <output
                    aria-label={`IEEPNR de la línea ${n}`}
                    className={`block rounded-lg border border-transparent px-1 py-2 text-right font-mono text-sm tabular-nums ${ieepnr[i] < 0 ? 'text-red-700' : 'text-slate-700'}`}
                  >
                    {fmt(ieepnr[i] ?? 0)}
                  </output>
                </div>

                <div>
                  <label htmlFor={`linea-${i}-precioUnitario`} className={etiqueta}>
                    Precio/ud ({simboloMoneda(moneda)})
                  </label>
                  <input
                    id={`linea-${i}-precioUnitario`}
                    aria-label={`Precio por unidad de la línea ${n} en ${moneda}`}
                    {...marca(`lineas.${i}.precioUnitario`)}
                    inputMode="decimal"
                    className={`${campo} text-right tabular-nums`}
                    value={l.precioUnitario}
                    onChange={(e) => onCambiar(l.clave, { precioUnitario: e.target.value })}
                  />
                </div>

                <div>
                  <span className={etiqueta}>Total</span>
                  <output
                    aria-label={`Total de la línea ${n}, sin IEEPNR`}
                    className={`block rounded-lg border border-transparent px-1 py-2 text-right font-mono text-sm font-semibold tabular-nums ${totales[i] < 0 ? 'text-red-700' : 'text-slate-900'}`}
                  >
                    {fmt(totales[i] ?? 0)}
                  </output>
                </div>

                <div className="hidden pt-1 lg:block">{quitar}</div>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-start">
                <div>{iva(l, i)}</div>
                <div className="min-w-0">{cuenta(l, i)}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
