'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface ClientData {
  name: string;
  total: number;
}

interface TopClientsChartProps {
  data: ClientData[];
  className?: string;
}

export function TopClientsChart({ data, className = '' }: TopClientsChartProps) {
  return (
    <div className={`w-full h-80 bg-slate-900 rounded-lg p-4 border border-slate-700 ${className}`}>
      <h3 className="text-sm font-semibold text-slate-200 mb-4">Top 5 Clientes por Facturación</h3>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 200, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis type="number" stroke="#94a3b8" style={{ fontSize: '12px' }} />
          <YAxis dataKey="name" type="category" stroke="#94a3b8" width={190} style={{ fontSize: '11px' }} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#e2e8f0'
            }}
            formatter={(value) => typeof value === 'number' ? `€${value.toLocaleString('es-ES')}` : '-'}
          />
          <Bar dataKey="total" fill="#06b6d4" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
