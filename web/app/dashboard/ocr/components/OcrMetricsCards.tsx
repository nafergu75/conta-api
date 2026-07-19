'use client';

import React, { useEffect, useState } from 'react';
import { FileText, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

interface OcrMetricsCardProps {
  companyId: string;
}

interface Metrics {
  processedToday: number;
  averageProcessingTime: number;
  errorRate: number;
  contabilizados: number;
}

export function OcrMetricsCards({ companyId }: OcrMetricsCardProps) {
  const { token, loading: authLoading, getAuthHeader } = useAuth();
  const [metrics, setMetrics] = useState<Metrics>({
    processedToday: 0,
    averageProcessingTime: 0,
    errorRate: 0,
    contabilizados: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const response = await fetch(`/api/companies/${companyId}/ocr/stats`, {
          headers: {
            ...getAuthHeader(),
          },
        });
        if (response.ok) {
          const data = await response.json();
          setMetrics({
            processedToday: data.data?.processedToday || 0,
            averageProcessingTime: data.data?.averageProcessingTime || 0,
            errorRate: data.data?.errorRate || 0,
            contabilizados: data.data?.contabilizados || 0,
          });
        }
      } catch (error) {
        console.error('Error fetching OCR metrics:', error);
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) {
      fetchMetrics();
    }
  }, [companyId, authLoading, token, getAuthHeader]);

  const cards = [
    {
      title: 'PDFs procesados',
      value: metrics.processedToday,
      icon: FileText,
      color: 'bg-blue-50 text-blue-600',
      subtext: 'últimas 24h',
    },
    {
      title: 'Tiempo promedio',
      value: `${metrics.averageProcessingTime}s`,
      icon: Clock,
      color: 'bg-purple-50 text-purple-600',
      subtext: 'por documento',
    },
    {
      title: 'Tasa de error',
      value: `${metrics.errorRate}%`,
      icon: AlertTriangle,
      color: 'bg-red-50 text-red-600',
      subtext: 'últimas 24h',
    },
    {
      title: 'Contabilizados',
      value: metrics.contabilizados,
      icon: CheckCircle,
      color: 'bg-green-50 text-green-600',
      subtext: 'derivados de OCR',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div key={idx} className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">{card.title}</p>
                <p className="text-2xl font-bold text-gray-900 mt-2">
                  {loading ? '...' : card.value}
                </p>
                <p className="text-xs text-gray-500 mt-1">{card.subtext}</p>
              </div>
              <div className={`${card.color} p-3 rounded-lg`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
