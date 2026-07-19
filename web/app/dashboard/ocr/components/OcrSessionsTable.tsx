'use client';

import React, { useState } from 'react';
import { Eye, FileText, Trash2 } from 'lucide-react';
import { OcrStatusBadge } from './OcrStatusBadge';

interface OcrSession {
  id: string;
  originalFileName: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  processingTimeSeconds?: number;
  ocrPageCount?: number;
  invoiceType: 'expense' | 'income';
  userId?: string;
}

interface OcrSessionsTableProps {
  sessions: OcrSession[];
  onViewDetail: (sessionId: string) => void;
  onViewPdf: (sessionId: string) => void;
  onDelete?: (sessionId: string) => void;
}

export function OcrSessionsTable({
  sessions,
  onViewDetail,
  onViewPdf,
  onDelete,
}: OcrSessionsTableProps) {
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const invoiceTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      expense: 'Gasto',
      income: 'Ingreso',
    };
    return labels[type] || type;
  };

  if (sessions.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500 font-medium">No hay sesiones OCR aún</p>
        <p className="text-sm text-gray-400 mt-1">Carga un PDF para comenzar</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-6 py-3 text-left font-semibold text-gray-700">Archivo</th>
            <th className="px-6 py-3 text-left font-semibold text-gray-700">Fecha</th>
            <th className="px-6 py-3 text-left font-semibold text-gray-700">Páginas</th>
            <th className="px-6 py-3 text-left font-semibold text-gray-700">Tipo</th>
            <th className="px-6 py-3 text-left font-semibold text-gray-700">Tiempo</th>
            <th className="px-6 py-3 text-left font-semibold text-gray-700">Estado</th>
            <th className="px-6 py-3 text-center font-semibold text-gray-700">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr
              key={session.id}
              className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
              onMouseEnter={() => setHoveredRow(session.id)}
              onMouseLeave={() => setHoveredRow(null)}
            >
              <td className="px-6 py-4">
                <p className="font-medium text-gray-900 truncate">{session.originalFileName}</p>
              </td>
              <td className="px-6 py-4 text-gray-600">{formatDate(session.createdAt)}</td>
              <td className="px-6 py-4 text-gray-600">{session.ocrPageCount || '-'}</td>
              <td className="px-6 py-4">
                <span className="inline-block px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                  {invoiceTypeLabel(session.invoiceType)}
                </span>
              </td>
              <td className="px-6 py-4 text-gray-600">
                {session.processingTimeSeconds ? `${session.processingTimeSeconds}s` : '-'}
              </td>
              <td className="px-6 py-4">
                <OcrStatusBadge status={session.status} size="sm" />
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => onViewDetail(session.id)}
                    className="p-1.5 text-gray-600 hover:bg-blue-50 hover:text-blue-600 rounded transition-colors"
                    title="Ver detalles"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onViewPdf(session.id)}
                    className="p-1.5 text-gray-600 hover:bg-purple-50 hover:text-purple-600 rounded transition-colors"
                    title="Ver PDF"
                  >
                    <FileText className="w-4 h-4" />
                  </button>
                  {onDelete && (
                    <button
                      onClick={() => onDelete(session.id)}
                      className="p-1.5 text-gray-600 hover:bg-red-50 hover:text-red-600 rounded transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
