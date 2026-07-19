'use client';

import { useEffect, useState } from 'react';
import { Download, Eye } from '@phosphor-icons/react';
import { getToken } from '@/lib/auth';

const API = '/api/conta';

interface Factura {
  id: string;
  numeroCompleto: string;
  fechaEmision: string;
  baseTotal: number;
  ivaTotal: number;
  totalFactura: number;
  estado: string;
  tipoGasto: string;
}

interface SupplierFacturasTabProps {
  supplierId: string;
  companyId: string;
}

export function SupplierFacturasTab({ supplierId, companyId }: SupplierFacturasTabProps) {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<string>('');

  useEffect(() => {
    loadFacturas();
  }, []);

  const loadFacturas = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/companies/${companyId}/proveedores/${supplierId}/invoices`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (!res.ok) throw new Error(`Error ${res.status}`);

      const data = await res.json();
      setFacturas(data.data || data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar facturas');
    } finally {
      setLoading(false);
    }
  };

  const facturasFiltradas = filtroEstado ? facturas.filter(f => f.estado === filtroEstado) : facturas;

  const totales = {
    base: facturasFiltradas.reduce((sum, f) => sum + (f.baseTotal || 0), 0),
    iva: facturasFiltradas.reduce((sum, f) => sum + (f.ivaTotal || 0), 0),
    total: facturasFiltradas.reduce((sum, f) => sum + (f.totalFactura || 0), 0),
  };

  const getEstadoBadge = (estado: string) => {
    const clases: Record<string, string> = {
      DRAFT: 'bg-slate-100 text-slate-700',
      CONFIRMED: 'bg-blue-100 text-blue-700',
      ACCOUNTED: 'bg-green-100 text-green-700',
      PAID: 'bg-green-100 text-green-700',
      PENDING: 'bg-amber-100 text-amber-700',
      OVERDUE: 'bg-rose-100 text-rose-700',
    };
    return clases[estado] || 'bg-slate-100 text-slate-700';
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
        <p className="text-slate-600 font-medium">No hay facturas asociadas a este proveedor</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtros y totales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
          <p className="text-xs text-slate-600 mb-1">Total de Facturas</p>
          <p className="text-2xl font-bold text-slate-900">{facturasFiltradas.length}</p>
        </div>
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
          <p className="text-xs text-slate-600 mb-1">Base Imponible</p>
          <p className="text-lg font-semibold text-slate-900">€{totales.base.toFixed(2)}</p>
        </div>
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
          <p className="text-xs text-slate-600 mb-1">IVA Total</p>
          <p className="text-lg font-semibold text-slate-900">€{totales.iva.toFixed(2)}</p>
        </div>
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
          <p className="text-xs text-slate-600 mb-1">Total a Pagar</p>
          <p className="text-lg font-semibold text-accent-600">€{totales.total.toFixed(2)}</p>
        </div>
      </div>

      {/* Filtro de estado */}
      <div>
        <label className="text-sm font-medium text-slate-700 mb-2 block">Filtrar por estado</label>
        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600"
        >
          <option value="">Todos los estados</option>
          <option value="DRAFT">Borrador</option>
          <option value="CONFIRMED">Confirmada</option>
          <option value="ACCOUNTED">Contabilizada</option>
          <option value="PAID">Pagada</option>
          <option value="PENDING">Pendiente</option>
          <option value="OVERDUE">Vencida</option>
        </select>
      </div>

      {/* Tabla de facturas */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Nº Factura</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Fecha</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Tipo</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">Base</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">IVA</th>
              <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">Total</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">Estado</th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-slate-700">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {facturasFiltradas.map(factura => (
              <tr key={factura.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 text-sm font-mono text-slate-900">{factura.numeroCompleto}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{factura.fechaEmision}</td>
                <td className="px-4 py-3 text-sm text-slate-600">{factura.tipoGasto}</td>
                <td className="px-4 py-3 text-sm text-right font-medium text-slate-900">€{(factura.baseTotal || 0).toFixed(2)}</td>
                <td className="px-4 py-3 text-sm text-right font-medium text-slate-900">€{(factura.ivaTotal || 0).toFixed(2)}</td>
                <td className="px-4 py-3 text-sm text-right font-bold text-accent-600">€{(factura.totalFactura || 0).toFixed(2)}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getEstadoBadge(factura.estado)}`}>
                    {factura.estado}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <button className="p-1 text-slate-400 hover:text-slate-600 transition-colors" aria-label="Ver">
                    <Eye size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
