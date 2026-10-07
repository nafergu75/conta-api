'use client';

import { useEffect } from 'react';
import { Check, X, Info, Warning } from '@phosphor-icons/react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  onClose: (id: string) => void;
}

export function Toast({ id, type, title, message, duration = 4000, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => onClose(id), duration);
    return () => clearTimeout(timer);
  }, [id, duration, onClose]);

  const styles = {
    success: {
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      icon: <Check size={20} className="text-emerald-600" weight="bold" />,
      title: 'text-emerald-900',
      message: 'text-emerald-700',
    },
    error: {
      bg: 'bg-rose-50',
      border: 'border-rose-200',
      icon: <X size={20} className="text-rose-600" weight="bold" />,
      title: 'text-rose-900',
      message: 'text-rose-700',
    },
    warning: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      icon: <Warning size={20} className="text-amber-600" weight="bold" />,
      title: 'text-amber-900',
      message: 'text-amber-700',
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      icon: <Info size={20} className="text-blue-600" weight="bold" />,
      title: 'text-blue-900',
      message: 'text-blue-700',
    },
  };

  const style = styles[type];

  return (
    <div
      className={`${style.bg} ${style.border} flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg animate-in fade-in slide-in-from-top-2`}
      role="status"
      aria-live="polite"
    >
      <div className="flex-shrink-0 pt-0.5">{style.icon}</div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold ${style.title}`}>{title}</p>
        {message && <p className={`text-sm mt-0.5 ${style.message}`}>{message}</p>}
      </div>
      <button
        onClick={() => onClose(id)}
        className="flex-shrink-0 text-slate-400 hover:text-slate-600"
        aria-label="Cerrar notificación"
      >
        <X size={16} />
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: Array<{ id: string; type: ToastType; title: string; message?: string }>;
  onClose: (id: string) => void;
}

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  return (
    // Por encima de los botones flotantes de abajo a la derecha: en el móvil, el del
    // menú y el de Carmen (hasta 128 px); en escritorio, el de Carmen (hasta 68 px).
    <div className="fixed bottom-36 right-4 z-40 flex max-w-sm flex-col gap-2 md:bottom-20">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          id={toast.id}
          type={toast.type}
          title={toast.title}
          message={toast.message}
          onClose={onClose}
        />
      ))}
    </div>
  );
}
