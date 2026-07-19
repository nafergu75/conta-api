'use client';

import { useEffect, useState } from 'react';
import { getToken } from '@/lib/auth';

const API = '/api/conta';

interface AuditEntry {
  id: string;
  supplierId: string;
  usuarioEmail?: string;
  tipoAccion: 'create' | 'update' | 'delete';
  campo?: string;
  valorAnterior?: string;
  valorNuevo?: string;
  descripcion?: string;
  createdAt: string;
}

interface SupplierHistorialTabProps {
  supplierId: string;
  companyId: string;
}

export function SupplierHistorialTab({ supplierId, companyId }: SupplierHistorialTabProps) {
  const [historial, setHistorial] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtroAccion, setFiltroAccion] = useState<string>('');

  useEffect(() => {
    loadHistorial();
  }, []);

  const loadHistorial = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/companies/${companyId}/proveedores/${supplierId}/audit-trail`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (!res.ok) throw new Error(`Error ${res.status}`);

      const data = await res.json();
      setHistorial(data.data || data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar historial');
    } finally {
      setLoading(false);
    }
  };

  const entriasFiltradas = filtroAccion ? historial.filter(e => e.tipoAccion === filtroAccion) : historial;

  const getIconoAccion = (tipoAccion: string) => {
    switch (tipoAccion) {
      case 'create':
        return '➕';
      case 'update':
        return '✏️';
      case 'delete':
        return '🗑️';
      default:
        return '•';
    }
  };

  const getColorAccion = (tipoAccion: string) => {
    switch (tipoAccion) {
      case 'create':
        return 'border-green-200 bg-green-50';
      case 'update':
        return 'border-blue-200 bg-blue-50';
      case 'delete':
        return 'border-red-200 bg-red-50';
      default:
        return 'border-slate-200 bg-slate-50';
    }
  };

  const getEtiquetaAccion = (tipoAccion: string) => {
    switch (tipoAccion) {
      case 'create':
        return 'Creado';
      case 'update':
        return 'Actualizado';
      case 'delete':
        return 'Eliminado';
      default:
        return 'Cambio';
    }
  };

  const formatearFecha = (fecha: string) => {
    try {
      const date = new Date(fecha);
      return new Intl.DateTimeFormat('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch {
      return fecha;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <p className="text-slate-600">Cargando historial...</p>
      </div>
    );
  }

  if (error) {
    return <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-700 p-4">{error}</div>;
  }

  if (historial.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
        <p className="text-slate-600">No hay cambios registrados</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filtro */}
      <div>
        <label className="text-sm font-medium text-slate-700 mb-2 block">Filtrar por tipo de cambio</label>
        <select
          value={filtroAccion}
          onChange={e => setFiltroAccion(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600"
        >
          <option value="">Todos los cambios</option>
          <option value="create">Creación</option>
          <option value="update">Actualización</option>
          <option value="delete">Eliminación</option>
        </select>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
          <p className="text-xs text-slate-600 mb-1">Total de cambios</p>
          <p className="text-2xl font-bold text-slate-900">{historial.length}</p>
        </div>
        <div className="bg-green-50 rounded-lg border border-green-200 p-4">
          <p className="text-xs text-green-600 mb-1">Creaciones</p>
          <p className="text-2xl font-bold text-green-700">{historial.filter(e => e.tipoAccion === 'create').length}</p>
        </div>
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
          <p className="text-xs text-blue-600 mb-1">Actualizaciones</p>
          <p className="text-2xl font-bold text-blue-700">{historial.filter(e => e.tipoAccion === 'update').length}</p>
        </div>
      </div>

      {/* Línea de tiempo */}
      <div className="space-y-4">
        {entriasFiltradas.map((entry, index) => (
          <div key={entry.id} className={`rounded-lg border p-4 ${getColorAccion(entry.tipoAccion)}`}>
            <div className="flex gap-4">
              {/* Icono y línea */}
              <div className="flex flex-col items-center">
                <div className="text-2xl">{getIconoAccion(entry.tipoAccion)}</div>
                {index < entriasFiltradas.length - 1 && <div className="w-0.5 h-8 bg-slate-300 my-2"></div>}
              </div>

              {/* Contenido */}
              <div className="flex-1 pt-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-slate-900">{getEtiquetaAccion(entry.tipoAccion)}</span>
                  <span className="text-xs text-slate-500">{formatearFecha(entry.createdAt)}</span>
                </div>

                {entry.descripcion && <p className="text-sm text-slate-700 mb-2">{entry.descripcion}</p>}

                {entry.campo && (
                  <div className="mt-2 space-y-1 text-sm">
                    <p className="text-slate-600">
                      <strong>Campo:</strong> {entry.campo}
                    </p>
                    {entry.valorAnterior && (
                      <p className="text-slate-600">
                        <strong>Valor anterior:</strong>{' '}
                        <code className="bg-slate-100 px-2 py-0.5 rounded text-xs">{entry.valorAnterior}</code>
                      </p>
                    )}
                    {entry.valorNuevo && (
                      <p className="text-slate-600">
                        <strong>Valor nuevo:</strong>{' '}
                        <code className="bg-slate-100 px-2 py-0.5 rounded text-xs">{entry.valorNuevo}</code>
                      </p>
                    )}
                  </div>
                )}

                {entry.usuarioEmail && (
                  <p className="text-xs text-slate-500 mt-2">
                    <strong>Usuario:</strong> {entry.usuarioEmail}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
