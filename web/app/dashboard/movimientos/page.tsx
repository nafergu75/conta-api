'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FunnelSimple, X } from '@phosphor-icons/react';
import { getToken, clearSession } from '@/lib/auth';
import NewMovementModal, {
  CATEGORIES,
  STATUSES,
} from '@/components/dashboard/NewMovementModal';

const API = '/api/conta';

interface Movement {
  id: string;
  type: 'income' | 'expense';
  amount: string;
  category: string;
  description: string;
  date: string;
  referenceDocument?: string;
  status: string;
}

const eur = (n: number) =>
  n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

const statusStyles: Record<string, string> = {
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  reconciled: 'bg-slate-100 text-slate-700 border-slate-300',
  draft: 'bg-amber-50 text-amber-700 border-amber-200',
};

const statusLabels: Record<string, string> = {
  approved: 'Aprobado',
  reconciled: 'Conciliado',
  draft: 'Borrador',
};

export default function MovimientosPage() {
  const router = useRouter();
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Filtros servidor (la API los soporta como query params)
  const [type, setType] = useState('');
  const [category, setCategory] = useState('');
  // Filtros cliente
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const loadData = useCallback(async () => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (type) params.set('type', type);
      if (category) params.set('category', category);

      const r = await fetch(`${API}/companies/1/movements?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.status === 401) {
        clearSession();
        router.replace('/login');
        return;
      }
      if (!r.ok) throw new Error(`Error ${r.status}`);
      const j = await r.json();
      setMovements(j.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [router, type, category]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    return movements.filter((m) => {
      if (status && m.status !== status) return false;
      const d = m.date.slice(0, 10);
      if (dateFrom && d < dateFrom) return false;
      if (dateTo && d > dateTo) return false;
      return true;
    });
  }, [movements, status, dateFrom, dateTo]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const m of filtered) {
      if (m.type === 'income') income += Number(m.amount);
      else expense += Number(m.amount);
    }
    return { income, expense, net: income - expense };
  }, [filtered]);

  const hasFilters = type || category || status || dateFrom || dateTo;

  function clearFilters() {
    setType('');
    setCategory('');
    setStatus('');
    setDateFrom('');
    setDateTo('');
  }

  const selectClass =
    'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600 focus:border-accent-600';

  return (
    <div>
      <header className="sticky top-0 z-40 h-16 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 md:px-8 h-full flex items-center justify-between">
          <h1 className="font-semibold text-slate-900">Movimientos</h1>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent-600 text-white text-sm font-semibold rounded-lg hover:bg-accent-700 active:scale-[0.98] transition-all"
          >
            <Plus size={16} weight="bold" /> Nuevo movimiento
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-8 flex flex-col gap-6">
        {/* Barra de filtros */}
        <section className="rounded-xl bg-white border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-slate-900">
            <FunnelSimple size={18} className="text-accent-600" />
            Filtros
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 transition-colors"
              >
                <X size={13} /> Limpiar filtros
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="f-type" className="text-xs font-medium text-slate-500">
                Tipo
              </label>
              <select
                id="f-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className={selectClass}
              >
                <option value="">Todos</option>
                <option value="income">Ingresos</option>
                <option value="expense">Gastos</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="f-cat" className="text-xs font-medium text-slate-500">
                Categoría
              </label>
              <select
                id="f-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={selectClass}
              >
                <option value="">Todas</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="f-status" className="text-xs font-medium text-slate-500">
                Estado
              </label>
              <select
                id="f-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={selectClass}
              >
                <option value="">Todos</option>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="f-from" className="text-xs font-medium text-slate-500">
                Desde
              </label>
              <input
                id="f-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className={selectClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="f-to" className="text-xs font-medium text-slate-500">
                Hasta
              </label>
              <input
                id="f-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className={selectClass}
              />
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 p-4 text-sm">
            {error}
          </div>
        )}

        {/* Totales del filtro */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl bg-white border border-slate-200 p-4">
            <p className="text-sm text-slate-500 mb-1">Ingresos filtrados</p>
            <p className="text-xl font-semibold font-mono text-emerald-700">
              {eur(totals.income)}
            </p>
          </div>
          <div className="rounded-xl bg-white border border-slate-200 p-4">
            <p className="text-sm text-slate-500 mb-1">Gastos filtrados</p>
            <p className="text-xl font-semibold font-mono text-rose-600">
              {eur(totals.expense)}
            </p>
          </div>
          <div className="rounded-xl bg-white border border-emerald-300 p-4">
            <p className="text-sm text-slate-500 mb-1">Neto</p>
            <p className="text-xl font-semibold font-mono text-slate-900">
              {eur(totals.net)}
            </p>
          </div>
        </section>

        {/* Tabla */}
        <section className="rounded-xl bg-white border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <h2 className="text-base font-semibold text-slate-900">
              Resultados
            </h2>
            <span className="text-sm text-slate-500">
              {loading ? 'Cargando...' : `${filtered.length} movimientos`}
            </span>
          </div>

          {loading ? (
            <div className="h-64 mx-6 mb-6 animate-pulse bg-slate-100 rounded-lg" />
          ) : filtered.length === 0 ? (
            <div className="px-6 pb-10 pt-4 text-center">
              <p className="text-slate-600 font-medium mb-1">
                Sin resultados con estos filtros
              </p>
              <p className="text-sm text-slate-500 mb-4">
                Prueba a ampliar el rango de fechas o quitar algún filtro.
              </p>
              <button
                onClick={clearFilters}
                className="text-sm font-semibold text-accent-600 hover:text-accent-700"
              >
                Limpiar filtros
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-y border-slate-200 bg-slate-50">
                    <th className="px-6 py-3 font-medium">Fecha</th>
                    <th className="px-6 py-3 font-medium">Descripción</th>
                    <th className="px-6 py-3 font-medium">Categoría</th>
                    <th className="px-6 py-3 font-medium">Documento</th>
                    <th className="px-6 py-3 font-medium">Estado</th>
                    <th className="px-6 py-3 font-medium text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                        {new Date(m.date).toLocaleDateString('es-ES')}
                      </td>
                      <td className="px-6 py-3 text-slate-900 font-medium">
                        {m.description}
                      </td>
                      <td className="px-6 py-3 text-slate-600 capitalize">
                        {m.category}
                      </td>
                      <td className="px-6 py-3 font-mono text-slate-500">
                        {m.referenceDocument ?? '-'}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`inline-block text-xs font-medium border rounded-full px-2.5 py-0.5 ${
                            statusStyles[m.status] ?? statusStyles.draft
                          }`}
                        >
                          {statusLabels[m.status] ?? m.status}
                        </span>
                      </td>
                      <td
                        className={`px-6 py-3 text-right font-mono font-medium whitespace-nowrap ${
                          m.type === 'income'
                            ? 'text-emerald-700'
                            : 'text-rose-600'
                        }`}
                      >
                        {m.type === 'income' ? '+' : '-'}
                        {eur(Number(m.amount))}
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
        <NewMovementModal
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
