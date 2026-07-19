'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, MagnifyingGlass, X } from '@phosphor-icons/react';
import { getToken, clearSession } from '@/lib/auth';

const API = '/api/conta';

interface Factura {
  id: string;
  numeroCompleto: string;
  fechaEmision: string;
  cliente: { nombreFiscal: string };
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
};

const statusLabels: Record<string, string> = {
  DRAFT: 'Borrador',
  PENDING: 'Pendiente',
  PAID: 'Pagada',
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
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    setLoading(true);
    try {
      const [factRes, clientRes] = await Promise.all([
        fetch(`${API}/companies/1/income-invoices?limit=100`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API}/companies/1/clientes?limit=100`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (factRes.status === 401 || clientRes.status === 401) {
        clearSession();
        router.replace('/login');
        return;
      }

      if (!factRes.ok || !clientRes.ok) {
        throw new Error('Error al cargar datos');
      }

      const factData = await factRes.json();
      const clientData = await clientRes.json();

      setFacturas(factData.data ?? []);
      setClientes(clientData.data.items ?? clientData.data ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    return facturas.filter(
      (f) =>
        f.numeroCompleto.includes(search) ||
        f.cliente?.nombreFiscal.toLowerCase().includes(search.toLowerCase())
    );
  }, [facturas, search]);

  return (
    <div>
      <header className="sticky top-0 z-40 h-16 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 md:px-8 h-full flex items-center justify-between">
          <h1 className="font-semibold text-slate-900">Facturas de ingreso</h1>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent-600 text-white text-sm font-semibold rounded-lg hover:bg-accent-700 active:scale-[0.98] transition-all"
          >
            <Plus size={16} weight="bold" /> Nueva factura
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-8 flex flex-col gap-6">
        {/* Buscador */}
        <section className="rounded-xl bg-white border border-slate-200 p-4">
          <div className="flex items-center gap-2 border border-slate-300 rounded-lg px-3 py-2">
            <MagnifyingGlass size={18} className="text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por número o cliente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
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
              {loading ? 'Cargando...' : `${filtered.length} factura${filtered.length !== 1 ? 's' : ''}`}
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
                onClick={() => setShowForm(true)}
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
                      <td className="px-6 py-3 font-mono font-medium text-slate-900">
                        {factura.numeroCompleto}
                      </td>
                      <td className="px-6 py-3 text-slate-900">
                        {factura.cliente?.nombreFiscal ?? '-'}
                      </td>
                      <td className="px-6 py-3 text-slate-600">
                        {new Date(factura.fechaEmision).toLocaleDateString('es-ES')}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`inline-block text-xs font-medium border rounded-full px-2.5 py-0.5 ${
                            statusStyles[factura.estado] || statusStyles.DRAFT
                          }`}
                        >
                          {statusLabels[factura.estado] || factura.estado}
                        </span>
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

      {showForm && (
        <NuevaFacturaModal
          clientes={clientes}
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}

function NuevaFacturaModal({
  clientes,
  onClose,
  onCreated,
}: {
  clientes: Cliente[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [clienteId, setClienteId] = useState('');
  const [numero, setNumero] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [baseTotal, setBaseTotal] = useState('');
  const [ivaTotal, setIvaTotal] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const totalFactura =
        Number(baseTotal) + Number(ivaTotal);

      const res = await fetch(`${API}/companies/1/income-invoices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          customerId: clienteId,
          numero: Number(numero),
          serie: 'A',
          fechaEmision: fecha,
          baseTotal: Number(baseTotal),
          ivaTotal: Number(ivaTotal),
          totalFactura,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || `Error ${res.status}`);
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
      setSaving(false);
    }
  }

  const inputClass =
    'rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600 focus:border-accent-600 bg-white';

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-xl shadow-xl p-6 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-900">
            Nueva factura
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 text-slate-500 hover:text-slate-900 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="cliente" className="text-sm font-medium text-slate-700">
              Cliente *
            </label>
            <select
              id="cliente"
              required
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              className={inputClass}
            >
              <option value="">Selecciona un cliente</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombreFiscal} ({c.nifCif})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label htmlFor="numero" className="text-sm font-medium text-slate-700">
                Número *
              </label>
              <input
                id="numero"
                type="number"
                required
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="fecha" className="text-sm font-medium text-slate-700">
                Fecha *
              </label>
              <input
                id="fecha"
                type="date"
                required
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label htmlFor="base" className="text-sm font-medium text-slate-700">
                Base (€) *
              </label>
              <input
                id="base"
                type="number"
                step="0.01"
                required
                value={baseTotal}
                onChange={(e) => setBaseTotal(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="iva" className="text-sm font-medium text-slate-700">
                IVA (€) *
              </label>
              <input
                id="iva"
                type="number"
                step="0.01"
                required
                value={ivaTotal}
                onChange={(e) => setIvaTotal(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 bg-accent-600 text-white font-semibold rounded-lg hover:bg-accent-700 active:scale-[0.98] transition-all disabled:opacity-60 disabled:pointer-events-none"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
