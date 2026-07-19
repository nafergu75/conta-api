'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface DataPoint {
  month: string;
  ingresos: number;
  gastos: number;
}

interface MonthlyRevenueChartProps {
  data: DataPoint[];
  className?: string;
}

export function MonthlyRevenueChart({ data, className = '' }: MonthlyRevenueChartProps) {
  return (
    <div className={`w-full h-80 bg-slate-900 rounded-lg p-4 border border-slate-700 ${className}`}>
      <h3 className="text-sm font-semibold text-slate-200 mb-4">Ingresos vs Gastos (Últimos 6 meses)</h3>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="month" stroke="#94a3b8" style={{ fontSize: '12px' }} />
          <YAxis stroke="#94a3b8" style={{ fontSize: '12px' }} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#e2e8f0'
            }}
            formatter={(value) => typeof value === 'number' ? `€${value.toLocaleString('es-ES')}` : '-'}
          />
          <Legend wrapperStyle={{ color: '#cbd5e1' }} />
          <Bar dataKey="ingresos" fill="#10b981" name="Ingresos" radius={[4, 4, 0, 0]} />
          <Bar dataKey="gastos" fill="#f87171" name="Gastos" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
