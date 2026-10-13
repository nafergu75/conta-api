'use client';

import Link from 'next/link';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell } from 'recharts';
import { formatoImporte } from '@/lib/moneda';
import { cifraCompacta, type FilaTerceroPanel } from '@/lib/panel';

const COLORS = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ec4899', '#3b82f6', '#14b8a6', '#f97316', '#6366f1', '#a855f7'];

/** Barras que caben bien en el gráfico; la lista de al lado los tiene todos. */
const EN_GRAFICO = COLORS.length;

export interface RankingTercerosProps {
  filas: FilaTerceroPanel[];
  moneda: string;
  /** Título de la lista: «Clientes» o «Proveedores». */
  tituloLista: string;
  /** «factura» o «nómina» según la fila: el texto del número. */
  unidad?: (fila: FilaTerceroPanel) => [string, string];
  /** Ficha del cliente o del proveedor, si quien mira puede abrirla (null: sin enlace). */
  enlace?: (fila: FilaTerceroPanel) => string | null;
}

const claveDe = (f: FilaTerceroPanel) => f.id ?? `sin-id:${f.name}`;
const porDefecto = (): [string, string] => ['factura', 'facturas'];

/**
 * Gráfico de barras con los que más suman y, al lado, la lista completa con su
 * importe y el número de facturas. La lista es también la versión accesible
 * del gráfico. Admite importes negativos (rectificativas o abonos).
 */
export function RankingTercerosChart({ filas, moneda, tituloLista, unidad = porDefecto, enlace }: RankingTercerosProps) {
  const importe = (v: number) => formatoImporte(v, moneda);
  const enGrafico = filas.slice(0, EN_GRAFICO).map((f, i) => ({ ...f, clave: claveDe(f), color: COLORS[i % COLORS.length] }));
  const hayNegativos = enGrafico.some((f) => f.total < 0);

  return (
    <div className="grafico-panel w-full">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="h-64 sm:h-80" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={enGrafico} margin={{ top: 20, right: 8, left: 0, bottom: 0 }} accessibilityLayer={false}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="clave" tickFormatter={(_, i) => enGrafico[i]?.letter ?? ''} stroke="#64748b" style={{ fontSize: '12px' }} interval={0} />
                <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={cifraCompacta} width={56} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    color: '#e2e8f0',
                  }}
                  itemStyle={{ color: '#e2e8f0' }}
                  labelStyle={{ color: '#f8fafc', fontWeight: 600 }}
                  formatter={(value) => [typeof value === 'number' ? importe(value) : '—', 'Sin IVA']}
                  labelFormatter={(_, payload) => {
                    const nombre = payload?.[0]?.payload?.name;
                    return typeof nombre === 'string' ? nombre : '';
                  }}
                />
                {hayNegativos && <ReferenceLine y={0} stroke="#94a3b8" />}
                <Bar dataKey="total" radius={[8, 8, 0, 0]}>
                  {enGrafico.map((entry) => (
                    <Cell key={entry.clave} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {filas.length > EN_GRAFICO && (
            <p className="mt-2 text-xs text-slate-500">
              El gráfico enseña los {EN_GRAFICO} que más suman. En la lista están los {filas.length}.
            </p>
          )}
        </div>

        <div className="bg-slate-50 rounded-lg p-4 overflow-y-auto max-h-80">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">{tituloLista}</h3>
          <ol className="space-y-2">
            {filas.map((f, idx) => {
              const href = enlace?.(f) ?? null;
              const [una, varias] = unidad(f);
              return (
                <li key={claveDe(f)} className="flex items-start gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: idx < EN_GRAFICO ? COLORS[idx % COLORS.length] : '#94a3b8' }}
                  />
                  <div className="flex-1 min-w-0">
                    {href ? (
                      <Link href={href} className="block truncate font-medium text-slate-900 hover:underline focus-visible:underline" title={f.name}>
                        {f.name}
                      </Link>
                    ) : (
                      <p className="truncate font-medium text-slate-900" title={f.name}>
                        {f.name}
                      </p>
                    )}
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-xs text-slate-500">
                        {f.facturas} {f.facturas === 1 ? una : varias}
                      </span>
                      <span className={`font-mono font-semibold whitespace-nowrap ${f.total < 0 ? 'text-rose-600' : 'text-slate-700'}`}>{importe(f.total)}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
