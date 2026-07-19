'use client';

import { ReactNode } from 'react';

interface OcrKpiCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: {
    direction: 'up' | 'down';
    percentage: number;
  };
  unit?: string;
}

export function OcrKpiCard({
  label,
  value,
  icon,
  trend,
  unit,
}: OcrKpiCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 mb-1">{label}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold text-gray-900">{value}</p>
            {unit && <span className="text-sm text-gray-500">{unit}</span>}
          </div>
          {trend && (
            <p
              className={`text-xs font-medium mt-2 ${
                trend.direction === 'up'
                  ? 'text-green-600'
                  : 'text-red-600'
              }`}
            >
              {trend.direction === 'up' ? '↑' : '↓'} {trend.percentage}% vs último período
            </p>
          )}
        </div>
        {icon && (
          <div className="text-gray-400 ml-4">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
