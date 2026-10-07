'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiDownload, apiFetch, companyPath, errorMessage } from '@/lib/api';
import { trimestreAPresentar, ejerciciosSeleccionables } from '@/lib/aeatCalendar';
import { CaretLeft, Download } from '@phosphor-icons/react';
import { CasillasViewer } from '../components/CasillasViewer';
import { FormPresentar } from '../components/FormPresentar';
import { Tooltip } from '../components/Tooltip';
import { AvisosModelo } from '../components/AvisosModelo';

interface Modelo111 {
  id: string;
  ejercicio: number;
  trimestre: number;
  casillas: Record<string, any>;
  totalBase: number;
  totalRetenido: number;
  estado: 'vigente' | 'presentado';
  /** Nominas en borrador, meses solo con el resumen antiguo, casillas editadas o presentadas... */
  avisos?: string[];
}

export default function Modelo111Page() {
  return (
    <Suspense fallback={<div className="h-10 w-32 animate-pulse rounded-lg bg-slate-200" />}>
      <Modelo111Contenido />
    </Suspense>
  );
}

function Modelo111Contenido() {
  const params = useSearchParams();
  const [modelo, setModelo] = useState<Modelo111 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [avisoDescarga, setAvisoDescarga] = useState('');
  // Se abre en el trimestre de la URL (desde Nominas) o en el que toca presentar (en octubre, el 3T).
  const [ejercicio, setEjercicio] = useState(() => Number(params.get('ejercicio')) || trimestreAPresentar().ejercicio);
  const [trimestre, setTrimestre] = useState(() => {
    const t = Number(params.get('trimestre'));
    return t >= 1 && t <= 4 ? t : trimestreAPresentar().trimestre;
  });

  useEffect(() => {
    const fetchModelo = async () => {
      try {
        setLoading(true);
        setError('');
        setModelo(await apiFetch<Modelo111>(companyPath(`/tax-models/111?ejercicio=${ejercicio}&trimestre=${trimestre}`)));
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    };

    fetchModelo();
  }, [ejercicio, trimestre]);

  const eur = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
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
        <h1 className="text-3xl font-bold text-slate-900">Modelo 111 – Retenciones e Ingresos a Cuenta</h1>
        <p className="mt-2 text-slate-600">Resumen de retenciones practicadas en el período</p>
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
            {ejerciciosSeleccionables().map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Trimestre</label>
          <select
            value={trimestre}
            onChange={(e) => setTrimestre(parseInt(e.target.value))}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {[1, 2, 3, 4].map((t) => (
              <option key={t} value={t}>
                Q{t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Resumen Rápido */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2">
            <p className="text-sm text-slate-600">Base Total de Retenciones</p>
            <Tooltip text="Importe total de las operaciones sujetas a retención (honorarios, comisiones, etc.) en este trimestre." />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{eur.format(modelo.totalBase)}</p>
          <p className="mt-1 text-xs text-slate-500">Suma de todas las bases imponibles</p>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
          <div className="flex items-center gap-2">
            <p className="text-sm text-blue-600">Total Retenido</p>
            <Tooltip text="Total de IRPF que has retenido en este trimestre (suma de todas las retenciones practicadas)." />
          </div>
          <p className="mt-2 text-2xl font-bold text-blue-900">{eur.format(modelo.totalRetenido)}</p>
          <p className="mt-1 text-xs text-blue-600">Retenciones practicadas (IRPF)</p>
        </div>
      </div>

      <AvisosModelo avisos={modelo.avisos} ejercicio={modelo.ejercicio} mes={modelo.trimestre * 3} />

      {/* Casillas Completas */}
      <CasillasViewer
        casillas={modelo.casillas}
        titulo="Casillas del Modelo 111"
        casillasConteo={['01', '04', '07']}
        descripcion={`Trimestre ${modelo.trimestre} de ${modelo.ejercicio} – Retenciones por tipo`}
        estado={modelo.estado}
      />

      {/* Desglose por Tipo de Retención */}
      {modelo.casillas.retenciones && Array.isArray(modelo.casillas.retenciones) && (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h3 className="mb-4 font-semibold text-slate-900">Retenciones por Tipo</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3">Tipo de Retención</th>
                  <th className="text-right py-3">Porcentaje</th>
                  <th className="text-right py-3">
                    <div className="flex items-center justify-end gap-2">
                      <span>Base</span>
                      <Tooltip text="Importe total de la operación sujeta a retención." position="top" />
                    </div>
                  </th>
                  <th className="text-right py-3">
                    <div className="flex items-center justify-end gap-2">
                      <span>Cuota</span>
                      <Tooltip text="Importe de IRPF retenido (Base × Porcentaje)." position="top" />
                    </div>
                  </th>
                  <th className="text-right py-3">Operaciones</th>
                </tr>
              </thead>
              <tbody>
                {modelo.casillas.retenciones.map((ret: any, i: number) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3">{ret.tipo}</td>
                    <td className="text-right py-3" title={ret.medio ? 'Tipo medio: cuota entre base (cada nómina o factura lleva el suyo)' : undefined}>
                      {ret.porcentaje}%{ret.medio ? ' (medio)' : ''}
                    </td>
                    <td className="text-right py-3">{eur.format(ret.base)}</td>
                    <td className="text-right py-3 font-medium">{eur.format(ret.cuota)}</td>
                    <td className="text-right py-3 text-slate-600">{ret.operaciones}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
        {modelo.estado === 'vigente' && (
          <FormPresentar codigo="111" ejercicio={ejercicio} trimestre={trimestre} />
        )}
      </div>
    </div>
  );
}
