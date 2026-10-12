'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { CaretLeft } from '@phosphor-icons/react';
import SelectorAnio from '@/components/SelectorAnio';
import { usePeriodoTrimestral } from '../components/periodoModelo';
import { CargandoModelo, ErrorModelo } from '../components/BorradorAeat';
import { FormularioRetenciones, type FormularioRetencionesDatos } from '../components/FormularioRetenciones';
import { Declaraciones } from '../components/Declaraciones';
import { Tooltip } from '../components/Tooltip';
import { AvisosModelo } from '../components/AvisosModelo';
import { mesFinalPeriodo, SelectorPeriodoRetenciones } from '../components/SelectorPeriodoRetenciones';
import { formatoImporte } from '@/lib/moneda';

interface Modelo111 {
  /** Id de la fila del calendario; null si aún no existe (abrir la pantalla no la crea). */
  id: string | null;
  ejercicio: number;
  /** 1-4 en los trimestrales; null en un periodo mensual. */
  trimestre: number | null;
  /** '1T'..'4T' o '01'..'12' (111 mensual). */
  periodo: string;
  casillas: Record<string, any>;
  totalBase: number;
  totalRetenido: number;
  estado: 'vigente' | 'presentado';
  /** Nominas en borrador, meses solo con el resumen antiguo, casillas editadas o presentadas... */
  avisos?: string[];
  /** Formulario oficial: la misma declaracion que el fichero de la AEAT. */
  formulario: FormularioRetencionesDatos;
}

export default function Modelo111Page() {
  return (
    <Suspense fallback={<div className="h-10 w-32 animate-pulse rounded-lg bg-slate-200" />}>
      <Modelo111Contenido />
    </Suspense>
  );
}

function Modelo111Contenido() {
  const [modelo, setModelo] = useState<Modelo111 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recarga, setRecarga] = useState(0);
  // Se abre en el periodo de la URL (desde Nominas) o en el trimestre que toca presentar (en octubre, el 3T),
  // nunca antes del primer año de la empresa en la app.
  const { ejercicio, setEjercicio, periodo, setPeriodo, anios, listo } = usePeriodoTrimestral();

  useEffect(() => {
    if (!listo) return;
    const fetchModelo = async () => {
      try {
        setLoading(true);
        setError('');
        setModelo(await apiFetch<Modelo111>(companyPath(`/tax-models/111?ejercicio=${ejercicio}&periodo=${periodo}`)));
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    };

    fetchModelo();
  }, [listo, ejercicio, periodo, recarga]);

  const eur = { format: (n: number) => formatoImporte(n, 'EUR') };

  const cabecera = (
    <div>
      <Link href="/dashboard/fiscal" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4">
        <CaretLeft size={20} />
        Volver a Fiscal
      </Link>
      <h1 className="text-3xl font-bold text-slate-900">Modelo 111 – Retenciones e Ingresos a Cuenta</h1>
      <p className="mt-2 text-slate-600">Resumen de retenciones practicadas en el período</p>
    </div>
  );

  // Periodo siempre a la vista: si el modelo da error, se puede elegir otro.
  const selectorPeriodo = (
    <div className="flex flex-wrap gap-4 rounded-lg border border-slate-200 bg-white p-4">
      <SelectorAnio id="m111-ej" valor={ejercicio} anios={anios} onChange={(a) => a !== null && setEjercicio(a)} />
      <SelectorPeriodoRetenciones id="m111-periodo" valor={periodo} onChange={setPeriodo} />
    </div>
  );

  if (loading || error || !modelo) {
    return (
      <div className="space-y-6">
        {cabecera}
        {selectorPeriodo}
        {error ? <ErrorModelo mensaje={error} /> : <CargandoModelo />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {cabecera}
      {selectorPeriodo}

      <AvisosModelo avisos={modelo.avisos} ejercicio={modelo.ejercicio} mes={mesFinalPeriodo(modelo.periodo ?? periodo)} />

      {/* Formulario oficial (misma fuente que el fichero) */}
      <FormularioRetenciones formulario={modelo.formulario} estado={modelo.estado} onGuardado={() => setRecarga((n) => n + 1)} />

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

      {/* Presentar, complementaria e historial */}
      <Declaraciones codigo="111" ejercicio={ejercicio} periodo={modelo.periodo ?? periodo} onCambio={() => setRecarga((n) => n + 1)} />
    </div>
  );
}
