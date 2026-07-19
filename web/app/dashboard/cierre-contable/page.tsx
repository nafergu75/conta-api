'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, clearSession } from '@/lib/auth';
import { CheckCircle, XCircle, Clock, Lock, Upload } from '@phosphor-icons/react';

interface Cierre {
  id: string;
  ejercicio: string;
  estado: 'ABIERTO' | 'PENDIENTE' | 'CERRADO' | 'AUDITADO';
  fechaApertura: string;
  fechaCierre?: string;
  usuarioCierre?: string;
  archivos: ArchivosCierre[];
}

interface ArchivosCierre {
  id: string;
  nombre: string;
  tipo: 'BALANCE_GENERAL' | 'CUENTA_RESULTADOS' | 'MEMORIA' | 'OTRO';
  fechaSubida: string;
  tamaño: number;
}

const API = 'http://localhost:3000';

const ESTADO_CONFIG = {
  ABIERTO: { color: 'bg-green-50 text-green-700', icon: CheckCircle, label: 'Ejercicio Abierto' },
  PENDIENTE: { color: 'bg-yellow-50 text-yellow-700', icon: Clock, label: 'Cierre Pendiente' },
  CERRADO: { color: 'bg-slate-50 text-slate-700', icon: Lock, label: 'Ejercicio Cerrado' },
  AUDITADO: { color: 'bg-blue-50 text-blue-700', icon: CheckCircle, label: 'Auditado' },
};

export default function CierrePage() {
  const router = useRouter();

  // Obtener companyId del token JWT (usar useMemo para evitar re-cálculos)
  const companyId = useMemo(() => {
    const token = getToken();
    if (!token) return null;
    try {
      const parts = token.split('.');
      const payload = JSON.parse(atob(parts[1]));
      return payload.companies?.[0] || payload.empresaSeleccionada || '1';
    } catch {
      return '1';
    }
  }, []);

  const [cierres, setCierres] = useState<Cierre[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCierre, setSelectedCierre] = useState<Cierre | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadData, setUploadData] = useState({
    tipo: 'BALANCE_GENERAL' as const,
    file: null as File | null,
  });

  useEffect(() => {
    const loadCierres = async () => {
      const token = getToken();
      if (!token) {
        router.replace('/login');
        return;
      }

      try {
        setLoading(true);
        const res = await fetch(`${API}/companies/${companyId}/accounting/closures`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) {
          clearSession();
          router.replace('/login');
          return;
        }

        if (!res.ok) throw new Error('Error cargando cierres');
        const data = await res.json();
        setCierres(data.data?.cierres || data.cierres || []);
        setError('');  // Limpiar error anterior si lo hay
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    };

    if (companyId) loadCierres();
  }, [companyId, router]);

  const handleCloseFiscalYear = async (ejercicio: string) => {
    if (!confirm(`¿Cerrar ejercicio ${ejercicio}? Esta acción es definitiva.`)) return;

    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }

    try {
      const res = await fetch(`${API}/companies/${companyId}/accounting/closures/${ejercicio}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ nuevoEstado: 'CERRADO' }),
      });

      if (res.status === 401) {
        clearSession();
        router.replace('/login');
        return;
      }

      if (!res.ok) throw new Error('Error cerrando ejercicio');

      setCierres(cierres.map((c) =>
        c.ejercicio === ejercicio ? { ...c, estado: 'CERRADO', fechaCierre: new Date().toISOString() } : c
      ));
      setSelectedCierre(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error cerrando ejercicio');
    }
  };

  const handleUploadFile = async (ejercicio: string) => {
    if (!uploadData.file) {
      setError('Selecciona un archivo');
      return;
    }

    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', uploadData.file);

      const res = await fetch(
        `${API}/companies/${companyId}/accounting/closures/${ejercicio}/upload?tipoContenido=${uploadData.tipo}`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData,
        }
      );

      if (res.status === 401) {
        clearSession();
        router.replace('/login');
        return;
      }

      if (!res.ok) throw new Error('Error subiendo archivo');

      setShowUpload(false);
      setUploadData({ tipo: 'BALANCE_GENERAL', file: null });
      // Recargar cierres
      const listRes = await fetch(`${API}/companies/${companyId}/accounting/closures`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await listRes.json();
      setCierres(data.data || data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error subiendo archivo');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Cierre Contable</h1>
        <p className="text-gray-600 mt-2">Cierre de ejercicio y gestión de cuentas anuales</p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
          {error}
        </div>
      )}

      {/* Ejemplos de uso */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-green-900 mb-2">📌 Flujo de Cierre</h3>
        <ol className="text-sm text-green-800 space-y-1 list-decimal list-inside">
          <li><strong>Ejercicio Abierto:</strong> Periodo de operación normal</li>
          <li><strong>Validaciones:</strong> Verifica que todos los asientos estén cuadrados</li>
          <li><strong>Cierre:</strong> Congela el período y genera asientos de cierre (si aplica)</li>
          <li><strong>Archivos:</strong> Sube balance, P&L, y memoria del ejercicio</li>
          <li><strong>Auditado:</strong> Cierre final, ejercicio no modificable</li>
        </ol>
      </div>

      {/* Tabla de cierres */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Cargando ejercicios...</div>
        ) : cierres.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No hay ejercicios. El sistema gestiona automáticamente los períodos contables.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Ejercicio
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Fecha Apertura
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">
                    Archivos
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {cierres.map((cierre) => {
                  const config = ESTADO_CONFIG[cierre.estado];
                  const Icon = config.icon;
                  return (
                    <tr key={cierre.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                        {cierre.ejercicio}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(cierre.fechaApertura).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${config.color}`}>
                          <Icon size={14} />
                          {config.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center text-sm text-gray-600">
                        {cierre.archivos.length}
                      </td>
                      <td className="px-6 py-4 text-sm space-x-2">
                        <button
                          onClick={() => setSelectedCierre(cierre)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Ver detalles
                        </button>
                        {cierre.estado === 'PENDIENTE' && (
                          <button
                            onClick={() => handleCloseFiscalYear(cierre.ejercicio)}
                            className="text-red-600 hover:text-red-900 ml-2"
                          >
                            Cerrar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de detalles */}
      {selectedCierre && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Ejercicio {selectedCierre.ejercicio}</h2>
                <p className="text-gray-600">Detalle de cierre contable</p>
              </div>
              <button
                onClick={() => setSelectedCierre(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>

            {/* Información general */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Fecha Apertura:</span>
                <span className="font-medium">
                  {new Date(selectedCierre.fechaApertura).toLocaleDateString()}
                </span>
              </div>
              {selectedCierre.fechaCierre && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Fecha Cierre:</span>
                  <span className="font-medium">
                    {new Date(selectedCierre.fechaCierre).toLocaleDateString()}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">Estado:</span>
                <span className="font-medium">{selectedCierre.estado}</span>
              </div>
            </div>

            {/* Archivos */}
            <div className="mb-4">
              <h3 className="font-semibold text-gray-900 mb-3">Documentos de Cierre</h3>
              {selectedCierre.archivos.length > 0 ? (
                <ul className="space-y-2">
                  {selectedCierre.archivos.map((archivo) => (
                    <li
                      key={archivo.id}
                      className="flex justify-between items-center bg-gray-50 p-3 rounded"
                    >
                      <div>
                        <div className="font-medium text-gray-900">{archivo.nombre}</div>
                        <div className="text-sm text-gray-600">
                          {archivo.tipo} • {(archivo.tamaño / 1024).toFixed(2)} KB
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(archivo.fechaSubida).toLocaleDateString()}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500 text-sm">No hay archivos subidos</p>
              )}
            </div>

            {/* Botones de acción */}
            {selectedCierre.estado !== 'CERRADO' && selectedCierre.estado !== 'AUDITADO' && (
              <>
                <button
                  onClick={() => setShowUpload(true)}
                  className="w-full mb-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center justify-center gap-2"
                >
                  <Upload size={18} />
                  Subir Documento
                </button>
                {selectedCierre.estado === 'PENDIENTE' && (
                  <button
                    onClick={() => handleCloseFiscalYear(selectedCierre.ejercicio)}
                    className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
                  >
                    Cerrar Ejercicio
                  </button>
                )}
              </>
            )}

            <button
              onClick={() => setSelectedCierre(null)}
              className="w-full mt-2 px-4 py-2 bg-gray-200 text-gray-900 rounded-md hover:bg-gray-300"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Modal de carga de archivo */}
      {showUpload && selectedCierre && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Subir Documento</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Documento
                </label>
                <select
                  value={uploadData.tipo}
                  onChange={(e) =>
                    setUploadData({
                      ...uploadData,
                      tipo: e.target.value as any,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="BALANCE_GENERAL">Balance General</option>
                  <option value="CUENTA_RESULTADOS">Cuenta de Resultados</option>
                  <option value="MEMORIA">Memoria</option>
                  <option value="OTRO">Otro Documento</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Archivo (PDF, Excel)
                </label>
                <input
                  type="file"
                  accept=".pdf,.xls,.xlsx"
                  onChange={(e) =>
                    setUploadData({
                      ...uploadData,
                      file: e.target.files?.[0] || null,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleUploadFile(selectedCierre.ejercicio)}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
                >
                  Subir
                </button>
                <button
                  onClick={() => setShowUpload(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-900 rounded-md hover:bg-gray-300"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Información de ayuda */}
      <div className="mt-6 p-4 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-700">
        <p>
          <strong>Ciclo contable:</strong> Los ejercicios se cierran automáticamente al final del año.
          Durante el cierre se ejecutan asientos de cierre automáticos y se bloquea la modificación
          de transacciones del período.
        </p>
      </div>
    </div>
  );
}
