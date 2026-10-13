'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Info, Plus, Receipt, Sparkle } from '@phosphor-icons/react';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { ApiError, apiFetch, companyPath, errorMessage } from '@/lib/api';
import { anioEspana, mesEspana, nombreTrimestre } from '@/lib/anios';
import { formatoImporte } from '@/lib/moneda';
import { useAniosEmpresa } from '@/lib/useAniosEmpresa';
import { useVencimientosAeat } from '@/lib/useVencimientosAeat';
import SelectorAnio from '@/components/SelectorAnio';
import { anioOTodosDeUrl, ponerEnUrl } from '@/lib/urlEstado';
import { AlertCard } from '@/components/dashboard/AlertCard';
import { AvisoArranque } from '@/components/contabilidad/AvisoArranque';
import { arranqueApi } from '@/lib/arranque';
import { CobrosClientes } from '@/components/dashboard/CobrosClientes';
import { UltimasFacturas } from '@/components/dashboard/UltimasFacturas';
import { getCurrentQuarter, PATRON_TRIMESTRE } from '@/lib/quarters';
import { IncomeExpenseChart } from '@/components/charts/IncomeExpenseChart';
import { IncomeAnalysisChart } from '@/components/charts/IncomeAnalysisChart';
import { ExpenseDetailChart } from '@/components/charts/ExpenseDetailChart';
import {
  consultaPeriodo,
  enPeriodo,
  MESES,
  mesesDelPeriodo,
  nombreMes,
  nombreMonedaPlural,
  nombrePeriodo,
  tipoDePeriodo,
  type FilaCategoriaPanel,
  type FilaMesPanel,
  type FilaTerceroPanel,
  type ResumenFiscalPanel,
  type ResumenPanel,
  type UltimaFacturaPanel,
} from '@/lib/panel';

// ---------------------------------------------------------------------------
// Lecturas del panel
// ---------------------------------------------------------------------------

type EstadoLectura = 'cargando' | 'listo' | 'error' | 'sinAcceso';

interface Lectura<T> {
  estado: EstadoLectura;
  datos: T | null;
  error: string | null;
  reintentar: () => void;
}

/**
 * Lee una ruta del panel cada vez que cambia. Mientras carga deja los datos
 * anteriores (atenuados en pantalla) y descarta la respuesta de una ruta
 * anterior que llegue tarde. Un 403 no es un error: su acceso no incluye ese
 * dato (lo pide Contabilidad o Tesorería).
 */
function useLectura<T>(ruta: string): Lectura<T> {
  const [s, setS] = useState<{ estado: EstadoLectura; datos: T | null; error: string | null }>({ estado: 'cargando', datos: null, error: null });
  const [intento, setIntento] = useState(0);
  useEffect(() => {
    let vigente = true;
    setS((p) => ({ ...p, estado: 'cargando', error: null }));
    apiFetch<T>(companyPath(ruta)).then(
      (datos) => {
        if (vigente) setS({ estado: 'listo', datos, error: null });
      },
      (e: unknown) => {
        if (!vigente) return;
        if (e instanceof ApiError && e.status === 403) setS({ estado: 'sinAcceso', datos: null, error: null });
        else setS({ estado: 'error', datos: null, error: errorMessage(e) });
      },
    );
    return () => {
      vigente = false;
    };
  }, [ruta, intento]);
  const reintentar = useCallback(() => setIntento((i) => i + 1), []);
  return { ...s, reintentar };
}

// ---------------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------------

const facturasTexto = (n: number, de: string) => `${n} ${n === 1 ? 'factura' : 'facturas'} de ${de}`;
const nominasTexto = (n: number) => `${n} ${n === 1 ? 'nómina' : 'nóminas'}`;
/** «cobrada o no» con una sola, «cobradas o no» con varias. */
const oNo = (n: number, participio: 'cobrada' | 'pagada') => `${n === 1 ? participio : `${participio}s`} o no`;
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const CLASE_SELECT =
  'px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-600';

function Fila({ etiqueta, valor, ayuda }: { etiqueta: string; valor: string; ayuda?: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-slate-600">
        {etiqueta}
        {ayuda && <span className="block text-xs text-slate-500">{ayuda}</span>}
      </span>
      <span className="font-mono font-medium text-slate-900 whitespace-nowrap">{valor}</span>
    </div>
  );
}

function ErrorBloque({ texto, error, onReintentar }: { texto: string; error: string | null; onReintentar: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
      <p>
        <strong>{texto}</strong> {error}
      </p>
      <button type="button" onClick={onReintentar} className="mt-2 font-medium underline hover:no-underline">
        Volver a intentarlo
      </button>
    </div>
  );
}

function Vacio({ children, alto = 'h-40' }: { children: React.ReactNode; alto?: string }) {
  return <div className={`${alto} flex items-center justify-center rounded-lg bg-slate-50 px-4 text-center text-sm text-slate-500`}>{children}</div>;
}

/** Desplegable «Todo el año / trimestres / meses» de un bloque (valores '', 'AAAA-Qn' o 'AAAA-MM'). */
function SelectorPeriodo({ id, etiqueta, anio, valor, onChange }: { id: string; etiqueta: string; anio: number; valor: string; onChange: (v: string) => void }) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {etiqueta}
      </label>
      <select id={id} value={valor} onChange={(e) => onChange(e.target.value)} className={CLASE_SELECT}>
        <option value="">Todo el año</option>
        <optgroup label="Trimestres">
          {[1, 2, 3, 4].map((t) => (
            <option key={t} value={`${anio}-Q${t}`}>
              {nombreTrimestre(t)}
            </option>
          ))}
        </optgroup>
        <optgroup label="Meses">
          {MESES.map((m, i) => (
            <option key={m} value={`${anio}-${String(i + 1).padStart(2, '0')}`}>
              {capital(m)}
            </option>
          ))}
        </optgroup>
      </select>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pantalla
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [userEmail, setUserEmail] = useState<string>('');
  // Año en curso en España por defecto (o el de la URL, al volver al panel).
  const [selectedYear, setSelectedYear] = useState(() => anioOTodosDeUrl() ?? anioEspana());
  // Periodo de toda la pantalla (cifras, gráfico, evolución y categorías): '' (todo el año), 'AAAA-Qn' o 'AAAA-MM'.
  // Al abrir, todo el año: una venta de un trimestre anterior tiene que verse sin tocar nada.
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const periodType = tipoDePeriodo(selectedPeriod);
  // Periodo del análisis por cliente y por proveedor (el mismo formato; por defecto, todo el año).
  const [selectedAnalysisPeriod, setSelectedAnalysisPeriod] = useState('');
  const aniosEmpresa = useAniosEmpresa();
  const availableYears = aniosEmpresa.anios([selectedYear]);
  const [incomeExpenseViewType, setIncomeExpenseViewType] = useState<'income-expense' | 'result'>('income-expense');
  // Lo que deja ver y hacer su acceso en la empresa activa (se lee al montar: la sesión vive en el navegador).
  const [acceso, setAcceso] = useState<{
    cobros: boolean;
    aeat: boolean;
    arranque: boolean;
    nuevaVenta: boolean;
    nuevoGasto: boolean;
    abrirVentas: boolean;
    abrirGastos: boolean;
  } | null>(null);
  // Plazos de la AEAT del servidor (día hábil, ajustes fiscales); sin permiso de impuestos, el calendario general.
  const { vencimientos: vencimientosAeat, vencidos: vencidosAeat, vencidosPorAnio } = useVencimientosAeat(4, !!acceso?.aeat);
  // Los años con vencidos, del más antiguo al más reciente (cada uno enlaza a Estado fiscal en ese año).
  const aniosVencidos = Object.keys(vencidosPorAnio)
    .map(Number)
    .sort((a, b) => a - b);
  // Año que llevó la gestoría (traído con «Traer la contabilidad»): sus modelos los presenta ella.
  const [anioGestoria, setAnioGestoria] = useState<number | null>(null);

  // Todo sale de las facturas y las nóminas (GET /movements/stats/*), por la fecha de la factura.
  const qPeriodo = consultaPeriodo(selectedYear, selectedPeriod);
  const qAnalisis = consultaPeriodo(selectedYear, selectedAnalysisPeriod);
  const resumen = useLectura<ResumenPanel>(`/movements/stats/summary?${qPeriodo}`);
  const fiscal = useLectura<ResumenFiscalPanel>(`/movements/stats/fiscal?${qPeriodo}`);
  const categorias = useLectura<FilaCategoriaPanel[]>(`/movements/stats/by-category?${qPeriodo}`);
  // Los doce meses del año: el gráfico y la evolución mensual se quedan con los del periodo.
  const meses = useLectura<FilaMesPanel[]>(`/movements/stats/by-month?anio=${selectedYear}`);
  const ultimas = useLectura<UltimaFacturaPanel[]>(`/movements/stats/ultimas-facturas?limit=15&anio=${selectedYear}`);
  const clientes = useLectura<FilaTerceroPanel[]>(`/movements/stats/ingresos-por-cliente?${qAnalisis}`);
  const proveedores = useLectura<FilaTerceroPanel[]>(`/movements/stats/gastos-por-proveedor?${qAnalisis}`);

  useEffect(() => {
    const user = getUser();
    setUserEmail(user?.email ?? '');
    setAcceso({
      // Mismos permisos que piden las rutas del servidor.
      cobros: tieneAlgunPermiso(user, ['ventas:read', 'contabilidad:read']),
      aeat: tieneAlgunPermiso(user, ['impuestos:read', 'contabilidad:read']),
      // Aviso de la contabilidad del año anterior (GET /arranque/aviso pide contabilidad:read).
      arranque: tieneAlgunPermiso(user, ['contabilidad:read']),
      // Emitir una venta (POST /income-invoices) o registrar un gasto (POST /expense-invoices).
      nuevaVenta: tieneAlgunPermiso(user, ['ventas:write']),
      nuevoGasto: tieneAlgunPermiso(user, ['compras:write']),
      // Abrir la ficha de una venta o de un cliente, y la de un gasto o de un proveedor.
      abrirVentas: tieneAlgunPermiso(user, ['ventas:read', 'contabilidad:read']),
      abrirGastos: tieneAlgunPermiso(user, ['compras:read', 'contabilidad:read']),
    });
  }, []);

  useEffect(() => {
    if (!acceso?.aeat || !acceso.arranque) return;
    arranqueApi
      .estado()
      .then((e) => setAnioGestoria(e.llevanzaAnterior === 'EXTERNA' ? e.ejercicio - 1 : null))
      .catch(() => setAnioGestoria(null));
  }, [acceso]);

  /** Al cambiar de año se mantiene el mismo trimestre o mes del año nuevo (o «Todo el año»). */
  const cambiarAnio = (y: number) => {
    const mover = (p: string) => (PATRON_TRIMESTRE.test(p) || /^\d{4}-\d{2}$/.test(p) ? `${y}${p.slice(4)}` : p);
    setSelectedYear(y);
    ponerEnUrl({ ejercicio: y });
    setSelectedPeriod((p) => mover(p));
    setSelectedAnalysisPeriod((p) => mover(p));
  };

  const cambiarTipoPeriodo = (tipo: 'year' | 'quarters' | 'months') => {
    if (tipo === 'year') setSelectedPeriod('');
    else if (tipo === 'quarters') setSelectedPeriod(selectedYear === anioEspana() ? getCurrentQuarter() : `${selectedYear}-Q1`);
    else setSelectedPeriod(`${selectedYear}-${String(selectedYear === anioEspana() ? mesEspana() : 1).padStart(2, '0')}`);
  };

  const sinAccesoResumen = resumen.estado === 'sinAcceso';
  const r = resumen.datos;
  const f = fiscal.datos;
  const moneda = r?.monedaCuenta ?? f?.monedaCuenta ?? 'EUR';
  const importe = (n: number) => formatoImporte(n, moneda);
  // Una empresa no establecida en España no lleva IVA: sin esas cifras.
  const conIva = f?.empresaEspanola !== false;

  const filteredMonths = useMemo(() => mesesDelPeriodo(meses.datos ?? [], selectedPeriod), [meses.datos, selectedPeriod]);
  const hayFacturas = (m: FilaMesPanel) => m.facturasVenta + m.facturasGasto + m.nominas > 0;
  // El año entero sin una sola factura ni nómina: en vez de gráficas vacías, un aviso con qué hacer.
  const anioVacio = meses.estado === 'listo' && !(meses.datos ?? []).some(hayFacturas);
  const periodoVacio = !filteredMonths.some(hayFacturas);
  const maxMonthTotal = Math.max(1, ...filteredMonths.map((m) => Math.max(m.income, m.expense, 0)));
  const ancho = (v: number) => `${(Math.max(0, v) / maxMonthTotal) * 100}%`;

  const periodoTexto = nombrePeriodo(selectedYear, selectedPeriod);
  const analisisTexto = enPeriodo(selectedYear, selectedAnalysisPeriod);
  const atenuar = (l: Lectura<unknown>) => (l.estado === 'cargando' && l.datos !== null ? 'opacity-60 transition-opacity' : 'transition-opacity');

  const claseBotonPrincipal =
    'inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-accent-600 text-white text-sm font-semibold rounded-lg hover:bg-accent-700 active:scale-[0.98] transition-all';
  const claseBotonSecundario =
    'inline-flex items-center justify-center gap-1.5 px-4 py-2 border border-slate-300 bg-white text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 active:scale-[0.98] transition-all';

  // Sustituyen a «Nuevo movimiento»: los movimientos a mano ya no cuentan en el resumen.
  const accionesNuevas = (
    <>
      {acceso?.nuevoGasto && (
        <Link href="/dashboard/compras/nueva" className={claseBotonSecundario}>
          <Plus size={16} weight="bold" aria-hidden="true" /> Nuevo gasto
        </Link>
      )}
      {acceso?.nuevaVenta && (
        <Link href="/dashboard/facturas/nueva" className={claseBotonPrincipal}>
          <Plus size={16} weight="bold" aria-hidden="true" /> Nueva factura
        </Link>
      )}
    </>
  );

  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <header className="sticky top-0 z-40 h-16 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 md:px-8 h-full flex items-center justify-between gap-3">
          <div className="flex items-center gap-4 min-w-0">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors shrink-0"
            >
              <ArrowLeft size={16} aria-hidden="true" /> Web
            </Link>
            <span className="text-slate-300" aria-hidden="true">
              |
            </span>
            <h1 className="font-semibold text-slate-900 truncate">Resumen</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden lg:inline text-sm text-slate-500">{userEmail}</span>
            <div className="hidden sm:flex items-center gap-2">{accionesNuevas}</div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-8 flex flex-col gap-6 md:gap-8">
        {/* En el móvil, los botones de alta van aquí: en la cabecera no caben. */}
        {(acceso?.nuevaVenta || acceso?.nuevoGasto) && <div className="sm:hidden flex gap-2 [&>*]:flex-1">{accionesNuevas}</div>}

        {acceso?.arranque && <AvisoArranque />}
        {sinAccesoResumen && (
          <div role="status" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            Tu acceso a esta empresa no incluye el resumen general (ingresos, gastos y facturas). En el menú tienes las áreas que sí puedes
            usar.
          </div>
        )}

        {/* Plazos AEAT calculados con el calendario real a partir de hoy */}
        {acceso?.aeat && (
          <section aria-labelledby="vencimientos-aeat">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3">
              <h2 id="vencimientos-aeat" className="font-semibold text-slate-900">
                Próximos plazos AEAT
              </h2>
              <p className="text-xs text-slate-500">Si el último día cae en fin de semana o festivo nacional, ya sale el siguiente día hábil.</p>
            </div>
            {vencidosAeat > 0 && (
              <div role="status" className="mb-3 space-y-1 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                <p>
                  {vencidosAeat === 1 ? 'Hay 1 modelo' : `Hay ${vencidosAeat} modelos`} con el plazo vencido y sin presentar. Si los presentó tu
                  gestoría, márcalos como presentados fuera de la app.
                </p>
                <p>
                  Revísalos en Estado fiscal:{' '}
                  {aniosVencidos.map((anio, i) => (
                    <span key={anio}>
                      {i > 0 && (i === aniosVencidos.length - 1 ? ' y ' : ', ')}
                      <Link href={`/dashboard/fiscal/estado?ejercicio=${anio}`} className="font-medium underline">
                        {vencidosPorAnio[anio]} de {anio}
                      </Link>
                    </span>
                  ))}
                  .
                </p>
                <p>
                  ¿Empezaste a llevar los impuestos con la app hace poco?{' '}
                  <Link href="/dashboard/configuracion/impuestos" className="font-medium underline">
                    Indica desde cuándo
                  </Link>{' '}
                  y no te pediremos los de antes.
                </p>
              </div>
            )}
            {vencimientosAeat === null ? (
              <div className="h-24 animate-pulse rounded-lg bg-white border border-slate-200" />
            ) : vencimientosAeat.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">No tienes modelos en plazo pendientes de presentar.</p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {vencimientosAeat.map((alerta) => (
                  <AlertCard key={alerta.id} alert={alerta} gestoria={anioGestoria !== null && alerta.periodo.endsWith(` ${anioGestoria}`)} />
                ))}
              </div>
            )}
          </section>
        )}

        {!sinAccesoResumen && (
          <>
            {/* Filtros: año y periodo, y de dónde salen las cifras */}
            <section aria-label="Año y periodo del resumen" className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="flex items-center gap-x-4 gap-y-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-700" aria-hidden>
                    Año:
                  </span>
                  <SelectorAnio
                    id="panel-anio"
                    etiqueta=""
                    valor={selectedYear}
                    anios={availableYears}
                    onChange={(y) => y !== null && cambiarAnio(y)}
                    className={CLASE_SELECT}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label htmlFor="panel-agrupar" className="text-sm font-medium text-slate-700">
                    Período:
                  </label>
                  <select
                    id="panel-agrupar"
                    value={periodType}
                    onChange={(e) => cambiarTipoPeriodo(e.target.value as 'year' | 'quarters' | 'months')}
                    className={CLASE_SELECT}
                  >
                    <option value="year">Todo el año</option>
                    <option value="quarters">Por trimestres</option>
                    <option value="months">Por meses</option>
                  </select>
                </div>

                {periodType !== 'year' && (
                  <div className="flex items-center gap-2">
                    <select
                      aria-label={periodType === 'quarters' ? 'Trimestre' : 'Mes'}
                      value={selectedPeriod}
                      onChange={(e) => setSelectedPeriod(e.target.value)}
                      className={CLASE_SELECT}
                    >
                      {periodType === 'quarters'
                        ? [1, 2, 3, 4].map((t) => (
                            <option key={t} value={`${selectedYear}-Q${t}`}>
                              {nombreTrimestre(t)}
                            </option>
                          ))
                        : MESES.map((m, i) => (
                            <option key={m} value={`${selectedYear}-${String(i + 1).padStart(2, '0')}`}>
                              {capital(m)}
                            </option>
                          ))}
                    </select>
                  </div>
                )}
              </div>
              <p className="mt-3 text-xs text-slate-500">
                Las cifras salen de tus facturas de venta y de gasto y de las nóminas, según la fecha de cada factura, cobradas o no. Importes
                sin IVA, en {nombreMonedaPlural(moneda)}.
              </p>
            </section>

            {/* Avisos discretos: movimientos a mano que ya no cuentan y nóminas fuera de su acceso */}
            {r && (r.movimientosManuales > 0 || !r.nominasIncluidas) && (
              <div role="status" className="flex flex-col gap-1.5 -mt-2 md:-mt-4 text-sm text-slate-600">
                {r.movimientosManuales > 0 && (
                  <p className="flex items-start gap-2">
                    <Info size={16} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
                    <span>
                      {r.movimientosManuales === 1
                        ? 'El movimiento que anotaste a mano con «Nuevo movimiento» ya no cuenta aquí'
                        : `Los ${r.movimientosManuales} movimientos que anotaste a mano con «Nuevo movimiento» ya no cuentan aquí`}
                      : el resumen sale de las facturas. Puedes verlos en{' '}
                      <Link href="/dashboard/movimientos" className="font-medium underline hover:no-underline">
                        Movimientos
                      </Link>
                      .
                    </span>
                  </p>
                )}
                {!r.nominasIncluidas && (
                  <p className="flex items-start gap-2">
                    <Info size={16} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
                    <span>Los gastos no incluyen las nóminas: tu acceso no incluye los datos de personal.</span>
                  </p>
                )}
              </div>
            )}

            {/* Cifras del periodo: ingresos, gastos, resultado e IVA */}
            <section aria-labelledby="cifras-periodo" aria-busy={resumen.estado === 'cargando'}>
              <h2 id="cifras-periodo" className="sr-only">
                Cifras {enPeriodo(selectedYear, selectedPeriod)}
              </h2>
              {resumen.estado === 'error' ? (
                <ErrorBloque texto="No se ha podido cargar el resumen." error={resumen.error} onReintentar={resumen.reintentar} />
              ) : !r ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-48 rounded-xl bg-white border border-slate-200 animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 ${atenuar(resumen)}`}>
                  {/* Ingresos */}
                  <div className="rounded-xl bg-white border border-slate-200 p-6 md:p-8">
                    <p className="text-sm font-semibold text-slate-500">Ingresos · {periodoTexto}</p>
                    <p className="mt-2 text-3xl md:text-4xl font-bold text-emerald-700 break-words">{importe(r.totalIncome)}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Base sin IVA de {facturasTexto(r.facturasVenta, 'venta')}, {oNo(r.facturasVenta, 'cobrada')}.
                    </p>
                    {f && (conIva || !!f.ventas.retencion) && (
                      <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                        {conIva && <Fila etiqueta="IVA repercutido" valor={importe(f.ventas.iva)} />}
                        {!!f.ventas.retencion && <Fila etiqueta="IRPF que te retienen" valor={importe(-f.ventas.retencion)} />}
                      </div>
                    )}
                  </div>

                  {/* Gastos */}
                  <div className="rounded-xl bg-white border border-slate-200 p-6 md:p-8">
                    <p className="text-sm font-semibold text-slate-500">Gastos · {periodoTexto}</p>
                    <p className="mt-2 text-3xl md:text-4xl font-bold text-rose-600 break-words">{importe(r.totalExpense)}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Base sin IVA de {facturasTexto(r.facturasGasto, 'gasto')}
                      {r.nominas > 0 ? ` y coste de ${nominasTexto(r.nominas)}` : ''}, {oNo(r.facturasGasto + r.nominas, 'pagada')}.
                    </p>
                    <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
                      <Fila etiqueta="Facturas de gasto" valor={importe(r.gastoFacturas)} />
                      {/* Una empresa de fuera de España no lleva nóminas en la app: sin la fila, salvo que tenga alguna. */}
                      {r.nominasIncluidas && (conIva || r.nominas > 0) && (
                        <Fila
                          etiqueta="Nóminas"
                          ayuda="Coste para la empresa: bruto, dietas, indemnizaciones, Seguridad Social de la empresa y el ingreso a cuenta de la retribución en especie que asume la empresa"
                          valor={importe(r.gastoPersonal)}
                        />
                      )}
                      {f && conIva && <Fila etiqueta="IVA soportado" valor={importe(f.gastos.iva)} />}
                      {!!f?.gastos.retencion && <Fila etiqueta="Retenciones practicadas" valor={importe(f.gastos.retencion)} />}
                    </div>
                  </div>

                  {/* Resultado */}
                  <div className={`rounded-xl bg-white border-2 p-6 md:p-8 ${r.balance >= 0 ? 'border-emerald-200' : 'border-rose-200'}`}>
                    <p className="text-sm font-semibold text-slate-500">Resultado · {periodoTexto}</p>
                    <p className={`mt-2 text-3xl md:text-4xl font-bold break-words ${r.balance >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {importe(r.balance)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Ingresos menos gastos, según la fecha de las facturas.</p>
                    <p className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-500">
                      Es una cifra orientativa: no tiene en cuenta las amortizaciones ni otros apuntes que solo están en la contabilidad.
                    </p>
                  </div>

                  {/* IVA y retenciones del mismo periodo */}
                  {conIva && (
                    <div className="rounded-xl bg-white border border-slate-200 p-6 md:p-8">
                      <p className="text-sm font-semibold text-slate-500 mb-5">IVA y retenciones · {periodoTexto}</p>
                      {fiscal.estado === 'error' ? (
                        <ErrorBloque texto="No se ha podido calcular el IVA." error={fiscal.error} onReintentar={fiscal.reintentar} />
                      ) : (
                        <div className="space-y-4">
                          <div className="flex justify-between items-center gap-4 bg-emerald-50 -mx-6 md:-mx-8 px-6 md:px-8 py-3">
                            <span className="font-medium text-slate-700">
                              {f && f.ivaResultado < 0 ? 'IVA a compensar' : 'IVA a ingresar'}
                              <span className="block text-xs font-normal text-slate-500">Repercutido − soportado (orientativo)</span>
                            </span>
                            <span className="text-xl md:text-2xl font-bold text-emerald-700 whitespace-nowrap">{f ? importe(Math.abs(f.ivaResultado)) : '—'}</span>
                          </div>
                          <div className="flex justify-between items-center gap-4 bg-blue-50 -mx-6 md:-mx-8 px-6 md:px-8 py-3">
                            <span className="font-medium text-slate-700">
                              Retenciones a ingresar
                              <span className="block text-xs font-normal text-slate-500">Las que practicas en tus gastos (111/115)</span>
                            </span>
                            <span className="text-xl md:text-2xl font-bold text-blue-700 whitespace-nowrap">{f ? importe(f.retencionesAIngresar) : '—'}</span>
                          </div>
                          <p className="text-xs text-slate-500">
                            Va por la fecha de cada factura. El modelo 303 usa la fecha en que registraste cada gasto y, en las ventas, la de la
                            operación si es otra, así que puede no coincidir.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          </>
        )}

        {/* Cobros de clientes: pendiente (de cualquier año) y cobrado del año elegido.
            Solo con Ventas o Contabilidad, que es lo que pide su ruta. */}
        {acceso?.cobros && <CobrosClientes anio={selectedYear} />}

        {!sinAccesoResumen && anioVacio && (
          <section aria-labelledby="sin-facturas" className="rounded-xl bg-white border border-slate-200 p-6 md:p-8 text-center">
            <Receipt size={32} className="mx-auto text-slate-400" aria-hidden="true" />
            <h2 id="sin-facturas" className="mt-3 text-base font-semibold text-slate-900">
              Aún no hay facturas en {selectedYear}
            </h2>
            <p className="mt-2 text-sm text-slate-600 max-w-xl mx-auto">
              Las gráficas se llenan solas con las facturas de venta que emitas o registres con el lector, las facturas de gasto y las nóminas
              contabilizadas, cada una en el mes de su fecha.
            </p>
            {(acceso?.nuevaVenta || acceso?.nuevoGasto) && (
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {acceso?.nuevaVenta && (
                  <>
                    <Link href="/dashboard/facturas/nueva" className={claseBotonPrincipal}>
                      <Plus size={16} weight="bold" aria-hidden="true" /> Nueva factura
                    </Link>
                    <Link href="/dashboard/ventas/lector-ingresos" className={claseBotonSecundario}>
                      <Sparkle size={16} aria-hidden="true" /> Leer una factura de venta
                    </Link>
                  </>
                )}
                {acceso?.nuevoGasto && (
                  <>
                    <Link href="/dashboard/compras/nueva" className={claseBotonSecundario}>
                      <Plus size={16} weight="bold" aria-hidden="true" /> Nuevo gasto
                    </Link>
                    <Link href="/dashboard/compras/lector-gastos" className={claseBotonSecundario}>
                      <Sparkle size={16} aria-hidden="true" /> Leer una factura de gasto
                    </Link>
                  </>
                )}
              </div>
            )}
          </section>
        )}

        {!sinAccesoResumen && !anioVacio && (
          <>
            {/* Gráfico de ingresos y gastos por mes */}
            <section aria-labelledby="grafico-ingresos-gastos" aria-busy={meses.estado === 'cargando'} className="rounded-xl bg-white border border-slate-200 p-4 sm:p-6 md:p-8">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <h2 id="grafico-ingresos-gastos" className="text-base font-semibold text-slate-900">
                    Ingresos y gastos
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">Por mes, según la fecha de las facturas, cobradas o no. Los gastos incluyen las nóminas.</p>
                </div>
                <div className="flex gap-2" role="group" aria-label="Qué enseña el gráfico">
                  <button
                    type="button"
                    aria-pressed={incomeExpenseViewType === 'income-expense'}
                    onClick={() => setIncomeExpenseViewType('income-expense')}
                    className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      incomeExpenseViewType === 'income-expense' ? 'bg-accent-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Ingresos / Gastos
                  </button>
                  <button
                    type="button"
                    aria-pressed={incomeExpenseViewType === 'result'}
                    onClick={() => setIncomeExpenseViewType('result')}
                    className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      incomeExpenseViewType === 'result' ? 'bg-accent-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Resultado
                  </button>
                </div>
              </div>

              {/* Filtros del gráfico (los mismos del resumen de arriba) */}
              <div className="flex items-center gap-3 mb-6 flex-wrap">
                <SelectorAnio
                  id="grafico-anio"
                  etiqueta=""
                  valor={selectedYear}
                  anios={availableYears}
                  onChange={(y) => y !== null && cambiarAnio(y)}
                  className={CLASE_SELECT}
                />
                <SelectorPeriodo id="grafico-periodo" etiqueta="Trimestre o mes del gráfico" anio={selectedYear} valor={selectedPeriod} onChange={setSelectedPeriod} />
              </div>

              {meses.estado === 'error' ? (
                <ErrorBloque texto="No se ha podido cargar el gráfico." error={meses.error} onReintentar={meses.reintentar} />
              ) : !meses.datos ? (
                <div className="h-72 sm:h-96 animate-pulse bg-slate-100 rounded-lg" />
              ) : periodoVacio ? (
                <Vacio alto="h-72 sm:h-96">
                  {/* El año sí tiene facturas (si no, saldría el aviso del año vacío): se ofrece verlo entero. */}
                  <span>
                    No hay facturas {enPeriodo(selectedYear, selectedPeriod)}.{' '}
                    <button type="button" onClick={() => setSelectedPeriod('')} className="font-medium text-accent-600 underline hover:no-underline">
                      Ver todo {selectedYear}
                    </button>
                  </span>
                </Vacio>
              ) : (
                <div className={atenuar(meses)}>
                  <IncomeExpenseChart data={filteredMonths} viewType={incomeExpenseViewType} moneda={moneda} />
                </div>
              )}
            </section>

            {/* Análisis de ingresos: ventas por cliente */}
            <section aria-labelledby="analisis-ingresos" aria-busy={clientes.estado === 'cargando'} className="rounded-xl bg-white border border-slate-200 p-4 sm:p-6 md:p-8">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <h2 id="analisis-ingresos" className="text-base font-semibold text-slate-900">
                    Análisis de ingresos
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Ventas por cliente, sin IVA, según la fecha de las facturas, cobradas o no. Las rectificativas ya están restadas.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <span>Agrupar por</span>
                  <select className={CLASE_SELECT}>
                    <option>Clientes</option>
                  </select>
                </label>
              </div>

              <div className="flex items-center gap-3 mb-6 flex-wrap">
                <SelectorAnio
                  id="ingresos-anio"
                  etiqueta=""
                  valor={selectedYear}
                  anios={availableYears}
                  onChange={(y) => y !== null && cambiarAnio(y)}
                  className={CLASE_SELECT}
                />
                <SelectorPeriodo
                  id="ingresos-periodo"
                  etiqueta="Trimestre o mes del análisis"
                  anio={selectedYear}
                  valor={selectedAnalysisPeriod}
                  onChange={setSelectedAnalysisPeriod}
                />
              </div>

              {clientes.estado === 'error' ? (
                <ErrorBloque texto="No se ha podido cargar el análisis de ingresos." error={clientes.error} onReintentar={clientes.reintentar} />
              ) : !clientes.datos ? (
                <div className="h-64 sm:h-80 animate-pulse bg-slate-100 rounded-lg" />
              ) : clientes.datos.length === 0 ? (
                <Vacio alto="h-64 sm:h-80">No hay facturas de venta {analisisTexto}.</Vacio>
              ) : (
                <div className={atenuar(clientes)}>
                  <IncomeAnalysisChart clients={clientes.datos} moneda={moneda} conEnlace={!!acceso?.abrirVentas} />
                </div>
              )}
            </section>

            {/* Detalle de gastos: por proveedor y nóminas */}
            <section aria-labelledby="detalle-gastos" aria-busy={proveedores.estado === 'cargando'} className="rounded-xl bg-white border border-slate-200 p-4 sm:p-6 md:p-8">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <h2 id="detalle-gastos" className="text-base font-semibold text-slate-900">
                    Detalle de gastos
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Gastos por proveedor, sin IVA, según la fecha de las facturas, pagadas o no. Los abonos ya están restados.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <span>Agrupar por</span>
                  <select className={CLASE_SELECT}>
                    <option>Proveedores</option>
                  </select>
                </label>
              </div>

              <div className="flex items-center gap-3 mb-6 flex-wrap">
                <SelectorAnio
                  id="gastos-anio"
                  etiqueta=""
                  valor={selectedYear}
                  anios={availableYears}
                  onChange={(y) => y !== null && cambiarAnio(y)}
                  className={CLASE_SELECT}
                />
                <SelectorPeriodo
                  id="gastos-periodo"
                  etiqueta="Trimestre o mes del detalle de gastos"
                  anio={selectedYear}
                  valor={selectedAnalysisPeriod}
                  onChange={setSelectedAnalysisPeriod}
                />
              </div>

              {proveedores.estado === 'error' ? (
                <ErrorBloque texto="No se ha podido cargar el detalle de gastos." error={proveedores.error} onReintentar={proveedores.reintentar} />
              ) : !proveedores.datos ? (
                <div className="h-64 sm:h-80 animate-pulse bg-slate-100 rounded-lg" />
              ) : proveedores.datos.length === 0 ? (
                <Vacio alto="h-64 sm:h-80">No hay gastos {analisisTexto}.</Vacio>
              ) : (
                <div className={atenuar(proveedores)}>
                  <ExpenseDetailChart suppliers={proveedores.datos} moneda={moneda} conEnlace={!!acceso?.abrirGastos} />
                </div>
              )}
            </section>

            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Evolución mensual del periodo */}
              <div className="rounded-xl bg-white border border-slate-200 p-4 sm:p-6" aria-busy={meses.estado === 'cargando'}>
                <h2 className="text-base font-semibold text-slate-900">Evolución mensual</h2>
                <p className="mt-1 mb-5 text-xs text-slate-500">Ingresos menos gastos de cada mes, {enPeriodo(selectedYear, selectedPeriod)}.</p>
                {meses.estado === 'error' ? (
                  <ErrorBloque texto="No se ha podido cargar la evolución mensual." error={meses.error} onReintentar={meses.reintentar} />
                ) : !meses.datos ? (
                  <div className="h-40 animate-pulse bg-slate-100 rounded-lg" />
                ) : (
                  <ul className={`flex flex-col gap-5 ${atenuar(meses)}`}>
                    {filteredMonths.map((m) => (
                      <li key={m.month} className="flex flex-col gap-1.5">
                        <div className="flex justify-between gap-3 text-sm">
                          <span className="font-medium text-slate-700">{capital(nombreMes(m.month))}</span>
                          <span className={`font-mono ${m.balance < 0 ? 'text-rose-600' : 'text-slate-500'}`}>{importe(m.balance)}</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-emerald-500" style={{ width: ancho(m.income) }} title={`Ingresos: ${importe(m.income)}`} />
                        <div className="h-2.5 rounded-full bg-rose-400" style={{ width: ancho(m.expense) }} title={`Gastos: ${importe(m.expense)}`} />
                        <span className="sr-only">
                          Ingresos {importe(m.income)}; gastos {importe(m.expense)}.
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-5 pt-4 text-xs text-slate-500" aria-hidden="true">
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

              {/* Gastos por categoría: cuenta de gasto del plan y «Personal» */}
              <div className="rounded-xl bg-white border border-slate-200 p-4 sm:p-6" aria-busy={categorias.estado === 'cargando'}>
                <h2 className="text-base font-semibold text-slate-900">Gastos por categoría</h2>
                <p className="mt-1 mb-5 text-xs text-slate-500">Por la cuenta de gasto de cada factura, {enPeriodo(selectedYear, selectedPeriod)}. Las nóminas van en «Personal».</p>
                {categorias.estado === 'error' ? (
                  <ErrorBloque texto="No se han podido cargar las categorías." error={categorias.error} onReintentar={categorias.reintentar} />
                ) : !categorias.datos ? (
                  <div className="h-40 animate-pulse bg-slate-100 rounded-lg" />
                ) : categorias.datos.length === 0 ? (
                  <Vacio>No hay gastos {enPeriodo(selectedYear, selectedPeriod)}.</Vacio>
                ) : (
                  <ul className={`flex flex-col gap-4 ${atenuar(categorias)}`}>
                    {categorias.datos.map((c) => (
                      <li key={c.clave} className="flex flex-col gap-1.5">
                        <div className="flex justify-between gap-3 text-sm">
                          <span className="min-w-0 font-medium text-slate-700">
                            {c.category}
                            {/* Sin nombre en el plan, el servidor ya dice «Cuenta 629»: el código no se repite. */}
                            {c.cuenta && !c.category.includes(c.cuenta) && <span className="ml-1.5 font-mono text-xs font-normal text-slate-500">{c.cuenta}</span>}
                          </span>
                          <span className={`shrink-0 font-mono ${c.expense < 0 ? 'text-rose-600' : 'text-slate-500'}`}>{importe(c.expense)}</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-slate-100" aria-hidden="true">
                          <div className="h-2.5 rounded-full bg-slate-400" style={{ width: `${Math.max(0, Math.min(100, c.percentage))}%`, minWidth: c.expense > 0 ? '4px' : 0 }} />
                        </div>
                        <span className="sr-only">{c.percentage.toLocaleString('es-ES')} % del gasto.</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* Últimas facturas del año, con enlace a cada una */}
            <section aria-labelledby="ultimas-facturas" aria-busy={ultimas.estado === 'cargando'} className="rounded-xl bg-white border border-slate-200 overflow-hidden">
              <div className="px-4 sm:px-6 pt-6 pb-4">
                <h2 id="ultimas-facturas" className="text-base font-semibold text-slate-900">
                  Últimas facturas de {selectedYear}
                </h2>
                <p className="mt-1 text-xs text-slate-500">Ventas y gastos, de la más reciente a la más antigua. Importes sin IVA.</p>
              </div>
              {ultimas.estado === 'error' ? (
                <div className="px-4 sm:px-6 pb-6">
                  <ErrorBloque texto="No se han podido cargar las últimas facturas." error={ultimas.error} onReintentar={ultimas.reintentar} />
                </div>
              ) : !ultimas.datos ? (
                <div className="h-64 mx-4 sm:mx-6 mb-6 animate-pulse bg-slate-100 rounded-lg" />
              ) : ultimas.datos.length === 0 ? (
                <div className="px-4 sm:px-6 pb-6">
                  <Vacio>Aún no hay facturas en {selectedYear}.</Vacio>
                </div>
              ) : (
                <div className={atenuar(ultimas)}>
                  <UltimasFacturas
                    facturas={ultimas.datos}
                    moneda={moneda}
                    puedeAbrir={{ venta: !!acceso?.abrirVentas, gasto: !!acceso?.abrirGastos }}
                  />
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
