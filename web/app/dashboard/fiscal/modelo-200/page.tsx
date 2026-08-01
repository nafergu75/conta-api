'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { CaretLeft, Download } from '@phosphor-icons/react';
import { CasillasViewer } from '../components/CasillasViewer';
import { FormPresentar } from '../components/FormPresentar';

interface Modelo200 {
  id: string;
  ejercicio: number;
  resultadoContable: number;
  baseImponible: number;
  tipoImpositivo: number;
  cuotaIntegra: number;
  deducciones: number;
  cuotaLiquida: number;
  estado: 'vigente' | 'presentado';
  casillas: Record<string, any>;
}

export default function Modelo200Page() {
  const params = useParams();
  const companyId = params.companyId as string;
  const [modelo, setModelo] = useState<Modelo200 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ejercicio, setEjercicio] = useState(new Date().getFullYear());

  useEffect(() => {
    const fetchModelo = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/companies/${companyId}/tax-models/200?ejercicio=${ejercicio}`);

        if (!response.ok) {
          throw new Error('Error al cargar el modelo 200');
        }

        const data = await response.json();
        setModelo(data.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    };

    fetchModelo();
  }, [companyId, ejercicio]);

  const eur = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  });

  const pct = new Intl.NumberFormat('es-ES', {
    style: 'percent',
    minimumFractionDigits: 0,
  });

  const descargarAEAT = async () => {
    try {
      const response = await fetch(`/api/companies/${companyId}/tax-models/200/${modelo?.id}/download`);
      if (!response.ok) throw new Error('Error al descargar');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `modelo-200-${ejercicio}.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Error descargando fichero AEAT:', err);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-32 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-96 animate-pulse rounded-lg bg-slate-200" />
      </div>
    );
  }

  if (error || !modelo) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/fiscal" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700">
          <CaretLeft size={20} />
          Volver a Fiscal
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-800">{error || 'Modelo no encontrado'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/dashboard/fiscal" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4">
          <CaretLeft size={20} />
          Volver a Fiscal
        </Link>
        <h1 className="text-3xl font-bold text-slate-900">Modelo 200 – Impuesto de Sociedades</h1>
        <p className="mt-2 text-slate-600">Cálculo de cuota íntegra y cuota líquida del ejercicio</p>
      </div>

      {/* Período Selector */}
      <div className="flex flex-wrap gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Ejercicio</label>
          <select
            value={ejercicio}
            onChange={(e) => setEjercicio(parseInt(e.target.value))}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {[2024, 2025, 2026, 2027].map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Flujo de Cálculo */}
      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-6">
        <h3 className="font-semibold text-slate-900">Flujo de Cálculo</h3>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between border-b border-slate-100 pb-2">
            <span className="text-slate-600">Resultado Contable del Ejercicio</span>
            <span className="font-medium text-slate-900">{eur.format(modelo.resultadoContable)}</span>
          </div>

          <div className="flex justify-between border-b border-slate-100 pb-2">
            <span className="text-slate-600">Ajustes Extracontables (–)</span>
            <span className="font-medium text-slate-900">–</span>
          </div>

          <div className="rounded bg-blue-50 p-2 flex justify-between border border-blue-200">
            <span className="text-blue-900 font-medium">Base Imponible</span>
            <span className="font-bold text-blue-900">{eur.format(modelo.baseImponible)}</span>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-600">Base Imponible × Tipo Impositivo ({modelo.tipoImpositivo}%)</span>
              <span className="font-medium text-slate-900">{eur.format(modelo.cuotaIntegra)}</span>
            </div>

            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-600">Cuota Íntegra</span>
              <span className="font-medium text-slate-900">{eur.format(modelo.cuotaIntegra)}</span>
            </div>

            <div className="flex justify-between border-b border-slate-100 pb-2">
              <span className="text-slate-600">Menos: Deducciones (I+D, Inversión, etc.)</span>
              <span className="font-medium text-slate-900">–{eur.format(modelo.deducciones)}</span>
            </div>

            <div className="rounded bg-green-50 p-2 flex justify-between border border-green-200">
              <span className="text-green-900 font-medium">Cuota Líquida</span>
              <span className="font-bold text-green-900">{eur.format(modelo.cuotaLiquida)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Casillas Completas */}
      <CasillasViewer
        casillas={modelo.casillas}
        titulo="Casillas del Modelo 200"
        descripcion={`Ejercicio ${modelo.ejercicio}`}
        estado={modelo.estado}
      />

      {/* Resumen de Ratios */}
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h3 className="mb-4 font-semibold text-slate-900">Ratios y Análisis</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded bg-slate-50 p-4">
            <p className="text-xs text-slate-600">Tipo Impositivo Efectivo</p>
            <p className="mt-2 text-lg font-bold text-slate-900">
              {modelo.resultadoContable !== 0
                ? pct.format(modelo.cuotaLiquida / modelo.resultadoContable)
                : '–'}
            </p>
          </div>

          <div className="rounded bg-slate-50 p-4">
            <p className="text-xs text-slate-600">Impuesto sobre Base Imponible</p>
            <p className="mt-2 text-lg font-bold text-slate-900">{modelo.tipoImpositivo}%</p>
          </div>

          <div className="rounded bg-slate-50 p-4">
            <p className="text-xs text-slate-600">Cuota Líquida a Pagar</p>
            <p className={`mt-2 text-lg font-bold ${modelo.cuotaLiquida > 0 ? 'text-red-900' : 'text-green-900'}`}>
              {modelo.cuotaLiquida > 0 ? '+' : '–'}{eur.format(Math.abs(modelo.cuotaLiquida))}
            </p>
          </div>
        </div>
      </div>

      {/* Acciones Finales */}
      <div className="space-y-4">
        {/* Botón de Descarga AEAT */}
        {modelo.estado === 'vigente' && (
          <button
            onClick={descargarAEAT}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-medium text-white hover:bg-emerald-700 transition"
          >
            <Download size={18} />
            Descargar Fichero AEAT (TXT)
          </button>
        )}

        {/* Formulario de Presentación */}
        {modelo.estado === 'vigente' && <FormPresentar codigo="200" ejercicio={ejercicio} />}
      </div>
    </div>
  );
}
