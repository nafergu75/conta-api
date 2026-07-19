'use client';


import React, { useState, useRef , Suspense} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Upload, X, Check, AlertCircle, Loader } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

interface UploadedFile {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
}

function OcrUploadPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, getAuthHeader } = useAuth();
  const companyId = searchParams.get('companyId') || '1';

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [invoiceType, setInvoiceType] = useState<'expense' | 'income'>('expense');
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const newFiles = selectedFiles.map((file) => ({
      file,
      progress: 0,
      status: 'pending' as const,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const droppedFiles = Array.from(e.dataTransfer.files || []);
    const newFiles = droppedFiles.map((file) => ({
      file,
      progress: 0,
      status: 'pending' as const,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (files.length === 0) return;

    setUploading(true);

    for (let i = 0; i < files.length; i++) {
      const fileData = files[i];

      try {
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: 'uploading' } : f
          )
        );

        const formData = new FormData();
        formData.append('file', fileData.file);
        formData.append('invoiceType', invoiceType);
        formData.append('language', 'es');

        const response = await fetch(
          `/api/companies/${companyId}/ocr/invoices`,
          {
            method: 'POST',
            headers: {
              ...getAuthHeader(),
            },
            body: formData,
            credentials: 'include',
          }
        );

        if (response.ok) {
          const data = await response.json();
          setFiles((prev) =>
            prev.map((f, idx) =>
              idx === i
                ? { ...f, status: 'completed', progress: 100 }
                : f
            )
          );
          console.log('OCR iniciado:', data.data.sessionId);
        } else {
          const error = await response.json();
          setFiles((prev) =>
            prev.map((f, idx) =>
              idx === i
                ? {
                    ...f,
                    status: 'error',
                    error: error.error || 'Error al procesar el archivo',
                  }
                : f
            )
          );
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Error desconocido';
        setFiles((prev) =>
          prev.map((f, idx) =>
            idx === i ? { ...f, status: 'error', error: errorMsg } : f
          )
        );
      }
    }

    setUploading(false);

    // Redirigir a la bandeja después de 2 segundos
    setTimeout(() => {
      router.push(`/dashboard/ocr?companyId=${companyId}`);
    }, 2000);
  };

  const completedCount = files.filter((f) => f.status === 'completed').length;
  const errorCount = files.filter((f) => f.status === 'error').length;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={() => router.back()}
          className="text-blue-600 hover:text-blue-700 text-sm font-medium mb-4"
        >
          ← Volver
        </button>
        <h1 className="text-3xl font-bold text-gray-900">Cargar PDF para OCR</h1>
        <p className="text-gray-600 mt-2">
          Sube tus facturas escaneadas para procesarlas automáticamente
        </p>
      </div>

      {/* Tipo de factura */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <label className="block text-sm font-semibold text-gray-900 mb-4">
          Tipo de factura
        </label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              value="expense"
              checked={invoiceType === 'expense'}
              onChange={(e) => setInvoiceType(e.target.value as 'expense' | 'income')}
              className="w-4 h-4"
            />
            <span className="text-gray-700">Gasto (Compra)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              value="income"
              checked={invoiceType === 'income'}
              onChange={(e) => setInvoiceType(e.target.value as 'expense' | 'income')}
              className="w-4 h-4"
            />
            <span className="text-gray-700">Ingreso (Venta)</span>
          </label>
        </div>
      </div>

      {/* Zona de carga */}
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900">Arrastra tus PDFs aquí</h3>
        <p className="text-gray-600 mt-2">o haz clic para seleccionar archivos</p>
        <p className="text-xs text-gray-500 mt-4">
          Soporta PDF hasta 150MB • Máx 20 archivos por carga
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {/* Lista de archivos */}
      {files.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">
              {files.length} archivo{files.length !== 1 ? 's' : ''} seleccionado{files.length !== 1 ? 's' : ''}
            </h3>
            {(completedCount > 0 || errorCount > 0) && (
              <p className="text-sm text-gray-600 mt-1">
                {completedCount} completado{completedCount !== 1 ? 's' : ''} •{' '}
                {errorCount} error{errorCount !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          <div className="divide-y divide-gray-200">
            {files.map((fileData, idx) => (
              <div key={idx} className="p-4 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {fileData.file.name}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {(fileData.file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  {fileData.status === 'uploading' && (
                    <div className="mt-2 bg-gray-200 rounded-full h-1 w-full">
                      <div
                        className="bg-blue-600 h-1 rounded-full transition-all"
                        style={{ width: `${fileData.progress}%` }}
                      />
                    </div>
                  )}
                  {fileData.status === 'error' && (
                    <p className="text-xs text-red-600 mt-1">{fileData.error}</p>
                  )}
                </div>

                <div className="flex items-center gap-3 ml-4">
                  {fileData.status === 'completed' && (
                    <Check className="w-5 h-5 text-green-600" />
                  )}
                  {fileData.status === 'error' && (
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  )}
                  {fileData.status === 'uploading' && (
                    <Loader className="w-5 h-5 text-blue-600 animate-spin" />
                  )}
                  {fileData.status === 'pending' && (
                    <button
                      onClick={() => removeFile(idx)}
                      className="p-1 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Acciones */}
      <div className="flex gap-3">
        <button
          onClick={() => router.back()}
          className="flex-1 px-4 py-3 border border-gray-300 text-gray-900 font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={uploadFiles}
          disabled={files.length === 0 || uploading}
          className="flex-1 px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? 'Procesando...' : `Subir ${files.length} archivo${files.length !== 1 ? 's' : ''}`}
        </button>
      </div>

      {/* Notas */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
        <p className="font-medium mb-2">💡 Recomendaciones:</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>Asegúrate de que los PDFs sean legibles y de buena calidad</li>
          <li>Los PDFs pueden estar en blanco y negro o a color</li>
          <li>El OCR funciona mejor con PDFs de texto (no solo imágenes)</li>
          <li>Una vez procesados, los PDFs aparecerán en la bandeja OCR</li>
        </ul>
      </div>
    </div>
  );
}

export default function OcrUploadPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Cargando...</div>}>
      <OcrUploadPageInner />
    </Suspense>
  );
}
