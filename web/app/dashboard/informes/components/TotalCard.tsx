'use client';

import { ReactNode } from 'react';

interface TotalCardProps {
  label: string;
  valor: number;
  icon?: ReactNode;
  porcentaje?: number;
  color?: 'blue' | 'green' | 'amber' | 'slate';
  variant?: 'default' | 'highlight';
}

const colorClasses = {
  blue: 'bg-blue-50 border-blue-200 text-blue-900',
  green: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  amber: 'bg-amber-50 border-amber-200 text-amber-900',
  slate: 'bg-slate-50 border-slate-200 text-slate-900',
};

const iconColorClasses = {
  blue: 'text-blue-600',
  green: 'text-emerald-600',
  amber: 'text-amber-600',
  slate: 'text-slate-400',
};

export function TotalCard({
  label,
  valor,
  icon,
  porcentaje,
  color = 'slate',
  variant = 'default',
}: TotalCardProps) {
  const eur = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  });

  const highlight = variant === 'highlight';

  return (
    <div
      className={`rounded-lg border p-4 transition-all ${
        colorClasses[color]
      } ${highlight ? 'ring-2 ring-offset-2 ring-blue-500 shadow-lg' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium opacity-80">{label}</p>
          <p className={`mt-2 text-2xl font-bold`}>
            {eur.format(valor)}
          </p>
          {porcentaje !== undefined && (
            <p className="mt-1 text-xs opacity-70">
              {porcentaje.toFixed(1)}% del total
            </p>
          )}
        </div>
        {icon && (
          <div className={`text-3xl ${iconColorClasses[color]} opacity-40`}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
