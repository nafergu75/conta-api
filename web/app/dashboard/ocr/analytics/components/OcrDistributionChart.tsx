'use client';

import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';

interface DistributionData {
  type: string;
  count: number;
  completed: number;
  failed: number;
  successRate: number;
}

interface OcrDistributionChartProps {
  data: DistributionData[];
  isLoading?: boolean;
}

const COLORS = {
  expense: '#3b82f6',
  income: '#10b981',
};

export function OcrDistributionChart({ data, isLoading }: OcrDistributionChartProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 h-80 flex items-center justify-center">
        <div className="text-gray-400">Cargando datos...</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6 h-80 flex items-center justify-center">
        <div className="text-gray-400">Sin datos para mostrar</div>
      </div>
    );
  }

  // Preparar datos para el gráfico de pie
  const pieData = data.map((item) => ({
    name: item.type === 'expense' ? 'Gastos' : 'Ingresos',
    value: item.count,
    type: item.type,
  }));

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Distribución por tipo</h3>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, value }) => `${name}: ${value}`}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            {pieData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[entry.type as keyof typeof COLORS] || '#9ca3af'}
              />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>

      {/* Tabla de detalles */}
      <div className="mt-6 border-t border-gray-200 pt-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-600 font-medium">
              <th className="text-left py-2">Tipo</th>
              <th className="text-center py-2">Total</th>
              <th className="text-center py-2">Completados</th>
              <th className="text-center py-2">Fallidos</th>
              <th className="text-right py-2">Tasa Éxito</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.map((row) => (
              <tr key={row.type} className="text-gray-900">
                <td className="py-2 font-medium">
                  {row.type === 'expense' ? '💰 Gastos' : '📊 Ingresos'}
                </td>
                <td className="text-center py-2">{row.count}</td>
                <td className="text-center py-2 text-green-600">{row.completed}</td>
                <td className="text-center py-2 text-red-600">{row.failed}</td>
                <td className="text-right py-2 font-semibold text-blue-600">
                  {row.successRate}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
