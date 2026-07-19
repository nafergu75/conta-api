'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from '@phosphor-icons/react';
import { getToken, clearSession } from '@/lib/auth';

const API = '/api/conta';

interface Cliente {
  id: string;
  nombreFiscal: string;
  nifCif: string;
}

export default function NuevaFacturaPage() {
  const router = useRouter();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    clienteId: '',
    numero: '',
    fechaEmision: new Date().toISOString().split('T')[0],
    fechaVencimiento: '',
    base: '',
    iva: '21',
    concepto: '',
  });

  useEffect(() => {
    const loadClientes = async () => {
      const token = getToken();
      if (!token) {
        router.replace('/login');
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(`${API}/companies/1/clientes?limit=1000`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          clearSession();
          router.replace('/login');
          return;
        }
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const data = await res.json();
        setClientes(data.data?.items ?? data.data ?? []);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar clientes');
      } finally {
        setLoading(false);
      }
    };

    loadClientes();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clienteId) {
      setError('Selecciona un cliente');
      return;
    }

    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }

    try {
      const base = parseFloat(formData.base);
      const iva = parseFloat(formData.iva);
      const ivaAmount = base * (iva / 100);
      const total = base + ivaAmount;

      const res = await fetch(`${API}/companies/1/income-invoices`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          customerId: formData.clienteId,
          invoiceNumber: formData.numero,
          invoiceDate: formData.fechaEmision,
          dueDate: formData.fechaVencimiento,
          description: formData.concepto,
          baseAmount: base,
          ivaPercentage: iva,
          totalAmount: total,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Error ${res.status}`);
      }

      router.push('/dashboard/facturas');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar factura');
    }
  };

  const inputClass =
    'w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600 focus:border-accent-600 bg-white';

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
          <h1 className="font-semibold text-slate-900">Nuevo ingreso</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 md:px-8 py-8">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 p-4 mb-6">
            {error}
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-xl p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Cliente */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700">
                  Cliente *
                </label>
                <select
                  required
                  value={formData.clienteId}
                  onChange={(e) =>
                    setFormData({ ...formData, clienteId: e.target.value })
                  }
                  className={inputClass}
                  disabled={loading}
                >
                  <option value="">
                    {loading ? 'Cargando...' : 'Selecciona un cliente'}
                  </option>
                  {clientes.map((cliente) => (
                    <option key={cliente.id} value={cliente.id}>
                      {cliente.nombreFiscal}
                    </option>
                  ))}
                </select>
              </div>

              {/* Número de factura */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700">
                  Número de factura
                </label>
                <input
                  type="text"
                  placeholder="Ej: FAC-001"
                  value={formData.numero}
                  onChange={(e) =>
                    setFormData({ ...formData, numero: e.target.value })
                  }
                  className={inputClass}
                />
              </div>

              {/* Fecha de emisión */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700">
                  Fecha de emisión *
                </label>
                <input
                  type="date"
                  required
                  value={formData.fechaEmision}
                  onChange={(e) =>
                    setFormData({ ...formData, fechaEmision: e.target.value })
                  }
                  className={inputClass}
                />
              </div>

              {/* Fecha de vencimiento */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700">
                  Fecha de vencimiento
                </label>
                <input
                  type="date"
                  value={formData.fechaVencimiento}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      fechaVencimiento: e.target.value,
                    })
                  }
                  className={inputClass}
                />
              </div>

              {/* Base imponible */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700">
                  Base imponible (€) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  required
                  value={formData.base}
                  onChange={(e) =>
                    setFormData({ ...formData, base: e.target.value })
                  }
                  className={inputClass}
                />
              </div>

              {/* IVA */}
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-slate-700">
                  IVA (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="21"
                  value={formData.iva}
                  onChange={(e) =>
                    setFormData({ ...formData, iva: e.target.value })
                  }
                  className={inputClass}
                />
              </div>
            </div>

            {/* Concepto */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-700">
                Concepto
              </label>
              <textarea
                placeholder="Descripción de los servicios/productos"
                value={formData.concepto}
                onChange={(e) =>
                  setFormData({ ...formData, concepto: e.target.value })
                }
                className={`${inputClass} resize-none`}
                rows={3}
              />
            </div>

            {/* Resumen */}
            {formData.base && (
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-slate-600 mb-1">Base</p>
                    <p className="font-semibold text-slate-900">
                      {parseFloat(formData.base || '0').toLocaleString('es-ES', {
                        style: 'currency',
                        currency: 'EUR',
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-600 mb-1">IVA</p>
                    <p className="font-semibold text-slate-900">
                      {(
                        parseFloat(formData.base || '0') *
                        (parseFloat(formData.iva || '0') / 100)
                      ).toLocaleString('es-ES', {
                        style: 'currency',
                        currency: 'EUR',
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-600 mb-1">Total</p>
                    <p className="font-semibold text-accent-600 text-lg">
                      {(
                        parseFloat(formData.base || '0') +
                        parseFloat(formData.base || '0') *
                          (parseFloat(formData.iva || '0') / 100)
                      ).toLocaleString('es-ES', {
                        style: 'currency',
                        currency: 'EUR',
                      })}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Botones */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => router.back()}
                className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 bg-accent-600 text-white font-semibold rounded-lg hover:bg-accent-700 active:scale-[0.98] transition-all"
              >
                Guardar factura
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
