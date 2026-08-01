'use client';

import { useState } from 'react';
import { Calendar } from '@phosphor-icons/react';

interface SelectRangoProps {
  onRangeChange: (from: string, to: string) => void;
  loading?: boolean;
}

export function SelectRango({ onRangeChange, loading }: SelectRangoProps) {
  const currentYear = new Date().getFullYear();
  const [mode, setMode] = useState<'rango' | 'año'>('año');
  const [year, setYear] = useState(currentYear);
  const [fromDate, setFromDate] = useState(
    `${currentYear}-01-01`
  );
  const [toDate, setToDate] = useState(
    `${currentYear}-12-31`
  );

  const handleModeChange = (newMode: 'rango' | 'año') => {
    setMode(newMode);
    if (newMode === 'año') {
      const from = `${year}-01-01`;
      const to = `${year}-12-31`;
      onRangeChange(from, to);
    } else {
      onRangeChange(fromDate, toDate);
    }
  };

  const handleYearChange = (newYear: number) => {
    setYear(newYear);
    const from = `${newYear}-01-01`;
    const to = `${newYear}-12-31`;
    onRangeChange(from, to);
  };

  const handleDateRangeChange = (
    field: 'from' | 'to',
    value: string
  ) => {
    if (field === 'from') {
      setFromDate(value);
      onRangeChange(value, toDate);
    } else {
      setToDate(value);
      onRangeChange(fromDate, value);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center gap-2">
        <Calendar size={18} className="text-slate-500" />
        <h3 className="font-medium text-slate-900">Período</h3>
      </div>

      {/* Mode Selector */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => handleModeChange('año')}
          disabled={loading}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
            mode === 'año'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          } disabled:opacity-50`}
        >
          Por Año
        </button>
        <button
          onClick={() => handleModeChange('rango')}
          disabled={loading}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
            mode === 'rango'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
          } disabled:opacity-50`}
        >
          Rango
        </button>
      </div>

      {/* Modo Año */}
      {mode === 'año' && (
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-600">Año:</label>
          <select
            value={year}
            onChange={(e) => handleYearChange(Number(e.target.value))}
            disabled={loading}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
          >
            {[2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Modo Rango */}
      {mode === 'rango' && (
        <div className="space-y-3">
          <div className="flex flex-col gap-2">
            <label className="text-sm text-slate-600">Desde:</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => handleDateRangeChange('from', e.target.value)}
              disabled={loading}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm text-slate-600">Hasta:</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => handleDateRangeChange('to', e.target.value)}
              disabled={loading}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
            />
          </div>
        </div>
      )}
    </div>
  );
}
