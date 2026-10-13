'use client';

import type { FilaTerceroPanel } from '@/lib/panel';
import { RankingTercerosChart } from './RankingTercerosChart';

interface ExpenseDetailChartProps {
  /** GET /movements/stats/gastos-por-proveedor: base de los gastos por proveedor y la fila «Personal (nóminas)». */
  suppliers: FilaTerceroPanel[];
  moneda?: string;
  /** Si quien mira puede abrir la ficha del proveedor. */
  conEnlace?: boolean;
}

/** Gastos del periodo por proveedor (base sin IVA, con los abonos restados) y el coste de las nóminas. */
export function ExpenseDetailChart({ suppliers, moneda = 'EUR', conEnlace = false }: ExpenseDetailChartProps) {
  return (
    <RankingTercerosChart
      filas={suppliers}
      moneda={moneda}
      tituloLista="Proveedores"
      // La fila de las nóminas no tiene proveedor (id null).
      unidad={(f) => (f.id === null ? ['nómina', 'nóminas'] : ['factura', 'facturas'])}
      enlace={conEnlace ? (f) => (f.id ? `/dashboard/proveedores/${f.id}` : null) : undefined}
    />
  );
}
