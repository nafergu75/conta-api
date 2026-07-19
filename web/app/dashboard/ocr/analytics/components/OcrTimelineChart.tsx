'use client';

import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface TimelineData {
  date: string;
  count: number;
  completed: number;
  failed: number;
}

interface OcrTimelineChartProps {
  data: TimelineData[];
  isLoading?: boolean;
}

export function OcrTimelineChart({ data, isLoading }: OcrTimelineChartProps) {
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

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">PDFs por día</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            stroke="#9ca3af"
          />
          <YAxis
            tick={{ fontSize: 12 }}
            stroke="#9ca3af"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
            }}
            formatter={(value) => [value, '']}
            labelFormatter={(label) => `Fecha: ${label}`}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="count"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ fill: '#3b82f6', r: 4 }}
            name="Total"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="completed"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ fill: '#10b981', r: 4 }}
            name="Completados"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="failed"
            stroke="#ef4444"
            strokeWidth={2}
            dot={{ fill: '#ef4444', r: 4 }}
            name="Fallidos"
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
