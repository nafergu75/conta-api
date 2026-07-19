'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface ClientData {
  name: string;
  total: number;
  letter: string;
}

interface IncomeAnalysisChartProps {
  clients: ClientData[];
}

const COLORS = [
  '#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ec4899',
  '#3b82f6', '#14b8a6', '#f97316', '#6366f1', '#a855f7',
];

export function IncomeAnalysisChart({ clients }: IncomeAnalysisChartProps) {
  const eur = (n: number) =>
    n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

  // Preparar datos para el gráfico
  const chartData = clients.map((c, idx) => ({
    letter: c.letter,
    total: c.total,
    name: c.name,
    color: COLORS[idx % COLORS.length],
  }));

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico */}
        <div className="lg:col-span-2 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="letter" stroke="#64748b" style={{ fontSize: '12px' }} />
              <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#e2e8f0',
                }}
                formatter={(value) => typeof value === 'number' ? eur(value) : '-'}
                labelFormatter={(label) => `Cliente ${label}`}
              />
              <Bar dataKey="total" radius={[8, 8, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Leyenda */}
        <div className="bg-slate-50 rounded-lg p-4 overflow-y-auto max-h-80">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Ranking de Clientes</h3>
          <div className="space-y-2">
            {clients.map((client, idx) => (
              <div key={client.name} className="flex items-center gap-2 text-sm">
                <div
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-slate-900 font-medium truncate">{client.name}</p>
                </div>
                <p className="text-slate-700 font-semibold whitespace-nowrap">{eur(client.total)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
