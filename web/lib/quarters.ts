import { anioEspana, rangoFechas, trimestreEspana } from './anios';

/**
 * Trimestres del filtro del panel. Las fechas van como texto AAAA-MM-DD: con
 * `new Date(...).toISOString()` el 1 de enero en España salía 31 de diciembre.
 */
export interface Quarter {
  value: string;
  label: string;
  /** AAAA-MM-DD */
  start: string;
  /** AAAA-MM-DD */
  end: string;
}

/** Trimestre como valor de filtro: '2027-Q1'. */
export const PATRON_TRIMESTRE = /^\d{4}-Q[1-4]$/;

export function getQuartersForYear(year: number): Quarter[] {
  return [1, 2, 3, 4].map((q) => {
    const { desde, hasta } = rangoFechas(year, q);
    return { value: `${year}-Q${q}`, label: `T${q} ${year}`, start: desde, end: hasta };
  });
}

/** Trimestre en curso en España: '2027-Q1'. */
export function getCurrentQuarter(): string {
  return `${anioEspana()}-Q${trimestreEspana()}`;
}

export function getQuarterRange(quarterValue: string): { start: string; end: string } {
  const [year, q] = quarterValue.split('-Q');
  const { desde, hasta } = rangoFechas(parseInt(year, 10), parseInt(q, 10));
  return { start: desde, end: hasta };
}

/** ¿La fecha (AAAA-MM-DD) o el mes (AAAA-MM) cae en el trimestre? */
export function isDateInQuarter(date: string, quarterValue: string): boolean {
  const { start, end } = getQuarterRange(quarterValue);
  if (/^\d{4}-\d{2}$/.test(date)) return date >= start.slice(0, 7) && date <= end.slice(0, 7);
  return date >= start && date <= end;
}
