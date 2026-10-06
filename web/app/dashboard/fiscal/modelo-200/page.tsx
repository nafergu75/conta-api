'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiDownload, apiFetch, companyPath, errorMessage } from '@/lib/api';
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
  const [modelo, setModelo] = useState<Modelo200 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [avisoDescarga, setAvisoDescarga] = useState('');
  const [ejercicio, setEjercicio] = useState(new Date().getFullYear());

  useEffect(() => {
    const fetchModelo = async () => {
      try {
        setLoading(true);
        setError('');
        setModelo(await apiFetch<Modelo200>(companyPath(`/tax-models/200?ejercicio=${ejercicio}`)));
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    };

    fetchModelo();
  }, [ejercicio]);

  const eur = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  });

  const pct = new Intl.NumberFormat('es-ES', {
    style: 'percent',
    minimumFractionDigits: 0,
  });

  const descargarAEAT = () => {
    // El backend aun no genera el fichero de este modelo (solo el del 303).
    setAvisoDescarga(
      'La descarga del fichero AEAT de este modelo aún no está disponible. Puedes copiar las casillas desde esta pantalla.',
    );
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
          <>
            <button
              onClick={descargarAEAT}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-medium text-white hover:bg-emerald-700 transition"
            >
              <Download size={18} />
              Descargar Fichero AEAT (TXT)
            </button>
            {avisoDescarga && (
              <p role="status" className="mt-2 text-sm text-amber-700">{avisoDescarga}</p>
            )}
          </>
        )}

        {/* Formulario de Presentación */}
        {modelo.estado === 'vigente' && <FormPresentar codigo="200" ejercicio={ejercicio} />}
      </div>
    </div>
  );
}
