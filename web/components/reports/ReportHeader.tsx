'use client';

import Link from 'next/link';
import { ArrowLeft } from '@phosphor-icons/react';

interface ReportHeaderProps {
  title: string;
  subtitle?: string;
  ejercicio?: number;
  onEjercicioChange?: (ejercicio: number) => void;
  backHref?: string;
}

export function ReportHeader({
  title,
  subtitle,
  ejercicio,
  onEjercicioChange,
  backHref = '/dashboard',
}: ReportHeaderProps) {
  const currentYear = new Date().getFullYear();

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Link href={backHref} className="text-blue-600 hover:text-blue-900 inline-flex items-center gap-1">
          <ArrowLeft size={16} />
          Volver
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="mt-2 text-gray-600">{subtitle}</p>}
        </div>

        {ejercicio !== undefined && onEjercicioChange && (
          <select
            value={ejercicio}
            onChange={(e) => onEjercicioChange(parseInt(e.target.value))}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-900"
          >
            {[currentYear, currentYear - 1, currentYear - 2].map((year) => (
              <option key={year} value={year}>
                Ejercicio {year}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
