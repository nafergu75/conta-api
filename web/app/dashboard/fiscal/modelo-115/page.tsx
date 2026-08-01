'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { CaretLeft, Download } from '@phosphor-icons/react';
import { CasillasViewer } from '../components/CasillasViewer';
import { FormPresentar } from '../components/FormPresentar';

interface Modelo115 {
  id: string;
  ejercicio: number;
  totalBase: number;
  totalRetenido: number;
  estado: 'vigente' | 'presentado';
  casillas: Record<string, any>;
  desgloseTrimestral: Array<{
    numero: number;
    base: number;
    cuota: number;
    operaciones: number;
  }>;
}

export default function Modelo115Page() {
  const params = useParams();
  const companyId = params.companyId as string;
  const [modelo, setModelo] = useState<Modelo115 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ejercicio, setEjercicio] = useState(new Date().getFullYear());

  useEffect(() => {
    const fetchModelo = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/companies/${companyId}/tax-models/115?ejercicio=${ejercicio}`);

        if (!response.ok) {
          throw new Error('Error al cargar el modelo 115');
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

  const descargarAEAT = async () => {
    try {
      const response = await fetch(`/api/companies/${companyId}/tax-models/115/${modelo?.id}/download`);
      if (!response.ok) throw new Error('Error al descargar');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `modelo-115-${ejercicio}.txt`;
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
        <h1 className="text-3xl font-bold text-slate-900">Modelo 115 – Resumen Anual de Arrendamientos</h1>
        <p className="mt-2 text-slate-600">Consolidación de los 4 trimestres en resumen anual de retenciones IRPF sobre arrendamientos de locales</p>
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

      {/* Resumen Anual */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <p className="text-sm text-slate-600">Base Total de Arrendamientos</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{eur.format(modelo.totalBase)}</p>
          <p className="mt-1 text-xs text-slate-500">Suma de todas las bases anuales</p>
        </div>

        <div className="rounded-lg border border-fuchsia-200 bg-fuchsia-50 p-6">
          <p className="text-sm text-fuchsia-600">Total Retenciones IRPF</p>
          <p className="mt-2 text-2xl font-bold text-fuchsia-900">{eur.format(modelo.totalRetenido)}</p>
          <p className="mt-1 text-xs text-fuchsia-600">Total anual – Suma Q1-Q4</p>
        </div>
      </div>

      {/* Desglose Trimestral */}
      {modelo.desgloseTrimestral && modelo.desgloseTrimestral.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h3 className="mb-4 font-semibold text-slate-900">Desglose Trimestral</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3">Trimestre</th>
                  <th className="text-right py-3">Base de Arrendamiento</th>
                  <th className="text-right py-3">Retenciones Practicadas</th>
                  <th className="text-right py-3">Nº Operaciones</th>
                </tr>
              </thead>
              <tbody>
                {modelo.desgloseTrimestral.map((trimestre) => (
                  <tr key={trimestre.numero} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 font-medium">Q{trimestre.numero}</td>
                    <td className="text-right py-3">{eur.format(trimestre.base)}</td>
                    <td className="text-right py-3 font-medium text-fuchsia-600">{eur.format(trimestre.cuota)}</td>
                    <td className="text-right py-3 text-slate-600">{trimestre.operaciones}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                  <td className="py-3">Total Anual</td>
                  <td className="text-right py-3">{eur.format(modelo.totalBase)}</td>
                  <td className="text-right py-3 text-fuchsia-900">{eur.format(modelo.totalRetenido)}</td>
                  <td className="text-right py-3 text-slate-900">
                    {modelo.desgloseTrimestral.reduce((sum, t) => sum + t.operaciones, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Casillas Completas */}
      <CasillasViewer
        casillas={modelo.casillas}
        titulo="Casillas del Modelo 115"
        descripcion={`Ejercicio ${modelo.ejercicio} – Retenciones sobre Arrendamientos`}
        estado={modelo.estado}
      />

      {/* Nota Informativa */}
      <div className="rounded-lg border-l-4 border-l-blue-500 bg-blue-50 p-4">
        <p className="text-sm text-blue-900">
          <strong>Nota importante:</strong> El modelo 115 consolida los 4 trimestres de retenciones e ingresos a cuenta
          practicadas sobre arrendamientos de locales. Se genera automáticamente a partir de los trimestres Q1–Q4 del ejercicio.
          Verifica que todos los arrendamientos y retenciones estén correctamente registrados.
        </p>
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
        {modelo.estado === 'vigente' && <FormPresentar codigo="115" ejercicio={ejercicio} />}
      </div>
    </div>
  );
}
