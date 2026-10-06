'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getCompanyId, getUser, tieneAlgunPermiso } from '@/lib/auth';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { ArrowLeft } from '@phosphor-icons/react';
import Link from 'next/link';
import ContabilizarButton from '@/components/ContabilizarButton';
import CobrosFactura from '@/components/CobrosFactura';

interface LineaGasto {
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

interface FacturaGasto {
  id: string;
  numeroCompleto: string;
  fechaEmision: string;
  fechaVencimiento: string;
  supplier?: {
    id: string;
    nombreFiscal: string;
    nifCif: string;
  };
  baseTotal: number;
  ivaTotal: number;
  retencionTotal: number;
  totalFactura: number;
  estado: string;
  /** PENDIENTE | PARCIAL | PAGADA */
  estadoPago?: string;
  tipoGasto?: string;
  lineas: LineaGasto[];
}

const ESTADO_PAGO: Record<string, { texto: string; clase: string }> = {
  PENDIENTE: { texto: 'Pendiente de pago', clase: 'bg-amber-50 text-amber-800 border-amber-200' },
  PARCIAL: { texto: 'Pagada en parte', clase: 'bg-blue-50 text-blue-800 border-blue-200' },
  PAGADA: { texto: 'Pagada', clase: 'bg-green-50 text-green-800 border-green-200' },
};

const TIPO_GASTO_LABELS: Record<string, string> = {
  COMPRA: 'Compra de Mercaderías',
  SERVICIO_PROFESIONAL: 'Servicios Profesionales',
  ALQUILER: 'Arrendamiento',
  SUMINISTROS: 'Suministros',
};

export default function GastoDetailPage() {
  const router = useRouter();
  const params = useParams();
  const gastoId = params.id as string;

  // Empresa activa de la sesion (la que devolvio el login).
  const companyId = getCompanyId();

  const puedePagar = tieneAlgunPermiso(getUser(), ['compras:write', 'contabilidad:write']);

  const [gasto, setGasto] = useState<FacturaGasto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadGasto = useCallback(async () => {
    try {
      // El backend responde { data: factura } dentro del sobre { ok, data }.
      const r = await apiFetch<{ data?: FacturaGasto } & Partial<FacturaGasto>>(companyPath(`/expense-invoices/${gastoId}`));
      setGasto((r.data ?? r) as FacturaGasto);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [gastoId]);

  useEffect(() => {
    if (companyId) loadGasto();
  }, [companyId, loadGasto]);

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="text-center text-gray-500">Cargando factura de gasto...</div>
      </div>
    );
  }

  if (!gasto) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="text-center text-red-500">Factura de gasto no encontrada</div>
      </div>
    );
  }

  const tipoGastoLabel = gasto.tipoGasto ? TIPO_GASTO_LABELS[gasto.tipoGasto] || gasto.tipoGasto : '—';

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Encabezado */}
      <div className="mb-6 flex items-center gap-4">
        <Link href="/dashboard/compras" className="p-2 hover:bg-gray-100 rounded-lg transition">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Gasto {gasto.numeroCompleto}</h1>
        {gasto.estadoPago && ESTADO_PAGO[gasto.estadoPago] && (
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${ESTADO_PAGO[gasto.estadoPago].clase}`}>
            {ESTADO_PAGO[gasto.estadoPago].texto}
          </span>
        )}
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
            <p className="text-lg font-semibold text-gray-900">{gasto.numeroCompleto}</p>
          </div>
          <div>
            <label className="text-sm text-gray-600">Fecha Emisión</label>
            <p className="text-lg font-semibold text-gray-900">
              {new Date(gasto.fechaEmision).toLocaleDateString('es-ES')}
            </p>
          </div>
          <div>
            <label className="text-sm text-gray-600">Tipo Gasto</label>
            <p className="text-lg font-semibold text-gray-900">{tipoGastoLabel}</p>
          </div>
          <div>
            <label className="text-sm text-gray-600">Estado</label>
            <p className="text-lg font-semibold text-gray-900 capitalize">{gasto.estado}</p>
          </div>
        </div>

        {/* Proveedor */}
        {gasto.supplier && (
          <div className="border-t border-gray-200 pt-6">
            <h3 className="font-semibold text-gray-900 mb-3">Proveedor</h3>
            <div className="space-y-1">
              <p className="text-gray-900">{gasto.supplier.nombreFiscal}</p>
              <p className="text-gray-600 font-mono">{gasto.supplier.nifCif}</p>
            </div>
          </div>
        )}
      </div>

      {/* Líneas del Gasto */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">Líneas del Gasto</h2>
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
            {gasto.lineas.map((linea) => (
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
            <span className="font-mono font-semibold">€{gasto.baseTotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-gray-900">
            <span>IVA Soportado</span>
            <span className="font-mono font-semibold">€{gasto.ivaTotal.toFixed(2)}</span>
          </div>
          {gasto.retencionTotal > 0 && (
            <div className="flex justify-between text-gray-900">
              <span>IRPF Retenido</span>
              <span className="font-mono font-semibold">-€{gasto.retencionTotal.toFixed(2)}</span>
            </div>
          )}
          <div className="border-t border-gray-300 pt-2 flex justify-between text-lg font-bold text-gray-900">
            <span>Total a Pagar</span>
            <span className="font-mono">€{gasto.totalFactura.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Pagos */}
      {gasto.totalFactura > 0 && (
        <div className="mb-6">
          <CobrosFactura tipo="GASTO" facturaId={gastoId} puedeEditar={puedePagar} fechaFactura={gasto.fechaEmision} onCambio={loadGasto} />
        </div>
      )}

      {/* Contabilizar */}
      {companyId && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <h3 className="font-semibold text-green-900 mb-4">Contabilización</h3>
          <ContabilizarButton
            invoiceId={gastoId}
            companyId={companyId}
            tipo="GASTO"
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
