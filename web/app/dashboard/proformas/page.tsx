'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, MagnifyingGlass, X } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { formatoImporte } from '@/lib/moneda';

/**
 * Facturas proforma: mismo documento que la factura, numerado en la serie P,
 * sin efectos fiscales. Desde la ficha de cada una se pasa a factura si el
 * cliente la acepta.
 */

interface Proforma {
  id: string;
  numeroCompleto: string | null;
  fechaEmision: string;
  customerId: string;
  customerNombre: string;
  totalFactura: number;
  estado: string;
  /** Moneda de la proforma y total en ella. */
  moneda?: string;
  totalFacturaDoc?: number;
}
const fecha = (iso: string) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('es-ES') : '');

const ESTADOS: Record<string, { texto: string; clase: string }> = {
  PENDIENTE: { texto: 'Pendiente', clase: 'bg-amber-50 text-amber-700 border-amber-200' },
  ACEPTADA: { texto: 'Aceptada', clase: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  RECHAZADA: { texto: 'Rechazada', clase: 'bg-slate-100 text-slate-600 border-slate-300' },
};

const FILTROS = [
  ['', 'Todas'],
  ['PENDIENTE', 'Pendientes'],
  ['ACEPTADA', 'Aceptadas'],
  ['RECHAZADA', 'Rechazadas'],
] as const;

export default function ProformasPage() {
  const router = useRouter();
  const [proformas, setProformas] = useState<Proforma[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch<{ items: Proforma[] }>(companyPath('/income-invoices?estadoDocumento=PROFORMA&take=500'));
      setProformas(r.items ?? []);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filtradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return proformas
      .filter((p) => !filtro || p.estado === filtro)
      .filter((p) => !q || (p.numeroCompleto ?? '').toLowerCase().includes(q) || p.customerNombre?.toLowerCase().includes(q));
  }, [proformas, search, filtro]);

  const nueva = () => router.push('/dashboard/facturas/nueva?tipo=proforma');

  return (
    <div>
      <header className="sticky top-0 z-40 h-16 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 md:px-8 h-full flex items-center justify-between gap-3">
          <h1 className="font-semibold text-slate-900">Facturas proforma</h1>
          <button
            onClick={nueva}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent-600 text-white text-sm font-semibold rounded-lg hover:bg-accent-700 active:scale-[0.98] transition-all"
          >
            <Plus size={16} weight="bold" /> Nueva proforma
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-8 flex flex-col gap-6">
        <p className="text-sm text-slate-600">
          La proforma tiene el mismo aspecto que la factura, pero no es una factura: no se contabiliza ni cuenta para el IVA.
          Si el cliente la acepta, ábrela y pulsa «Pasar a factura».
        </p>

        <section className="rounded-lg border border-slate-200 bg-white p-4 flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1">
            <label htmlFor="buscar-proforma" className="block text-sm font-medium text-slate-700 mb-2">
              Buscar proforma
            </label>
            <div className="relative">
              <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="buscar-proforma"
                type="text"
                placeholder="Buscar por número o cliente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-9 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  title="Limpiar búsqueda"
                  aria-label="Limpiar búsqueda"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
            {FILTROS.map(([valor, texto]) => (
              <button
                key={valor || 'todas'}
                type="button"
                onClick={() => setFiltro(valor)}
                aria-pressed={filtro === valor}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  filtro === valor ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {texto}
              </button>
            ))}
          </div>
        </section>

        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 p-4 text-sm">{error}</div>}

        <section className="rounded-xl bg-white border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 pt-5 pb-3">
            <h2 className="text-base font-semibold text-slate-900">Resultados</h2>
            <span className="text-sm text-slate-500">
              {loading ? 'Cargando...' : `${filtradas.length} proforma${filtradas.length !== 1 ? 's' : ''}`}
            </span>
          </div>

          {loading ? (
            <div className="h-64 mx-6 mb-6 animate-pulse bg-slate-100 rounded-lg" />
          ) : filtradas.length === 0 ? (
            <div className="px-6 pb-10 pt-4 text-center">
              <p className="text-slate-600 font-medium mb-2">{proformas.length ? 'Sin resultados' : 'Sin proformas'}</p>
              <p className="text-sm text-slate-500 mb-4">
                {proformas.length ? 'Prueba con otro término o estado' : 'Haz una proforma para enviar al cliente antes de facturar'}
              </p>
              {!proformas.length && (
                <button
                  onClick={nueva}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-accent-600 hover:text-accent-700"
                >
                  <Plus size={16} /> Nueva proforma
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-y border-slate-200 bg-slate-50">
                    <th className="px-6 py-3 font-medium">Número</th>
                    <th className="px-6 py-3 font-medium">Cliente</th>
                    <th className="px-6 py-3 font-medium">Fecha</th>
                    <th className="px-6 py-3 font-medium">Estado</th>
                    <th className="px-6 py-3 font-medium text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((p) => {
                    const e = ESTADOS[p.estado];
                    return (
                      <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-3">
                          <Link
                            href={`/dashboard/proformas/${p.id}`}
                            className="font-mono font-medium text-blue-600 hover:text-blue-700 hover:underline"
                          >
                            {p.numeroCompleto}
                          </Link>
                        </td>
                        <td className="px-6 py-3 text-slate-900">
                          <Link href={`/dashboard/proformas/${p.id}`} className="hover:underline hover:text-blue-600">
                            {p.customerNombre ?? '-'}
                          </Link>
                        </td>
                        <td className="px-6 py-3 text-slate-600">{fecha(p.fechaEmision)}</td>
                        <td className="px-6 py-3">
                          <span
                            className={`inline-block text-xs font-medium border rounded-full px-2.5 py-0.5 ${
                              e?.clase ?? 'bg-slate-50 text-slate-700 border-slate-200'
                            }`}
                          >
                            {e?.texto ?? p.estado}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-right font-mono font-medium text-slate-900">
                          {formatoImporte(p.totalFacturaDoc ?? p.totalFactura, p.moneda ?? 'EUR')}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
