'use client';

import { useMemo } from 'react';

interface ChartData {
  label: string;
  value: number;
  color?: 'emerald' | 'rose' | 'blue' | 'amber' | 'slate';
}

interface ReportChartProps {
  data: ChartData[];
  title?: string;
  type?: 'bar' | 'summary';
}

const colorMap = {
  emerald: 'bg-emerald-100 border-emerald-300 text-emerald-700',
  rose: 'bg-rose-100 border-rose-300 text-rose-700',
  blue: 'bg-blue-100 border-blue-300 text-blue-700',
  amber: 'bg-amber-100 border-amber-300 text-amber-700',
  slate: 'bg-slate-100 border-slate-300 text-slate-700',
};

export function ReportChart({ data, title, type = 'bar' }: ReportChartProps) {
  const maxValue = useMemo(() => Math.max(...data.map((d) => Math.abs(d.value))), [data]);
  const formatValue = (value: number) => value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

  if (type === 'summary') {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {data.map((item) => {
          const color = item.color || 'blue';
          const colorClasses = colorMap[color];

          return (
            <div key={item.label} className={`rounded-lg border ${colorClasses} p-6 text-center`}>
              <p className="text-sm font-medium mb-2">{item.label}</p>
              <p className="text-3xl font-bold">{formatValue(item.value)}</p>
              <p className="text-xs mt-2 opacity-75">
                {((item.value / maxValue) * 100).toFixed(0)}% del máximo
              </p>
            </div>
          );
        })}
      </div>
    );
  }

  // Bar chart visualization
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      {title && <h3 className="text-lg font-semibold text-gray-900 mb-6">{title}</h3>}

      <div className="space-y-6">
        {data.map((item) => {
          const percentage = (Math.abs(item.value) / maxValue) * 100;
          const color = item.color || 'blue';
          const bgColor = {
            emerald: 'bg-emerald-500',
            rose: 'bg-rose-500',
            blue: 'bg-blue-500',
            amber: 'bg-amber-500',
            slate: 'bg-slate-500',
          }[color];

          return (
            <div key={item.label}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-900">{item.label}</span>
                <span className="text-sm font-bold text-gray-900">{formatValue(item.value)}</span>
              </div>
              <div className="h-8 bg-gray-100 rounded-lg overflow-hidden">
                <div
                  className={`h-full ${bgColor} transition-all duration-300 flex items-center justify-end pr-2`}
                  style={{ width: `${percentage}%` }}
                >
                  {percentage > 15 && <span className="text-xs font-bold text-white">{percentage.toFixed(0)}%</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
