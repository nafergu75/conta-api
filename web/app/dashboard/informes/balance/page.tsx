'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, clearSession } from '@/lib/auth';
import {
  Buildings,
  Wallet,
  CreditCard,
} from '@phosphor-icons/react';
import { SelectRango } from '../components/SelectRango';
import { TotalCard } from '../components/TotalCard';
import { IndicadorCuadre } from '../components/IndicadorCuadre';
import { TablaBalance } from '../components/TablaBalance';
import { CargandoReporte } from '../components/CargandoReporte';

interface BalanceData {
  fecha: string;
  activo: {
    noCirculante: number;
    circulante: number;
  };
  pasivo: {
    noCirculante: number;
    circulante: number;
  };
  patrimonioNeto: number;
}

const API = '/api/conta';

export default function BalancePage() {
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

  const [balance, setBalance] = useState<BalanceData | null>(null);
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

  const loadBalance = async (fromDate: string, toDate: string) => {
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
        `${API}/companies/${companyId}/reports/balance?from=${fromDate}&to=${toDate}`,
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
      setBalance(data.data || data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar balance');
      console.error('Error loading balance:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBalance(from, to);
  }, [companyId]);

  const handleRangeChange = (newFrom: string, newTo: string) => {
    setFrom(newFrom);
    setTo(newTo);
    loadBalance(newFrom, newTo);
  };

  const totalActivo =
    (balance?.activo.noCirculante || 0) +
    (balance?.activo.circulante || 0);
  const totalPasivo =
    (balance?.pasivo.noCirculante || 0) +
    (balance?.pasivo.circulante || 0);
  const totalPasivoPatrimonio =
    totalPasivo + (balance?.patrimonioNeto || 0);

  const activoRows = [
    {
      seccion: 'Activo No Circulante',
      total: balance?.activo.noCirculante || 0,
    },
    {
      seccion: 'Activo Circulante',
      total: balance?.activo.circulante || 0,
    },
  ];

  const pasivoRows = [
    {
      seccion: 'Patrimonio Neto',
      total: balance?.patrimonioNeto || 0,
    },
    {
      seccion: 'Pasivo No Circulante',
      total: balance?.pasivo.noCirculante || 0,
    },
    {
      seccion: 'Pasivo Circulante',
      total: balance?.pasivo.circulante || 0,
    },
  ];

  if (!companyId) {
    return <CargandoReporte />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Balance General</h1>
        <p className="mt-2 text-slate-600">
          Estado de activos, pasivos y patrimonio neto de la empresa
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
      ) : balance ? (
        <>
          {/* Cards de totales */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <TotalCard
              label="Total Activo"
              valor={totalActivo}
              icon={<Buildings />}
              color="blue"
              variant="highlight"
            />
            <TotalCard
              label="Patrimonio Neto"
              valor={balance.patrimonioNeto}
              icon={<Wallet />}
              color="green"
            />
            <TotalCard
              label="Total Pasivo"
              valor={totalPasivo}
              icon={<CreditCard />}
              color="amber"
            />
            <TotalCard
              label="Total Pasivo + PN"
              valor={totalPasivoPatrimonio}
              color="slate"
              variant="highlight"
            />
          </div>

          {/* Indicador de cuadre */}
          <IndicadorCuadre
            totalActivo={totalActivo}
            totalPasivoPatrimonio={totalPasivoPatrimonio}
          />

          {/* Tablas */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <TablaBalance
              titulo="ACTIVO"
              filas={activoRows}
              mostrarDesglose={false}
            />
            <TablaBalance
              titulo="PASIVO Y PATRIMONIO NETO"
              filas={pasivoRows}
              mostrarDesglose={false}
            />
          </div>

          {/* Información adicional */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm text-blue-800">
              <strong>Nota:</strong> El Balance General presenta una fotografía
              del estado financiero de la empresa al cierre del período
              seleccionado. Si no cuadra, verifica los asientos contables en el
              Motor Contable.
            </p>
          </div>
        </>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
          <p className="text-slate-600">
            No hay datos de balance para el período seleccionado.
          </p>
        </div>
      )}
    </div>
  );
}
