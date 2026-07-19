'use client';

import React from 'react';

type OcrStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

interface OcrStatusBadgeProps {
  status: OcrStatus;
  size?: 'sm' | 'md';
}

const statusConfig: Record<OcrStatus, { bg: string; text: string; label: string }> = {
  PENDING: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Pendiente' },
  PROCESSING: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'En proceso' },
  COMPLETED: { bg: 'bg-green-100', text: 'text-green-700', label: 'OCR OK' },
  FAILED: { bg: 'bg-red-100', text: 'text-red-700', label: 'Error' },
};

export function OcrStatusBadge({ status, size = 'sm' }: OcrStatusBadgeProps) {
  const config = statusConfig[status];
  const sizeClass = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm';

  return (
    <span className={`inline-flex font-medium rounded ${config.bg} ${config.text} ${sizeClass}`}>
      {config.label}
    </span>
  );
}
