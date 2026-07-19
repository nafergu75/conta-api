'use client';

import { useEffect, useState } from 'react';
import { X } from '@phosphor-icons/react';
import { getToken } from '@/lib/auth';

const API = '/api/conta';

interface Cliente {
  id: string;
  nombreFiscal: string;
  nifCif: string;
  email?: string;
  telefono?: string;
  provincia?: string;
}

interface Factura {
  id: string;
  numero: string;
  fecha: string;
  total: number;
  estado: string;
  customerId: string;
}

interface Movimiento {
  id: string;
  fecha: string;
  descripcion: string;
  importe: number;
  tipo: string;
  documento?: string;
  estado?: string;
}

export function ClienteLedgerModal({
  cliente,
  onClose,
}: {
  cliente: Cliente;
  onClose: () => void;
}) {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      const token = getToken();
      if (!token) return;

      setLoading(true);
      try {
        const [facturasRes, movimientosRes] = await Promise.all([
          fetch(`${API}/income-invoices?customerId=${cliente.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API}/companies/1/movements?type=income&customerId=${cliente.id}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!isMounted) return;

        if (facturasRes.ok) {
          const j = await facturasRes.json();
          setFacturas(j.data?.items ?? j.data ?? []);
        } else {
          setFacturas([]);
        }

        if (movimientosRes.ok) {
          const j = await movimientosRes.json();
          setMovimientos(j.data?.items ?? j.data ?? []);
        } else {
          setMovimientos([]);
        }

        setError(null);
      } catch (e) {
        if (isMounted) {
          setError(e instanceof Error ? e.message : 'Error desconocido');
          setFacturas([]);
          setMovimientos([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [cliente.id]);

  const formatCurrency = (n: number) =>
    n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  const formatDate = (d: string) => new Date(d).toLocaleDateString('es-ES');

  const totalFacturado = facturas.reduce((sum, f) => sum + f.total, 0);
  const totalPagado = movimientos
    .filter((m) => m.tipo === 'pago')
    .reduce((sum, m) => sum + m.importe, 0);
  const saldoPendiente = totalFacturado - totalPagado;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-white rounded-xl shadow-xl max-h-[90dvh] overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Mayor de {cliente.nombreFiscal}
            </h2>
            <p className="text-sm text-slate-500">{cliente.nifCif}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 text-slate-500 hover:text-slate-900 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-6">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 p-4 text-sm">
              {error}
            </div>
          )}

          {/* Resumen */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
              <p className="text-xs text-blue-600 font-semibold mb-1">Total Facturado</p>
              <p className="text-2xl font-bold text-blue-900">{formatCurrency(totalFacturado)}</p>
            </div>
            <div className="rounded-lg bg-green-50 border border-green-200 p-4">
              <p className="text-xs text-green-600 font-semibold mb-1">Total Pagado</p>
              <p className="text-2xl font-bold text-green-900">{formatCurrency(totalPagado)}</p>
            </div>
            <div
              className={`rounded-lg p-4 border ${
                saldoPendiente > 0
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-emerald-50 border-emerald-200'
              }`}
            >
              <p
                className={`text-xs font-semibold mb-1 ${
                  saldoPendiente > 0 ? 'text-amber-600' : 'text-emerald-600'
                }`}
              >
                Saldo Pendiente
              </p>
              <p
                className={`text-2xl font-bold ${
                  saldoPendiente > 0 ? 'text-amber-900' : 'text-emerald-900'
                }`}
              >
                {formatCurrency(saldoPendiente)}
              </p>
            </div>
          </div>

          {/* Facturas */}
          <div>
            <h3 className="font-semibold text-slate-900 mb-4">
              Facturas de Venta ({facturas.length})
            </h3>
            {loading ? (
              <div className="text-center py-8 text-slate-500">Cargando...</div>
            ) : facturas.length === 0 ? (
              <div className="text-center py-8 text-slate-500">Sin facturas</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-2 font-semibold text-slate-900">
                        Número
                      </th>
                      <th className="text-left px-4 py-2 font-semibold text-slate-900">
                        Fecha
                      </th>
                      <th className="text-right px-4 py-2 font-semibold text-slate-900">
                        Importe
                      </th>
                      <th className="text-left px-4 py-2 font-semibold text-slate-900">
                        Estado
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {facturas.map((f) => (
                      <tr key={f.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-slate-700">{f.numero}</td>
                        <td className="px-4 py-3 text-slate-600">{formatDate(f.fecha)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">
                          {formatCurrency(f.total)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-block px-2 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-700">
                            {f.estado}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagos */}
          <div>
            <h3 className="font-semibold text-slate-900 mb-4">
              Pagos Recibidos ({movimientos.filter((m) => m.tipo === 'pago').length})
            </h3>
            {loading ? (
              <div className="text-center py-8 text-slate-500">Cargando...</div>
            ) : movimientos.length === 0 ? (
              <div className="text-center py-8 text-slate-500">Sin pagos</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-2 font-semibold text-slate-900">
                        Fecha
                      </th>
                      <th className="text-left px-4 py-2 font-semibold text-slate-900">
                        Descripción
                      </th>
                      <th className="text-right px-4 py-2 font-semibold text-slate-900">
                        Importe
                      </th>
                      <th className="text-left px-4 py-2 font-semibold text-slate-900">
                        Documento
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {movimientos.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-600">{formatDate(m.fecha)}</td>
                        <td className="px-4 py-3 text-slate-700">{m.descripcion}</td>
                        <td className="px-4 py-3 text-right font-semibold text-green-600">
                          +{formatCurrency(m.importe)}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-600">
                          {m.documento || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
