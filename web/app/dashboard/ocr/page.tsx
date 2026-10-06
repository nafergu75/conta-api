'use client';


import React, { useEffect, useState , Suspense} from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Filter, X } from 'lucide-react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { OcrMetricsCards } from './components/OcrMetricsCards';
import { OcrSessionsTable } from './components/OcrSessionsTable';

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

interface FilterState {
  status: string;
  invoiceType: string;
  dateRange: string;
}

function OcrSessionsPageInner() {
  const router = useRouter();
  const [errorCarga, setErrorCarga] = useState('');
  const [aviso, setAviso] = useState('');

  const [sessions, setSessions] = useState<OcrSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    status: 'all',
    invoiceType: 'all',
    dateRange: '7d',
  });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams({
          status: filters.status !== 'all' ? filters.status : '',
          invoiceType: filters.invoiceType !== 'all' ? filters.invoiceType : '',
          dateRange: filters.dateRange,
        });

        setErrorCarga('');
        setSessions((await apiFetch<OcrSession[]>(companyPath(`/ocr/sessions?${params}`))) || []);
      } catch (error) {
        setErrorCarga(errorMessage(error));
      } finally {
        setLoading(false);
      }
    };

    fetchSessions();
  }, [filters]);

  const handleViewDetail = (sessionId: string) => {
    router.push(`/dashboard/ocr/sessions/${sessionId}`);
  };

  const handleViewPdf = (_sessionId: string) => {
    // El backend todavia no sirve el PDF original de una sesion OCR.
    setAviso('La vista del PDF original aún no está disponible. Abre el detalle de la sesión para ver el texto extraído.');
  };

  const handleUploadClick = () => {
    router.push('/dashboard/ocr/upload');
  };

  const resetFilters = () => {
    setFilters({ status: 'all', invoiceType: 'all', dateRange: '7d' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Bandeja OCR</h1>
          <p className="text-gray-600 mt-1">Gestiona tus documentos escaneados y procesados</p>
        </div>
        <button
          onClick={handleUploadClick}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Upload className="w-5 h-5" />
          Cargar PDF
        </button>
      </div>

      {/* Métricas */}
      {(errorCarga || aviso) && (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {errorCarga || aviso}
        </div>
      )}

      <OcrMetricsCards />

      {/* Filtros */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            <Filter className="w-4 h-4" />
            Filtros
            {Object.values(filters).some((v) => v !== 'all' && v !== '7d') && (
              <span className="inline-block w-2 h-2 bg-blue-600 rounded-full" />
            )}
          </button>
          {Object.values(filters).some((v) => v !== 'all' && v !== '7d') && (
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
            >
              <X className="w-3 h-3" />
              Limpiar
            </button>
          )}
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Estado */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-2">Estado</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="all">Todos</option>
                <option value="PENDING">Pendiente</option>
                <option value="PROCESSING">En proceso</option>
                <option value="COMPLETED">Completado</option>
                <option value="FAILED">Error</option>
              </select>
            </div>

            {/* Tipo */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-2">Tipo</label>
              <select
                value={filters.invoiceType}
                onChange={(e) => setFilters({ ...filters, invoiceType: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="all">Todos</option>
                <option value="expense">Gastos</option>
                <option value="income">Ingresos</option>
              </select>
            </div>

            {/* Rango de fechas */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-2">Período</label>
              <select
                value={filters.dateRange}
                onChange={(e) => setFilters({ ...filters, dateRange: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              >
                <option value="1d">Últimas 24h</option>
                <option value="7d">Últimos 7 días</option>
                <option value="30d">Últimos 30 días</option>
                <option value="all">Todo</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Tabla de sesiones */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-gray-600 mt-4">Cargando sesiones...</p>
          </div>
        ) : (
          <OcrSessionsTable
            sessions={sessions}
            onViewDetail={handleViewDetail}
            onViewPdf={handleViewPdf}
          />
        )}
      </div>
    </div>
  );
}

export default function OcrSessionsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Cargando...</div>}>
      <OcrSessionsPageInner />
    </Suspense>
  );
}
