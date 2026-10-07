'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiDownload, apiFetch, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { ejercicioAnualAPresentar, ejerciciosSeleccionables } from '@/lib/aeatCalendar';
import { CaretLeft, Info, Download } from '@phosphor-icons/react';
import { CasillasViewer } from '../components/CasillasViewer';
import { FormPresentar } from '../components/FormPresentar';
import { AvisosModelo } from '../components/AvisosModelo';

interface Modelo190 {
  id: string;
  ejercicio: number;
  totalBase: number;
  totalRetenido: number;
  estado: 'vigente' | 'presentado';
  casillas: Record<string, any>;
  desgloseTrimestral: Array<{
    numero: number;
    retenciones: Array<{
      tipo: string;
      porcentaje: number;
      base: number;
      cuota: number;
      operaciones: number;
    }>;
    base: number;
    cuota: number;
  }>;
  /** Nominas en borrador, datos que faltan, atrasos sin ejercicio, cuadre con los 111 presentados... */
  avisos?: string[];
  cuadre111?: { total: number; coincide: boolean };
}

/**
 * Retenciones del ano por tipo: se suman los trimestres por su tipo (los
 * profesionales ya vienen por el tipo real de sus facturas, "Profesionales (15 %)").
 * Sin columna de porcentaje: en el trabajo es un tipo medio que cambia cada
 * trimestre y partiria la misma clase de perceptor en varias filas.
 */
function retencionesPorTipo(desglose: Modelo190['desgloseTrimestral']) {
  const grupos = new Map<string, { tipo: string; base: number; cuota: number }>();
  for (const t of desglose) {
    for (const r of t.retenciones) {
      const g = grupos.get(r.tipo) ?? { tipo: r.tipo, base: 0, cuota: 0 };
      g.base = Math.round((g.base + r.base) * 100) / 100;
      g.cuota = Math.round((g.cuota + r.cuota) * 100) / 100;
      grupos.set(r.tipo, g);
    }
  }
  return Array.from(grupos.values());
}

export default function Modelo190Page() {
  const [modelo, setModelo] = useState<Modelo190 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [avisoDescarga, setAvisoDescarga] = useState('');
  // Modelo anual: se presenta por el ejercicio anterior.
  const [ejercicio, setEjercicio] = useState(ejercicioAnualAPresentar);

  useEffect(() => {
    const fetchModelo = async () => {
      try {
        setLoading(true);
        setError('');
        setModelo(await apiFetch<Modelo190>(companyPath(`/tax-models/190?ejercicio=${ejercicio}`)));
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

  // El fichero y el informe por perceptor llevan datos de cada trabajador: solo con permiso de nominas.
  const conNominas = tieneAlgunPermiso(getUser(), ['nominas:read']);

  const descargar = async (ruta: string, nombre: string) => {
    setAvisoDescarga('');
    if (!conNominas) {
      setAvisoDescarga('El fichero lleva los datos de cada trabajador: solo lo pueden descargar el administrador y el contable.');
      return;
    }
    try {
      await apiDownload(companyPath(ruta), nombre);
    } catch (err) {
      // 409 si el diseno de registro de ese ejercicio aun no esta publicado; 400 si faltan datos.
      setAvisoDescarga(errorMessage(err));
    }
  };
  const descargarAEAT = () => descargar(`/nominas/190/${ejercicio}/fichero`, `190_${ejercicio}.txt`);
  const descargarPerceptores = () => descargar(`/nominas/190/${ejercicio}/perceptores?formato=xlsx`, `modelo190_${ejercicio}.xlsx`);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-32 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-96 animate-pulse rounded-lg bg-slate-200" />
      </div>
    );
  }

  if (error || !modelo) {
    const isNotAvailable = error?.includes('no encontrado') || error?.includes('404');
    return (
      <div className="space-y-6">
        {/* Header con botón de vuelta */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Modelo 190 – Resumen Anual de Retenciones</h1>
            <p className="mt-2 text-slate-600">Consolidación de los 4 trimestres (111) en resumen anual de retenciones</p>
          </div>
          <Link href="/dashboard/fiscal" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <CaretLeft size={18} />
            Volver
          </Link>
        </div>

        {/* Estado: No disponible */}
        <div className={`rounded-lg border-l-4 p-6 ${isNotAvailable ? 'border-l-amber-500 bg-amber-50' : 'border-l-red-500 bg-red-50'}`}>
          <h3 className={`text-lg font-semibold ${isNotAvailable ? 'text-amber-900' : 'text-red-900'}`}>
            {isNotAvailable ? 'Modelo no disponible' : 'Error al cargar'}
          </h3>
          <p className={`mt-2 ${isNotAvailable ? 'text-amber-800' : 'text-red-800'}`}>
            {isNotAvailable
              ? `No hay datos del Modelo 190 para el ejercicio ${ejercicio}.`
              : error}
          </p>

          {isNotAvailable && (
            <div className={`mt-4 space-y-2 text-sm ${isNotAvailable ? 'text-amber-700' : 'text-red-700'}`}>
              <p><strong>Posibles razones:</strong></p>
              <ul className="list-inside list-disc space-y-1">
                <li>Aún no se han generado los 4 trimestres del Modelo 111 para este ejercicio.</li>
                <li>Los trimestres del Modelo 111 aún no han sido procesados correctamente.</li>
              </ul>
              <p className="mt-3"><strong>Qué hacer:</strong></p>
              <p>
                Dirígete a{' '}
                <Link href="/dashboard/fiscal" className="font-semibold underline hover:no-underline">
                  Modelos Fiscales
                </Link>
                {' '}y genera primero los 4 trimestres del Modelo 111 (Q1, Q2, Q3, Q4) para el ejercicio {ejercicio}.
              </p>
            </div>
          )}

          <Link href="/dashboard/fiscal" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            <CaretLeft size={18} />
            Ir a Modelos Fiscales
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header con botón de vuelta siempre visible */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Modelo 190 – Resumen Anual de Retenciones</h1>
              <p className="mt-2 text-slate-600">Consolidación de los 4 trimestres (111) en resumen anual de retenciones e ingresos a cuenta</p>
            </div>
            {/* Tooltip informativo */}
            <div className="group relative">
              <button
                type="button"
                className="mt-1 inline-flex items-center justify-center rounded-full bg-indigo-100 p-1.5 text-indigo-600 hover:bg-indigo-200"
                title="Información sobre este modelo"
              >
                <Info size={18} />
              </button>
              <div className="pointer-events-none absolute right-0 top-8 z-50 hidden w-64 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-lg group-hover:pointer-events-auto group-hover:block">
                <p className="font-semibold text-slate-900">¿Qué es el Modelo 190?</p>
                <p className="mt-2">
                  Es el resumen anual de retenciones e ingresos a cuenta. Se calcula automáticamente consolidando los 4 trimestres del Modelo 111 del mismo ejercicio.
                </p>
              </div>
            </div>
          </div>
        </div>
        <Link
          href="/dashboard/fiscal"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
        >
          <CaretLeft size={18} />
          Volver
        </Link>
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
      </div>

      <AvisosModelo avisos={modelo.avisos} ejercicio={modelo.ejercicio} />

      {/* Resumen Anual */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <p className="text-sm text-slate-600">Base Total de Retenciones</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{eur.format(modelo.totalBase)}</p>
          <p className="mt-1 text-xs text-slate-500">Suma de todas las bases anuales</p>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
          <p className="text-sm text-amber-600">Total Retenido (IRPF + Ingresos a Cuenta)</p>
          <p className="mt-2 text-2xl font-bold text-amber-900">{eur.format(modelo.totalRetenido)}</p>
          <p className="mt-1 text-xs text-amber-600">Total anual – Suma Q1-Q4</p>
        </div>
      </div>

      {/* Desglose Trimestral */}
      {modelo.desgloseTrimestral && modelo.desgloseTrimestral.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h3 className="mb-4 font-semibold text-slate-900">Desglose Trimestral (Modelo 111)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3">Trimestre</th>
                  <th className="text-right py-3">Base Total</th>
                  <th className="text-right py-3">Retenciones Practicadas</th>
                  <th className="text-right py-3">Nº Operaciones</th>
                </tr>
              </thead>
              <tbody>
                {modelo.desgloseTrimestral.map((trimestre) => (
                  <tr key={trimestre.numero} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 font-medium">Q{trimestre.numero}</td>
                    <td className="text-right py-3">{eur.format(trimestre.base)}</td>
                    <td className="text-right py-3 font-medium text-amber-600">{eur.format(trimestre.cuota)}</td>
                    <td className="text-right py-3 text-slate-600">
                      {trimestre.retenciones.reduce((sum, r) => sum + r.operaciones, 0)}
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                  <td className="py-3">Total Anual</td>
                  <td className="text-right py-3">{eur.format(modelo.totalBase)}</td>
                  <td className="text-right py-3 text-amber-900">{eur.format(modelo.totalRetenido)}</td>
                  <td className="text-right py-3 text-slate-900">
                    {modelo.desgloseTrimestral.reduce(
                      (sum, t) => sum + t.retenciones.reduce((s, r) => s + r.operaciones, 0),
                      0
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Desglose por Tipo de Retención */}
      {modelo.desgloseTrimestral && retencionesPorTipo(modelo.desgloseTrimestral).length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h3 className="mb-4 font-semibold text-slate-900">Retenciones por Tipo (Total Anual)</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-3">Tipo de Retención</th>
                  <th className="text-right py-3">Base Anual</th>
                  <th className="text-right py-3">Retención Anual</th>
                </tr>
              </thead>
              <tbody>
                {retencionesPorTipo(modelo.desgloseTrimestral).map((ret) => (
                  <tr key={ret.tipo} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3">{ret.tipo}</td>
                    <td className="text-right py-3">{eur.format(ret.base)}</td>
                    <td className="text-right py-3 font-medium text-amber-600">{eur.format(ret.cuota)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Los trimestres van por fecha de pago, como el 111. La base anual de arriba suma además las dietas y las indemnizaciones exentas (registros L del 190), que no tienen retención.
          </p>
        </div>
      )}

      {/* Casillas Completas */}
      <CasillasViewer
        casillas={modelo.casillas}
        // La 01 y los totales de perceptores son recuentos, no euros.
        casillasConteo={['01', 'numeroPercepciones', 'perceptores']}
        titulo="Casillas del Modelo 190"
        descripcion={`Ejercicio ${modelo.ejercicio} – Resumen Anual de Retenciones`}
        estado={modelo.estado}
      />

      {/* Sección de ayuda */}
      <div className="space-y-4">
        <div className="rounded-lg border-l-4 border-l-indigo-500 bg-indigo-50 p-4">
          <div className="flex gap-3">
            <Info size={18} className="mt-0.5 flex-shrink-0 text-indigo-600" />
            <div className="text-sm text-indigo-900">
              <p className="font-semibold">¿Cómo funciona este resumen?</p>
              <p className="mt-1">
                El Modelo 190 consolida automáticamente los 4 trimestres (Q1, Q2, Q3, Q4) del Modelo 111 del mismo ejercicio.
                Incluye todas las retenciones e ingresos a cuenta (IRPF, dividendos, cupones, etc.) del ejercicio.
              </p>
            </div>
          </div>
        </div>

        {/* Próximos pasos */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">Próximos pasos</p>
          <ul className="mt-2 space-y-2 text-sm text-slate-700">
            <li>✓ Revisa los datos del desglose trimestral para verificar que son correctos.</li>
            <li>✓ Consulta el desglose por tipo de retención para ver el detalle de cada tipo.</li>
            <li>✓ Consulta las casillas AEAT para ver el detalle técnico de tu declaración.</li>
            <li>✓ Una vez verificado, marca el modelo como presentado cuando lo hayas declarado a Hacienda.</li>
          </ul>
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
            {conNominas && (
              <button
                onClick={descargarPerceptores}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
              >
                <Download size={18} />
                Informe por perceptor (Excel)
              </button>
            )}
            {avisoDescarga && (
              <p role="status" className="mt-2 text-sm text-amber-700">{avisoDescarga}</p>
            )}
          </>
        )}

        {/* Formulario de Presentación */}
        {modelo.estado === 'vigente' && <FormPresentar codigo="190" ejercicio={ejercicio} />}
      </div>
    </div>
  );
}
