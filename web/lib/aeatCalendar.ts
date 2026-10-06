/**
 * Plazos generales de presentacion de la AEAT para una pyme con ejercicio
 * natural. Son los plazos ordinarios: si el ultimo dia cae en sabado, domingo
 * o festivo nacional, la AEAT lo traslada al siguiente dia habil, y eso no se
 * calcula aqui. Por eso la UI los presenta como fecha orientativa.
 */

export interface VencimientoAeat {
  id: string;
  modelo: string;
  periodo: string;
  fechaVencimiento: Date;
  diasFaltantes: number;
  enlace: string;
}

interface Plazo {
  modelo: string;
  periodo: string;
  fecha: Date;
  enlace: string;
}

const TRIMESTRALES = [
  { codigo: '303', nombre: 'Modelo 303' },
  { codigo: '111', nombre: 'Modelo 111' },
  { codigo: '115', nombre: 'Modelo 115' },
];

function plazosDelAnio(anio: number): Plazo[] {
  const plazos: Plazo[] = [];

  // Trimestrales: T1-T3 hasta el dia 20 del mes siguiente; T4 hasta el 30 de enero.
  const finTrimestre: Array<[string, Date]> = [
    [`1T ${anio}`, new Date(anio, 3, 20)],
    [`2T ${anio}`, new Date(anio, 6, 20)],
    [`3T ${anio}`, new Date(anio, 9, 20)],
    [`4T ${anio}`, new Date(anio + 1, 0, 30)],
  ];
  for (const { codigo, nombre } of TRIMESTRALES) {
    for (const [periodo, fecha] of finTrimestre) {
      plazos.push({ modelo: nombre, periodo, fecha, enlace: `/dashboard/fiscal/modelo-${codigo}` });
    }
  }

  // Anuales del ejercicio `anio`, que se presentan al ano siguiente.
  plazos.push(
    { modelo: 'Modelo 390', periodo: `Ejercicio ${anio}`, fecha: new Date(anio + 1, 0, 30), enlace: '/dashboard/fiscal/modelo-390' },
    { modelo: 'Modelo 190', periodo: `Ejercicio ${anio}`, fecha: new Date(anio + 1, 0, 31), enlace: '/dashboard/fiscal/modelo-190' },
    // Hasta el ultimo dia de febrero.
    { modelo: 'Modelo 347', periodo: `Ejercicio ${anio}`, fecha: new Date(anio + 1, 2, 0), enlace: '/dashboard/fiscal/modelo-347' },
    // Impuesto sobre Sociedades: 25 dias naturales tras los 6 meses del cierre.
    { modelo: 'Modelo 200', periodo: `Ejercicio ${anio}`, fecha: new Date(anio + 1, 6, 25), enlace: '/dashboard/fiscal/modelo-200' },
  );

  return plazos;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** Los proximos `n` plazos a partir de `hoy` (incluido), ordenados por fecha. */
export function proximosVencimientos(hoy: Date = new Date(), n = 4): VencimientoAeat[] {
  const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const anio = hoy.getFullYear();

  return [...plazosDelAnio(anio - 1), ...plazosDelAnio(anio)]
    .filter((p) => p.fecha.getTime() >= inicioHoy.getTime())
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
    .slice(0, n)
    .map((p) => ({
      id: `${p.modelo}-${p.periodo}`,
      modelo: p.modelo,
      periodo: p.periodo,
      fechaVencimiento: p.fecha,
      diasFaltantes: Math.round((p.fecha.getTime() - inicioHoy.getTime()) / DIA_MS),
      enlace: p.enlace,
    }));
}
