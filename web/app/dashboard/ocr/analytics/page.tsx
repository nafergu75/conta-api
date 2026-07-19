'use client';


import React, { useState, useEffect , Suspense} from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';
import { OcrKpiCard } from './components/OcrKpiCard';
import { OcrTimelineChart } from './components/OcrTimelineChart';
import { OcrDistributionChart } from './components/OcrDistributionChart';
import { Calendar, TrendingUp, Clock, AlertCircle } from 'lucide-react';

interface KPIData {
  todayCount: number;
  avgTime: number;
  errorRate: number;
  totalProcessed: number;
  completedCount: number;
  failedCount: number;
}

interface TimelineData {
  date: string;
  count: number;
  completed: number;
  failed: number;
}

interface DistributionData {
  type: string;
  count: number;
  completed: number;
  failed: number;
  successRate: number;
}

function OcrAnalyticsPageInner() {
  const searchParams = useSearchParams();
  const companyId = searchParams.get('companyId') || '1';
  const { getAuthHeader } = useAuth();

  const [kpis, setKpis] = useState<KPIData | null>(null);
  const [timeline, setTimeline] = useState<TimelineData[]>([]);
  const [distribution, setDistribution] = useState<DistributionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch KPIs
        const kpiRes = await fetch(
          `/api/companies/${companyId}/ocr/analytics/kpis?days=${days}`,
          { headers: getAuthHeader() }
        );
        if (!kpiRes.ok) throw new Error('Failed to fetch KPIs');
        const kpiData = await kpiRes.json();
        setKpis(kpiData.data);

        // Fetch Timeline
        const tlRes = await fetch(
          `/api/companies/${companyId}/ocr/analytics/timeline?days=${days}`,
          { headers: getAuthHeader() }
        );
        if (!tlRes.ok) throw new Error('Failed to fetch timeline');
        const tlData = await tlRes.json();
        setTimeline(tlData.data);

        // Fetch Distribution
        const distRes = await fetch(
          `/api/companies/${companyId}/ocr/analytics/distribution?days=${days}`,
          { headers: getAuthHeader() }
        );
        if (!distRes.ok) throw new Error('Failed to fetch distribution');
        const distData = await distRes.json();
        setDistribution(distData.data.byType);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Error desconocido';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [companyId, days, getAuthHeader]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics OCR</h1>
          <p className="text-gray-600 mt-1">Estadísticas y métricas del procesamiento de facturas</p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar size={20} className="text-gray-400" />
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
            className="px-4 py-2 border border-gray-200 rounded-lg bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <option value={7}>Últimos 7 días</option>
            <option value={30}>Últimos 30 días</option>
            <option value={60}>Últimos 60 días</option>
            <option value={90}>Últimos 90 días</option>
          </select>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-gap-3">
          <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-red-900">Error al cargar datos</h3>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <OcrKpiCard
          label="PDFs Hoy"
          value={kpis?.todayCount || 0}
          icon={<TrendingUp size={24} />}
          unit="archivos"
        />
        <OcrKpiCard
          label="Tiempo Promedio"
          value={kpis?.avgTime || 0}
          icon={<Clock size={24} />}
          unit="segundos"
        />
        <OcrKpiCard
          label="Tasa de Error"
          value={kpis?.errorRate || 0}
          icon={<AlertCircle size={24} />}
          unit="%"
        />
        <OcrKpiCard
          label="Total Procesados"
          value={kpis?.totalProcessed || 0}
          icon={<TrendingUp size={24} />}
          unit="PDFs"
        />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <OcrTimelineChart data={timeline} isLoading={loading} />
        <OcrDistributionChart data={distribution} isLoading={loading} />
      </div>

      {/* Resumen */}
      {kpis && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-2">📊 Resumen</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-blue-800">
            <div>
              <p className="font-medium">Completados</p>
              <p className="text-lg font-bold">
                {kpis.completedCount} ({kpis.totalProcessed > 0 ? Math.round((kpis.completedCount / kpis.totalProcessed) * 100) : 0}%)
              </p>
            </div>
            <div>
              <p className="font-medium">Fallidos</p>
              <p className="text-lg font-bold text-red-600">{kpis.failedCount}</p>
            </div>
            <div>
              <p className="font-medium">Promedio de velocidad</p>
              <p className="text-lg font-bold">{kpis.avgTime}s</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OcrAnalyticsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Cargando...</div>}>
      <OcrAnalyticsPageInner />
    </Suspense>
  );
}
