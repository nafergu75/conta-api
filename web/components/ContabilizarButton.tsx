'use client';

import { useState } from 'react';
import { getToken, clearSession } from '@/lib/auth';
import { CheckCircle, Spinner } from '@phosphor-icons/react';

interface ContabilizarButtonProps {
  invoiceId: string;
  companyId: string;
  tipo: 'INGRESO' | 'GASTO';
  onSuccess?: (journalEntryId: string) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
}

const API = '/api/conta';

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
    const token = getToken();
    if (!token) {
      setError('No autorizado');
      onError?.('No autorizado');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const res = await fetch(
        `${API}/companies/${companyId}/accounting/contabilizar/${invoiceId}?tipo=${tipo}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (res.status === 401) {
        clearSession();
        setError('Sesión expirada');
        onError?.('Sesión expirada');
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error?.message || 'Error al contabilizar');
      }

      const data = await res.json();
      const id = data.data?.id || data.journalEntryId;
      setJournalId(id);
      setSuccess(true);
      onSuccess?.(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
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
          <span className="font-medium">Contabilizado exitosamente</span>
        </div>
        {journalId && (
          <p className="text-sm text-gray-600">
            ID del asiento: <code className="font-mono bg-gray-100 px-2 py-1 rounded">{journalId}</code>
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
          'Contabilizar Factura'
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
