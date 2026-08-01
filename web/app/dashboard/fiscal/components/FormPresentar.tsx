'use client';

import { useState } from 'react';
import { CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { useParams } from 'next/navigation';
import { ConfirmationModal } from '@/components/dashboard/ConfirmationModal';

interface FormPresentarProps {
  codigo: '111' | '115' | '190' | '200' | '303' | '347' | '390';
  ejercicio: number;
  trimestre?: number;
  onSuccess?: () => void;
  isLoading?: boolean;
}

export function FormPresentar({
  codigo,
  ejercicio,
  trimestre,
  onSuccess,
  isLoading = false,
}: FormPresentarProps) {
  const params = useParams();
  const companyId = params.companyId as string;
  const [formData, setFormData] = useState({
    numero: '',
    fecha: new Date().toISOString().split('T')[0],
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const handleClickMarcar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.numero || !formData.fecha) {
      setError('Por favor completa todos los campos');
      return;
    }
    setShowConfirmation(true);
  };

  const handleConfirm = async () => {
    await handleSubmit();
  };

  const handleSubmit = async () => {
    setError('');
    setSuccess(false);
    setSubmitting(true);
    setShowConfirmation(false);

    try {
      const endpoint =
        codigo === '200'
          ? `/api/companies/${companyId}/tax-models/${codigo}/presentado`
          : `/api/companies/${companyId}/tax-models/${codigo}/presentado`;

      const payload = {
        ejercicio,
        ...(trimestre && { trimestre }),
        justificante: {
          numero: formData.numero,
          fecha: formData.fecha,
        },
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al marcar como presentado');
      }

      setSuccess(true);
      setFormData({ numero: '', fecha: new Date().toISOString().split('T')[0] });
      onSuccess?.();

      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <h3 className="mb-4 font-semibold text-slate-900">Marcar como Presentado</h3>

      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <WarningCircle size={20} className="mt-0.5 text-red-600" />
          <div>
            <p className="font-medium text-red-900">Error</p>
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
          <CheckCircle size={20} className="mt-0.5 text-green-600" />
          <div>
            <p className="font-medium text-green-900">Éxito</p>
            <p className="text-sm text-green-800">
              Modelo {codigo} marcado como presentado correctamente
            </p>
          </div>
        </div>
      )}

      <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              Número de Justificante *
            </label>
            <input
              type="text"
              placeholder="Ej: 2025001234AB"
              value={formData.numero}
              onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
              required
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-slate-500">
              Número de justificante proporcionado por Hacienda
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Fecha de Presentación *
            </label>
            <input
              type="date"
              value={formData.fecha}
              onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
              required
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-4">
          <button
            type="button"
            onClick={handleClickMarcar}
            disabled={submitting || isLoading}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50 hover:bg-green-700"
          >
            {submitting ? 'Guardando...' : 'Marcar como Presentado'}
          </button>

          <button
            type="reset"
            disabled={submitting || isLoading}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-50"
          >
            Limpiar
          </button>
        </div>
      </form>

      <div className="mt-4 border-t border-slate-100 pt-4 text-xs text-slate-500">
        <p className="font-medium text-slate-600">Nota:</p>
        <p>
          Una vez marcado como presentado, el modelo quedará registrado con el número de
          justificante. Este dato se utilizará para auditoría y cumplimiento fiscal.
        </p>
      </div>

      {/* Modal de Confirmación */}
      <ConfirmationModal
        isOpen={showConfirmation}
        title={`Confirmar Presentación – Modelo ${codigo}`}
        message={`¿Estás seguro de que deseas marcar el Modelo ${codigo} ${trimestre ? `(Q${trimestre})` : ''} como presentado?`}
        details={
          <div className="space-y-2">
            <div>
              <span className="font-medium text-slate-900">Número de Justificante:</span>
              <span className="ml-2 text-slate-700">{formData.numero || '—'}</span>
            </div>
            <div>
              <span className="font-medium text-slate-900">Fecha de Presentación:</span>
              <span className="ml-2 text-slate-700">{formData.fecha}</span>
            </div>
            <div>
              <span className="font-medium text-slate-900">Ejercicio:</span>
              <span className="ml-2 text-slate-700">{ejercicio}</span>
            </div>
            <p className="mt-3 text-xs italic text-slate-600">
              Esta acción no se puede deshacer. El modelo quedará marcado como presentado en el sistema.
            </p>
          </div>
        }
        confirmLabel="Marcar como Presentado"
        cancelLabel="Cancelar"
        isDangerous={true}
        isLoading={submitting}
        onConfirm={handleConfirm}
        onCancel={() => setShowConfirmation(false)}
      />
    </div>
  );
}
