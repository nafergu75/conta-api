'use client';

import { useState } from 'react';
import { Download, X } from '@phosphor-icons/react';
import { getToken } from '@/lib/auth';

const API = '/api/conta';

interface ExportSupplierModalProps {
  supplierId: string;
  companyId: string;
  nombreFiscal: string;
  isOpen: boolean;
  onClose: () => void;
}

export function ExportSupplierModal({
  supplierId,
  companyId,
  nombreFiscal,
  isOpen,
  onClose,
}: ExportSupplierModalProps) {
  const [formato, setFormato] = useState<'csv' | 'json'>('csv');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [incluirFacturas, setIncluirFacturas] = useState(true);
  const [incluirContactos, setIncluirContactos] = useState(true);
  const [incluirCuentas, setIncluirCuentas] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExportar = async () => {
    setExportando(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        formato,
        ...(fechaDesde && { fechaDesde }),
        ...(fechaHasta && { fechaHasta }),
        ...(incluirFacturas && { incluirFacturas: 'true' }),
        ...(incluirContactos && { incluirContactos: 'true' }),
        ...(incluirCuentas && { incluirCuentasBancarias: 'true' }),
      });

      const res = await fetch(`${API}/companies/${companyId}/proveedores/${supplierId}/export?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (!res.ok) throw new Error(`Error ${res.status}`);

      // Descargar archivo
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${nombreFiscal}_${new Date().toISOString().split('T')[0]}.${formato}`;
      a.click();
      window.URL.revokeObjectURL(url);

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al exportar');
    } finally {
      setExportando(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Exportar Proveedor</h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Contenido */}
        <div className="p-6 space-y-4">
          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-700 p-3 text-sm">{error}</div>}

          {/* Formato */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">Formato de exportación</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="csv"
                  checked={formato === 'csv'}
                  onChange={e => setFormato(e.target.value as 'csv' | 'json')}
                  className="w-4 h-4"
                />
                <span className="text-sm text-slate-700">CSV</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="json"
                  checked={formato === 'json'}
                  onChange={e => setFormato(e.target.value as 'csv' | 'json')}
                  className="w-4 h-4"
                />
                <span className="text-sm text-slate-700">JSON</span>
              </label>
            </div>
          </div>

          {/* Rango de fechas */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">Rango de fechas (opcional)</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-slate-600 mb-1 block">Desde</label>
                <input
                  type="date"
                  value={fechaDesde}
                  onChange={e => setFechaDesde(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-600"
                />
              </div>
              <div>
                <label className="text-xs text-slate-600 mb-1 block">Hasta</label>
                <input
                  type="date"
                  value={fechaHasta}
                  onChange={e => setFechaHasta(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-600"
                />
              </div>
            </div>
          </div>

          {/* Opciones de inclusión */}
          <div>
            <label className="text-sm font-medium text-slate-700 mb-2 block">Incluir información</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={incluirFacturas}
                  onChange={e => setIncluirFacturas(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300"
                />
                <span className="text-sm text-slate-700">Facturas asociadas</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={incluirContactos}
                  onChange={e => setIncluirContactos(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300"
                />
                <span className="text-sm text-slate-700">Contactos</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={incluirCuentas}
                  onChange={e => setIncluirCuentas(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300"
                />
                <span className="text-sm text-slate-700">Cuentas bancarias</span>
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-6 border-t border-slate-200">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleExportar}
            disabled={exportando}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-accent-600 text-white font-semibold rounded-lg hover:bg-accent-700 active:scale-[0.98] transition-all disabled:opacity-60 disabled:pointer-events-none"
          >
            <Download size={18} />
            {exportando ? 'Exportando...' : 'Descargar'}
          </button>
        </div>
      </div>
    </div>
  );
}
