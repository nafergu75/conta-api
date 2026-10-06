'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, MagnifyingGlass, X } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';

interface Factura {
  id: string;
  numeroCompleto: string | null;
  estadoDocumento: 'BORRADOR' | 'FINAL';
  esRectificativa: boolean;
  fechaEmision: string;
  customerId: string;
  customerNombre: string;
  baseTotal: number;
  ivaTotal: number;
  totalFactura: number;
  estado: string;
}

interface Cliente {
  id: string;
  nombreFiscal: string;
  nifCif: string;
}

const eur = (n: number) =>
  n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

const statusStyles: Record<string, string> = {
  DRAFT: 'bg-amber-50 text-amber-700 border-amber-200',
  PENDING: 'bg-blue-50 text-blue-700 border-blue-200',
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  OVERDUE: 'bg-rose-50 text-rose-700 border-rose-200',
  ACCOUNTED: 'bg-slate-50 text-slate-700 border-slate-200',
};

const statusLabels: Record<string, string> = {
  DRAFT: 'Borrador',
  PENDING: 'Pendiente',
  PAID: 'Cobrada',
  ACCOUNTED: 'Contabilizada',
  OVERDUE: 'Vencida',
};

export default function FacturasPage() {
  const router = useRouter();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [fact, cli] = await Promise.all([
        apiFetch<{ items: Factura[] }>(companyPath('/income-invoices?take=500')),
        apiFetch<{ items: Cliente[] } | Cliente[]>(companyPath('/clientes?limit=1000')),
      ]);
      setFacturas(fact.items ?? []);
      setClientes(Array.isArray(cli) ? cli : cli.items ?? []);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const clienteMap = useMemo(() => {
    const map = new Map<string, Cliente>();
    clientes.forEach(c => map.set(c.id, c));
    return map;
  }, [clientes]);

  const filtered = useMemo(() => {
    if (!search.trim()) return facturas;
    const searchLower = search.toLowerCase();
    return facturas.filter((f) => {
      const cliente = clienteMap.get(f.customerId);
      return (
        (f.numeroCompleto ?? 'borrador').toLowerCase().includes(searchLower) ||
        f.customerNombre?.toLowerCase().includes(searchLower) ||
        cliente?.nifCif.toLowerCase().includes(searchLower)
      );
    });
  }, [facturas, search, clienteMap]);

  return (
    <div>
      <header className="sticky top-0 z-40 h-16 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 md:px-8 h-full flex items-center justify-between">
          <h1 className="font-semibold text-slate-900">Facturas de ingreso</h1>
          <button
            onClick={() => router.push('/dashboard/facturas/nueva')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent-600 text-white text-sm font-semibold rounded-lg hover:bg-accent-700 active:scale-[0.98] transition-all"
          >
            <Plus size={16} weight="bold" /> Nueva factura
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-8 flex flex-col gap-6">
        {/* Buscador */}
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Buscar factura
          </label>
          <div className="relative">
            <MagnifyingGlass
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Buscar por número, cliente o NIF..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-9 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                title="Limpiar búsqueda"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 p-4 text-sm">
            {error}
          </div>
        )}

        {/* Tabla de facturas */}
        <section className="rounded-xl bg-white border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <h2 className="text-base font-semibold text-slate-900">
              Resultados
            </h2>
            <span className="text-sm text-slate-500">
              {loading ? 'Cargando...' : search ? `${filtered.length}/${facturas.length} factura${filtered.length !== 1 ? 's' : ''}` : `${facturas.length} factura${facturas.length !== 1 ? 's' : ''}`}
            </span>
          </div>

          {loading ? (
            <div className="h-64 mx-6 mb-6 animate-pulse bg-slate-100 rounded-lg" />
          ) : filtered.length === 0 ? (
            <div className="px-6 pb-10 pt-4 text-center">
              <p className="text-slate-600 font-medium mb-2">
                {search ? 'Sin resultados' : 'Sin facturas'}
              </p>
              <p className="text-sm text-slate-500 mb-4">
                {search
                  ? 'Prueba con otro término de búsqueda'
                  : 'Crea la primera factura para comenzar'}
              </p>
              <button
                onClick={() => router.push('/dashboard/facturas/nueva')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-accent-600 hover:text-accent-700"
              >
                <Plus size={16} /> Nueva factura
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-y border-slate-200 bg-slate-50">
                    <th className="px-6 py-3 font-medium">Número</th>
                    <th className="px-6 py-3 font-medium">Cliente</th>
                    <th className="px-6 py-3 font-medium">Emisión</th>
                    <th className="px-6 py-3 font-medium">Estado</th>
                    <th className="px-6 py-3 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((factura) => (
                    <tr
                      key={factura.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-3">
                        <Link
                          href={`/dashboard/facturas/${factura.id}`}
                          className="font-mono font-medium text-blue-600 hover:text-blue-700 hover:underline"
                        >
                          {factura.numeroCompleto ?? <span className="font-sans italic text-slate-500">Borrador</span>}
                        </Link>
                        {factura.esRectificativa && <span className="ml-2 text-xs text-amber-700">Rectificativa</span>}
                      </td>
                      <td className="px-6 py-3 text-slate-900">
                        <Link
                          href={`/dashboard/facturas/${factura.id}`}
                          className="hover:underline hover:text-blue-600"
                        >
                          {factura.customerNombre ?? '-'}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-slate-600">
                        {new Date(factura.fechaEmision).toLocaleDateString('es-ES')}
                      </td>
                      <td className="px-6 py-3">
                        {factura.estadoDocumento === 'BORRADOR' ? (
                          <span className={`inline-block text-xs font-medium border rounded-full px-2.5 py-0.5 ${statusStyles.DRAFT}`}>
                            Borrador
                          </span>
                        ) : (
                          <span
                            className={`inline-block text-xs font-medium border rounded-full px-2.5 py-0.5 ${
                              statusStyles[factura.estado] || statusStyles.DRAFT
                            }`}
                          >
                            {statusLabels[factura.estado] || factura.estado}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-right font-mono font-medium text-slate-900">
                        {eur(factura.totalFactura)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

    </div>
  );
}
