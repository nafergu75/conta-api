'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { getToken, clearSession } from '@/lib/auth';
import { ArrowLeft, CheckCircle, Clock, WarningCircle } from '@phosphor-icons/react';
import Link from 'next/link';

interface JournalEntryLine {
  id: string;
  accountCode: string;
  accountName?: string;
  descripcion?: string;
  debe: number;
  haber: number;
  referencia?: string;
}

interface JournalEntry {
  id: string;
  numeroAsiento: string;
  fecha: string;
  descripcion: string;
  origen: string;
  estado: 'DRAFT' | 'PENDING_REVIEW' | 'POSTED' | 'REVERSED';
  invoiceId?: string;
  lineas: JournalEntryLine[];
  totalDebe?: number;
  totalHaber?: number;
}

const API = '/api/conta';

const ESTADO_CONFIG = {
  DRAFT: { color: 'bg-slate-50 text-slate-700 border-slate-200', label: 'Borrador', icon: Clock },
  PENDING_REVIEW: { color: 'bg-yellow-50 text-yellow-700 border-yellow-200', label: 'Revisión', icon: Clock },
  POSTED: { color: 'bg-green-50 text-green-700 border-green-200', label: 'Contabilizado', icon: CheckCircle },
  REVERSED: { color: 'bg-red-50 text-red-700 border-red-200', label: 'Reversado', icon: WarningCircle },
};

export default function AsientoDetailPage() {
  const router = useRouter();
  const params = useParams();
  const asientoId = params.id as string;

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

  const [asiento, setAsiento] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    const loadAsiento = async () => {
      const token = getToken();
      if (!token || !companyId) {
        return;
      }

      try {
        setLoading(true);
        const res = await fetch(
          `${API}/companies/${companyId}/accounting/journal-entries/${asientoId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (res.status === 401) {
          clearSession();
          return;
        }

        if (!res.ok) throw new Error('Error cargando asiento');
        const data = await res.json();
        setAsiento(data.data || data);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    };

    if (companyId) loadAsiento();
  }, [companyId, asientoId]);

  const handleApprove = async () => {
    if (!confirm('¿Aprobar este asiento?')) return;

    const token = getToken();
    if (!token || !companyId) {
      return;
    }

    try {
      setApproving(true);
      const res = await fetch(
        `${API}/companies/${companyId}/accounting/journal-entries/${asientoId}/approve`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ observaciones: 'Aprobado desde detalle del asiento' }),
        }
      );

      if (res.status === 401) {
        clearSession();
        return;
      }

      if (!res.ok) throw new Error('Error aprobando asiento');

      const data = await res.json();
      setAsiento({ ...asiento!, estado: 'POSTED' });
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error aprobando asiento');
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="text-center text-gray-500">Cargando asiento...</div>
      </div>
    );
  }

  if (!asiento) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="text-center text-red-500">Asiento no encontrado</div>
      </div>
    );
  }

  const config = ESTADO_CONFIG[asiento.estado];
  const Icon = config.icon;

  // Calcular totales si no vienen en la respuesta
  const totalDebe = asiento.totalDebe || asiento.lineas.reduce((sum, l) => sum + l.debe, 0);
  const totalHaber = asiento.totalHaber || asiento.lineas.reduce((sum, l) => sum + l.haber, 0);
  const cuadrado = Math.abs(totalDebe - totalHaber) < 0.01;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Encabezado */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/motor-contable"
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Detalle del Asiento</h1>
            <p className="text-gray-600 mt-1">Asiento #{asiento.numeroAsiento}</p>
          </div>
        </div>
        <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border ${config.color}`}>
          <Icon size={16} />
          {config.label}
        </span>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
          {error}
        </div>
      )}

      {/* Información General */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Información General</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="text-sm text-gray-600">Número de Asiento</label>
            <p className="text-lg font-mono font-semibold text-gray-900">{asiento.numeroAsiento}</p>
          </div>
          <div>
            <label className="text-sm text-gray-600">Fecha</label>
            <p className="text-lg font-semibold text-gray-900">
              {new Date(asiento.fecha).toLocaleDateString('es-ES')}
            </p>
          </div>
          <div>
            <label className="text-sm text-gray-600">Origen</label>
            <p className="text-lg font-semibold text-gray-900">
              {asiento.origen === 'FACTURA_INGRESO' ? 'Factura Ingreso' : 'Factura Gasto'}
            </p>
          </div>
          <div>
            <label className="text-sm text-gray-600">Estado</label>
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${config.color}`}>
              {config.label}
            </span>
          </div>
        </div>
        <div className="mt-4">
          <label className="text-sm text-gray-600">Descripción</label>
          <p className="text-gray-900 mt-1">{asiento.descripcion}</p>
        </div>
        {asiento.invoiceId && (
          <div className="mt-4">
            <label className="text-sm text-gray-600">Referencia a Factura</label>
            <p className="text-gray-900 mt-1 font-mono">{asiento.invoiceId}</p>
          </div>
        )}
      </div>

      {/* Líneas del Asiento */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">Líneas del Asiento</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                Cuenta
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                Descripción
              </th>
              <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                Debe (€)
              </th>
              <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                Haber (€)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {asiento.lineas.map((linea) => (
              <tr key={linea.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-mono font-semibold text-gray-900">
                  {linea.accountCode}
                </td>
                <td className="px-6 py-4 text-sm text-gray-700">
                  {linea.accountName || linea.descripcion || '—'}
                </td>
                <td className="px-6 py-4 text-sm text-right font-mono text-gray-700">
                  {linea.debe > 0 ? linea.debe.toFixed(2) : '—'}
                </td>
                <td className="px-6 py-4 text-sm text-right font-mono text-gray-700">
                  {linea.haber > 0 ? linea.haber.toFixed(2) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 border-t border-gray-200 font-semibold">
            <tr>
              <td colSpan={2} className="px-6 py-4 text-sm text-gray-900">
                TOTALES
              </td>
              <td className="px-6 py-4 text-sm text-right font-mono text-gray-900">
                {totalDebe.toFixed(2)}
              </td>
              <td className="px-6 py-4 text-sm text-right font-mono text-gray-900">
                {totalHaber.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Validación de Cuadre */}
      <div className={`border rounded-lg p-4 mb-6 ${cuadrado ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
        <div className="flex items-center gap-2 mb-2">
          {cuadrado ? (
            <>
              <CheckCircle size={20} className="text-green-600" />
              <h3 className="font-semibold text-green-900">Asiento Cuadrado</h3>
            </>
          ) : (
            <>
              <WarningCircle size={20} className="text-red-600" />
              <h3 className="font-semibold text-red-900">Asiento No Cuadrado</h3>
            </>
          )}
        </div>
        <p className={cuadrado ? 'text-green-800' : 'text-red-800'}>
          Total DEBE: {totalDebe.toFixed(2)}€ | Total HABER: {totalHaber.toFixed(2)}€
          {!cuadrado && ` | Diferencia: ${Math.abs(totalDebe - totalHaber).toFixed(2)}€`}
        </p>
      </div>

      {/* Acciones */}
      {asiento.estado === 'PENDING_REVIEW' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <button
            onClick={handleApprove}
            disabled={approving}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2 px-4 rounded-lg transition"
          >
            {approving ? 'Aprobando...' : 'Aprobar Asiento'}
          </button>
        </div>
      )}

      {asiento.estado === 'POSTED' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-900">
          <p className="font-semibold">✓ Este asiento ha sido aprobado y contabilizado</p>
        </div>
      )}
    </div>
  );
}
