'use client';

import { useState } from 'react';
import { Download, FileText, File } from '@phosphor-icons/react';
import { Toast, ToastContainer, ToastType } from '@/components/dashboard/Toast';

export type ExportFormat = 'pdf' | 'excel';

interface ExportButtonProps {
  onExport: (format: ExportFormat) => Promise<void>;
  label?: string;
  documentName?: string;
}

export function ExportButton({ onExport, label = 'Exportar', documentName = 'documento' }: ExportButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: string; type: ToastType; title: string; message?: string }>>([]);

  const addToast = (type: ToastType, title: string, message?: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, type, title, message }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleExport = async (format: ExportFormat) => {
    setIsLoading(true);
    try {
      await onExport(format);
      addToast('success', 'Exportación completada', `${documentName} exportado a ${format.toUpperCase()}`);
      setShowMenu(false);
    } catch (error) {
      addToast('error', 'Error en exportación', error instanceof Error ? error.message : 'Error desconocido');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={`${label} - seleccionar formato`}
        >
          <Download size={16} />
          {isLoading ? 'Exportando…' : label}
        </button>

        {showMenu && !isLoading && (
          <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
            <button
              onClick={() => handleExport('pdf')}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-200 flex items-center gap-2 text-sm text-gray-700"
            >
              <FileText size={18} className="text-red-600" />
              Exportar a PDF
            </button>
            <button
              onClick={() => handleExport('excel')}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center gap-2 text-sm text-gray-700"
            >
              <File size={18} className="text-green-600" />
              Exportar a Excel
            </button>
          </div>
        )}
      </div>

      <ToastContainer toasts={toasts} onClose={removeToast} />
    </>
  );
}
