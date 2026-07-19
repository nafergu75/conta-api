'use client';

import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';

interface StateData {
  name: string;
  value: number;
  color: string;
}

interface InvoiceStateChartProps {
  data: StateData[];
  className?: string;
}

export function InvoiceStateChart({ data, className = '' }: InvoiceStateChartProps) {
  return (
    <div className={`w-full h-80 bg-slate-900 rounded-lg p-4 border border-slate-700 ${className}`}>
      <h3 className="text-sm font-semibold text-slate-200 mb-4">Facturas por Estado</h3>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#e2e8f0'
            }}
            formatter={(value) => typeof value === 'number' ? value : '-'}
          />
          <Legend wrapperStyle={{ color: '#cbd5e1', paddingTop: '20px' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
