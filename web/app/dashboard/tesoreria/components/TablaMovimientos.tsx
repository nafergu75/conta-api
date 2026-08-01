'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, Clock } from '@phosphor-icons/react';

interface Movimiento {
  id: string;
  fecha: string;
  importe: number;
  concepto: string;
  estado: 'pendiente' | 'conciliado' | 'rechazado';
  reconciliacionId?: string;
  tipo?: 'entrada' | 'salida' | 'desconocido';
}

interface TablaMovimientosProps {
  movimientos: Movimiento[];
  onConciliar?: (movimientoId: string) => void;
  loading?: boolean;
}

export function TablaMovimientos({
  movimientos,
  onConciliar,
  loading = false,
}: TablaMovimientosProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const eur = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  });

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-ES');
  };

  const estadoClasses = {
    pendiente: 'bg-amber-50 text-amber-700 border-amber-200',
    conciliado: 'bg-green-50 text-green-700 border-green-200',
    rechazado: 'bg-red-50 text-red-700 border-red-200',
  };

  const getEstadoIcon = (estado: string) => {
    switch (estado) {
      case 'conciliado':
        return <CheckCircle size={16} className="text-green-600" />;
      case 'rechazado':
        return <XCircle size={16} className="text-red-600" />;
      case 'pendiente':
      default:
        return <Clock size={16} className="text-amber-600" />;
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-500">Cargando movimientos...</p>
      </div>
    );
  }

  if (!movimientos.length) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-500">No hay movimientos para mostrar</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            <th className="px-6 py-3 text-left text-sm font-medium text-slate-700">Fecha</th>
            <th className="px-6 py-3 text-left text-sm font-medium text-slate-700">Concepto</th>
            <th className="px-6 py-3 text-right text-sm font-medium text-slate-700">Importe</th>
            <th className="px-6 py-3 text-center text-sm font-medium text-slate-700">Estado</th>
            <th className="px-6 py-3 text-center text-sm font-medium text-slate-700">Acción</th>
          </tr>
        </thead>
        <tbody>
          {movimientos.map((mov) => (
            <tr key={mov.id} className="border-b border-slate-200 hover:bg-slate-50">
              <td className="px-6 py-4 text-sm text-slate-900">{formatDate(mov.fecha)}</td>
              <td className="px-6 py-4 text-sm text-slate-600">
                <div className="max-w-xs truncate">{mov.concepto}</div>
              </td>
              <td className="px-6 py-4 text-right text-sm font-medium text-slate-900">
                {eur.format(mov.importe)}
              </td>
              <td className="px-6 py-4 text-center">
                <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1">
                  {getEstadoIcon(mov.estado)}
                  <span className="text-xs font-medium">{mov.estado}</span>
                </div>
              </td>
              <td className="px-6 py-4 text-center">
                {mov.estado === 'pendiente' && onConciliar ? (
                  <button
                    onClick={() => {
                      setExpandedId(expandedId === mov.id ? null : mov.id);
                      onConciliar(mov.id);
                    }}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    Conciliar
                  </button>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
