'use client';

import Link from 'next/link';
import { ChartBar, ChartLine, Lock } from '@phosphor-icons/react';
import { Tooltip } from '@/app/dashboard/components/Tooltip';

export default function InformesPage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-slate-900">Informes Contables</h1>
          <Tooltip text="Reportes financieros que muestran la situación económica de tu empresa. Todos basados en asientos contabilizados." position="top" />
        </div>
        <p className="mt-2 text-slate-600">
          Reportes financieros para análisis y toma de decisiones
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Resultados (P&L) - Primero */}
        <Link
          href="/dashboard/informes/pyg"
          className="group rounded-lg border border-slate-200 bg-white p-6 transition hover:border-green-300 hover:shadow-lg"
        >
          <div className="mb-4 flex items-center justify-between">
            <ChartLine size={32} className="text-green-600" />
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
              Ver ahora
            </span>
          </div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900 group-hover:text-green-600">
              Resultados
            </h2>
            <Tooltip text="¿Cuánto has ganado o perdido? Muestra ingresos menos gastos del período." position="top" />
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Cuenta de resultados del ejercicio: ingresos menos gastos operacionales.
          </p>
        </Link>

        {/* Balance General */}
        <Link
          href="/dashboard/informes/balance"
          className="group rounded-lg border border-slate-200 bg-white p-6 transition hover:border-blue-300 hover:shadow-lg"
        >
          <div className="mb-4 flex items-center justify-between">
            <ChartBar size={32} className="text-blue-600" />
            <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
              Ver ahora
            </span>
          </div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900 group-hover:text-blue-600">
              Situación (Balance)
            </h2>
            <Tooltip text="¿Qué tienes y cuánto debes? Muestra activos, pasivos y patrimonio neto." position="top" />
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Estado de activos, pasivos y patrimonio neto de la empresa al
            cierre del período.
          </p>
        </Link>

        {/* Cierre Contable */}
        <Link
          href="/dashboard/cierre-contable"
          className="group rounded-lg border border-slate-200 bg-white p-6 transition hover:border-amber-300 hover:shadow-lg"
        >
          <div className="mb-4 flex items-center justify-between">
            <Lock size={32} className="text-amber-600" />
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
              Escritura
            </span>
          </div>
          <h2 className="text-lg font-semibold text-slate-900 group-hover:text-amber-600">
            Cierre Contable
          </h2>
          <p className="mt-2 text-sm text-slate-600">
            Generar asientes de cierre y gestionar el cierre de ejercicio.
          </p>
        </Link>
      </div>

      {/* Info Box */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm text-blue-800">
          <strong>Nota:</strong> Todos los informes se basan en asientos
          contables ya contabilizados (estado POSTED). Para incluir nuevos
          ingresos o gastos en los informes, contabiliza las facturas en el
          Motor Contable.
        </p>
      </div>
    </div>
  );
}
