'use client';

import React, { useEffect, useState } from 'react';
import { FileText, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { apiFetch, companyPath } from '@/lib/api';

interface Metrics {
  processedToday: number;
  averageProcessingTime: number;
  errorRate: number;
  contabilizados: number;
}

export function OcrMetricsCards() {
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
        const data = await apiFetch<Partial<Metrics>>(companyPath('/ocr/stats'));
        setMetrics({
          processedToday: data?.processedToday || 0,
          averageProcessingTime: data?.averageProcessingTime || 0,
          errorRate: data?.errorRate || 0,
          contabilizados: data?.contabilizados || 0,
        });
      } catch {
        // La bandeja ya muestra el error de carga; aqui las tarjetas quedan a cero.
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, []);

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
