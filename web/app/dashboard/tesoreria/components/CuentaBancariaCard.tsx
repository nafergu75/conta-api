'use client';

import Link from 'next/link';
import { Bank, CaretRight, PlusMinus } from '@phosphor-icons/react';

interface CuentaBancariaCardProps {
  id: string;
  iban: string;
  bancoNombre?: string;
  entidad?: string;
  saldoInicial: number;
  estado: string;
  pendientes: number;
  conciliados: number;
}

export function CuentaBancariaCard({
  id,
  iban,
  bancoNombre,
  entidad,
  saldoInicial,
  estado,
  pendientes,
  conciliados,
}: CuentaBancariaCardProps) {
  const eur = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  });

  const estadoClasses = {
    // El backend devuelve 'activa' | 'inactiva'.
    activa: 'bg-green-50 text-green-700 border-green-200',
    inactiva: 'bg-gray-50 text-gray-700 border-gray-200',
    cerrado: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-100 p-2">
            <Bank size={24} className="text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">{bancoNombre || 'Cuenta'}</h3>
            <p className="text-sm text-slate-500">{iban}</p>
          </div>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${estadoClasses[estado as keyof typeof estadoClasses] || estadoClasses.activa}`}>
          {estado}
        </span>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded bg-slate-50 p-3">
          <p className="text-xs text-slate-600">Saldo Inicial</p>
          <p className="mt-1 font-semibold text-slate-900">{eur.format(saldoInicial)}</p>
        </div>
        <div className="rounded bg-amber-50 p-3">
          <p className="text-xs text-amber-600">Pendientes</p>
          <p className="mt-1 font-semibold text-amber-900">{pendientes}</p>
        </div>
        <div className="rounded bg-green-50 p-3">
          <p className="text-xs text-green-600">Conciliados</p>
          <p className="mt-1 font-semibold text-green-900">{conciliados}</p>
        </div>
      </div>

      <Link
        href={`/dashboard/tesoreria/conciliacion?cuenta=${id}`}
        className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
      >
        <PlusMinus size={16} />
        Conciliar
        <CaretRight size={14} />
      </Link>
    </div>
  );
}
