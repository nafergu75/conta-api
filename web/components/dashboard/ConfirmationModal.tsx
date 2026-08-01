'use client';

import React, { ReactNode } from 'react';
import { X, WarningCircle } from '@phosphor-icons/react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  details?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  isDangerous?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationModal({
  isOpen,
  title,
  message,
  details,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  isDangerous = false,
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  const confirmButtonColor = isDangerous
    ? 'bg-red-600 hover:bg-red-700'
    : 'bg-blue-600 hover:bg-blue-700';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between">
          <div className="flex gap-3">
            {isDangerous && (
              <WarningCircle size={24} className="mt-0.5 flex-shrink-0 text-red-600" weight="fill" />
            )}
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
              <p className="mt-1 text-sm text-slate-600">{message}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600"
            disabled={isLoading}
          >
            <X size={20} />
          </button>
        </div>

        {/* Details Section */}
        {details && (
          <div className="mb-6 rounded-lg bg-slate-50 p-4">
            <div className="space-y-2 text-sm text-slate-700">{details}</div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50 ${confirmButtonColor}`}
          >
            {isLoading ? '⏳ Procesando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
