'use client';

import Link from 'next/link';
import { ReactNode } from 'react';

interface KeyIndicatorCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  href?: string;
  color?: 'emerald' | 'rose' | 'blue' | 'amber' | 'slate';
  badge?: {
    label: string;
    type: 'success' | 'warning' | 'error' | 'info';
  };
}

const colorMap = {
  emerald: {
    bg: 'bg-emerald-100',
    text: 'text-emerald-600',
    border: 'border-emerald-200',
  },
  rose: {
    bg: 'bg-rose-100',
    text: 'text-rose-600',
    border: 'border-rose-200',
  },
  blue: {
    bg: 'bg-blue-100',
    text: 'text-blue-600',
    border: 'border-blue-200',
  },
  amber: {
    bg: 'bg-amber-100',
    text: 'text-amber-600',
    border: 'border-amber-200',
  },
  slate: {
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    border: 'border-slate-200',
  },
};

const badgeColors = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  error: 'bg-rose-50 text-rose-700 border-rose-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
};

export function KeyIndicatorCard({
  label,
  value,
  icon,
  href,
  color = 'blue',
  badge,
}: KeyIndicatorCardProps) {
  const colors = colorMap[color];

  const content = (
    <div
      className={`rounded-lg border ${colors.border} bg-white p-6 ${
        href ? 'hover:shadow-md transition cursor-pointer group' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-600">{label}</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
          {badge && (
            <div className="mt-3">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${
                  badgeColors[badge.type]
                }`}
              >
                {badge.label}
              </span>
            </div>
          )}
        </div>
        <div className={`rounded-lg ${colors.bg} p-3 flex-shrink-0`}>
          <div className={colors.text}>{icon}</div>
        </div>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
