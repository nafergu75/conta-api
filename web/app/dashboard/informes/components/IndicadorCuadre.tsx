'use client';

import { CheckCircle, Warning } from '@phosphor-icons/react';

interface IndicadorCuadreProps {
  totalActivo: number;
  totalPasivoPatrimonio: number;
  tolerancia?: number; // diferencia máxima permitida (por defecto 0.01)
}

export function IndicadorCuadre({
  totalActivo,
  totalPasivoPatrimonio,
  tolerancia = 0.01,
}: IndicadorCuadreProps) {
  const diferencia = Math.abs(totalActivo - totalPasivoPatrimonio);
  const cuadra = diferencia <= tolerancia;

  const eur = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  });

  return (
    <div
      className={`rounded-lg border-2 p-4 ${
        cuadra
          ? 'border-emerald-200 bg-emerald-50'
          : 'border-amber-200 bg-amber-50'
      }`}
    >
      <div className="flex items-center gap-3">
        {cuadra ? (
          <>
            <CheckCircle
              size={28}
              weight="fill"
              className="text-emerald-600"
            />
            <div>
              <p className="font-semibold text-emerald-900">Balance Cuadrado</p>
              <p className="text-sm text-emerald-700">
                Activo = Pasivo + Patrimonio Neto
              </p>
            </div>
          </>
        ) : (
          <>
            <Warning size={28} weight="fill" className="text-amber-600" />
            <div>
              <p className="font-semibold text-amber-900">Balance No Cuadrado</p>
              <p className="text-sm text-amber-700">
                Diferencia: {eur.format(diferencia)}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
