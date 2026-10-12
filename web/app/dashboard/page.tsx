'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus } from '@phosphor-icons/react';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { ApiError, apiFetch, companyPath, errorMessage } from '@/lib/api';
import { anioEspana } from '@/lib/anios';
import { useAniosEmpresa } from '@/lib/useAniosEmpresa';
import { useVencimientosAeat } from '@/lib/useVencimientosAeat';
import SelectorAnio from '@/components/SelectorAnio';
import { AlertCard } from '@/components/dashboard/AlertCard';
import { CobrosClientes } from '@/components/dashboard/CobrosClientes';
import { getQuartersForYear, getCurrentQuarter, isDateInQuarter, PATRON_TRIMESTRE } from '@/lib/quarters';
import NewMovementModal from '@/components/dashboard/NewMovementModal';
import { IncomeExpenseChart } from '@/components/charts/IncomeExpenseChart';
import { IncomeAnalysisChart } from '@/components/charts/IncomeAnalysisChart';
import { ExpenseDetailChart } from '@/components/charts/ExpenseDetailChart';

interface Summary {
  totalIncome: number;
  totalExpense: number;
  balance: number;
  totalMovements: number;
  fiscal?: {
    ivaBase: number;
    ivaRate: number;
    ivaToLiquidate: number;
    irpfRetained: number;
  };
}

/** Resumen fiscal del año sacado de las facturas (GET /movements/stats/fiscal). */
interface ResumenFiscal {
  ventas: { facturas: number; base: number; iva: number; retencion: number; total: number };
  gastos: { facturas: number; base: number; iva: number; retencion: number; total: number };
  ivaResultado: number;
  retencionesAIngresar: number;
}

interface MonthRow {
  month: string;
  income: number;
  expense: number;
  balance: number;
}

interface CategoryRow {
  category: string;
  expense: number;
  percentage: number;
}

interface Movement {
  id: string;
  type: 'income' | 'expense';
  amount: string;
  category: string;
  description: string;
  date: string;
  referenceDocument?: string;
  status: string;
}

interface Cliente {
  id: string;
  nombreFiscal: string;
  nifCif: string;
  email?: string;
}

const eur = (n: number) =>
  n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

const statusStyles: Record<string, string> = {
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  reconciled: 'bg-slate-100 text-slate-700 border-slate-300',
  draft: 'bg-amber-50 text-amber-700 border-amber-200',
};

const statusLabels: Record<string, string> = {
  approved: 'Aprobado',
  reconciled: 'Conciliado',
  draft: 'Borrador',
};

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [months, setMonths] = useState<MonthRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sinAccesoResumen, setSinAccesoResumen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  // Año en curso en España por defecto; la lista, los años de la empresa más los que tienen movimientos.
  const [selectedYear, setSelectedYear] = useState(() => anioEspana());
  const [periodType, setPeriodType] = useState<'year' | 'quarters' | 'months'>('quarters');
  const [selectedPeriod, setSelectedPeriod] = useState(getCurrentQuarter());
  const [aniosConMovimientos, setAniosConMovimientos] = useState<number[]>([]);
  const aniosEmpresa = useAniosEmpresa();
  const availableYears = aniosEmpresa.anios([...aniosConMovimientos, selectedYear]);
  const [fiscal, setFiscal] = useState<ResumenFiscal | null>(null);
  const [incomeExpenseViewType, setIncomeExpenseViewType] = useState<'income-expense' | 'result'>('income-expense');
  const [selectedAnalysisPeriod, setSelectedAnalysisPeriod] = useState<string>(''); // Período único para análisis
  // Lo que deja ver su acceso en la empresa activa (se lee al montar: la sesion vive en el navegador).
  const [acceso, setAcceso] = useState<{ cobros: boolean; aeat: boolean; nuevoMovimiento: boolean } | null>(null);
  // Plazos de la AEAT del servidor (día hábil, ajustes fiscales); sin permiso de impuestos, el calendario general.
  const { vencimientos: vencimientosAeat } = useVencimientosAeat(4, !!acceso?.aeat);

  const loadData = useCallback(async () => {
    try {
      // Sin sesion, el layout ya redirige al login; un 401 lo gestiona apiFetch.
      const get = <T,>(path: string) => apiFetch<T>(companyPath(path));

      // Cada bloque por su lado: con permisos a medida (p. ej. solo Ventas) unas
      // lecturas dan 403 y otras no, y lo que si carga se pinta igual.
      const resultados = await Promise.allSettled([
        get<Summary>('/movements/stats/summary'),
        get<MonthRow[]>('/movements/stats/by-month'),
        get<CategoryRow[]>('/movements/stats/by-category'),
        get<Movement[]>('/movements?limit=15'),
        get<{ items?: Cliente[] }>('/clientes?limit=10'),
      ]);
      const [rSum, rByMonth, rByCat, rMovs, rCls] = resultados;
      const valor = <T,>(r: PromiseSettledResult<T>, porDefecto: T): T => (r.status === 'fulfilled' ? r.value ?? porDefecto : porDefecto);
      const sum = valor(rSum, null as Summary | null);
      const byMonth = valor(rByMonth, [] as MonthRow[]);
      const byCat = valor(rByCat, [] as CategoryRow[]);
      const movs = valor(rMovs, [] as Movement[]);
      const cls = valor(rCls, {} as { items?: Cliente[] });

      const fallos = resultados.flatMap((r) => (r.status === 'rejected' ? [r.reason as unknown] : []));
      const esSinPermiso = (e: unknown) => e instanceof ApiError && e.status === 403;
      // Un 403 en el resumen es que su acceso no incluye esos datos (pide
      // Contabilidad o Tesoreria): no se pintan ceros como si fueran reales y se
      // dice sin tono de error. Un 403 solo en clientes no oculta el resumen.
      const resumenSinAcceso = rSum.status === 'rejected' && esSinPermiso(rSum.reason);
      setSinAccesoResumen(resumenSinAcceso);
      const otroFallo = fallos.find((e) => !esSinPermiso(e));

      // IVA y retenciones del año, desde las facturas (no se estiman).
      try {
        setFiscal(resumenSinAcceso ? null : await get<ResumenFiscal>(`/movements/stats/fiscal?anio=${selectedYear}`));
      } catch {
        setFiscal(null);
      }

      setSummary(sum);
      setMonths(byMonth);
      setCategories(byCat);
      setMovements(movs);
      setClientes(cls.items ?? []);
      setError(otroFallo === undefined ? null : errorMessage(otroFallo));

      // Años con movimientos: se unen a los de la empresa en el selector.
      setAniosConMovimientos(Array.from(new Set(byMonth.map((m: MonthRow) => parseInt(m.month.slice(0, 4), 10)))).filter((y) => Number.isInteger(y)));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  useEffect(() => {
    const user = getUser();
    setUserEmail(user?.email ?? '');
    setAcceso({
      // Mismos permisos que piden las rutas del servidor.
      cobros: tieneAlgunPermiso(user, ['ventas:read', 'contabilidad:read']),
      aeat: tieneAlgunPermiso(user, ['impuestos:read', 'contabilidad:read']),
      nuevoMovimiento: tieneAlgunPermiso(user, ['contabilidad:write']),
    });
    loadData();
  }, [loadData]);

  // Trimestres y meses del año elegido (los doce, tenga o no datos).
  const availableQuarters = useMemo(() => getQuartersForYear(selectedYear).map((q) => ({ value: q.value, label: q.label })), [selectedYear]);
  const availableMonths = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const value = `${selectedYear}-${String(i + 1).padStart(2, '0')}`;
        return { value, label: new Date(selectedYear, i, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }) };
      }),
    [selectedYear],
  );

  /** Al cambiar de año se mantiene el mismo trimestre o mes del año nuevo (o «Todo el año»). */
  const cambiarAnio = (y: number) => {
    const mover = (p: string) => (PATRON_TRIMESTRE.test(p) || /^\d{4}-\d{2}$/.test(p) ? `${y}${p.slice(4)}` : p);
    setSelectedYear(y);
    setSelectedPeriod((p) => mover(p));
    setSelectedAnalysisPeriod((p) => mover(p));
  };

  // Filtrar datos por período seleccionado
  const getFilteredData = () => {
    const yearStr = selectedYear.toString();

    // Si no hay período seleccionado, mostrar todo el año
    if (!selectedPeriod) {
      return {
        months: months.filter((m) => m.month.startsWith(yearStr)),
        movements: movements.filter((m) => m.date.slice(0, 4) === yearStr),
      };
    }

    // Detectar si es un trimestre (formato: 2026-Q1) o un mes (formato: 2026-01)
    if (PATRON_TRIMESTRE.test(selectedPeriod)) {
      // Es un trimestre
      return {
        months: months.filter((m) => isDateInQuarter(m.month, selectedPeriod)),
        movements: movements.filter((m) => isDateInQuarter(m.date.slice(0, 10), selectedPeriod)),
      };
    } else if (selectedPeriod.match(/^\d{4}-\d{2}$/)) {
      // Es un mes (formato: 2026-01)
      return {
        months: months.filter((m) => m.month === selectedPeriod),
        movements: movements.filter((m) => m.date.slice(0, 7) === selectedPeriod),
      };
    }

    // Por defecto, mostrar todo el año
    return {
      months: months.filter((m) => m.month.startsWith(yearStr)),
      movements: movements.filter((m) => m.date.slice(0, 4) === yearStr),
    };
  };

  const { months: filteredMonths, movements: filteredMovements } = getFilteredData();

  // Aplicar filtro de período a los movimientos de análisis de ingresos/gastos
  let analysisMovements = filteredMovements;

  if (selectedAnalysisPeriod) {
    if (PATRON_TRIMESTRE.test(selectedAnalysisPeriod)) {
      // Es un trimestre (formato: 2026-Q1)
      analysisMovements = filteredMovements.filter((m) => isDateInQuarter(m.date.slice(0, 10), selectedAnalysisPeriod));
    } else if (selectedAnalysisPeriod.match(/^\d{2}$/)) {
      // Es un mes (formato: 01-12)
      analysisMovements = filteredMovements.filter((m) => m.date.slice(5, 7) === selectedAnalysisPeriod);
    }
  }

  const maxMonthTotal = Math.max(
    1,
    ...filteredMonths.map((m) => Math.max(m.income, m.expense))
  );

  // Recalcular KPIs del trimestre
  const quarterSummary = {
    totalIncome: filteredMovements.reduce((sum, m) => (m.type === 'income' ? sum + Number(m.amount) : sum), 0),
    totalExpense: filteredMovements.reduce((sum, m) => (m.type === 'expense' ? sum + Number(m.amount) : sum), 0),
    balance: 0,
    totalMovements: filteredMovements.length,
  };
  quarterSummary.balance = quarterSummary.totalIncome - quarterSummary.totalExpense;

  // Desglose fiscal: usar datos reales de la API si disponibles, sino calcular
  const incomeMovements = filteredMovements.filter((m) => m.type === 'income');
  // Antes se estimaba (21 % de IVA y 15 % de IRPF sobre los cobros): ahora sale de las facturas.
  void incomeMovements;
  void summary;
  const sinDato = '—';
  const beneficio = fiscal ? Math.round((fiscal.ventas.base - fiscal.gastos.base) * 100) / 100 : null;

  // Calcular ingresos por cliente (usando nombres de clientes reales) - usando analysisMovements
  const incomeByClientName = new Map<string, number>();

  analysisMovements
    .filter((m) => m.type === 'income')
    .forEach((m) => {
      // Buscar el cliente coincidiendo con su nombreFiscal en la descripción
      let clientName = 'Sin especificar';
      const foundClient = clientes.find((c) =>
        m.description?.toLowerCase().includes(c.nombreFiscal.toLowerCase())
      );

      if (foundClient) {
        clientName = foundClient.nombreFiscal;
      } else {
        // Si no encuentra exacto, intenta extraer del patrón "Factura X-XXXX-XXX NombreCliente"
        const match = m.description?.match(/^Factura\s+[A-Z0-9\-]+\s+(.+)$/) ||
                     m.description?.match(/^[A-Z0-9\-]+\s+(.+)$/);
        if (match && match[1]) {
          clientName = match[1].trim();
        }
      }

      incomeByClientName.set(
        clientName,
        (incomeByClientName.get(clientName) || 0) + Number(m.amount)
      );
    });

  const clientsData = Array.from(incomeByClientName.entries())
    .map(([name, total]) => ({
      name,
      total,
      letter: name.charAt(0).toUpperCase(),
    }))
    .sort((a, b) => b.total - a.total);

  // Calcular gastos por proveedor/descripción (extrayendo el nombre del proveedor) - usando analysisMovements
  const expenseBySupplierName = new Map<string, number>();

  analysisMovements
    .filter((m) => m.type === 'expense')
    .forEach((m) => {
      let supplierName = 'Sin especificar';
      const desc = m.description || '';

      // Patrones comunes de descripción de gastos:
      // "Concepto Proveedor/Empresa"
      // "Concepto referencia Proveedor"
      const patterns = [
        /^(.+?)\s+[A-Z0-9\-]+\s+([A-Z][a-z\s]+)$/,  // "Concepto REF Proveedor"
        /^([A-Z][a-z\s]+)(?:\s+[A-Z][a-z\s]+)*$/,    // Múltiples palabras capitalizadas
        /^(.+?)(?:\s+(?:Energia|Gestoria|Suministros|Turia|Mediterranea|Ribera|equipo))?$/i, // Con keywords
      ];

      for (const pattern of patterns) {
        const match = desc.match(pattern);
        if (match) {
          // Tomar hasta la primera palabra que no sea un número/código
          let extracted = match[1].trim();
          if (extracted.length > 2) {
            supplierName = extracted;
            break;
          }
        }
      }

      // Si aún no tenemos un nombre, tomar las primeras 2-3 palabras significativas
      if (supplierName === 'Sin especificar') {
        const words = desc.split(' ').filter(w => w.length > 2 && !/^[A-Z0-9\-]+$/.test(w));
        if (words.length > 0) {
          supplierName = words.slice(0, Math.min(3, words.length)).join(' ');
        }
      }

      expenseBySupplierName.set(
        supplierName,
        (expenseBySupplierName.get(supplierName) || 0) + Number(m.amount)
      );
    });

  const suppliersData = Array.from(expenseBySupplierName.entries())
    .map(([name, total]) => ({
      name,
      total,
      letter: name.charAt(0).toUpperCase(),
    }))
    .sort((a, b) => b.total - a.total);

  // Recalcular categorías del trimestre
  const quarterCategories = categories.map((cat) => {
    const catExpense = filteredMovements.reduce((sum, m) => {
      return m.category === cat.category && m.type === 'expense'
        ? sum + Number(m.amount)
        : sum;
    }, 0);
    return { ...cat, expense: catExpense };
  });
  const totalExpenseInQuarter = quarterCategories.reduce((sum, c) => sum + c.expense, 0);
  const quarterCategoriesWithPercentage = quarterCategories.map((c) => ({
    ...c,
    percentage: totalExpenseInQuarter > 0 ? (c.expense / totalExpenseInQuarter) * 100 : 0,
  }));

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <header className="sticky top-0 z-40 h-16 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 md:px-8 h-full flex items-center justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors shrink-0"
            >
              <ArrowLeft size={16} /> Web
            </Link>
            <span className="text-slate-300">|</span>
            <span className="font-semibold text-slate-900 truncate">
              Dashboard
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden md:inline text-sm text-slate-500">
              {userEmail}
            </span>
            {acceso?.nuevoMovimiento && (
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent-600 text-white text-sm font-semibold rounded-lg hover:bg-accent-700 active:scale-[0.98] transition-all"
              >
                <Plus size={16} weight="bold" /> Nuevo movimiento
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-8 flex flex-col gap-8">
        {sinAccesoResumen && (
          <div role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            Tu acceso a esta empresa no incluye el resumen general (ingresos, gastos y movimientos). En el menú tienes las áreas que sí
            puedes usar.
          </div>
        )}

        {/* Plazos AEAT calculados con el calendario real a partir de hoy */}
        {acceso?.aeat && (
        <section aria-labelledby="vencimientos-aeat">
          <div className="flex items-baseline justify-between gap-4 mb-3">
            <h2 id="vencimientos-aeat" className="font-semibold text-slate-900">
              Próximos plazos AEAT
            </h2>
            <p className="text-xs text-slate-500">
              Si el último día cae en fin de semana o festivo nacional, ya sale el siguiente día hábil.
            </p>
          </div>
          {vencimientosAeat === null ? (
            <div className="h-24 animate-pulse rounded-lg bg-white border border-slate-200" />
          ) : vencimientosAeat.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">No tienes modelos pendientes de presentar.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {vencimientosAeat.map((alerta) => (
                <AlertCard key={alerta.id} alert={alerta} />
              ))}
            </div>
          )}
        </section>
        )}

        {!sinAccesoResumen && (
          <>
        {/* Filtros: Año y Período */}
        <section className="flex items-center gap-4 flex-wrap bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700" aria-hidden>Año:</span>
            <SelectorAnio
              id="panel-anio"
              etiqueta=""
              valor={selectedYear}
              anios={availableYears}
              onChange={(y) => y !== null && cambiarAnio(y)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-600"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700">Período:</label>
            <select
              value={periodType}
              onChange={(e) => {
                const newType = e.target.value as 'year' | 'quarters' | 'months';
                setPeriodType(newType);
                if (newType === 'year') setSelectedPeriod('');
                else if (newType === 'quarters') setSelectedPeriod(selectedYear === anioEspana() ? getCurrentQuarter() : availableQuarters[0].value);
                else setSelectedPeriod(availableMonths[0].value);
              }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-600"
            >
              <option value="year">Todo el año</option>
              <option value="quarters">Por trimestres</option>
              <option value="months">Por meses</option>
            </select>
          </div>

          {periodType !== 'year' && (
            <div className="flex items-center gap-2">
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-600"
              >
                {(periodType === 'quarters' ? availableQuarters : availableMonths).map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </section>
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 p-4 text-sm">
            <strong>No se pudo cargar el dashboard.</strong> {error}
          </div>
        )}

        {/* Resumen Tributario - 2x2 Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-48 rounded-xl bg-white border border-slate-200 animate-pulse" />
            ))
          ) : (
            <>
              {/* Ingresos */}
              <div className="rounded-xl bg-white border border-slate-200 p-8">
                <p className="text-sm font-semibold text-slate-500 mb-2">Ingresos</p>
                <p className="text-4xl font-bold text-emerald-700 mb-6">
                  {eur(quarterSummary.totalIncome)}
                </p>
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <p className="text-xs text-slate-400">Facturas emitidas en {selectedYear}: {fiscal?.ventas.facturas ?? 0}</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Base imponible</span>
                    <span className="font-mono font-medium text-slate-900">{fiscal ? eur(fiscal.ventas.base) : sinDato}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">IVA repercutido</span>
                    <span className="font-mono font-medium text-slate-900">{fiscal ? eur(fiscal.ventas.iva) : sinDato}</span>
                  </div>
                  {!!fiscal?.ventas.retencion && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">IRPF que te retienen</span>
                      <span className="font-mono font-medium text-slate-900">-{eur(fiscal.ventas.retencion)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Gastos */}
              <div className="rounded-xl bg-white border border-slate-200 p-8">
                <p className="text-sm font-semibold text-slate-500 mb-2">Gastos</p>
                <p className="text-4xl font-bold text-rose-600 mb-6">
                  {eur(quarterSummary.totalExpense)}
                </p>
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <p className="text-xs text-slate-400">Facturas de gasto en {selectedYear}: {fiscal?.gastos.facturas ?? 0}</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Base imponible</span>
                    <span className="font-mono font-medium text-slate-900">{fiscal ? eur(fiscal.gastos.base) : sinDato}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">IVA soportado</span>
                    <span className="font-mono font-medium text-slate-900">{fiscal ? eur(fiscal.gastos.iva) : sinDato}</span>
                  </div>
                  {!!fiscal?.gastos.retencion && (
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-600">Retenciones practicadas</span>
                      <span className="font-mono font-medium text-slate-900">{eur(fiscal.gastos.retencion)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Total / Balance */}
              <div className="rounded-xl bg-white border-2 border-emerald-300 p-8 shadow-sm shadow-emerald-100">
                <p className="text-sm font-semibold text-slate-500 mb-2">Beneficio antes de impuestos</p>
                <p
                  className={`text-4xl font-bold mb-1 ${
                    beneficio === null || beneficio >= 0 ? 'text-emerald-700' : 'text-rose-600'
                  }`}
                >
                  {beneficio === null ? sinDato : eur(beneficio)}
                </p>
                <p className="mb-5 text-xs text-slate-400">Base de las ventas − base de los gastos de {selectedYear}, según las facturas</p>
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>Cobros − pagos (caja)</span>
                    <span className={`font-mono font-medium ${quarterSummary.balance >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                      {eur(quarterSummary.balance)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Liquidaciones */}
              <div className="rounded-xl bg-white border border-slate-200 p-8">
                <p className="text-sm font-semibold text-slate-500 mb-6">Liquidaciones</p>
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-emerald-50 -mx-8 px-8 py-3">
                    <span className="font-medium text-slate-700">
                      {fiscal && fiscal.ivaResultado < 0 ? 'IVA a compensar' : 'IVA a ingresar'}
                      <span className="block text-xs font-normal text-slate-500">Repercutido − soportado (orientativo)</span>
                    </span>
                    <span className="text-2xl font-bold text-emerald-700">{fiscal ? eur(Math.abs(fiscal.ivaResultado)) : sinDato}</span>
                  </div>
                  <div className="flex justify-between items-center bg-blue-50 -mx-8 px-8 py-3">
                    <span className="font-medium text-slate-700">
                      Retenciones a ingresar
                      <span className="block text-xs font-normal text-slate-500">Las que practicas en tus gastos (111/115)</span>
                    </span>
                    <span className="text-2xl font-bold text-blue-700">{fiscal ? eur(fiscal.retencionesAIngresar) : sinDato}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

          </>
        )}

        {/* Cobros de clientes: pendiente (de cualquier año) y cobrado del año elegido.
            Solo con Ventas o Contabilidad, que es lo que pide su ruta. */}
        {acceso?.cobros && <CobrosClientes anio={selectedYear} />}

        {!sinAccesoResumen && (
          <>
        {/* Gráfico de Ingresos y Gastos */}
        <section className="rounded-xl bg-white border border-slate-200 p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-base font-semibold text-slate-900">Ingresos y Gastos</h2>
            <div className="flex gap-2">
              <button
                onClick={() => setIncomeExpenseViewType('income-expense')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  incomeExpenseViewType === 'income-expense'
                    ? 'bg-accent-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Ingresos / Gastos
              </button>
              <button
                onClick={() => setIncomeExpenseViewType('result')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  incomeExpenseViewType === 'result'
                    ? 'bg-accent-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Resultado
              </button>
            </div>
          </div>

          {/* Filtros del gráfico */}
          <div className="flex items-center gap-4 mb-6 flex-wrap">
            <SelectorAnio
              id="grafico-anio"
              etiqueta=""
              valor={selectedYear}
              anios={availableYears}
              onChange={(y) => y !== null && cambiarAnio(y)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-600"
            />

            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-600"
            >
              <option value="">Todo el año</option>
              <optgroup label="Trimestres">
                <option value={`${selectedYear}-Q1`}>1 Trimestre</option>
                <option value={`${selectedYear}-Q2`}>2 Trimestre</option>
                <option value={`${selectedYear}-Q3`}>3 Trimestre</option>
                <option value={`${selectedYear}-Q4`}>4 Trimestre</option>
              </optgroup>
              <optgroup label="Meses">
                <option value={`${selectedYear}-01`}>Enero</option>
                <option value={`${selectedYear}-02`}>Febrero</option>
                <option value={`${selectedYear}-03`}>Marzo</option>
                <option value={`${selectedYear}-04`}>Abril</option>
                <option value={`${selectedYear}-05`}>Mayo</option>
                <option value={`${selectedYear}-06`}>Junio</option>
                <option value={`${selectedYear}-07`}>Julio</option>
                <option value={`${selectedYear}-08`}>Agosto</option>
                <option value={`${selectedYear}-09`}>Septiembre</option>
                <option value={`${selectedYear}-10`}>Octubre</option>
                <option value={`${selectedYear}-11`}>Noviembre</option>
                <option value={`${selectedYear}-12`}>Diciembre</option>
              </optgroup>
            </select>
          </div>

          {/* Gráfico */}
          {loading ? (
            <div className="h-80 animate-pulse bg-slate-100 rounded-lg" />
          ) : (
            <IncomeExpenseChart data={months} viewType={incomeExpenseViewType} />
          )}
        </section>

        {/* Análisis de Ingresos */}
        <section className="rounded-xl bg-white border border-slate-200 p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-base font-semibold text-slate-900">Análisis de ingresos</h2>
            <select className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-600">
              <option>Clientes</option>
            </select>
          </div>

          {/* Filtros */}
          <div className="flex items-center gap-4 mb-6 flex-wrap">
            <SelectorAnio
              id="ingresos-anio"
              etiqueta=""
              valor={selectedYear}
              anios={availableYears}
              onChange={(y) => y !== null && cambiarAnio(y)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-600"
            />

            <select
              value={selectedAnalysisPeriod}
              onChange={(e) => setSelectedAnalysisPeriod(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-600"
            >
              <option value="">Todo el año</option>
              <optgroup label="Trimestres">
                <option value={`${selectedYear}-Q1`}>1 Trimestre</option>
                <option value={`${selectedYear}-Q2`}>2 Trimestre</option>
                <option value={`${selectedYear}-Q3`}>3 Trimestre</option>
                <option value={`${selectedYear}-Q4`}>4 Trimestre</option>
              </optgroup>
              <optgroup label="Meses">
                <option value="01">Enero</option>
                <option value="02">Febrero</option>
                <option value="03">Marzo</option>
                <option value="04">Abril</option>
                <option value="05">Mayo</option>
                <option value="06">Junio</option>
                <option value="07">Julio</option>
                <option value="08">Agosto</option>
                <option value="09">Septiembre</option>
                <option value="10">Octubre</option>
                <option value="11">Noviembre</option>
                <option value="12">Diciembre</option>
              </optgroup>
            </select>
          </div>

          {/* Gráfico */}
          {loading ? (
            <div className="h-80 animate-pulse bg-slate-100 rounded-lg" />
          ) : clientsData.length > 0 ? (
            <IncomeAnalysisChart clients={clientsData} />
          ) : (
            <div className="h-80 flex items-center justify-center text-slate-500">
              No hay datos de ingresos para el período seleccionado
            </div>
          )}
        </section>

        {/* Detalle de Gastos */}
        <section className="rounded-xl bg-white border border-slate-200 p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-base font-semibold text-slate-900">Detalle de gastos</h2>
            <select className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-600">
              <option>Proveedores</option>
            </select>
          </div>

          {/* Filtros */}
          <div className="flex items-center gap-4 mb-6 flex-wrap">
            <SelectorAnio
              id="gastos-anio"
              etiqueta=""
              valor={selectedYear}
              anios={availableYears}
              onChange={(y) => y !== null && cambiarAnio(y)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-600"
            />

            <select
              value={selectedAnalysisPeriod}
              onChange={(e) => setSelectedAnalysisPeriod(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-600"
            >
              <option value="">Todo el año</option>
              <optgroup label="Trimestres">
                <option value={`${selectedYear}-Q1`}>1 Trimestre</option>
                <option value={`${selectedYear}-Q2`}>2 Trimestre</option>
                <option value={`${selectedYear}-Q3`}>3 Trimestre</option>
                <option value={`${selectedYear}-Q4`}>4 Trimestre</option>
              </optgroup>
              <optgroup label="Meses">
                <option value="01">Enero</option>
                <option value="02">Febrero</option>
                <option value="03">Marzo</option>
                <option value="04">Abril</option>
                <option value="05">Mayo</option>
                <option value="06">Junio</option>
                <option value="07">Julio</option>
                <option value="08">Agosto</option>
                <option value="09">Septiembre</option>
                <option value="10">Octubre</option>
                <option value="11">Noviembre</option>
                <option value="12">Diciembre</option>
              </optgroup>
            </select>
          </div>

          {/* Gráfico */}
          {loading ? (
            <div className="h-80 animate-pulse bg-slate-100 rounded-lg" />
          ) : suppliersData.length > 0 ? (
            <ExpenseDetailChart suppliers={suppliersData} />
          ) : (
            <div className="h-80 flex items-center justify-center text-slate-500">
              No hay datos de gastos para el período seleccionado
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl bg-white border border-slate-200 p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-5">
              Evolución mensual
            </h2>
            {loading ? (
              <div className="h-40 animate-pulse bg-slate-100 rounded-lg" />
            ) : (
              <div className="flex flex-col gap-5">
                {filteredMonths.map((m) => (
                  <div key={m.month} className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-slate-700">
                        {new Date(m.month + '-01').toLocaleDateString('es-ES', {
                          month: 'long',
                          year: 'numeric',
                        })}
                      </span>
                      <span className="font-mono text-slate-500">
                        {eur(m.balance)}
                      </span>
                    </div>
                    <div
                      className="h-2.5 rounded-full bg-emerald-500"
                      style={{ width: `${(m.income / maxMonthTotal) * 100}%` }}
                      title={`Ingresos: ${eur(m.income)}`}
                    />
                    <div
                      className="h-2.5 rounded-full bg-rose-400"
                      style={{ width: `${(m.expense / maxMonthTotal) * 100}%` }}
                      title={`Gastos: ${eur(m.expense)}`}
                    />
                  </div>
                ))}
                <div className="flex gap-5 pt-1 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    Ingresos
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
                    Gastos
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl bg-white border border-slate-200 p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-5">
              Gastos por categoría
            </h2>
            {loading ? (
              <div className="h-40 animate-pulse bg-slate-100 rounded-lg" />
            ) : (
              <ul className="flex flex-col gap-4">
                {categories.map((c) => (
                  <li key={c.category} className="flex items-center gap-3">
                    <span className="w-28 text-sm font-medium text-slate-700 capitalize shrink-0">
                      {c.category}
                    </span>
                    <div
                      className="h-2.5 rounded-full bg-slate-400"
                      style={{ width: `${c.percentage}%`, minWidth: '4px' }}
                    />
                    <span className="ml-auto font-mono text-sm text-slate-500 shrink-0">
                      {eur(c.expense)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="rounded-xl bg-white border border-slate-200 overflow-hidden">
          <h2 className="text-base font-semibold text-slate-900 px-6 pt-6 pb-4">
            Últimos movimientos
          </h2>
          {loading ? (
            <div className="h-64 mx-6 mb-6 animate-pulse bg-slate-100 rounded-lg" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-y border-slate-200 bg-slate-50">
                    <th className="px-6 py-3 font-medium">Fecha</th>
                    <th className="px-6 py-3 font-medium">Descripción</th>
                    <th className="px-6 py-3 font-medium">Documento</th>
                    <th className="px-6 py-3 font-medium">Estado</th>
                    <th className="px-6 py-3 font-medium text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-3 text-slate-600 whitespace-nowrap">
                        {new Date(m.date).toLocaleDateString('es-ES')}
                      </td>
                      <td className="px-6 py-3 text-slate-900 font-medium">
                        {m.description}
                      </td>
                      <td className="px-6 py-3 font-mono text-slate-500">
                        {m.referenceDocument ?? '-'}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`inline-block text-xs font-medium border rounded-full px-2.5 py-0.5 ${
                            statusStyles[m.status] ?? statusStyles.draft
                          }`}
                        >
                          {statusLabels[m.status] ?? m.status}
                        </span>
                      </td>
                      <td
                        className={`px-6 py-3 text-right font-mono font-medium whitespace-nowrap ${
                          m.type === 'income'
                            ? 'text-emerald-700'
                            : 'text-rose-600'
                        }`}
                      >
                        {m.type === 'income' ? '+' : '-'}
                        {eur(Number(m.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
          </>
        )}

      </main>

      {showForm && (
        <NewMovementModal
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}

