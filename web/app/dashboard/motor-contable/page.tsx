'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, clearSession, getCompanyId } from '@/lib/auth';
import { CheckCircle, XCircle, Clock, Eye, ArrowRight } from '@phosphor-icons/react';
import Link from 'next/link';
import { Tooltip } from '@/app/dashboard/components/Tooltip';
import { ConfirmationModal } from '@/components/dashboard/ConfirmationModal';
import { Toast, ToastContainer, ToastType } from '@/components/dashboard/Toast';

interface JournalEntry {
  id: string;
  numeroAsiento: string;
  fecha: string;
  estado: 'DRAFT' | 'PENDING_REVIEW' | 'POSTED' | 'REVERSED';
  concepto: string;
  debe: number;
  haber: number;
  origen?: string;
  facturaId?: string;
}

const API = '/api/conta';

const ESTADO_CONFIG = {
  DRAFT: {
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: Clock,
    label: 'Borrador',
    tooltip: 'Asiento en borrador, no contabilizado aún.',
  },
  PENDING_REVIEW: {
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    icon: Eye,
    label: 'Pendiente revisión',
    tooltip: 'Esperando aprobación manual antes de contabilizar.',
  },
  POSTED: {
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: CheckCircle,
    label: 'Aprobado',
    tooltip: 'Contabilizado correctamente en el sistema.',
  },
  REVERSED: {
    color: 'bg-rose-50 text-rose-700 border-rose-200',
    icon: XCircle,
    label: 'Rechazado',
    tooltip: 'Asiento anulado o reversado.',
  },
};

export default function MotorContablePage() {
  const router = useRouter();

  // Empresa activa de la sesion (la que devolvio el login).
  const companyId = getCompanyId();

  const [asientos, setAsientos] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtros, setFiltros] = useState({
    estado: 'PENDING_REVIEW',
    desde: '',
    hasta: '',
  });
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, asientoId: '', isLoading: false });
  const [toasts, setToasts] = useState<Array<{ id: string; type: ToastType; title: string; message?: string }>>([]);

  useEffect(() => {
    const loadAsientos = async () => {
      const token = getToken();
      if (!token) {
        router.replace('/login');
        return;
      }

      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (filtros.estado) params.append('estado', filtros.estado);
        if (filtros.desde) params.append('desde', filtros.desde);
        if (filtros.hasta) params.append('hasta', filtros.hasta);

        const res = await fetch(
          `${API}/companies/${companyId}/accounting/journal-entries?${params}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (res.status === 401) {
          clearSession();
          router.replace('/login');
          return;
        }

        if (!res.ok) throw new Error('Error cargando asientos');
        const data = await res.json();
        setAsientos(data.data || data || []);
        setError('');  // Limpiar error anterior si lo hay
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    };

    if (companyId) loadAsientos();
  }, [companyId, filtros, router]);

  const addToast = (type: ToastType, title: string, message?: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, type, title, message }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleApproveClick = (asientoId: string) => {
    setConfirmModal({ isOpen: true, asientoId, isLoading: false });
  };

  const handleApproveConfirm = async () => {
    setConfirmModal((prev) => ({ ...prev, isLoading: true }));
    const token = getToken();
    if (!token) {
      setConfirmModal({ isOpen: false, asientoId: '', isLoading: false });
      return;
    }

    try {
      const res = await fetch(
        `${API}/companies/${companyId}/accounting/journal-entries/${confirmModal.asientoId}/approve`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ observaciones: 'Aprobado desde dashboard' }),
        }
      );

      if (res.status === 401) {
        clearSession();
        setConfirmModal({ isOpen: false, asientoId: '', isLoading: false });
        return;
      }

      if (!res.ok) throw new Error('Error aprobando asiento');

      setAsientos(asientos.map((a) =>
        a.id === confirmModal.asientoId ? { ...a, estado: 'POSTED' } : a
      ));
      addToast('success', 'Asiento aprobado', 'El asiento se ha contabilizado correctamente');
      setConfirmModal({ isOpen: false, asientoId: '', isLoading: false });
    } catch (err) {
      addToast('error', 'Error al aprobar', err instanceof Error ? err.message : 'Error desconocido');
      setConfirmModal((prev) => ({ ...prev, isLoading: false }));
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Motor Contable</h1>
        <p className="text-gray-600 mt-2">Generación automática y gestión de asientos contables</p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
          {error}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <h2 className="text-lg font-semibold mb-4">Filtros</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Estado
            </label>
            <select
              value={filtros.estado}
              onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">Todos</option>
              <option value="DRAFT">Borrador</option>
              <option value="PENDING_REVIEW">Revisión</option>
              <option value="POSTED">Contabilizado</option>
              <option value="REVERSED">Reversado</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Desde
            </label>
            <input
              type="date"
              value={filtros.desde}
              onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Hasta
            </label>
            <input
              type="date"
              value={filtros.hasta}
              onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
        </div>
      </div>

      {/* Ejemplos de uso */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-blue-900 mb-2">📌 Ejemplos de Uso</h3>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>Los asientos se crean automáticamente al contabilizar facturas</li>
          <li>Estado DRAFT = esperando revisión manual antes de aprobar</li>
          <li>Click en "Aprobar" cambia a POSTED y se registra en contabilidad</li>
          <li>Filtro por estado para seguimiento de asientos pendientes</li>
        </ul>
      </div>

      {/* Tabla de asientos */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Cargando asientos...</div>
        ) : asientos.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No hay asientos en este filtro. Contabiliza facturas para generar asientos.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                  # Asiento
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                  Fecha
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                  Concepto
                </th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                  Debe (€)
                </th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                  Haber (€)
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {asientos.map((asiento) => {
                const config = ESTADO_CONFIG[asiento.estado];
                const Icon = config.icon;
                return (
                  <tr key={asiento.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-mono text-gray-700">
                      {asiento.numeroAsiento}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(asiento.fecha).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {asiento.concepto}
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-mono text-gray-700">
                      {asiento.debe.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-mono text-gray-700">
                      {asiento.haber.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${config.color}`}>
                          <Icon size={14} />
                          {config.label}
                        </span>
                        <Tooltip text={config.tooltip} position="left" />
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm space-x-2">
                      <Link
                        href={`/dashboard/motor-contable/${asiento.id}`}
                        className="text-blue-600 hover:text-blue-900 font-medium inline-flex items-center gap-1"
                      >
                        Ver detalle <ArrowRight size={14} />
                      </Link>
                      {asiento.estado === 'PENDING_REVIEW' && (
                        <>
                          <span className="text-gray-300">|</span>
                          <button
                            onClick={() => handleApproveClick(asiento.id)}
                            className="text-green-600 hover:text-green-900 font-medium"
                          >
                            Aprobar
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Estadísticas */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-gray-900">
            {asientos.filter((a) => a.estado === 'PENDING_REVIEW').length}
          </div>
          <div className="text-sm text-gray-600">Pendientes revisión</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-gray-900">
            {asientos.filter((a) => a.estado === 'POSTED').length}
          </div>
          <div className="text-sm text-gray-600">Contabilizados</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-gray-900">
            €{asientos
              .filter((a) => a.estado === 'POSTED')
              .reduce((sum, a) => sum + a.debe, 0)
              .toFixed(2)}
          </div>
          <div className="text-sm text-gray-600">Total debe</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-2xl font-bold text-gray-900">
            €{asientos
              .filter((a) => a.estado === 'POSTED')
              .reduce((sum, a) => sum + a.haber, 0)
              .toFixed(2)}
          </div>
          <div className="text-sm text-gray-600">Total haber</div>
        </div>
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
        <p>
          <strong>Documentación:</strong> Los asientos se generan automáticamente según las reglas
          contables definidas. Requieren aprobación manual antes de registrarse definitivamente.
        </p>
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title="Aprobar asiento"
        message="¿Estás seguro de que deseas aprobar este asiento? Se contabilizará inmediatamente."
        confirmLabel="Aprobar"
        cancelLabel="Cancelar"
        isLoading={confirmModal.isLoading}
        onConfirm={handleApproveConfirm}
        onCancel={() => setConfirmModal({ isOpen: false, asientoId: '', isLoading: false })}
      />

      {/* Toast Container */}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}
