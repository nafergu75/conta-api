'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getToken, clearSession } from '@/lib/auth';
import { ArrowLeft } from '@phosphor-icons/react';
import Link from 'next/link';
import ContabilizarButton from '@/components/ContabilizarButton';

interface LineaIngreso {
  id: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  baseLine: number;
  tipoIva: number;
  ivaImporte: number;
  tipoRetencion: number;
  retencionImporte: number;
}

interface FacturaIngreso {
  id: string;
  numeroCompleto: string;
  fechaEmision: string;
  fechaVencimiento: string;
  cliente: {
    id: string;
    nombreFiscal: string;
    nifCif: string;
  };
  baseTotal: number;
  ivaTotal: number;
  retencionTotal: number;
  totalFactura: number;
  estado: string;
  lineas: LineaIngreso[];
}

const API = '/api/conta';

export default function FacturaDetailPage() {
  const router = useRouter();
  const params = useParams();
  const facturaId = params.id as string;

  const companyId = useMemo(() => {
    const token = getToken();
    if (!token) return null;
    try {
      const parts = token.split('.');
      const payload = JSON.parse(atob(parts[1]));
      return payload.companies?.[0] || payload.empresaSeleccionada || '1';
    } catch {
      return '1';
    }
  }, []);

  const [factura, setFactura] = useState<FacturaIngreso | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadFactura = async () => {
      const token = getToken();
      if (!token || !companyId) return;

      try {
        setLoading(true);
        const res = await fetch(`${API}/companies/${companyId}/income-invoices/${facturaId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) {
          clearSession();
          return;
        }

        if (!res.ok) throw new Error('Error cargando factura');
        const data = await res.json();
        setFactura(data.data || data);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    };

    if (companyId) loadFactura();
  }, [companyId, facturaId]);

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="text-center text-gray-500">Cargando factura...</div>
      </div>
    );
  }

  if (!factura) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="text-center text-red-500">Factura no encontrada</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Encabezado */}
      <div className="mb-6 flex items-center gap-4">
        <Link href="/dashboard/facturas" className="p-2 hover:bg-gray-100 rounded-lg transition">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Factura {factura.numeroCompleto}</h1>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
          {error}
        </div>
      )}

      {/* Información Principal */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div>
            <label className="text-sm text-gray-600">Número</label>
            <p className="text-lg font-semibold text-gray-900">{factura.numeroCompleto}</p>
          </div>
          <div>
            <label className="text-sm text-gray-600">Fecha Emisión</label>
            <p className="text-lg font-semibold text-gray-900">
              {new Date(factura.fechaEmision).toLocaleDateString('es-ES')}
            </p>
          </div>
          <div>
            <label className="text-sm text-gray-600">Fecha Vencimiento</label>
            <p className="text-lg font-semibold text-gray-900">
              {new Date(factura.fechaVencimiento).toLocaleDateString('es-ES')}
            </p>
          </div>
          <div>
            <label className="text-sm text-gray-600">Estado</label>
            <p className="text-lg font-semibold text-gray-900 capitalize">{factura.estado}</p>
          </div>
        </div>

        {/* Cliente */}
        <div className="border-t border-gray-200 pt-6">
          <h3 className="font-semibold text-gray-900 mb-3">Cliente</h3>
          <div className="space-y-1">
            <p className="text-gray-900">{factura.cliente.nombreFiscal}</p>
            <p className="text-gray-600 font-mono">{factura.cliente.nifCif}</p>
          </div>
        </div>
      </div>

      {/* Líneas de la Factura */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">Líneas de la Factura</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                Descripción
              </th>
              <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                Cantidad
              </th>
              <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                P.U. (€)
              </th>
              <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                Base (€)
              </th>
              <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                IVA (€)
              </th>
              <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                IRPF (€)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {factura.lineas.map((linea) => (
              <tr key={linea.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm text-gray-900">{linea.descripcion}</td>
                <td className="px-6 py-4 text-sm text-right font-mono text-gray-700">
                  {linea.cantidad}
                </td>
                <td className="px-6 py-4 text-sm text-right font-mono text-gray-700">
                  {linea.precioUnitario.toFixed(2)}
                </td>
                <td className="px-6 py-4 text-sm text-right font-mono text-gray-700">
                  {linea.baseLine.toFixed(2)}
                </td>
                <td className="px-6 py-4 text-sm text-right font-mono text-gray-700">
                  {linea.tipoIva}% ({linea.ivaImporte.toFixed(2)})
                </td>
                <td className="px-6 py-4 text-sm text-right font-mono text-gray-700">
                  {linea.tipoRetencion}% ({linea.retencionImporte.toFixed(2)})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totales */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
        <div className="space-y-2">
          <div className="flex justify-between text-gray-900">
            <span>Base Imponible</span>
            <span className="font-mono font-semibold">€{factura.baseTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-gray-900">
            <span>IVA</span>
            <span className="font-mono font-semibold">€{factura.ivaTotal.toFixed(2)}</span>
          </div>
          {factura.retencionTotal > 0 && (
            <div className="flex justify-between text-gray-900">
              <span>IRPF Retención</span>
              <span className="font-mono font-semibold">-€{factura.retencionTotal.toFixed(2)}</span>
            </div>
          )}
          <div className="border-t border-gray-300 pt-2 flex justify-between text-lg font-bold text-gray-900">
            <span>Total</span>
            <span className="font-mono">€{factura.totalFactura.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Contabilizar */}
      {companyId && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-4">Contabilización</h3>
          <ContabilizarButton
            invoiceId={facturaId}
            companyId={companyId}
            tipo="INGRESO"
            onSuccess={(journalId) => {
              // Redirigir al asiento creado
              setTimeout(() => {
                router.push(`/dashboard/motor-contable/${journalId}`);
              }, 1000);
            }}
          />
        </div>
      )}
    </div>
  );
}
