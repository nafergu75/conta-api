'use client';

interface ReportRow {
  label: string;
  value: string | number;
  percentage?: number;
  trend?: 'up' | 'down' | 'neutral';
  bold?: boolean;
  subItems?: ReportRow[];
}

interface ReportTableProps {
  rows: ReportRow[];
  columns?: string[];
  title?: string;
}

export function ReportTable({ rows, columns, title }: ReportTableProps) {
  const formatCurrency = (value: string | number) => {
    if (typeof value === 'string') return value;
    return value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      {title && <div className="px-6 py-4 bg-gray-50 border-b border-gray-200 font-semibold text-gray-900">{title}</div>}

      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">Concepto</th>
            <th className="px-6 py-3 text-right text-sm font-semibold text-gray-900">Importe (€)</th>
            {columns && columns.map((col) => (
              <th key={col} className="px-6 py-3 text-right text-sm font-semibold text-gray-900">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {rows.map((row, idx) => (
            <div key={idx}>
              <tr className={row.bold ? 'bg-gray-100' : ''}>
                <td className={`px-6 py-3 text-sm ${row.bold ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
                  {row.label}
                </td>
                <td className={`px-6 py-3 text-sm text-right ${row.bold ? 'font-bold text-gray-900' : 'text-gray-900'}`}>
                  {formatCurrency(row.value)}
                </td>
                {row.percentage !== undefined && (
                  <td className="px-6 py-3 text-sm text-right text-gray-600">{row.percentage.toFixed(1)}%</td>
                )}
              </tr>
              {row.subItems && row.subItems.map((subItem, subIdx) => (
                <tr key={`${idx}-${subIdx}`} className="bg-gray-50">
                  <td className="px-6 py-3 text-sm text-gray-600 pl-12">{subItem.label}</td>
                  <td className="px-6 py-3 text-sm text-right text-gray-600">{formatCurrency(subItem.value)}</td>
                </tr>
              ))}
            </div>
          ))}
        </tbody>
      </table>
    </div>
  );
}
