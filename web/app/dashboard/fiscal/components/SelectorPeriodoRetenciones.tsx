'use client';

/**
 * Periodo del 111 y del 115: los cuatro trimestres y, para quien declara cada
 * mes (grandes empresas y Administraciones públicas), los meses 01 a 12.
 * El valor es el que espera el servidor: '1T'..'4T' o '01'..'12'.
 */

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export const PERIODOS_TRIMESTRALES = ['1T', '2T', '3T', '4T'];
export const PERIODOS_MENSUALES = MESES.map((_, i) => String(i + 1).padStart(2, '0'));

/** '3T' -> '3T'; '3' -> '3T'; '05' o '5' (con mensual) -> '05'. null si no vale. */
export function normalizarPeriodo(valor: string | null | undefined): string | null {
  const v = String(valor ?? '').toUpperCase().trim();
  if (/^[1-4]T$/.test(v)) return v;
  if (/^(0?[1-9]|1[0-2])$/.test(v)) return v.padStart(2, '0');
  return null;
}

/** Texto del periodo: «3T» o «Mayo (05)». */
export function textoPeriodo(periodo: string): string {
  if (/^[1-4]T$/.test(periodo)) return periodo;
  const mes = Number(periodo);
  return mes >= 1 && mes <= 12 ? `${MESES[mes - 1]} (${periodo})` : periodo;
}

/** Ultimo mes del periodo (para enlazar con Nóminas): 3T -> 9, 05 -> 5. */
export function mesFinalPeriodo(periodo: string): number {
  return /^[1-4]T$/.test(periodo) ? Number(periodo[0]) * 3 : Number(periodo);
}

export function SelectorPeriodoRetenciones({ id, valor, onChange }: { id: string; valor: string; onChange: (periodo: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        Periodo
      </label>
      <select id={id} value={valor} onChange={(e) => onChange(e.target.value)} className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm">
        <optgroup label="Trimestral">
          {PERIODOS_TRIMESTRALES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </optgroup>
        <optgroup label="Mensual (grandes empresas)">
          {PERIODOS_MENSUALES.map((p) => (
            <option key={p} value={p}>
              {textoPeriodo(p)}
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}
