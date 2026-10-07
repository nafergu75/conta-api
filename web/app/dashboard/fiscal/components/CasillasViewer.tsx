'use client';

import { CheckCircle, Clock } from '@phosphor-icons/react';

interface CasillasViewerProps {
  casillas: Record<string, any>;
  titulo: string;
  descripcion?: string;
  estado?: 'vigente' | 'presentado';
  /** Casillas que son numeros de personas (p. ej. perceptores del 111), no euros. */
  casillasConteo?: string[];
}

export function CasillasViewer({
  casillas,
  titulo,
  descripcion,
  estado = 'vigente',
  casillasConteo = [],
}: CasillasViewerProps) {
  const eur = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  });

  // Filtrar casillas numéricas (excluir metadata)
  const casillasNumericas = Object.entries(casillas)
    .filter(([key, value]) => {
      // Excluir metadata
      if (
        typeof value === 'object' ||
        key.includes('resumen') ||
        key.includes('auditoria') ||
        key.includes('retenciones')
      ) {
        return false;
      }
      return /^\d+[A-Z]?$/.test(key) || /^\d{3}[A-Z]?$/.test(key);
    })
    .sort(([keyA], [keyB]) => {
      // Ordenar por número de casilla
      const numA = parseInt(keyA.replace(/[A-Z]/g, ''));
      const numB = parseInt(keyB.replace(/[A-Z]/g, ''));
      return numA - numB;
    });

  const formatValue = (key: string, value: any) => {
    if (casillasConteo.includes(key) && typeof value === 'number') {
      return value.toLocaleString('es-ES', { maximumFractionDigits: 0 });
    }
    if (typeof value === 'number') {
      return eur.format(value);
    }
    if (typeof value === 'object' && value?.valor !== undefined) {
      return eur.format(value.valor);
    }
    return String(value);
  };

  const getDescription = (key: string, value: any) => {
    if (typeof value === 'object' && value?.descripcion) {
      return value.descripcion;
    }
    return `Casilla ${key}`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between rounded-lg border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{titulo}</h2>
          {descripcion && <p className="mt-1 text-sm text-slate-600">{descripcion}</p>}
        </div>
        <div className="flex items-center gap-2">
          {estado === 'presentado' ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1">
              <CheckCircle size={16} className="text-green-600" />
              <span className="text-xs font-medium text-green-900">Presentado</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1">
              <Clock size={16} className="text-amber-600" />
              <span className="text-xs font-medium text-amber-900">Borrador</span>
            </div>
          )}
        </div>
      </div>

      {/* Casillas Grid */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {casillasNumericas.map(([key, value]) => (
          <div key={key} className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500 uppercase">Casilla {key}</span>
              {typeof value === 'object' && value?.tipo && (
                <span className="text-xs text-slate-400">{value.tipo}</span>
              )}
            </div>
            <div className="text-sm text-slate-600">{getDescription(key, value)}</div>
            <div className="mt-2 text-lg font-bold text-slate-900">{formatValue(key, value)}</div>
            {typeof value === 'object' && value?.formula && (
              <div className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
                Fórmula: <code>{value.formula}</code>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Resumen si existe */}
      {casillas.resumen && (
        <div className="rounded-lg border-l-4 border-l-blue-500 bg-blue-50 p-4">
          <h3 className="mb-3 font-semibold text-blue-900">Resumen Ejecutivo</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {Object.entries(casillas.resumen).map(([key, value]) => (
              <div key={key} className="flex justify-between">
                <span className="text-sm text-blue-800">{key.replace(/([A-Z])/g, ' $1')}</span>
                <span className="font-medium text-blue-900">{formatValue(key, value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
