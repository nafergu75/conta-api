'use client';

import { WarningCircle, Clock, CheckCircle } from '@phosphor-icons/react';
import Link from 'next/link';

interface Alert {
  id: string;
  modelo: string;
  periodo: string;
  fechaVencimiento: Date;
  diasFaltantes: number;
  enlace: string;
}

interface AlertCardProps {
  alert: Alert;
}

export function AlertCard({ alert }: AlertCardProps) {
  // Determina color según urgencia
  const getColorClasses = (diasFaltantes: number) => {
    if (diasFaltantes < 30) {
      return {
        bg: 'bg-rose-50',
        border: 'border-rose-200',
        text: 'text-rose-600',
        badge: 'bg-rose-100',
        icon: 'text-rose-600',
      };
    } else if (diasFaltantes < 90) {
      return {
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        text: 'text-amber-600',
        badge: 'bg-amber-100',
        icon: 'text-amber-600',
      };
    } else {
      return {
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        text: 'text-emerald-600',
        badge: 'bg-emerald-100',
        icon: 'text-emerald-600',
      };
    }
  };

  const colors = getColorClasses(alert.diasFaltantes);

  const getUrgencyLabel = (diasFaltantes: number) => {
    if (diasFaltantes < 30) return 'Urgente';
    if (diasFaltantes < 90) return 'Próximo';
    return 'Normal';
  };

  const getIcon = (diasFaltantes: number) => {
    if (diasFaltantes < 30) return <WarningCircle size={20} />;
    if (diasFaltantes < 90) return <Clock size={20} />;
    return <CheckCircle size={20} />;
  };

  return (
    <Link href={alert.enlace}>
      <div className={`group rounded-lg border ${colors.border} ${colors.bg} p-4 hover:shadow-md transition cursor-pointer`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-gray-900">{alert.modelo}</h3>
              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${colors.bg} ${colors.text} border ${colors.border}`}>
                {getUrgencyLabel(alert.diasFaltantes)}
              </span>
            </div>
            <p className="text-sm text-gray-600 mb-2">{alert.periodo}</p>
            <p className="text-xs text-gray-500">
              Vence: {alert.fechaVencimiento.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className={`rounded-lg ${colors.badge} p-2 flex-shrink-0`}>
            <div className={colors.icon}>{getIcon(alert.diasFaltantes)}</div>
          </div>
        </div>
        <div className="mt-3 text-sm font-medium text-gray-700">
          {alert.diasFaltantes} días restantes
        </div>
      </div>
    </Link>
  );
}
