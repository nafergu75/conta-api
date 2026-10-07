'use client';

import { useState } from 'react';
import { CheckCircle, Spinner } from '@phosphor-icons/react';
import { apiFetch, errorMessage } from '@/lib/api';

interface ContabilizarButtonProps {
  invoiceId: string;
  companyId: string;
  tipo: 'INGRESO' | 'GASTO';
  onSuccess?: (journalEntryId: string) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
}

export default function ContabilizarButton({
  invoiceId,
  companyId,
  tipo,
  onSuccess,
  onError,
  disabled = false,
}: ContabilizarButtonProps) {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [journalId, setJournalId] = useState('');

  const handleContabilizar = async () => {
    try {
      setLoading(true);
      setError('');

      // La ruta responde { journalEntryId, estado, ... } sin sobre, y los errores
      // con { error } o { message }: apiFetch lee los dos (antes salia siempre
      // «Error al contabilizar»).
      const data = await apiFetch<{ journalEntryId?: string; id?: string }>(
        `/companies/${encodeURIComponent(companyId)}/accounting/contabilizar/${encodeURIComponent(invoiceId)}?tipo=${tipo}`,
        { method: 'POST' },
      );
      const id = data.journalEntryId || data.id || '';
      setJournalId(id);
      setSuccess(true);
      onSuccess?.(id);
    } catch (err) {
      const message = errorMessage(err) || 'No se pudo contabilizar';
      setError(message);
      onError?.(message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
          <CheckCircle size={20} weight="fill" />
          <span className="font-medium">Factura contabilizada</span>
        </div>
        {journalId && (
          <p className="text-sm text-gray-600">
            Asiento creado: <code className="font-mono bg-gray-100 px-2 py-1 rounded">{journalId}</code>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleContabilizar}
        disabled={disabled || loading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition inline-flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Spinner size={18} className="animate-spin" />
            Contabilizando...
          </>
        ) : (
          'Contabilizar factura'
        )}
      </button>
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
          {error}
        </div>
      )}
    </div>
  );
}
