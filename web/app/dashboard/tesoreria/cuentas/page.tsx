'use client';

import { useEffect, useState } from 'react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { CuentaBancariaCard } from '../components/CuentaBancariaCard';
import { Plus } from '@phosphor-icons/react';

interface CuentaBancaria {
  id: string;
  iban: string;
  bic?: string;
  bancoNombre?: string;
  entidad?: string;
  saldoInicial: number;
  estado: string;
  movimientos: any[];
}

export default function CuentasPage() {
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    iban: '',
    bic: '',
    bancoNombre: '',
    entidad: '',
    subcuentaCodigo: '',
    saldoInicial: '0',
    observaciones: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchCuentas();
  }, []);

  const fetchCuentas = async () => {
    try {
      setCuentas((await apiFetch<CuentaBancaria[]>(companyPath('/treasury/bank-accounts'))) || []);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      const payload = {
        iban: formData.iban,
        bic: formData.bic || undefined,
        bancoNombre: formData.bancoNombre || undefined,
        entidad: formData.entidad || undefined,
        subcuentaCodigo: formData.subcuentaCodigo,
        saldoInicial: parseFloat(formData.saldoInicial),
        observaciones: formData.observaciones || undefined,
      };

      await apiFetch(companyPath('/treasury/bank-accounts'), {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setSuccess('Cuenta bancaria creada exitosamente');
      setFormData({
        iban: '',
        bic: '',
        bancoNombre: '',
        entidad: '',
        subcuentaCodigo: '',
        saldoInicial: '0',
        observaciones: '',
      });
      setShowForm(false);
      fetchCuentas();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (loading) {
    return <div className="text-center text-slate-500">Cargando cuentas...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Cuentas Bancarias</h1>
          <p className="mt-2 text-slate-600">Gestión de cuentas bancarias de la empresa</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700"
        >
          <Plus size={20} />
          Nueva cuenta
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          {success}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-slate-200 bg-white p-6 space-y-4"
        >
          <h3 className="font-semibold text-slate-900">Nueva cuenta bancaria</h3>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">IBAN *</label>
              <input
                type="text"
                placeholder="ES9121000418450200051332"
                value={formData.iban}
                onChange={(e) => setFormData({ ...formData, iban: e.target.value })}
                required
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">BIC</label>
              <input
                type="text"
                placeholder="BBVAESMM"
                value={formData.bic}
                onChange={(e) => setFormData({ ...formData, bic: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Banco</label>
              <input
                type="text"
                placeholder="BBVA"
                value={formData.bancoNombre}
                onChange={(e) => setFormData({ ...formData, bancoNombre: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Entidad</label>
              <input
                type="text"
                placeholder="0182"
                value={formData.entidad}
                onChange={(e) => setFormData({ ...formData, entidad: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Subcuenta *</label>
              <input
                type="text"
                placeholder="0001"
                value={formData.subcuentaCodigo}
                onChange={(e) => setFormData({ ...formData, subcuentaCodigo: e.target.value })}
                required
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Saldo Inicial</label>
              <input
                type="number"
                placeholder="0.00"
                value={formData.saldoInicial}
                onChange={(e) => setFormData({ ...formData, saldoInicial: e.target.value })}
                step="0.01"
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">Observaciones</label>
            <textarea
              value={formData.observaciones}
              onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              rows={3}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              Crear cuenta
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {cuentas.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <p className="text-slate-500">No hay cuentas bancarias configuradas</p>
          <button
            onClick={() => setShowForm(true)}
            className="mt-4 text-blue-600 hover:text-blue-700 font-medium"
          >
            Crear primera cuenta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cuentas.map((cuenta) => (
            <CuentaBancariaCard
              key={cuenta.id}
              id={cuenta.id}
              iban={cuenta.iban}
              bancoNombre={cuenta.bancoNombre}
              entidad={cuenta.entidad}
              saldoInicial={cuenta.saldoInicial || 0}
              estado={cuenta.estado || 'activa'}
              pendientes={cuenta.movimientos?.filter((m) => m.estado === 'pendiente').length || 0}
              conciliados={cuenta.movimientos?.filter((m) => m.estado === 'conciliado').length || 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
