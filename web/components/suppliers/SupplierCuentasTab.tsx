'use client';

import { useEffect, useState } from 'react';
import { Trash, Plus, Check, X, Star } from '@phosphor-icons/react';
import { getToken } from '@/lib/auth';

const API = '/api/conta';

interface CuentaBancaria {
  id: string;
  iban: string;
  bic?: string;
  banco?: string;
  alias: string;
  formaPagoPorDefecto: string;
  esPrincipal: boolean;
  observaciones?: string;
}

interface SupplierCuentasTabProps {
  supplierId: string;
  companyId: string;
}

export function SupplierCuentasTab({ supplierId, companyId }: SupplierCuentasTabProps) {
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  const [formData, setFormData] = useState({
    iban: '',
    bic: '',
    banco: '',
    alias: 'Cuenta principal',
    formaPagoPorDefecto: 'transferencia',
    esPrincipal: false,
  });

  useEffect(() => {
    loadCuentas();
  }, []);

  const loadCuentas = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/companies/${companyId}/proveedores/${supplierId}/bank-accounts`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (!res.ok) throw new Error(`Error ${res.status}`);

      const data = await res.json();
      setCuentas(data.data || data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar cuentas');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      iban: '',
      bic: '',
      banco: '',
      alias: 'Cuenta principal',
      formaPagoPorDefecto: 'transferencia',
      esPrincipal: false,
    });
  };

  const handleCrear = async () => {
    if (!formData.iban.trim()) {
      setError('El IBAN es requerido');
      return;
    }

    try {
      const res = await fetch(`${API}/companies/${companyId}/proveedores/${supplierId}/bank-accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || `Error ${res.status}`);
      }

      setCreando(false);
      resetForm();
      await loadCuentas();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear cuenta');
    }
  };

  const handleEliminar = async (cuentaId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta cuenta bancaria?')) return;

    try {
      const res = await fetch(`${API}/companies/${companyId}/proveedores/${supplierId}/bank-accounts/${cuentaId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (!res.ok) throw new Error(`Error ${res.status}`);

      await loadCuentas();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar');
    }
  };

  const handleSetPrincipal = async (cuentaId: string) => {
    try {
      const res = await fetch(`${API}/companies/${companyId}/proveedores/${supplierId}/bank-accounts/${cuentaId}/set-principal`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (!res.ok) throw new Error(`Error ${res.status}`);

      await loadCuentas();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <p className="text-slate-600">Cargando cuentas bancarias...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-700 p-4">{error}</div>}

      {!creando && (
        <button
          onClick={() => setCreando(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-accent-600 text-white font-semibold rounded-lg hover:bg-accent-700 transition-colors"
        >
          <Plus size={18} /> Añadir cuenta bancaria
        </button>
      )}

      {/* Formulario de creación */}
      {creando && (
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 space-y-4">
          <h3 className="font-semibold text-slate-900">Nueva Cuenta Bancaria</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="IBAN *"
              value={formData.iban}
              onChange={e => setFormData({ ...formData, iban: e.target.value.toUpperCase() })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-600 font-mono"
            />
            <input
              type="text"
              placeholder="BIC/SWIFT"
              value={formData.bic}
              onChange={e => setFormData({ ...formData, bic: e.target.value.toUpperCase() })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-600 font-mono"
            />
            <input
              type="text"
              placeholder="Nombre del banco"
              value={formData.banco}
              onChange={e => setFormData({ ...formData, banco: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-600"
            />
            <input
              type="text"
              placeholder="Alias (ej: Cuenta principal)"
              value={formData.alias}
              onChange={e => setFormData({ ...formData, alias: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-600"
            />
            <select
              value={formData.formaPagoPorDefecto}
              onChange={e => setFormData({ ...formData, formaPagoPorDefecto: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-600"
            >
              <option value="transferencia">Transferencia bancaria</option>
              <option value="recibo">Recibo</option>
              <option value="domiciliacion">Domiciliación</option>
              <option value="otro">Otra</option>
            </select>
            <label className="flex items-center gap-2 py-2">
              <input
                type="checkbox"
                checked={formData.esPrincipal}
                onChange={e => setFormData({ ...formData, esPrincipal: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300"
              />
              <span className="text-sm text-slate-700">Cuenta principal</span>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCrear}
              className="inline-flex items-center gap-2 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700"
            >
              <Check size={16} /> Guardar
            </button>
            <button
              onClick={() => {
                setCreando(false);
                resetForm();
              }}
              className="inline-flex items-center gap-2 px-3 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded hover:bg-slate-100"
            >
              <X size={16} /> Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de cuentas */}
      {cuentas.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
          <p className="text-slate-600">No hay cuentas bancarias registradas</p>
        </div>
      ) : (
        <div className="space-y-3">
          {cuentas.map(cuenta => (
            <div key={cuenta.id} className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-mono font-semibold text-slate-900">{cuenta.iban}</h4>
                    {cuenta.esPrincipal && <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded">Principal</span>}
                  </div>
                  <p className="text-sm text-slate-600 mt-2">Alias: {cuenta.alias}</p>
                  {cuenta.banco && <p className="text-sm text-slate-600">Banco: {cuenta.banco}</p>}
                  {cuenta.bic && <p className="text-sm text-slate-600 font-mono">BIC: {cuenta.bic}</p>}
                  <p className="text-sm text-slate-600">Forma de pago: {cuenta.formaPagoPorDefecto}</p>
                </div>
                <div className="flex gap-2">
                  {!cuenta.esPrincipal && (
                    <button
                      onClick={() => handleSetPrincipal(cuenta.id)}
                      className="p-2 text-slate-400 hover:text-amber-600 transition-colors"
                      aria-label="Establecer como principal"
                    >
                      <Star size={18} />
                    </button>
                  )}
                  <button
                    onClick={() => handleEliminar(cuenta.id)}
                    className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                    aria-label="Eliminar"
                  >
                    <Trash size={18} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
