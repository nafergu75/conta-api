'use client';

import type { FilaTerceroPanel } from '@/lib/panel';
import { RankingTercerosChart } from './RankingTercerosChart';

interface IncomeAnalysisChartProps {
  /** GET /movements/stats/ingresos-por-cliente: base de las ventas por cliente, de mayor a menor. */
  clients: FilaTerceroPanel[];
  moneda?: string;
  /** Si quien mira puede abrir la ficha del cliente. */
  conEnlace?: boolean;
}

/** Ventas del periodo por cliente (base sin IVA, con las rectificativas restadas). */
export function IncomeAnalysisChart({ clients, moneda = 'EUR', conEnlace = false }: IncomeAnalysisChartProps) {
  return (
    <RankingTercerosChart
      filas={clients}
      moneda={moneda}
      tituloLista="Clientes"
      enlace={conEnlace ? (f) => (f.id ? `/dashboard/clientes/${f.id}` : null) : undefined}
    />
  );
}
