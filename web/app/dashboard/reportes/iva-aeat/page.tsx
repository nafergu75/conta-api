'use client';

import { useState } from 'react';
import { ReportHeader } from '@/components/reports/ReportHeader';
import { ReportTable } from '@/components/reports/ReportTable';
import { WarningCircle, CheckCircle } from '@phosphor-icons/react';

interface IVAData {
  ejercicio: number;
  ivaRepercutidoContable: number;
  ivaSoportadoContable: number;
  ivaRepercutidoAEAT: number;
  ivaSoportadoAEAT: number;
  resultadoContable: number;
  resultadoAEAT: number;
}

// Datos simulados (realistas para PYME españa 2026)
const getIVAData = (ejercicio: number): IVAData => {
  if (ejercicio === 2026) {
    return {
      ejercicio: 2026,
      ivaRepercutidoContable: 21000,
      ivaSoportadoContable: 5200,
      ivaRepercutidoAEAT: 21000,
      ivaSoportadoAEAT: 5150,
      resultadoContable: 15800,
      resultadoAEAT: 15850,
    };
  }
  return {
    ejercicio: 2025,
    ivaRepercutidoContable: 18000,
    ivaSoportadoContable: 4500,
    ivaRepercutidoAEAT: 18000,
    ivaSoportadoAEAT: 4500,
    resultadoContable: 13500,
    resultadoAEAT: 13500,
  };
};

export default function IVAAEATPage() {
  const [ejercicio, setEjercicio] = useState(2026);
  const data = getIVAData(ejercicio);

  const discrepanciaRep = Math.abs(data.ivaRepercutidoContable - data.ivaRepercutidoAEAT);
  const discrepanciaSop = Math.abs(data.ivaSoportadoContable - data.ivaSoportadoAEAT);
  const discrepanciaTotal = Math.abs(data.resultadoContable - data.resultadoAEAT);

  const tieneDiscrepancias = discrepanciaTotal > 1; // Tolerancia de 1€

  const comparisonRows = [
    { label: 'IVA Repercutido (Contabilidad)', value: data.ivaRepercutidoContable, bold: true },
    {
      label: 'IVA Repercutido (AEAT 303)',
      value: data.ivaRepercutidoAEAT,
      percentage: (data.ivaRepercutidoContable / data.ivaRepercutidoAEAT) * 100,
    },
    {
      label: 'Diferencia',
      value: discrepanciaRep,
      bold: discrepanciaRep > 0,
    },
    { label: '', value: '' },
    { label: 'IVA Soportado (Contabilidad)', value: data.ivaSoportadoContable, bold: true },
    {
      label: 'IVA Soportado (AEAT 303)',
      value: data.ivaSoportadoAEAT,
      percentage: (data.ivaSoportadoContable / data.ivaSoportadoAEAT) * 100,
    },
    {
      label: 'Diferencia',
      value: discrepanciaSop,
      bold: discrepanciaSop > 0,
    },
    { label: '', value: '' },
    { label: 'Resultado (Contabilidad)', value: data.resultadoContable, bold: true },
    {
      label: 'Resultado (AEAT 303)',
      value: data.resultadoAEAT,
      bold: true,
    },
    {
      label: 'Diferencia Total',
      value: discrepanciaTotal,
      bold: true,
    },
  ];

  return (
    <div className="space-y-8">
      <ReportHeader
        title="IVA vs AEAT"
        subtitle="Comparativa entre tu contabilidad y lo presentado a Hacienda"
        ejercicio={ejercicio}
        onEjercicioChange={setEjercicio}
        backHref="/dashboard"
      />

      {/* Alert si hay discrepancias */}
      {tieneDiscrepancias && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 flex items-start gap-3">
          <WarningCircle size={20} className="text-rose-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-rose-900">Discrepancia detectada</p>
            <p className="text-sm text-rose-700 mt-1">
              Hay una diferencia de {discrepanciaTotal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })} entre tu contabilidad
              y lo presentado a AEAT. Te recomendamos revisar tus registros antes del próximo modelo 303.
            </p>
          </div>
        </div>
      )}

      {!tieneDiscrepancias && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 flex items-start gap-3">
          <CheckCircle size={20} className="text-emerald-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-emerald-900">Todo en orden</p>
            <p className="text-sm text-emerald-700 mt-1">Tu IVA contable coincide con lo presentado a AEAT. ✅</p>
          </div>
        </div>
      )}

      {/* KPIs Principales */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
          <p className="text-sm text-blue-600">IVA Repercutido</p>
          <p className="mt-2 text-2xl font-bold text-blue-900">
            {data.ivaRepercutidoContable.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
          </p>
          <p className="mt-2 text-xs text-blue-600">
            {discrepanciaRep === 0 ? '✅ Coincide con AEAT' : `⚠️ Diferencia: ${discrepanciaRep.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`}
          </p>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
          <p className="text-sm text-amber-600">IVA Soportado</p>
          <p className="mt-2 text-2xl font-bold text-amber-900">
            {data.ivaSoportadoContable.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
          </p>
          <p className="mt-2 text-xs text-amber-600">
            {discrepanciaSop === 0 ? '✅ Coincide con AEAT' : `⚠️ Diferencia: ${discrepanciaSop.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}`}
          </p>
        </div>

        <div className={`rounded-lg border p-6 ${!tieneDiscrepancias ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
          <p className={`text-sm ${!tieneDiscrepancias ? 'text-emerald-600' : 'text-rose-600'}`}>IVA a Pagar/Recibir</p>
          <p className={`mt-2 text-2xl font-bold ${!tieneDiscrepancias ? 'text-emerald-900' : 'text-rose-900'}`}>
            {data.resultadoContable.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
          </p>
          <p className={`mt-2 text-xs ${!tieneDiscrepancias ? 'text-emerald-600' : 'text-rose-600'}`}>
            {data.resultadoContable > 0 ? 'A pagar a Hacienda' : 'A recibir de Hacienda'}
          </p>
        </div>
      </div>

      {/* Tabla Comparativa */}
      <ReportTable rows={comparisonRows} title="Comparativa Detallada" />

      {/* Recomendaciones */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recomendaciones</h2>
        <div className="space-y-3">
          {tieneDiscrepancias && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm font-semibold text-rose-900">1. Revisar registros contables</p>
              <p className="text-xs text-rose-700 mt-1">
                Hay una discrepancia de {discrepanciaTotal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}.
                Verifica que todos tus asientos de IVA estén correctamente registrados.
              </p>
            </div>
          )}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-900">2. Próximo vencimiento Modelo 303</p>
            <p className="text-xs text-blue-700 mt-1">
              Tienes hasta el 20 de {new Date().getMonth() > 3 ? 'abril' : 'enero'} para presentar este trimestre a AEAT.
            </p>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-900">3. Guardar evidencia</p>
            <p className="text-xs text-emerald-700 mt-1">
              Exporta este reporte para tu documentación. Es útil si Hacienda te pide justificación.
            </p>
          </div>
        </div>
      </div>

      {/* Información */}
      <div className="rounded-lg border-l-4 border-l-blue-500 bg-blue-50 p-4">
        <p className="text-sm text-blue-900">
          <strong>Nota:</strong> Este reporte compara tu IVA contable con lo presentado en modelos 303/390.
          Pequeñas diferencias (menores a 1€) son normales por redondeamiento. Si hay discrepancias significativas,
          revisa tus registros o consulta con tu asesor contable.
        </p>
      </div>
    </div>
  );
}
