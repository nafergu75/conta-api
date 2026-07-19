'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from '@phosphor-icons/react';
import { getToken, clearSession } from '@/lib/auth';

const API = '/api/conta';

interface Cliente {
  id: string;
  nombreFiscal: string;
  nifCif: string;
  email?: string;
  telefono?: string;
}

interface Factura {
  id: string;
  numero: string;
  fecha: string;
  vencimiento?: string;
  total: number;
  estado: string;
  concepto?: string;
  base?: number;
}

export default function ClienteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clienteId = params.id as string;

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState('2026');
  const [selectedPeriod, setSelectedPeriod] = useState('year');

  useEffect(() => {
    const loadData = async () => {
      const token = getToken();
      if (!token) {
        router.replace('/login');
        return;
      }

      setLoading(true);
      try {
        const [clienteRes, facturasRes] = await Promise.all([
          fetch(`${API}/companies/1/clientes/${clienteId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`${API}/income-invoices?customerId=${clienteId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (clienteRes.status === 401) {
          clearSession();
          router.replace('/login');
          return;
        }

        if (clienteRes.ok) {
          const j = await clienteRes.json();
          setCliente(j.data);
        }

        if (facturasRes.ok) {
          const j = await facturasRes.json();
          setFacturas(j.data?.items ?? j.data ?? []);
        }

        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [clienteId, router]);

  const formatCurrency = (n: number) =>
    n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  const formatDate = (d: string) => new Date(d).toLocaleDateString('es-ES');

  const totalFacturado = facturas.reduce((sum, f) => sum + f.total, 0);
  const totalCobrado = facturas
    .filter((f) => f.estado === 'PAID' || f.estado === 'Pagada')
    .reduce((sum, f) => sum + f.total, 0);
  const totalPendiente = totalFacturado - totalCobrado;
  const porcentajeCobrado = totalFacturado > 0 ? (totalCobrado / totalFacturado) * 100 : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-slate-600 mb-2">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-rose-600">Cliente no encontrado</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <header className="sticky top-0 z-40 h-16 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-full flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="font-semibold text-slate-900">{cliente.nombreFiscal}</h1>
            <p className="text-sm text-slate-500">{cliente.nifCif}</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 p-4 mb-6">
            {error}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-4 border-b border-slate-200 mb-6">
          <button className="px-4 py-3 font-medium text-accent-600 border-b-2 border-accent-600">
            Facturas
          </button>
        </div>

        {/* Filtros */}
        <div className="flex gap-4 mb-6 flex-wrap">
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm"
          >
            <option value="2026">2026</option>
            <option value="2025">2025</option>
            <option value="2024">2024</option>
          </select>

          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm"
          >
            <option value="year">Todo el año</option>
            <option value="q1">Trimestre 1</option>
            <option value="q2">Trimestre 2</option>
            <option value="q3">Trimestre 3</option>
            <option value="q4">Trimestre 4</option>
          </select>
        </div>

        {/* Resumen de Cobros */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <p className="text-sm text-slate-600 mb-1">Total Facturado</p>
                <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalFacturado)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600 mb-1">Total Cobrado</p>
                <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalCobrado)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <p className="text-sm text-slate-600 mb-3">Estado de Cobro</p>
            <div className="mb-3">
              <div className="h-6 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${porcentajeCobrado}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-emerald-600 font-semibold">Cobrado</p>
                <p className="text-slate-900">{Math.round(porcentajeCobrado)}%</p>
              </div>
              <div>
                <p className="text-amber-600 font-semibold">Pendiente</p>
                <p className="text-slate-900">{formatCurrency(totalPendiente)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabla de Facturas */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold text-sm text-slate-900">
                    Estado
                  </th>
                  <th className="text-left px-6 py-3 font-semibold text-sm text-slate-900">
                    Número
                  </th>
                  <th className="text-left px-6 py-3 font-semibold text-sm text-slate-900">
                    Emisión
                  </th>
                  <th className="text-left px-6 py-3 font-semibold text-sm text-slate-900">
                    Vencimiento
                  </th>
                  <th className="text-left px-6 py-3 font-semibold text-sm text-slate-900">
                    Concepto
                  </th>
                  <th className="text-right px-6 py-3 font-semibold text-sm text-slate-900">
                    Base (€)
                  </th>
                  <th className="text-right px-6 py-3 font-semibold text-sm text-slate-900">
                    Total (€)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {facturas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                      Sin facturas
                    </td>
                  </tr>
                ) : (
                  facturas.map((factura) => (
                    <tr key={factura.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <span
                          className={`inline-block px-2.5 py-1 rounded text-xs font-semibold ${
                            factura.estado === 'PAID' || factura.estado === 'Pagada'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {factura.estado === 'PAID' || factura.estado === 'Pagada'
                            ? 'Pagada'
                            : 'Pendiente'}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-sm text-slate-900">
                        {factura.numero}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {formatDate(factura.fecha)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {factura.vencimiento ? formatDate(factura.vencimiento) : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">
                        {factura.concepto || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-slate-900 font-mono">
                        {formatCurrency(factura.base || 0)}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-slate-900 font-mono font-semibold">
                        {formatCurrency(factura.total)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 text-sm text-slate-600">
            Mostrando {facturas.length} de {facturas.length} resultados
          </div>
        </div>
      </main>
    </div>
  );
}
