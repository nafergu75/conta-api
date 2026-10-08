'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { ejerciciosSeleccionables, trimestreAPresentar } from '@/lib/aeatCalendar';
import { formatoImporte } from '@/lib/moneda';
import { CaretLeft } from '@phosphor-icons/react';
import { FormPresentar } from '../components/FormPresentar';

/**
 * Modelo 115 (retenciones de alquileres): el trimestre, calculado con las
 * facturas de gasto de tipo «Alquileres» con retención, y el resumen del año
 * por arrendador (los datos del modelo 180).
 */

interface Arrendador {
  nif: string;
  nombre: string;
  base: number;
  retencion: number;
  facturas: number;
}

interface Modelo115Trimestre {
  id: string;
  ejercicio: number;
  trimestre: number;
  baseImponible: number;
  retencion: number;
  operaciones: number;
  estado: string;
  casillas: Record<string, number>;
  perceptores: Arrendador[];
  avisos?: string[];
}

interface Resumen115 {
  ejercicio: number;
  totalBase: number;
  totalRetenido: number;
  desgloseTrimestral: Array<{ numero: number; base: number; cuota: number; operaciones: number; estado: string }>;
  arrendadores: Arrendador[];
  avisos?: string[];
}

const eur = (n: number) => formatoImporte(Number(n) || 0, 'EUR');
const ESTADO: Record<string, string> = { vigente: 'Sin presentar', presentado: 'Presentado', omitido: 'Omitido' };

function TablaArrendadores({ filas }: { filas: Arrendador[] }) {
  if (filas.length === 0) return <p className="text-sm text-slate-500">No hay facturas de alquiler con retención.</p>;
  return (
    <>
      <table className="hidden w-full text-sm md:table">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-600">
            <th className="py-2 font-medium">Arrendador</th>
            <th className="py-2 font-medium">NIF</th>
            <th className="py-2 text-right font-medium">Base</th>
            <th className="py-2 text-right font-medium">Retención</th>
            <th className="py-2 text-right font-medium">Facturas</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((a) => (
            <tr key={a.nif} className="border-b border-slate-100">
              <td className="py-2 text-slate-900">{a.nombre}</td>
              <td className="py-2 font-mono text-slate-600">{a.nif}</td>
              <td className="py-2 text-right font-mono">{eur(a.base)}</td>
              <td className="py-2 text-right font-mono">{eur(a.retencion)}</td>
              <td className="py-2 text-right">{a.facturas}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="divide-y divide-slate-100 md:hidden">
        {filas.map((a) => (
          <li key={a.nif} className="py-2 text-sm">
            <p className="break-words font-medium text-slate-900">{a.nombre}</p>
            <p className="font-mono text-xs text-slate-500">{a.nif}</p>
            <p className="text-slate-700">
              Base {eur(a.base)} · Retención {eur(a.retencion)} · {a.facturas} factura{a.facturas !== 1 ? 's' : ''}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function Modelo115Page() {
  const [ejercicio, setEjercicio] = useState(() => trimestreAPresentar().ejercicio);
  const [trimestre, setTrimestre] = useState(() => trimestreAPresentar().trimestre);
  const [modelo, setModelo] = useState<Modelo115Trimestre | null>(null);
  const [resumen, setResumen] = useState<Resumen115 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    setError('');
    Promise.all([
      apiFetch<Modelo115Trimestre>(companyPath(`/tax-models/115?ejercicio=${ejercicio}&trimestre=${trimestre}`)),
      apiFetch<Resumen115>(companyPath(`/tax-models/115?ejercicio=${ejercicio}`)),
    ])
      .then(([m, r]) => {
        if (!vivo) return;
        setModelo(m);
        setResumen(r);
      })
      .catch((err) => vivo && setError(errorMessage(err)))
      .finally(() => vivo && setLoading(false));
    return () => {
      vivo = false;
    };
  }, [ejercicio, trimestre, recarga]);

  const casilla = (k: string) => Number(modelo?.casillas?.[k] ?? 0) || 0;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/fiscal" className="mb-4 inline-flex items-center gap-2 text-blue-600 hover:text-blue-700">
          <CaretLeft size={20} />
          Volver a Fiscal
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 md:text-3xl">Modelo 115 – Retenciones de alquileres</h1>
        <p className="mt-2 text-slate-600">
          Retenciones de IRPF de las facturas de gasto de tipo «Alquileres». Las de profesionales van al modelo 111.
        </p>
      </div>

      <div className="flex flex-wrap gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <label htmlFor="m115-ej" className="block text-sm font-medium text-slate-700">
            Ejercicio
          </label>
          <select id="m115-ej" value={ejercicio} onChange={(e) => setEjercicio(parseInt(e.target.value))} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {ejerciciosSeleccionables().map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="m115-tr" className="block text-sm font-medium text-slate-700">
            Trimestre
          </label>
          <select id="m115-tr" value={trimestre} onChange={(e) => setTrimestre(parseInt(e.target.value))} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {[1, 2, 3, 4].map((t) => (
              <option key={t} value={t}>
                {t}T
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && !modelo ? (
        <div className="h-96 animate-pulse rounded-lg bg-slate-200" />
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center text-red-800">{error}</div>
      ) : (
        modelo && (
          <>
            {/* Trimestre */}
            <section className={`space-y-4 rounded-lg border border-slate-200 bg-white p-4 md:p-6 ${loading ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-semibold text-slate-900">
                  {modelo.trimestre}T de {modelo.ejercicio}
                </h2>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-700">{ESTADO[modelo.estado] ?? modelo.estado}</span>
              </div>
              <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  ['01', 'Nº de perceptores', String(casilla('01'))],
                  ['02', 'Base de las retenciones', eur(casilla('02'))],
                  ['03', 'Retenciones', eur(casilla('03'))],
                  ['05', 'Resultado a ingresar', eur(casilla('05'))],
                ].map(([k, t, v]) => (
                  <div key={k} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <dt className="text-xs text-slate-600">
                      [{k}] {t}
                    </dt>
                    <dd className="mt-1 font-mono text-lg font-semibold text-slate-900">{v}</dd>
                  </div>
                ))}
              </dl>
              {modelo.avisos && modelo.avisos.length > 0 && (
                <ul className="list-disc space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 pl-8 text-sm text-amber-800">
                  {modelo.avisos.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              )}
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-900">Arrendadores del trimestre</h3>
                <TablaArrendadores filas={modelo.perceptores ?? []} />
              </div>
              <p className="text-xs text-slate-500">
                El pago del 115 se anota con un asiento manual contra la 4751 (la parte de alquileres). Las facturas pendientes de revisar o anuladas no cuentan.
              </p>
            </section>

            {modelo.estado === 'vigente' && <FormPresentar codigo="115" ejercicio={ejercicio} trimestre={trimestre} onSuccess={() => setRecarga((n) => n + 1)} />}

            {/* Resumen del año */}
            {resumen && (
              <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 md:p-6">
                <h2 className="font-semibold text-slate-900">Resumen del año (datos del modelo 180)</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-600">Base del año</p>
                    <p className="font-mono text-lg font-semibold text-slate-900">{eur(resumen.totalBase)}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-600">Retenciones del año</p>
                    <p className="font-mono text-lg font-semibold text-slate-900">{eur(resumen.totalRetenido)}</p>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-600">
                      <th className="py-2 font-medium">Trimestre</th>
                      <th className="py-2 text-right font-medium">Base</th>
                      <th className="py-2 text-right font-medium">Retención</th>
                      <th className="hidden py-2 text-right font-medium sm:table-cell">Facturas</th>
                      <th className="py-2 text-right font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.desgloseTrimestral.map((t) => (
                      <tr key={t.numero} className="border-b border-slate-100">
                        <td className="py-2 font-medium">{t.numero}T</td>
                        <td className="py-2 text-right font-mono">{eur(t.base)}</td>
                        <td className="py-2 text-right font-mono">{eur(t.cuota)}</td>
                        <td className="hidden py-2 text-right sm:table-cell">{t.operaciones}</td>
                        <td className="py-2 text-right text-xs text-slate-600">{ESTADO[t.estado] ?? t.estado}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-900">Por arrendador</h3>
                  <TablaArrendadores filas={resumen.arrendadores ?? []} />
                </div>
              </section>
            )}
          </>
        )
      )}
    </div>
  );
}
