'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from '@phosphor-icons/react';
import { apiFetch, errorMessage } from '@/lib/api';
import { formatoImporte } from '@/lib/moneda';
import { claseEstadoGasto, claseEstadoPago, fechaCorta } from '@/lib/compras';

interface Factura {
  id: string;
  numeroCompleto: string;
  numeroFacturaProveedor?: string | null;
  fechaEmision: string;
  fechaVencimiento?: string;
  baseTotal: number;
  ivaTotal: number;
  totalFactura: number;
  estado: string;
  estadoTexto?: string;
  estadoPago?: string;
  estadoPagoTexto?: string;
  vencida?: boolean;
  importePendiente?: number;
  tipoGasto: string;
}

interface SupplierFacturasTabProps {
  supplierId: string;
  companyId: string;
}

type FiltroPago = '' | 'PENDIENTE' | 'PARCIAL' | 'PAGADA' | 'VENCIDA';

const pasaFiltro = (f: Factura, filtro: FiltroPago) => {
  if (!filtro) return true;
  if (f.estado === 'ANULADA') return false;
  if (filtro === 'VENCIDA') return !!f.vencida;
  return f.estadoPago === filtro;
};

/** Facturas de gasto del proveedor, con su estado, su pago y lo pendiente. Cada fila abre la factura. */
export function SupplierFacturasTab({ supplierId, companyId }: SupplierFacturasTabProps) {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [moneda, setMoneda] = useState('EUR');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroPago>('');

  useEffect(() => {
    let vivo = true;
    const base = `/companies/${encodeURIComponent(companyId)}`;
    setLoading(true);
    apiFetch<Factura[]>(`${base}/proveedores/${encodeURIComponent(supplierId)}/invoices`)
      .then((r) => {
        if (!vivo) return;
        setFacturas(Array.isArray(r) ? r : []);
        setError(null);
      })
      .catch((e) => vivo && setError(errorMessage(e)))
      .finally(() => vivo && setLoading(false));
    // La moneda de la contabilidad (la da el listado de compras).
    apiFetch<{ monedaCuenta?: string }>(`${base}/expense-invoices?limit=1&supplierId=${encodeURIComponent(supplierId)}`)
      .then((r) => vivo && r.monedaCuenta && setMoneda(r.monedaCuenta))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [supplierId, companyId]);

  const fmt = (n: number | undefined) => formatoImporte(Number(n) || 0, moneda);
  const filtradas = facturas.filter((f) => pasaFiltro(f, filtro));
  const vigentes = filtradas.filter((f) => f.estado !== 'ANULADA');
  const totales = {
    base: vigentes.reduce((s, f) => s + (Number(f.baseTotal) || 0), 0),
    iva: vigentes.reduce((s, f) => s + (Number(f.ivaTotal) || 0), 0),
    pendiente: vigentes.reduce((s, f) => s + (Number(f.importePendiente) || 0), 0),
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-accent-600 mb-2"></div>
          <p className="text-slate-600">Cargando facturas...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-700 p-4">{error}</div>;
  }

  if (facturas.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
        <p className="text-slate-600 font-medium">Este proveedor aún no tiene facturas de gasto.</p>
        <Link href="/dashboard/compras/nueva" className="mt-2 inline-block text-sm font-semibold text-accent-600 hover:text-accent-700">
          Registrar una factura de gasto
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
          <p className="text-xs text-slate-600 mb-1">Facturas</p>
          <p className="text-2xl font-bold text-slate-900">{filtradas.length}</p>
        </div>
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
          <p className="text-xs text-slate-600 mb-1">Base imponible</p>
          <p className="text-lg font-semibold text-slate-900">{fmt(totales.base)}</p>
        </div>
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
          <p className="text-xs text-slate-600 mb-1">IVA</p>
          <p className="text-lg font-semibold text-slate-900">{fmt(totales.iva)}</p>
        </div>
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
          <p className="text-xs text-slate-600 mb-1">Pendiente de pago</p>
          <p className="text-lg font-semibold text-amber-700">{fmt(totales.pendiente)}</p>
        </div>
      </div>

      <div>
        <label htmlFor="sf-pago" className="text-sm font-medium text-slate-700 mb-2 block">
          Pago
        </label>
        <select
          id="sf-pago"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value as FiltroPago)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600"
        >
          <option value="">Todos</option>
          <option value="PENDIENTE">Pendiente</option>
          <option value="PARCIAL">Pagada en parte</option>
          <option value="PAGADA">Pagada</option>
          <option value="VENCIDA">Vencida</option>
        </select>
      </div>

      {filtradas.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">Ninguna factura cumple el filtro.</p>
      ) : (
        <>
          <div className="relative hidden overflow-x-auto lg:block">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Registro</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Nº proveedor</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Fecha</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700">Total</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-700">Pendiente</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Estado</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Pago</th>
                <th className="px-4 py-3">
                  <span className="sr-only">Ver</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtradas.map((f) => {
                const anulada = f.estado === 'ANULADA';
                return (
                  <tr key={f.id} className={`hover:bg-slate-50 transition-colors ${anulada ? 'text-slate-400 line-through' : ''}`}>
                    <td className="px-4 py-3 font-mono">
                      <Link href={`/dashboard/compras/${f.id}`} className={anulada ? '' : 'text-blue-600 hover:underline'}>
                        {f.numeroCompleto}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700 max-w-[10rem] truncate">{f.numeroFacturaProveedor ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fechaCorta(f.fechaEmision)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold whitespace-nowrap">{fmt(f.totalFactura)}</td>
                    <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{anulada ? '—' : fmt(f.importePendiente)}</td>
                    <td className="px-4 py-3">
                      <span className={claseEstadoGasto(f.estado)}>{f.estadoTexto ?? f.estado}</span>
                    </td>
                    <td className="px-4 py-3">{!anulada && f.estadoPago && <span className={claseEstadoPago(f.estadoPago, !!f.vencida)}>{f.estadoPagoTexto ?? f.estadoPago}</span>}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/dashboard/compras/${f.id}`} className="inline-flex items-center gap-1 font-medium text-blue-600 hover:underline">
                        <span className="sr-only">Ver</span>
                        <ArrowRight size={16} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <ul className="lg:hidden divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {filtradas.map((f) => {
              const anulada = f.estado === 'ANULADA';
              return (
                <li key={f.id}>
                  <Link href={`/dashboard/compras/${f.id}`} className="flex flex-col gap-1.5 px-4 py-3 hover:bg-slate-50">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`font-mono text-sm ${anulada ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                        {f.numeroCompleto}
                        {f.numeroFacturaProveedor && <span className="text-slate-500"> · {f.numeroFacturaProveedor}</span>}
                      </span>
                      <span className={`shrink-0 font-mono font-semibold ${anulada ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{fmt(f.totalFactura)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <span>{fechaCorta(f.fechaEmision)}</span>
                      <span className={claseEstadoGasto(f.estado)}>{f.estadoTexto ?? f.estado}</span>
                      {!anulada && f.estadoPago && <span className={claseEstadoPago(f.estadoPago, !!f.vencida)}>{f.estadoPagoTexto ?? f.estadoPago}</span>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
