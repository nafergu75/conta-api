'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface MonthData {
  month: string;
  income: number;
  expense: number;
}

interface IncomeExpenseChartProps {
  data: MonthData[];
  viewType: 'income-expense' | 'result';
}

export function IncomeExpenseChart({ data, viewType }: IncomeExpenseChartProps) {
  // Formatear datos para mostrar meses abreviados
  const formattedData = data.map((item) => {
    const date = new Date(item.month + '-01');
    return {
      month: date.toLocaleDateString('es-ES', { month: 'short' }).replace('.', ''),
      income: item.income,
      expense: item.expense,
      result: item.income - item.expense,
    };
  });

  const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  // Si no hay datos suficientes, rellenar con meses vacíos
  const allMonthsData = monthNames.map((monthName, idx) => {
    const existing = formattedData.find((d) => d.month.toLowerCase().startsWith(monthName.toLowerCase()));
    return (
      existing || {
        month: monthName,
        income: 0,
        expense: 0,
        result: 0,
      }
    );
  });

  return (
    <div className="w-full h-96">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={allMonthsData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: '12px' }} />
          <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              color: '#e2e8f0',
            }}
            formatter={(value) => typeof value === 'number' ? `€${(value / 1000).toFixed(1)}K` : '-'}
          />
          <Legend wrapperStyle={{ color: '#64748b', paddingTop: '20px' }} />

          {viewType === 'income-expense' ? (
            <>
              <Bar dataKey="income" fill="#10b981" name="profit" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" fill="#dc2626" name="loss" radius={[4, 4, 0, 0]} />
            </>
          ) : (
            <Bar
              dataKey="result"
              fill="#3b82f6"
              name="Resultado"
              radius={[4, 4, 0, 0]}
              formatter={(value) => typeof value === 'number' ? `€${(value / 1000).toFixed(1)}K` : '-'}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
