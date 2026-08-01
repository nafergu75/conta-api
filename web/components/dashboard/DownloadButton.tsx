'use client';

import { Download } from '@phosphor-icons/react';
import { useState } from 'react';

interface DownloadButtonProps {
  url: string;
  filename: string;
  label?: string;
  variant?: 'primary' | 'secondary';
  onStart?: () => void;
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function DownloadButton({
  url,
  filename,
  label = 'Descargar',
  variant = 'secondary',
  onStart,
  onSuccess,
  onError,
}: DownloadButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    onStart?.();

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Error ${response.status}: ${response.statusText}`);

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      onSuccess?.();
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error('Error desconocido'));
    } finally {
      setLoading(false);
    }
  };

  const baseStyles = 'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition disabled:opacity-50';
  const variantStyles =
    variant === 'primary'
      ? 'bg-blue-600 text-white hover:bg-blue-700'
      : 'border border-slate-300 text-slate-700 hover:bg-slate-50';

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className={`${baseStyles} ${variantStyles}`}
    >
      <Download size={16} weight="bold" />
      {loading ? 'Descargando...' : label}
    </button>
  );
}
