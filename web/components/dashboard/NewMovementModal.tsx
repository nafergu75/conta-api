'use client';

import { useState } from 'react';
import { X } from '@phosphor-icons/react';
import { getToken } from '@/lib/auth';

const API = '/api/conta';

export const CATEGORIES = [
  { value: 'ventas', label: 'Ventas' },
  { value: 'servicios', label: 'Servicios' },
  { value: 'suministros', label: 'Suministros' },
  { value: 'oficina', label: 'Oficina' },
  { value: 'software', label: 'Software' },
  { value: 'nominas', label: 'Nóminas' },
  { value: 'impuestos', label: 'Impuestos' },
  { value: 'otros', label: 'Otros' },
];

export const STATUSES = [
  { value: 'draft', label: 'Borrador' },
  { value: 'approved', label: 'Aprobado' },
  { value: 'reconciled', label: 'Conciliado' },
];

export default function NewMovementModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('ventas');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [referenceDocument, setReferenceDocument] = useState('');
  const [status, setStatus] = useState('draft');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`${API}/companies/1/movements`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          type,
          amount: Number(amount),
          category,
          description,
          date,
          referenceDocument: referenceDocument || undefined,
          status,
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
            Nuevo movimiento
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
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType('income')}
              className={`py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
                type === 'income'
                  ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                  : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Ingreso
            </button>
            <button
              type="button"
              onClick={() => setType('expense')}
              className={`py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
                type === 'expense'
                  ? 'bg-rose-50 border-rose-400 text-rose-700'
                  : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Gasto
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="mov-amount" className="text-sm font-medium text-slate-700">
                Importe (€)
              </label>
              <input
                id="mov-amount"
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="mov-date" className="text-sm font-medium text-slate-700">
                Fecha
              </label>
              <input
                id="mov-date"
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="mov-desc" className="text-sm font-medium text-slate-700">
              Descripción
            </label>
            <input
              id="mov-desc"
              type="text"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="mov-cat" className="text-sm font-medium text-slate-700">
                Categoría
              </label>
              <select
                id="mov-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={inputClass}
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="mov-status" className="text-sm font-medium text-slate-700">
                Estado
              </label>
              <select
                id="mov-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={inputClass}
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="mov-ref" className="text-sm font-medium text-slate-700">
              Documento de referencia (opcional)
            </label>
            <input
              id="mov-ref"
              type="text"
              value={referenceDocument}
              onChange={(e) => setReferenceDocument(e.target.value)}
              placeholder="A-2026-045"
              className={`${inputClass} placeholder:text-slate-400`}
            />
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
