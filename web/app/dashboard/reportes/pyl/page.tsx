'use client';

import { useState } from 'react';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { ReportTable } from '@/components/reports/ReportTable';
import { ReportChart } from '@/components/reports/ReportChart';

interface PYLData {
  ejercicio: number;
  ingresos: number;
  gastos: number;
  beneficio: number;
  margenBruto: number;
  ingresosPrevio?: number;
  gastosPrevio?: number;
  beneficioPrevio?: number;
}

// Datos simulados (realistas para PYME españa 2026)
const getPYLData = (ejercicio: number): PYLData => {
  if (ejercicio === 2026) {
    return {
      ejercicio: 2026,
      ingresos: 120000,
      gastos: 45000,
      beneficio: 75000,
      margenBruto: 62.5,
      ingresosPrevio: 95000,
      gastosPrevio: 38000,
      beneficioPrevio: 57000,
    };
  }
  return {
    ejercicio: 2025,
    ingresos: 95000,
    gastos: 38000,
    beneficio: 57000,
    margenBruto: 60.0,
    ingresosPrevio: 75000,
    gastosPrevio: 30000,
    beneficioPrevio: 45000,
  };
};

export default function PYLPage() {
  const [ejercicio, setEjercicio] = useState(2026);
  const data = getPYLData(ejercicio);

  const pylRows = [
    { label: 'Ingresos', value: data.ingresos, bold: true, percentage: 100 },
    {
      label: 'Gastos Operativos',
      value: data.gastos,
      percentage: (data.gastos / data.ingresos) * 100,
    },
    {
      label: 'Beneficio Bruto',
      value: data.beneficio,
      bold: true,
      percentage: (data.beneficio / data.ingresos) * 100,
    },
  ];

  const comparativaRows = data.ingresosPrevio && data.gastosPrevio ? [
    {
      label: 'Ingresos',
      value: data.ingresos,
      trend: data.ingresos > data.ingresosPrevio ? ('up' as const) : ('down' as const),
    },
    {
      label: 'Ingresos (Año anterior)',
      value: data.ingresosPrevio,
      percentage: ((data.ingresos - data.ingresosPrevio) / data.ingresosPrevio) * 100,
    },
    {
      label: 'Gastos',
      value: data.gastos,
      trend: data.gastos < data.gastosPrevio ? ('up' as const) : ('down' as const),
    },
    {
      label: 'Gastos (Año anterior)',
      value: data.gastosPrevio,
      percentage: ((data.gastos - data.gastosPrevio) / data.gastosPrevio) * 100,
    },
  ] : [];

  const chartData = [
    { label: 'Ingresos', value: data.ingresos, color: 'emerald' as const },
    { label: 'Gastos', value: data.gastos, color: 'rose' as const },
    { label: 'Beneficio', value: data.beneficio, color: 'blue' as const },
  ];

  return (
    <div className="space-y-8">
      <div role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Datos de ejemplo.</strong> Esta pantalla es un prototipo: las cifras no salen de tu
        contabilidad. Para informes reales usa Informes &gt; Balance general o Pérdidas y ganancias.
      </div>
      <ReportHeader
        title="P&L (Pérdidas y Ganancias)"
        subtitle="Estado de resultados de tu actividad económica"
        ejercicio={ejercicio}
        onEjercicioChange={setEjercicio}
        backHref="/dashboard"
      />

      {/* KPIs Principales */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6">
          <p className="text-sm text-emerald-600">Ingresos Totales</p>
          <p className="mt-2 text-3xl font-bold text-emerald-900">
            {data.ingresos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
          </p>
          {data.ingresosPrevio && (
            <p className="mt-2 text-xs text-emerald-600">
              +{(((data.ingresos - data.ingresosPrevio) / data.ingresosPrevio) * 100).toFixed(1)}% vs {ejercicio - 1}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-rose-200 bg-rose-50 p-6">
          <p className="text-sm text-rose-600">Gastos Totales</p>
          <p className="mt-2 text-3xl font-bold text-rose-900">
            {data.gastos.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
          </p>
          {data.gastosPrevio && (
            <p className="mt-2 text-xs text-rose-600">
              {data.gastos > data.gastosPrevio ? '+' : ''}
              {(((data.gastos - data.gastosPrevio) / data.gastosPrevio) * 100).toFixed(1)}% vs {ejercicio - 1}
            </p>
          )}
        </div>

        <div className={`rounded-lg border p-6 ${data.beneficio >= 0 ? 'border-blue-200 bg-blue-50' : 'border-red-200 bg-red-50'}`}>
          <p className={`text-sm ${data.beneficio >= 0 ? 'text-blue-600' : 'text-red-600'}`}>Beneficio Neto</p>
          <p className={`mt-2 text-3xl font-bold ${data.beneficio >= 0 ? 'text-blue-900' : 'text-red-900'}`}>
            {data.beneficio.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
          </p>
          <p className={`mt-2 text-xs ${data.beneficio >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
            Margen: {data.margenBruto.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Tabla P&L */}
      <ReportTable rows={pylRows} title="Resumen P&L" />

      {/* Gráfico */}
      <ReportChart data={chartData} title="Comparativa Ingresos, Gastos y Beneficio" type="bar" />

      {/* Comparativa con Año Anterior */}
      {comparativaRows.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Comparativa Año Anterior</h2>
          <ReportTable rows={comparativaRows} />
        </div>
      )}

      {/* Información adicional */}
      <div className="rounded-lg border-l-4 border-l-blue-500 bg-blue-50 p-4">
        <p className="text-sm text-blue-900">
          <strong>Nota:</strong> Este P&L es un resumen de tu actividad económica basado en ingresos y gastos registrados.
          Para un análisis detallado por categorías, consulta tu contabilidad analítica o reportes adicionales.
        </p>
      </div>
    </div>
  );
}
