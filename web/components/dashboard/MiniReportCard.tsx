'use client';

import { ArrowUp, ArrowDown, TrendUp } from '@phosphor-icons/react';

interface MiniReportItem {
  label: string;
  value: string | number;
  compareValue?: string | number;
  compareLabel?: string;
  trend?: 'up' | 'down' | 'neutral';
}

interface MiniReportCardProps {
  title: string;
  items: MiniReportItem[];
  color?: 'emerald' | 'rose' | 'blue' | 'amber';
}

const colorMap = {
  emerald: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-600',
    badge: 'bg-emerald-100',
  },
  rose: {
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    text: 'text-rose-600',
    badge: 'bg-rose-100',
  },
  blue: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    text: 'text-blue-600',
    badge: 'bg-blue-100',
  },
  amber: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-600',
    badge: 'bg-amber-100',
  },
};

export function MiniReportCard({ title, items, color = 'blue' }: MiniReportCardProps) {
  const colors = colorMap[color];

  return (
    <div className={`rounded-lg border ${colors.border} ${colors.bg} p-6`}>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>

      <div className="space-y-4">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-start justify-between pb-3 border-b border-gray-200 last:border-b-0 last:pb-0">
            <div className="flex-1">
              <p className="text-sm text-gray-600">{item.label}</p>
              <p className="mt-1 text-xl font-bold text-gray-900">{item.value}</p>
              {item.compareValue !== undefined && item.compareLabel && (
                <p className="mt-1 text-xs text-gray-500">
                  {item.compareLabel}: {item.compareValue}
                </p>
              )}
            </div>

            {item.trend && (
              <div className="flex-shrink-0 ml-4">
                {item.trend === 'up' && (
                  <div className="rounded-lg bg-emerald-100 p-2">
                    <ArrowUp size={16} className="text-emerald-600" />
                  </div>
                )}
                {item.trend === 'down' && (
                  <div className="rounded-lg bg-rose-100 p-2">
                    <ArrowDown size={16} className="text-rose-600" />
                  </div>
                )}
                {item.trend === 'neutral' && (
                  <div className="rounded-lg bg-slate-100 p-2">
                    <TrendUp size={16} className="text-slate-600" />
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
