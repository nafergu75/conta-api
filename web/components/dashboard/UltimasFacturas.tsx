'use client';

import Link from 'next/link';
import { CaretRight } from '@phosphor-icons/react';
import { formatoImporte } from '@/lib/moneda';
import { fechaCorta, type UltimaFacturaPanel } from '@/lib/panel';

interface Props {
  facturas: UltimaFacturaPanel[];
  moneda: string;
  /** Si quien mira puede abrir las facturas de venta (Ventas o Contabilidad) y las de gasto (Compras o Contabilidad). */
  puedeAbrir: { venta: boolean; gasto: boolean };
}

/** Color del estado de cobro o de pago. */
function claseEstado(estado: string): string {
  if (estado === 'Cobrada' || estado === 'Pagada') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (estado === 'Vencida') return 'bg-rose-50 text-rose-700 border-rose-200';
  if (estado === 'Rectificativa' || estado === 'Abono') return 'bg-violet-50 text-violet-700 border-violet-200';
  if (estado.startsWith('Pendiente') || estado === 'Pagada en parte') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-700 border-slate-300';
}

const tipoTexto = (f: UltimaFacturaPanel) => (f.tipo === 'venta' ? 'Venta' : 'Gasto');

function Estado({ estado }: { estado: string }) {
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${claseEstado(estado)}`}>{estado}</span>;
}

/**
 * Últimas facturas de venta y de gasto del año, con enlace a cada una. En el
 * móvil, una lista; desde tableta, una tabla. Importe: la base sin IVA de la
 * factura (en negativo las rectificativas y los abonos).
 */
export function UltimasFacturas({ facturas, moneda, puedeAbrir }: Props) {
  const importe = (n: number) => formatoImporte(n, moneda);
  const enlaceDe = (f: UltimaFacturaPanel) => (puedeAbrir[f.tipo] ? f.enlace : null);
  const etiqueta = (f: UltimaFacturaPanel) =>
    `Abrir la factura ${f.numero || 'sin número'} de ${f.tipo === 'venta' ? 'venta a' : 'gasto de'} ${f.tercero}`;
  const claseImporte = (f: UltimaFacturaPanel) => (f.tipo === 'venta' ? 'text-emerald-700' : 'text-rose-600');

  return (
    <>
      {/* Móvil: cada factura en un bloque que se pulsa entero. */}
      <ul className="md:hidden divide-y divide-slate-100 border-t border-slate-200">
        {facturas.map((f) => {
          const href = enlaceDe(f);
          const contenido = (
            <>
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 truncate font-medium text-slate-900">{f.tercero}</p>
                <p className={`shrink-0 font-mono font-medium ${claseImporte(f)}`}>{importe(f.base)}</p>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                <span>{tipoTexto(f)}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{f.numero || 'Sin número'}</span>
                <span aria-hidden="true">·</span>
                <span>{fechaCorta(f.date)}</span>
                <Estado estado={f.estado} />
              </div>
            </>
          );
          return (
            <li key={`${f.tipo}:${f.id}`}>
              {href ? (
                <Link href={href} aria-label={etiqueta(f)} className="flex items-center gap-2 px-4 py-3 hover:bg-slate-50 focus-visible:bg-slate-50">
                  <div className="min-w-0 flex-1">{contenido}</div>
                  <CaretRight size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
                </Link>
              ) : (
                <div className="px-4 py-3">{contenido}</div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Tableta y escritorio: tabla. */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Últimas facturas de venta y de gasto, de la más reciente a la más antigua</caption>
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-y border-slate-200 bg-slate-50">
              <th scope="col" className="px-6 py-3 font-medium">Fecha</th>
              <th scope="col" className="px-6 py-3 font-medium">Tipo</th>
              <th scope="col" className="px-6 py-3 font-medium">Factura</th>
              <th scope="col" className="px-6 py-3 font-medium">Cliente o proveedor</th>
              <th scope="col" className="px-6 py-3 font-medium">Estado</th>
              <th scope="col" className="px-6 py-3 font-medium text-right">Base (sin IVA)</th>
            </tr>
          </thead>
          <tbody>
            {facturas.map((f) => {
              const href = enlaceDe(f);
              return (
                <tr key={`${f.tipo}:${f.id}`} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3 text-slate-600 whitespace-nowrap">{fechaCorta(f.date)}</td>
                  <td className="px-6 py-3 text-slate-600">{tipoTexto(f)}</td>
                  <td className="px-6 py-3 font-mono whitespace-nowrap">
                    {href ? (
                      <Link href={href} aria-label={etiqueta(f)} className="font-medium text-accent-700 hover:underline focus-visible:underline">
                        {f.numero || 'Sin número'}
                      </Link>
                    ) : (
                      <span className="text-slate-500">{f.numero || 'Sin número'}</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-slate-900 font-medium">{f.tercero}</td>
                  <td className="px-6 py-3">
                    <Estado estado={f.estado} />
                  </td>
                  <td className={`px-6 py-3 text-right font-mono font-medium whitespace-nowrap ${claseImporte(f)}`}>{importe(f.base)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
