'use client';

import React, { useState } from 'react';
import { Copy, Download, ChevronDown } from 'lucide-react';

interface OcrPdfPreviewProps {
  pdfUrl: string;
  ocrText: string;
  sessionId: string;
}

export function OcrPdfPreview({ pdfUrl, ocrText, sessionId }: OcrPdfPreviewProps) {
  const [showOcrText, setShowOcrText] = useState(true);
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(ocrText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Error copying text:', error);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
      {/* Columna izquierda: PDF */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Documento PDF</h3>
        <div className="bg-gray-100 rounded-lg overflow-hidden border border-gray-200 h-96">
          <iframe
            src={pdfUrl}
            className="w-full h-full"
            title="OCR PDF Preview"
          />
        </div>
        <a
          href={pdfUrl}
          download
          className="inline-flex items-center gap-2 mt-3 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
        >
          <Download className="w-4 h-4" />
          Descargar PDF
        </a>
      </div>

      {/* Columna derecha: Texto OCR */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Texto OCR extraído</h3>
          <button
            onClick={copyToClipboard}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded transition-colors"
          >
            <Copy className="w-3 h-3" />
            {copied ? 'Copiado' : 'Copiar'}
          </button>
        </div>

        <div className="bg-gray-50 rounded-lg border border-gray-200 h-96 overflow-y-auto p-4">
          <pre className="text-xs text-gray-700 font-mono whitespace-pre-wrap break-words">
            {ocrText || 'No hay texto extraído aún...'}
          </pre>
        </div>

        <div className="mt-4">
          <button
            onClick={() => setShowOcrText(!showOcrText)}
            className="inline-flex items-center gap-2 text-xs font-medium text-gray-600 hover:text-gray-900"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${showOcrText ? 'rotate-180' : ''}`} />
            {showOcrText ? 'Ocultar' : 'Mostrar'} estadísticas OCR
          </button>
          {showOcrText && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded text-xs text-gray-700">
              <p>
                <strong>Caracteres extraídos:</strong> {ocrText.length.toLocaleString()}
              </p>
              <p>
                <strong>Palabras:</strong> {ocrText.split(/\s+/).length}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
