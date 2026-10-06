'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { Bank, ArrowDown, CheckCircle, Clock } from '@phosphor-icons/react';
import { Tooltip } from '@/app/dashboard/components/Tooltip';

export default function TesoreríaPage() {
  const [resumen, setResumen] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');

  useEffect(() => {
    const fetchResumen = async () => {
      try {
        setResumen(await apiFetch(companyPath('/treasury/summary')));
      } catch (error) {
        setErrorCarga(errorMessage(error));
      } finally {
        setLoading(false);
      }
    };

    fetchResumen();
  }, []);

  const eur = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  });

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 animate-pulse rounded-lg bg-slate-200" />
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {errorCarga && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {errorCarga}
        </div>
      )}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Tesorería</h1>
        <p className="mt-2 text-slate-600">
          Gestión de cuentas bancarias, extractos y conciliación de movimientos
        </p>
      </div>

      {/* Resumen de métricas */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-600">Cuentas activas</span>
              <Tooltip text="Número de cuentas bancarias registradas y operativas." position="top" />
            </div>
            <div className="rounded-lg bg-blue-100 p-2">
              <Bank size={20} className="text-blue-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900">{resumen?.cuentasActivas || 0}</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-600">Saldo combinado</span>
              <Tooltip text="Suma del saldo actual de todas las cuentas bancarias." position="top" />
            </div>
            <div className="rounded-lg bg-purple-100 p-2">
              <ArrowDown size={20} className="text-purple-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {eur.format(resumen?.saldoTotal || 0)}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-600">Conciliados</span>
              <Tooltip text="Movimientos que han sido revisados y coinciden con el extracto del banco." position="top" />
            </div>
            <div className="rounded-lg bg-green-100 p-2">
              <CheckCircle size={20} className="text-green-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900">{resumen?.conciliados || 0}</p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-600">Pendientes</span>
              <Tooltip text="Movimientos que aún no han sido conciliados con los extractos bancarios." position="top" />
            </div>
            <div className="rounded-lg bg-amber-100 p-2">
              <Clock size={20} className="text-amber-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900">{resumen?.pendientes || 0}</p>
        </div>
      </div>

      {/* Acciones rápidas */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Link
          href={`/dashboard/tesoreria/cuentas`}
          className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-6 transition hover:shadow-md"
        >
          <div>
            <h3 className="font-semibold text-slate-900">Cuentas bancarias</h3>
            <p className="mt-1 text-sm text-slate-600">Ver y gestionar cuentas</p>
          </div>
          <div className="rounded-lg bg-blue-100 p-3">
            <Bank size={24} className="text-blue-600" />
          </div>
        </Link>

        <Link
          href={`/dashboard/tesoreria/extractos`}
          className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-6 transition hover:shadow-md"
        >
          <div>
            <h3 className="font-semibold text-slate-900">Subir extractos</h3>
            <p className="mt-1 text-sm text-slate-600">Importar CSV/OFX</p>
          </div>
          <div className="rounded-lg bg-purple-100 p-3">
            <ArrowDown size={24} className="text-purple-600" />
          </div>
        </Link>

        <Link
          href={`/dashboard/tesoreria/conciliacion`}
          className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-6 transition hover:shadow-md"
        >
          <div>
            <h3 className="font-semibold text-slate-900">Conciliación</h3>
            <p className="mt-1 text-sm text-slate-600">Reconciliar movimientos</p>
          </div>
          <div className="rounded-lg bg-green-100 p-3">
            <CheckCircle size={24} className="text-green-600" />
          </div>
        </Link>
      </div>
    </div>
  );
}
