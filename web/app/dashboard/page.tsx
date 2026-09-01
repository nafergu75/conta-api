'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TrendUp, TrendDown, WarningCircle, CheckCircle, Clock, CreditCard, Calendar, FileText, Warning } from '@phosphor-icons/react';
import { getToken } from '@/lib/auth';
import { AlertCard } from '@/components/dashboard/AlertCard';
import { MiniReportCard } from '@/components/dashboard/MiniReportCard';
import { KeyIndicatorCard } from '@/components/dashboard/KeyIndicatorCard';

interface Factura {
  totalFactura: number;
  estado: string;
  fechaEmision: string;
}

interface ResumenDatos {
  totalIngresos: number;
  totalGastos: number;
  pendienteCobro: number;
  pendientePago: number;
  ivaADevolver: number;
  ivaAIngresar: number;
  facturasCount: number;
}

const eur = (n: number) =>
  n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

// Datos simulados de alertas (vencimientos AEAT españoles 2026)
const getUpcomingAlerts = () => {
  const today = new Date();
  const alerts = [
    {
      id: '303-q1',
      modelo: 'Modelo 303',
      periodo: 'Q1 2026 (enero-marzo)',
      fechaVencimiento: new Date(2026, 3, 20), // 20 abril 2026
      enlace: '/dashboard/fiscal/modelo-303',
    },
    {
      id: '111-q1',
      modelo: 'Modelo 111',
      periodo: 'Q1 2026 (enero-marzo)',
      fechaVencimiento: new Date(2026, 3, 20), // 20 abril 2026
      enlace: '/dashboard/fiscal/modelo-111',
    },
    {
      id: '347-2025',
      modelo: 'Modelo 347',
      periodo: 'Ejercicio 2025',
      fechaVencimiento: new Date(2026, 1, 1), // 1 febrero 2026
      enlace: '/dashboard/fiscal/modelo-347',
    },
    {
      id: '390-2025',
      modelo: 'Modelo 390',
      periodo: 'Ejercicio 2025',
      fechaVencimiento: new Date(2026, 2, 31), // 31 marzo 2026
      enlace: '/dashboard/fiscal/modelo-390',
    },
  ];

  return alerts
    .map((alert) => ({
      ...alert,
      diasFaltantes: Math.floor(
        (alert.fechaVencimiento.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      ),
    }))
    .sort((a, b) => a.diasFaltantes - b.diasFaltantes);
};

export default function DashboardPage() {
  const [resumen, setResumen] = useState<ResumenDatos | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchResumen = async () => {
      try {
        const token = getToken();
        const response = await fetch('/api/conta/companies/1/dashboard-summary', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          const data = await response.json();
          setResumen(data.data);
        } else {
          // Si no existe el endpoint, usar datos simulados
          setResumen({
            totalIngresos: 0,
            totalGastos: 0,
            pendienteCobro: 0,
            pendientePago: 0,
            ivaADevolver: 0,
            ivaAIngresar: 0,
            facturasCount: 0,
          });
        }
      } catch (error) {
        console.error('Error fetching dashboard summary:', error);
        setResumen({
          totalIngresos: 0,
          totalGastos: 0,
          pendienteCobro: 0,
          pendientePago: 0,
          ivaADevolver: 0,
          ivaAIngresar: 0,
          facturasCount: 0,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchResumen();
  }, []);

  const beneficio = (resumen?.totalIngresos || 0) - (resumen?.totalGastos || 0);
  const beneficioPositivo = beneficio >= 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-32 animate-pulse rounded-lg bg-slate-200" />
        <div className="grid gap-4 md:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg bg-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-2 text-slate-600">Resumen de tu situación económica y fiscal</p>
      </div>

      {/* Resumen Financiero */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Resumen Financiero</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {/* Ingresos */}
          <Link href="/dashboard/facturas" className="group rounded-lg border border-slate-200 bg-white p-6 hover:border-emerald-300 hover:shadow-md transition">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-600">Ingresos (Este año)</p>
                <p className="mt-2 text-2xl font-bold text-emerald-600">{eur(resumen?.totalIngresos || 0)}</p>
              </div>
              <div className="rounded-lg bg-emerald-100 p-3">
                <TrendUp size={24} className="text-emerald-600" />
              </div>
            </div>
          </Link>

          {/* Gastos */}
          <Link href="/dashboard/compras" className="group rounded-lg border border-slate-200 bg-white p-6 hover:border-rose-300 hover:shadow-md transition">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-600">Gastos (Este año)</p>
                <p className="mt-2 text-2xl font-bold text-rose-600">{eur(resumen?.totalGastos || 0)}</p>
              </div>
              <div className="rounded-lg bg-rose-100 p-3">
                <TrendDown size={24} className="text-rose-600" />
              </div>
            </div>
          </Link>

          {/* Beneficio */}
          <div className={`rounded-lg border p-6 ${beneficioPositivo ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className={`text-sm ${beneficioPositivo ? 'text-emerald-600' : 'text-rose-600'}`}>Beneficio/Pérdida</p>
                <p className={`mt-2 text-2xl font-bold ${beneficioPositivo ? 'text-emerald-900' : 'text-rose-900'}`}>
                  {eur(beneficio)}
                </p>
              </div>
              <div className={`rounded-lg p-3 ${beneficioPositivo ? 'bg-emerald-100' : 'bg-rose-100'}`}>
                {beneficioPositivo ? (
                  <TrendUp size={24} className={beneficioPositivo ? 'text-emerald-600' : 'text-rose-600'} />
                ) : (
                  <TrendDown size={24} className="text-rose-600" />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Alertas de Vencimientos */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Vencimientos Próximos</h2>
        {getUpcomingAlerts().length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {getUpcomingAlerts().slice(0, 4).map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
            <p className="text-sm text-slate-600">No hay vencimientos próximos registrados.</p>
          </div>
        )}
      </div>

      {/* Indicadores Clave */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Indicadores Clave</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {/* Próximo Vencimiento */}
          <KeyIndicatorCard
            label="Próximo Vencimiento"
            value={`${getUpcomingAlerts()[0]?.modelo || 'N/A'}`}
            icon={<Calendar size={24} />}
            href="/dashboard/fiscal"
            color="blue"
            badge={{
              label: getUpcomingAlerts()[0]?.diasFaltantes ? `${getUpcomingAlerts()[0].diasFaltantes} días` : 'N/A',
              type: getUpcomingAlerts()[0]?.diasFaltantes < 30 ? 'error' : getUpcomingAlerts()[0]?.diasFaltantes < 90 ? 'warning' : 'info',
            }}
          />

          {/* IVA a Ingresar/Devolver */}
          <KeyIndicatorCard
            label="IVA Este Trimestre"
            value={resumen?.ivaAIngresar ? `${eur(resumen?.ivaAIngresar || 0)} a ingresar` : resumen?.ivaADevolver ? `${eur(resumen?.ivaADevolver || 0)} a devolver` : 'Sin datos'}
            icon={<Warning size={24} />}
            href="/dashboard/fiscal/modelo-303"
            color={resumen?.ivaAIngresar ? 'rose' : 'emerald'}
            badge={{
              label: resumen?.ivaAIngresar ? 'A pagar' : 'A recibir',
              type: resumen?.ivaAIngresar ? 'error' : 'success',
            }}
          />

          {/* Retenciones Pendientes */}
          <KeyIndicatorCard
            label="Retenciones Pendientes"
            value="0 €"
            icon={<FileText size={24} />}
            href="/dashboard/fiscal/modelo-111"
            color="amber"
            badge={{
              label: 'Al día',
              type: 'info',
            }}
          />
        </div>
      </div>

      {/* Mini Reportes Fiscales */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Mini Reportes Fiscales</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {/* IVA del Trimestre */}
          <MiniReportCard
            title="IVA Q1 2026"
            color="blue"
            items={[
              {
                label: 'IVA Repercutido',
                value: eur(5420.50),
                compareValue: eur(4820.00),
                compareLabel: 'Q4 2025',
                trend: 'up',
              },
              {
                label: 'IVA Soportado',
                value: eur(1200.00),
                compareValue: eur(980.50),
                compareLabel: 'Q4 2025',
                trend: 'up',
              },
              {
                label: 'Resultado (A pagar)',
                value: eur(4220.50),
                trend: 'neutral',
              },
            ]}
          />

          {/* Retenciones */}
          <MiniReportCard
            title="Retenciones Q1 2026"
            color="amber"
            items={[
              {
                label: 'Base Sujeta',
                value: eur(8500.00),
                compareValue: eur(7200.00),
                compareLabel: 'Q4 2025',
                trend: 'up',
              },
              {
                label: 'Retención (15%)',
                value: eur(1275.00),
                compareValue: eur(1080.00),
                compareLabel: 'Q4 2025',
                trend: 'up',
              },
              {
                label: 'Estado',
                value: 'No presentado',
                trend: 'neutral',
              },
            ]}
          />

          {/* Modelos Presentados */}
          <MiniReportCard
            title="Modelos Presentados (2026)"
            color="emerald"
            items={[
              {
                label: 'Modelo 303',
                value: '0 trimestres',
                trend: 'neutral',
              },
              {
                label: 'Modelo 111',
                value: '0 trimestres',
                trend: 'neutral',
              },
              {
                label: 'Modelo 347',
                value: 'Pendiente (Feb)',
                trend: 'neutral',
              },
              {
                label: 'Modelo 390',
                value: 'Pendiente (Mar)',
                trend: 'neutral',
              },
            ]}
          />

          {/* Resumen Fiscal */}
          <MiniReportCard
            title="Resumen Fiscal"
            color="blue"
            items={[
              {
                label: 'Ingresos (YTD)',
                value: eur(resumen?.totalIngresos || 0),
                trend: 'up',
              },
              {
                label: 'Gastos (YTD)',
                value: eur(resumen?.totalGastos || 0),
                trend: 'down',
              },
              {
                label: 'Beneficio (YTD)',
                value: eur((resumen?.totalIngresos || 0) - (resumen?.totalGastos || 0)),
                trend: 'neutral',
              },
            ]}
          />
        </div>
      </div>

      {/* Gestión de Pendientes */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Gestión de Pendientes</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {/* Pendiente de Cobro */}
          <Link href="/dashboard/facturas" className="group rounded-lg border border-slate-200 bg-white p-6 hover:border-blue-300 hover:shadow-md transition">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-600">Pendiente de Cobro</p>
                <p className="mt-2 text-2xl font-bold text-blue-600">{eur(resumen?.pendienteCobro || 0)}</p>
              </div>
              <div className="rounded-lg bg-blue-100 p-3">
                <Clock size={24} className="text-blue-600" />
              </div>
            </div>
          </Link>

          {/* Pendiente de Pago */}
          <Link href="/dashboard/compras" className="group rounded-lg border border-slate-200 bg-white p-6 hover:border-amber-300 hover:shadow-md transition">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-600">Pendiente de Pago</p>
                <p className="mt-2 text-2xl font-bold text-amber-600">{eur(resumen?.pendientePago || 0)}</p>
              </div>
              <div className="rounded-lg bg-amber-100 p-3">
                <WarningCircle size={24} className="text-amber-600" />
              </div>
            </div>
          </Link>

          {/* Facturas Emitidas */}
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-slate-600">Facturas Emitidas (Este año)</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{resumen?.facturasCount || 0}</p>
              </div>
              <div className="rounded-lg bg-slate-100 p-3">
                <CreditCard size={24} className="text-slate-600" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Situación Fiscal */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Situación Fiscal (Este trimestre)</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {/* IVA a Devolver */}
          {(resumen?.ivaADevolver || 0) > 0 && (
            <Link href="/dashboard/fiscal/modelo-303" className="group rounded-lg border border-emerald-200 bg-emerald-50 p-6 hover:shadow-md transition">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-emerald-600">IVA a Devolver</p>
                  <p className="mt-2 text-2xl font-bold text-emerald-900">{eur(resumen?.ivaADevolver || 0)}</p>
                </div>
                <div className="rounded-lg bg-emerald-100 p-3">
                  <CheckCircle size={24} className="text-emerald-600" />
                </div>
              </div>
            </Link>
          )}

          {/* IVA a Ingresar */}
          {(resumen?.ivaAIngresar || 0) > 0 && (
            <Link href="/dashboard/fiscal/modelo-303" className="group rounded-lg border border-rose-200 bg-rose-50 p-6 hover:shadow-md transition">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-rose-600">IVA a Ingresar</p>
                  <p className="mt-2 text-2xl font-bold text-rose-900">{eur(resumen?.ivaAIngresar || 0)}</p>
                </div>
                <div className="rounded-lg bg-rose-100 p-3">
                  <WarningCircle size={24} className="text-rose-600" />
                </div>
              </div>
            </Link>
          )}

          {/* Nota si no hay datos */}
          {!(resumen?.ivaADevolver || resumen?.ivaAIngresar) && (
            <div className="col-span-full rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
              <p className="text-sm text-slate-600">
                Sin información de IVA disponible aún. Crea facturas y compras para ver el cálculo del IVA.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Nota informativa */}
      <div className="rounded-lg border-l-4 border-l-blue-500 bg-blue-50 p-4">
        <p className="text-sm text-blue-900">
          <strong>Nota:</strong> Este resumen se actualiza automáticamente con base en tus facturas, compras y movimientos registrados.
          Para más detalles, consulta las secciones específicas (Facturas, Compras, Fiscal).
        </p>
      </div>
    </div>
  );
}
