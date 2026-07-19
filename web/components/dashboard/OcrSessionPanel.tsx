'use client';

import React from 'react';
import { OcrSessionData } from '@/lib/useOcrSession';
import { Copy, FileText, RotateCw, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';

interface OcrSessionPanelProps {
  ocrData: OcrSessionData | null;
  loading?: boolean;
}

export function OcrSessionPanel({ ocrData, loading }: OcrSessionPanelProps) {
  const [copied, setCopied] = React.useState(false);
  const [pdfRotation, setPdfRotation] = React.useState(0);
  const [pdfZoom, setPdfZoom] = React.useState(100);
  const [currentPage, setCurrentPage] = React.useState(1);

  const handleCopyText = () => {
    if (ocrData?.ocrTextExtracted) {
      navigator.clipboard.writeText(ocrData.ocrTextExtracted);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const rotatePdf = () => {
    setPdfRotation((prev) => (prev + 90) % 360);
  };

  const zoomIn = () => {
    setPdfZoom((prev) => Math.min(prev + 20, 200));
  };

  const zoomOut = () => {
    setPdfZoom((prev) => Math.max(prev - 20, 60));
  };

  const nextPage = () => {
    if (currentPage < (ocrData?.ocrPageCount || 1)) {
      setCurrentPage((prev) => prev + 1);
    }
  };

  const prevPage = () => {
    if (currentPage > 1) {
      setCurrentPage((prev) => prev - 1);
    }
  };

  if (!ocrData) {
    return null;
  }

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-3" />
          <p className="text-blue-600 font-medium">Cargando sesión OCR...</p>
        </div>
      </div>
    );
  }

  const hasMultiplePages = (ocrData.ocrPageCount || 1) > 1;

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
      {/* Header */}
      <div className="flex items-start justify-between sticky top-0 bg-gradient-to-br from-blue-50 to-indigo-50 pb-2">
        <div className="flex items-start gap-3">
          <FileText size={20} className="text-blue-600 flex-shrink-0 mt-1" />
          <div>
            <h3 className="font-semibold text-gray-900">📄 Extracción OCR</h3>
            <p className="text-xs text-gray-600 mt-1 truncate">{ocrData.originalFileName}</p>
          </div>
        </div>
        <button
          onClick={handleCopyText}
          title="Copiar texto"
          className="p-2 hover:bg-blue-100 rounded-lg transition-colors text-blue-600 flex-shrink-0"
        >
          <Copy size={18} />
        </button>
      </div>

      {/* Metadata */}
      <div className="flex gap-4 text-xs border-t border-blue-200 pt-3">
        <div>
          <p className="text-gray-600">Páginas</p>
          <p className="font-semibold text-gray-900">{ocrData.ocrPageCount}</p>
        </div>
        <div>
          <p className="text-gray-600">Tipo</p>
          <p className="font-semibold text-gray-900">
            {ocrData.invoiceType === 'expense' ? '💰 Gasto' : '📊 Ingreso'}
          </p>
        </div>
        <div className="flex-1">
          <p className="text-gray-600">Estado</p>
          <p className="font-semibold">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              ocrData.status === 'COMPLETED'
                ? 'bg-green-100 text-green-800'
                : ocrData.status === 'PROCESSING'
                ? 'bg-blue-100 text-blue-800'
                : ocrData.status === 'FAILED'
                ? 'bg-red-100 text-red-800'
                : 'bg-gray-100 text-gray-800'
            }`}>
              {ocrData.status}
            </span>
          </p>
        </div>
      </div>

      {/* PDF Preview con controles */}
      {ocrData.ocrPdfPath && (
        <div className="border-t border-blue-200 pt-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-600">📄 Vista previa PDF</p>
            <div className="flex gap-1">
              <button
                onClick={rotatePdf}
                title="Rotar 90°"
                className="p-1.5 hover:bg-blue-100 rounded transition-colors text-blue-600"
              >
                <RotateCw size={16} />
              </button>
              <button
                onClick={zoomOut}
                title="Alejar"
                className="p-1.5 hover:bg-blue-100 rounded transition-colors text-blue-600"
                disabled={pdfZoom <= 60}
              >
                <ZoomOut size={16} />
              </button>
              <span className="px-2 py-1 text-xs font-medium text-gray-600 bg-white rounded border border-blue-100">
                {pdfZoom}%
              </span>
              <button
                onClick={zoomIn}
                title="Acercar"
                className="p-1.5 hover:bg-blue-100 rounded transition-colors text-blue-600"
                disabled={pdfZoom >= 200}
              >
                <ZoomIn size={16} />
              </button>
            </div>
          </div>

          {/* PDF Container */}
          <div className="bg-white rounded-lg border border-blue-100 overflow-hidden">
            <div
              className="overflow-auto"
              style={{ maxHeight: '300px' }}
            >
              <iframe
                src={ocrData.ocrPdfPath}
                className="w-full min-h-[300px] border-0"
                style={{
                  transform: `rotate(${pdfRotation}deg) scale(${pdfZoom / 100})`,
                  transformOrigin: 'top center',
                }}
                title="PDF Preview"
              />
            </div>
          </div>

          {/* Navegación de páginas */}
          {hasMultiplePages && (
            <div className="flex items-center justify-between text-xs bg-white rounded-lg p-2 border border-blue-100">
              <button
                onClick={prevPage}
                disabled={currentPage === 1}
                className="p-1 hover:bg-blue-50 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="font-medium text-gray-600">
                Página {currentPage} de {ocrData.ocrPageCount}
              </span>
              <button
                onClick={nextPage}
                disabled={currentPage === ocrData.ocrPageCount}
                className="p-1 hover:bg-blue-50 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Comparación lado-a-lado: PDF vs Texto */}
      {ocrData.ocrPdfPath && (
        <div className="border-t border-blue-200 pt-3">
          <p className="text-xs font-semibold text-gray-600 mb-2">🔍 Comparación PDF ↔ Texto extraído</p>
          <div className="bg-white rounded-lg p-2 text-xs text-gray-600 border border-blue-100">
            <p>✓ Verifica que el texto OCR coincida con el PDF</p>
            <p>✓ Ajusta datos manualmente si hay discrepancias</p>
          </div>
        </div>
      )}

      {/* Texto extraído */}
      <div className="border-t border-blue-200 pt-3">
        <p className="text-xs font-semibold text-gray-600 mb-2">📝 Texto extraído:</p>
        <div className="bg-white rounded-lg p-3 max-h-[200px] overflow-y-auto border border-blue-100">
          <pre className="text-xs text-gray-700 whitespace-pre-wrap break-words font-mono">
            {ocrData.ocrTextExtracted || 'Sin contenido'}
          </pre>
        </div>
      </div>

      {/* Copy feedback */}
      {copied && (
        <div className="bg-green-100 text-green-800 text-xs font-medium px-3 py-2 rounded-lg text-center border border-green-200">
          ✓ Texto copiado al portapapeles
        </div>
      )}

      {/* Info */}
      <div className="bg-white rounded-lg p-3 border border-blue-100 text-xs text-gray-600 space-y-1">
        <p>💡 <strong>Herramientas disponibles:</strong></p>
        <ul className="list-disc list-inside space-y-0.5 text-gray-600">
          <li>Rotar PDF para leer en cualquier ángulo</li>
          <li>Zoom in/out para detalles pequeños</li>
          <li>Navega entre páginas (si hay varias)</li>
          <li>Compara visualmente PDF vs texto</li>
          <li>Copia el texto para editar datos</li>
        </ul>
      </div>
    </div>
  );
}
