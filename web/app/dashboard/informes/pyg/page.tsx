'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, clearSession } from '@/lib/auth';
import { TrendUp, TrendDown } from '@phosphor-icons/react';
import { SelectRango } from '../components/SelectRango';
import { TotalCard } from '../components/TotalCard';
import { TablaBalance } from '../components/TablaBalance';
import { CargandoReporte } from '../components/CargandoReporte';

interface PyGData {
  desde: string;
  hasta: string;
  ingresos: number;
  gastos: number;
  resultadoExplotacion: number;
}

const API = '/api/conta';

export default function PyGPage() {
  const router = useRouter();

  const companyId = useMemo(() => {
    const token = getToken();
    if (!token) return null;
    try {
      const parts = token.split('.');
      const payload = JSON.parse(atob(parts[1]));
      return payload.companies?.[0] || payload.empresaSeleccionada || '1';
    } catch {
      return '1';
    }
  }, []);

  const [pyg, setPyG] = useState<PyGData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [from, setFrom] = useState(() => {
    const y = new Date().getFullYear();
    return `${y}-01-01`;
  });
  const [to, setTo] = useState(() => {
    const y = new Date().getFullYear();
    return `${y}-12-31`;
  });

  const loadPyG = async (fromDate: string, toDate: string) => {
    if (!companyId) {
      clearSession();
      router.push('/login');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const token = getToken();
      const res = await fetch(
        `${API}/companies/${companyId}/reports/profit-and-loss?from=${fromDate}&to=${toDate}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (res.status === 401) {
        clearSession();
        router.push('/login');
        return;
      }

      if (!res.ok) {
        throw new Error(`Error ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();
      setPyG(data.data || data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar P&L');
      console.error('Error loading P&L:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPyG(from, to);
  }, [companyId]);

  const handleRangeChange = (newFrom: string, newTo: string) => {
    setFrom(newFrom);
    setTo(newTo);
    loadPyG(newFrom, newTo);
  };

  const resultadoNeto = pyg?.resultadoExplotacion || 0;
  const margenBruto = pyg && pyg.ingresos > 0
    ? ((pyg.ingresos / (pyg.ingresos + pyg.gastos)) * 100)
    : 0;

  const filas = [
    {
      seccion: 'Ingresos de Explotación',
      total: pyg?.ingresos || 0,
    },
    {
      seccion: 'Gastos de Explotación',
      total: -(pyg?.gastos || 0),
    },
  ];

  if (!companyId) {
    return <CargandoReporte />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          Cuenta de Pérdidas y Ganancias
        </h1>
        <p className="mt-2 text-slate-600">
          Resultado del ejercicio: ingresos menos gastos
        </p>
      </div>

      {/* Selector de rango */}
      <SelectRango
        onRangeChange={handleRangeChange}
        loading={loading}
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <CargandoReporte />
      ) : pyg ? (
        <>
          {/* Cards de resultados */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <TotalCard
              label="Total Ingresos"
              valor={pyg.ingresos}
              icon={<TrendUp />}
              color="green"
              variant="highlight"
            />
            <TotalCard
              label="Total Gastos"
              valor={pyg.gastos}
              icon={<TrendDown />}
              color="amber"
            />
            <TotalCard
              label={
                resultadoNeto >= 0 ? 'Beneficio' : 'Pérdida'
              }
              valor={Math.abs(resultadoNeto)}
              color={resultadoNeto >= 0 ? 'green' : 'amber'}
              variant="highlight"
              porcentaje={margenBruto}
            />
          </div>

          {/* Tabla de P&L */}
          <TablaBalance
            titulo="CUENTA DE PÉRDIDAS Y GANANCIAS"
            filas={filas}
            mostrarDesglose={false}
          />

          {/* Resumen de resultado */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-600">Margen Operacional</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">
                {margenBruto.toFixed(2)}%
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-600">Resultado Neto</p>
              <p className={`mt-2 text-2xl font-bold ${
                resultadoNeto >= 0 ? 'text-green-600' : 'text-amber-600'
              }`}>
                {new Intl.NumberFormat('es-ES', {
                  style: 'currency',
                  currency: 'EUR',
                }).format(resultadoNeto)}
              </p>
            </div>
          </div>

          {/* Información adicional */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm text-blue-800">
              <strong>Nota:</strong> La P&L muestra el resultado del ejercicio
              considerando solo asientos contabilizados (POSTED). El margen
              operacional se calcula como ingresos divididos por el total de
              movimientos.
            </p>
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
          <p className="text-slate-600">
            No hay datos de P&L para el período seleccionado.
          </p>
        </div>
      )}
    </div>
  );
}
