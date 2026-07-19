'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, SignOut } from '@phosphor-icons/react';
import { getToken, getUser, clearSession } from '@/lib/auth';
import { getQuartersForYear, getCurrentQuarter, isDateInQuarter } from '@/lib/quarters';
import NewMovementModal from '@/components/dashboard/NewMovementModal';
import { IncomeExpenseChart } from '@/components/charts/IncomeExpenseChart';
import { IncomeAnalysisChart } from '@/components/charts/IncomeAnalysisChart';
import { ExpenseDetailChart } from '@/components/charts/ExpenseDetailChart';

const API = '/api/conta';

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

interface MaturityData {
  period: string;
  toCollect: number;
  toPay: number;
  balance: number;
}

interface MaturitySummary {
  averageDaysToCollect: number;
  data: MaturityData[];
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
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [months, setMonths] = useState<MonthRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [periodType, setPeriodType] = useState<'year' | 'quarters' | 'months'>('quarters');
  const [selectedPeriod, setSelectedPeriod] = useState(getCurrentQuarter());
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [availableQuarters, setAvailableQuarters] = useState<Array<{ value: string; label: string }>>([]);
  const [availableMonths, setAvailableMonths] = useState<Array<{ value: string; label: string }>>([]);
  const [maturityData, setMaturityData] = useState<MaturitySummary | null>(null);
  const [maturityViewType, setMaturityViewType] = useState<'months' | 'days'>('months');
  const [incomeExpenseViewType, setIncomeExpenseViewType] = useState<'income-expense' | 'result'>('income-expense');
  const [selectedAnalysisPeriod, setSelectedAnalysisPeriod] = useState<string>(''); // Período único para análisis

  const loadData = useCallback(async () => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const get = async (path: string) => {
        const r = await fetch(`${API}${path}`, { headers });
        if (r.status === 401) {
          clearSession();
          router.replace('/login');
          throw new Error('Sesión caducada');
        }
        if (!r.ok) throw new Error(`Error ${r.status} en ${path}`);
        const j = await r.json();
        return j.data;
      };

      const [sum, byMonth, byCat, movs, cls] = await Promise.all([
        get('/companies/1/movements/stats/summary'),
        get('/companies/1/movements/stats/by-month'),
        get('/companies/1/movements/stats/by-category'),
        get('/companies/1/movements?limit=15'),
        get('/companies/1/clientes?limit=10'),
      ]);

      // Cargar datos de vencimiento (si están disponibles en la API)
      try {
        const maturityRes = await fetch(`${API}/companies/1/invoices/stats/maturity`, { headers });
        if (maturityRes.ok) {
          const maturityInfo = await maturityRes.json();
          setMaturityData(maturityInfo.data);
        }
      } catch {
        // Si no hay endpoint de vencimiento, usar datos simulados
        setMaturityData({
          averageDaysToCollect: 273,
          data: [
            { period: 'Atrasos', toCollect: 0, toPay: 37.86, balance: -37.86 },
            { period: 'Julio', toCollect: 0, toPay: 0, balance: 0 },
            { period: 'Agosto', toCollect: 0, toPay: 0, balance: 0 },
            { period: '> 2 meses', toCollect: 0, toPay: 0, balance: 0 },
            { period: 'Indefinido', toCollect: 296146, toPay: 159744.17, balance: 136401.83 },
          ],
        });
      }

      setSummary(sum);
      setMonths(byMonth);
      setCategories(byCat);
      setMovements(movs);
      setClientes(cls.items ?? []);
      setError(null);

      // Calcular años disponibles basados en los meses de datos
      const years = new Set<number>();
      const monthsByYear = new Map<number, string[]>();
      byMonth.forEach((m: MonthRow) => {
        const year = parseInt(m.month.split('-')[0]);
        const month = m.month;
        years.add(year);
        if (!monthsByYear.has(year)) monthsByYear.set(year, []);
        monthsByYear.get(year)!.push(month);
      });

      const yearsList = Array.from(years).sort((a, b) => b - a);
      setAvailableYears(yearsList.length > 0 ? yearsList : [new Date().getFullYear()]);

      // Trimestres para el año seleccionado
      const quarters = getQuartersForYear(selectedYear).map((q) => ({
        value: q.value,
        label: q.label,
      }));
      setAvailableQuarters(quarters);

      // Meses para el año seleccionado
      const monthsForYear = monthsByYear.get(selectedYear) || [];
      const monthOptions = monthsForYear.map((m) => ({
        value: m,
        label: new Date(m + '-01').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }),
      }));
      setAvailableMonths(monthOptions);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    setUserEmail(getUser()?.email ?? '');
    loadData();
  }, [loadData]);

  function handleLogout() {
    clearSession();
    router.replace('/login');
  }

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
    if (selectedPeriod.match(/^202\d-Q[1-4]$/)) {
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
    if (selectedAnalysisPeriod.match(/^202\d-Q[1-4]$/)) {
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
  const ivaBase = summary?.fiscal?.ivaBase ?? incomeMovements.reduce((sum, m) => sum + Number(m.amount), 0);
  const ivaAmount = summary?.fiscal?.ivaToLiquidate ?? (ivaBase * 0.21);
  const irpfAmount = summary?.fiscal?.irpfRetained ?? incomeMovements.reduce((sum, m) => sum + Number(m.amount) * 0.15, 0);

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
              Dashboard · Empresa Demo
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden md:inline text-sm text-slate-500">
              {userEmail}
            </span>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent-600 text-white text-sm font-semibold rounded-lg hover:bg-accent-700 active:scale-[0.98] transition-all"
            >
              <Plus size={16} weight="bold" /> Nuevo movimiento
            </button>
            <button
              onClick={handleLogout}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="p-2 text-slate-500 hover:text-slate-900 transition-colors"
            >
              <SignOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-8 flex flex-col gap-8">
        {/* Filtros: Año y Período */}
        <section className="flex items-center gap-4 flex-wrap bg-white rounded-lg border border-slate-200 p-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700">Año:</label>
            <select
              value={selectedYear}
              onChange={(e) => {
                setSelectedYear(parseInt(e.target.value));
                if (periodType === 'months') setSelectedPeriod(availableMonths[0]?.value || '');
              }}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-600"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700">Período:</label>
            <select
              value={periodType}
              onChange={(e) => {
                const newType = e.target.value as 'year' | 'quarters' | 'months';
                setPeriodType(newType);
                if (newType === 'year') setSelectedPeriod('');
                else if (newType === 'quarters') setSelectedPeriod(availableQuarters[0]?.value || getCurrentQuarter());
                else setSelectedPeriod(availableMonths[0]?.value || '');
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
            <strong>No se pudo cargar el dashboard:</strong> {error}. Comprueba
            que la API está corriendo en el puerto 3000.
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
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Base IVA</span>
                    <span className="font-mono font-medium text-slate-900">{eur(ivaBase)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">IRPF (15%)</span>
                    <span className="font-mono font-medium text-slate-900">-{eur(irpfAmount)}</span>
                  </div>
                </div>
              </div>

              {/* Gastos */}
              <div className="rounded-xl bg-white border border-slate-200 p-8">
                <p className="text-sm font-semibold text-slate-500 mb-2">Gastos</p>
                <p className="text-4xl font-bold text-rose-600 mb-6">
                  {eur(quarterSummary.totalExpense)}
                </p>
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Total</span>
                    <span className="font-mono font-medium text-slate-900">
                      {eur(quarterSummary.totalExpense)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-600">Movimientos</span>
                    <span className="font-mono font-medium text-slate-900">
                      {filteredMovements.filter((m) => m.type === 'expense').length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Total / Balance */}
              <div className="rounded-xl bg-white border-2 border-emerald-300 p-8 shadow-sm shadow-emerald-100">
                <p className="text-sm font-semibold text-slate-500 mb-2">Total</p>
                <p
                  className={`text-4xl font-bold mb-6 ${
                    quarterSummary.balance >= 0
                      ? 'text-emerald-700'
                      : 'text-rose-600'
                  }`}
                >
                  {eur(quarterSummary.balance)}
                </p>
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>Movimientos</span>
                    <span className="font-mono font-medium text-slate-900">{filteredMovements.length}</span>
                  </div>
                </div>
              </div>

              {/* Liquidaciones */}
              <div className="rounded-xl bg-white border border-slate-200 p-8">
                <p className="text-sm font-semibold text-slate-500 mb-6">Liquidaciones</p>
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-emerald-50 -mx-8 px-8 py-3">
                    <span className="font-medium text-slate-700">IVA a liquidar</span>
                    <span className="text-2xl font-bold text-emerald-700">{eur(ivaAmount)}</span>
                  </div>
                  <div className="flex justify-between items-center bg-blue-50 -mx-8 px-8 py-3">
                    <span className="font-medium text-slate-700">IRPF a liquidar</span>
                    <span className="text-2xl font-bold text-blue-700">{eur(irpfAmount)}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

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
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-600"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

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
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-600"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

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
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-600"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

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

        {/* Sección de Vencimiento Mejorada */}
        {maturityData && (
          <section className="rounded-xl bg-white border border-slate-200 p-8">
            <div className="flex items-start justify-between mb-8">
              <div>
                <h2 className="text-base font-semibold text-slate-900 mb-3">Vencimiento</h2>
                <div>
                  <p className="text-4xl font-bold text-slate-900">{maturityData.averageDaysToCollect}</p>
                  <p className="text-sm text-slate-600">Tiempo medio para cobrar</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setMaturityViewType('months')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    maturityViewType === 'months'
                      ? 'bg-accent-600 text-white'
                      : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Por meses
                </button>
                <button
                  onClick={() => setMaturityViewType('days')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    maturityViewType === 'days'
                      ? 'bg-accent-600 text-white'
                      : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Por rango de días
                </button>
              </div>
            </div>

            {/* Tabla de Vencimiento - 3 Columnas */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-slate-300">
                    <th className="text-left py-4 px-6 font-semibold text-slate-900 w-32">Período</th>
                    <th className="text-center py-4 px-6 font-semibold text-slate-900">
                      <div className="text-xs uppercase tracking-wide text-slate-600">A cobrar</div>
                    </th>
                    <th className="text-center py-4 px-6 font-semibold text-slate-900">
                      <div className="text-xs uppercase tracking-wide text-slate-600">A pagar</div>
                    </th>
                    <th className="text-center py-4 px-6 font-semibold text-slate-900">
                      <div className="text-xs uppercase tracking-wide text-slate-600">Resultado</div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {maturityData.data.map((row, idx) => (
                    <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="py-4 px-6 text-slate-700 font-medium">{row.period}</td>
                      <td className="py-4 px-6 text-center font-mono text-slate-900">
                        {eur(row.toCollect)}
                      </td>
                      <td className="py-4 px-6 text-center font-mono text-slate-900">
                        {eur(row.toPay)}
                      </td>
                      <td
                        className={`py-4 px-6 text-center font-mono font-semibold ${
                          row.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {eur(row.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

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

