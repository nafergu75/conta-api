'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DataPoint {
  month: string;
  accumulated: number;
}

interface AccumulatedRevenueChartProps {
  data: DataPoint[];
  className?: string;
}

export function AccumulatedRevenueChart({ data, className = '' }: AccumulatedRevenueChartProps) {
  return (
    <div className={`w-full h-80 bg-slate-900 rounded-lg p-4 border border-slate-700 ${className}`}>
      <h3 className="text-sm font-semibold text-slate-200 mb-4">Ingresos Acumulados YTD</h3>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorAccumulated" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
              <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
            </linearGradient>
          </defs>
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
          <Area
            type="monotone"
            dataKey="accumulated"
            stroke="#10b981"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorAccumulated)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
