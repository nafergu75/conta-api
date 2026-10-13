'use client';

import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine, ResponsiveContainer } from 'recharts';
import { formatoImporte } from '@/lib/moneda';
import { cifraCompacta, mesCorto, nombreMes } from '@/lib/panel';

interface MonthData {
  /** AAAA-MM */
  month: string;
  income: number;
  expense: number;
}

interface IncomeExpenseChartProps {
  /** Los meses del periodo elegido (uno, tres o doce), tal como los da el servidor. */
  data: MonthData[];
  viewType: 'income-expense' | 'result';
  /** Moneda de cuenta de la empresa (EUR o USD). */
  moneda?: string;
}

const VERDE = '#10b981';
const ROJO = '#e11d48';

/**
 * Barras de ingresos y gastos (o del resultado) de cada mes. Admite importes
 * negativos (un mes con solo rectificativas). Los lectores de pantalla tienen
 * la misma información en una tabla oculta.
 */
export function IncomeExpenseChart({ data, viewType, moneda = 'EUR' }: IncomeExpenseChartProps) {
  const filas = data.map((item) => ({
    month: mesCorto(item.month),
    nombre: nombreMes(item.month),
    income: item.income,
    expense: item.expense,
    result: Math.round((item.income - item.expense) * 100) / 100,
  }));
  const importe = (v: unknown) => (typeof v === 'number' ? formatoImporte(v, moneda) : '—');
  const hayNegativos = filas.some((f) => (viewType === 'result' ? f.result < 0 : f.income < 0 || f.expense < 0));

  return (
    <div className="grafico-panel w-full">
      <div className="h-72 sm:h-96" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={filas} margin={{ top: 20, right: 8, left: 0, bottom: 0 }} accessibilityLayer={false}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: '12px' }} />
            <YAxis stroke="#64748b" style={{ fontSize: '12px' }} tickFormatter={cifraCompacta} width={56} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                color: '#e2e8f0',
              }}
              itemStyle={{ color: '#e2e8f0' }}
              labelStyle={{ color: '#f8fafc', fontWeight: 600 }}
              formatter={(value) => importe(value)}
              labelFormatter={(_, payload) => {
                const nombre = payload?.[0]?.payload?.nombre;
                return typeof nombre === 'string' ? nombre.charAt(0).toUpperCase() + nombre.slice(1) : '';
              }}
            />
            {(hayNegativos || viewType === 'result') && <ReferenceLine y={0} stroke="#94a3b8" />}

            {viewType === 'income-expense' ? (
              <>
                {/* Sin ordenar por nombre: primero Ingresos y después Gastos, como las barras. */}
                <Legend itemSorter={null} wrapperStyle={{ color: '#64748b', paddingTop: '12px', fontSize: '13px' }} />
                <Bar dataKey="income" fill={VERDE} name="Ingresos" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" fill={ROJO} name="Gastos" radius={[4, 4, 0, 0]} />
              </>
            ) : (
              <Bar dataKey="result" name="Resultado" radius={[4, 4, 0, 0]}>
                {filas.map((f) => (
                  <Cell key={f.month} fill={f.result < 0 ? ROJO : VERDE} />
                ))}
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* sr-only en un div: en la tabla no recorta su ancho y en el móvil la página se salía por el lado. */}
      <div className="sr-only">
        <table>
          <caption>{viewType === 'result' ? 'Resultado de cada mes' : 'Ingresos y gastos de cada mes'}</caption>
          <thead>
            <tr>
              <th scope="col">Mes</th>
              <th scope="col">Ingresos</th>
              <th scope="col">Gastos</th>
              <th scope="col">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.month}>
                <th scope="row">{f.nombre}</th>
                <td>{importe(f.income)}</td>
                <td>{importe(f.expense)}</td>
                <td>{importe(f.result)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
