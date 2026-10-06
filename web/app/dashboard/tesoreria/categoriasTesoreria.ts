// Tipos y utilidades de las categorias analiticas de tesoreria (compartidos por
// las pantallas de categorias y de cobros y pagos).

export type TipoCategoria = 'INGRESO' | 'GASTO';

export interface Categoria {
  id: string;
  tipo: TipoCategoria;
  nombre: string;
  color: string;
  ivaPorcentaje: number | null;
  activa: boolean;
  parentId: string | null;
  hijas: Categoria[];
}

/** Lista plana (padre seguido de sus hijas) con el nombre completo "Operación › Suministros". */
export function aplanar(arbol: Categoria[], tipo?: TipoCategoria, soloActivas = false) {
  const out: Array<Categoria & { ruta: string; nivel: number }> = [];
  for (const c of arbol) {
    if (tipo && c.tipo !== tipo) continue;
    if (soloActivas && !c.activa) continue;
    out.push({ ...c, ruta: c.nombre, nivel: 0 });
    for (const h of c.hijas) {
      if (soloActivas && !h.activa) continue;
      out.push({ ...h, ruta: `${c.nombre} › ${h.nombre}`, nivel: 1 });
    }
  }
  return out;
}

export const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

/** IVA contenido en un importe con IVA incluido (1.210 al 21 % -> 210). */
export function ivaIncluido(importe: number, porcentaje: number | null | undefined): number {
  if (!porcentaje) return 0;
  return Math.round(((importe * porcentaje) / (100 + porcentaje)) * 100) / 100;
}

export const COLORES = ['#16a34a', '#0d9488', '#0891b2', '#0ea5e9', '#2563eb', '#4f46e5', '#7c3aed', '#9333ea', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#059669', '#64748b'];
