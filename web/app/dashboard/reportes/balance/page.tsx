'use client';

import { useState } from 'react';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { ReportTable } from '@/components/reports/ReportTable';
import { ReportChart } from '@/components/reports/ReportChart';

interface BalanceData {
  ejercicio: number;
  activoCorriente: number;
  activoNoCorriente: number;
  pasivoCorriente: number;
  pasivoNoCorriente: number;
}

// Datos simulados (realistas para PYME españa 2026)
const getBalanceData = (ejercicio: number): BalanceData => {
  if (ejercicio === 2026) {
    return {
      ejercicio: 2026,
      activoCorriente: 35000,
      activoNoCorriente: 25000,
      pasivoCorriente: 15000,
      pasivoNoCorriente: 8000,
    };
  }
  return {
    ejercicio: 2025,
    activoCorriente: 28000,
    activoNoCorriente: 20000,
    pasivoCorriente: 12000,
    pasivoNoCorriente: 5000,
  };
};

export default function BalancePage() {
  const [ejercicio, setEjercicio] = useState(2026);
  const data = getBalanceData(ejercicio);

  const totalActivo = data.activoCorriente + data.activoNoCorriente;
  const totalPasivo = data.pasivoCorriente + data.pasivoNoCorriente;
  const neto = totalActivo - totalPasivo;

  const balanceRows = [
    { label: 'ACTIVO', value: '', bold: true },
    {
      label: 'Activo Corriente',
      value: data.activoCorriente,
      percentage: (data.activoCorriente / totalActivo) * 100,
    },
    {
      label: 'Activo No Corriente',
      value: data.activoNoCorriente,
      percentage: (data.activoNoCorriente / totalActivo) * 100,
    },
    { label: 'TOTAL ACTIVO', value: totalActivo, bold: true, percentage: 100 },
    { label: '', value: '' },
    { label: 'PASIVO', value: '', bold: true },
    {
      label: 'Pasivo Corriente',
      value: data.pasivoCorriente,
      percentage: (data.pasivoCorriente / totalPasivo) * 100,
    },
    {
      label: 'Pasivo No Corriente',
      value: data.pasivoNoCorriente,
      percentage: (data.pasivoNoCorriente / totalPasivo) * 100,
    },
    { label: 'TOTAL PASIVO', value: totalPasivo, bold: true, percentage: 100 },
    { label: '', value: '' },
    { label: 'NETO (Patrimonio Neto)', value: neto, bold: true },
  ];

  const ratios = {
    liquidez: (data.activoCorriente / data.pasivoCorriente).toFixed(2),
    solvencia: (totalActivo / totalPasivo).toFixed(2),
    endeudamiento: ((totalPasivo / totalActivo) * 100).toFixed(1),
  };

  const chartData = [
    { label: 'Activo', value: totalActivo, color: 'blue' as const },
    { label: 'Pasivo', value: totalPasivo, color: 'rose' as const },
    { label: 'Neto', value: neto, color: 'emerald' as const },
  ];

  return (
    <div className="space-y-8">
      <div role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Datos de ejemplo.</strong> Esta pantalla es un prototipo: las cifras no salen de tu
        contabilidad. Para informes reales usa Informes &gt; Balance general o Pérdidas y ganancias.
      </div>
      <ReportHeader
        title="Balance de Situación"
        subtitle="Estado patrimonial de tu empresa"
        ejercicio={ejercicio}
        onEjercicioChange={setEjercicio}
        backHref="/dashboard"
      />

      {/* KPIs Principales */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
          <p className="text-sm text-blue-600">Total Activo</p>
          <p className="mt-2 text-3xl font-bold text-blue-900">
            {totalActivo.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
          </p>
          <p className="mt-2 text-xs text-blue-600">Lo que tienes</p>
        </div>

        <div className="rounded-lg border border-rose-200 bg-rose-50 p-6">
          <p className="text-sm text-rose-600">Total Pasivo</p>
          <p className="mt-2 text-3xl font-bold text-rose-900">
            {totalPasivo.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
          </p>
          <p className="mt-2 text-xs text-rose-600">Lo que debes</p>
        </div>

        <div className={`rounded-lg border p-6 ${neto >= 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
          <p className={`text-sm ${neto >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Patrimonio Neto</p>
          <p className={`mt-2 text-3xl font-bold ${neto >= 0 ? 'text-emerald-900' : 'text-red-900'}`}>
            {neto.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
          </p>
          <p className={`mt-2 text-xs ${neto >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Tu valor neto</p>
        </div>
      </div>

      {/* Tabla Balance */}
      <ReportTable rows={balanceRows} title="Balance General" />

      {/* Gráfico */}
      <ReportChart data={chartData} title="Composición del Balance" type="bar" />

      {/* Ratios Financieros */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Ratios Financieros Clave</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-blue-200 bg-white p-6">
            <p className="text-sm text-gray-600">Ratio de Liquidez</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{ratios.liquidez}</p>
            <p className="mt-2 text-xs text-gray-500">
              {parseFloat(ratios.liquidez) > 1.5
                ? '✅ Buena liquidez'
                : parseFloat(ratios.liquidez) > 1
                ? '⚠️ Liquidez aceptable'
                : '❌ Riesgo de liquidez'}
            </p>
          </div>

          <div className="rounded-lg border border-emerald-200 bg-white p-6">
            <p className="text-sm text-gray-600">Ratio de Solvencia</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{ratios.solvencia}</p>
            <p className="mt-2 text-xs text-gray-500">
              {parseFloat(ratios.solvencia) > 2 ? '✅ Buena solvencia' : '⚠️ Solvencia moderada'}
            </p>
          </div>

          <div className="rounded-lg border border-rose-200 bg-white p-6">
            <p className="text-sm text-gray-600">Ratio de Endeudamiento</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{ratios.endeudamiento}%</p>
            <p className="mt-2 text-xs text-gray-500">
              {parseFloat(ratios.endeudamiento) < 50
                ? '✅ Bajo endeudamiento'
                : '⚠️ Endeudamiento moderado'}
            </p>
          </div>
        </div>
      </div>

      {/* Información */}
      <div className="rounded-lg border-l-4 border-l-blue-500 bg-blue-50 p-4">
        <p className="text-sm text-blue-900">
          <strong>Nota:</strong> Estos ratios te ayudan a entender tu salud financiera. Ratio de liquidez {'>'} 1 es bueno.
          Ratio de solvencia {'>'} 2 es recomendado. Endeudamiento {'<'} 50% es sano.
        </p>
      </div>
    </div>
  );
}
