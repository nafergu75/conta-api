'use client';

import { useState, useRef } from 'react';
import { Upload, CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { useParams } from 'next/navigation';

interface UploadExtractoFormProps {
  accountId: string;
  onSuccess?: (resultado: any) => void;
}

export function UploadExtractoForm({ accountId, onSuccess }: UploadExtractoFormProps) {
  const params = useParams();
  const companyId = params.companyId as string;
  const [uploading, setUploading] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const content = await file.text();
      const response = await fetch(
        `/api/companies/${companyId}/treasury/bank-accounts/${accountId}/statements`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contenidoCSV: content, origen: 'csv' }),
        }
      );

      if (!response.ok) throw new Error('Error en la subida');

      const data = await response.json();
      setResultado(data);
      onSuccess?.(data);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      setResultado({
        error: error instanceof Error ? error.message : 'Error desconocido',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6">
      <h3 className="mb-4 font-semibold text-slate-900">Subir extracto bancario</h3>

      <div className="mb-4">
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-8 transition hover:border-blue-400 hover:bg-blue-50">
          <Upload size={32} className="mb-2 text-slate-400" />
          <span className="text-sm font-medium text-slate-900">
            {uploading ? 'Subiendo...' : 'Haz clic o arrastra un archivo CSV'}
          </span>
          <span className="text-xs text-slate-500">Formato: fecha,importe,concepto,referencia</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      {resultado && (
        <div
          className={`rounded-lg p-4 ${
            resultado.error
              ? 'border border-red-200 bg-red-50'
              : 'border border-green-200 bg-green-50'
          }`}
        >
          <div className="mb-2 flex items-center gap-2">
            {resultado.error ? (
              <WarningCircle size={20} className="text-red-600" />
            ) : (
              <CheckCircle size={20} className="text-green-600" />
            )}
            <span className={`font-medium ${resultado.error ? 'text-red-900' : 'text-green-900'}`}>
              {resultado.error ? 'Error' : 'Éxito'}
            </span>
          </div>
          {resultado.error ? (
            <p className="text-sm text-red-800">{resultado.error}</p>
          ) : (
            <p className="text-sm text-green-800">
              {resultado.data?.movimientosCreados || 0} movimientos importados
            </p>
          )}
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Formato CSV esperado (con cabecera opcional):
        <br />
        fecha,importe,concepto,referencia
        <br />
        2024-01-15,-500.50,"Pago servicios","REF001"
      </p>
    </div>
  );
}
