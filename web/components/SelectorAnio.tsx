'use client';

/**
 * Desplegable de año común a todas las pantallas (spec arranque-2027, A.3).
 *
 * - Los años van de mayor a menor (los da useAniosEmpresa).
 * - El año elegido sale siempre, aunque no esté en la lista (llega por la URL
 *   o desde otra pantalla).
 * - Con `todos`, la primera opción es ese texto («Todos los años») y vale null.
 */

interface Props {
  id: string;
  valor: number | null;
  anios: number[];
  onChange: (anio: number | null) => void;
  /** Texto de la etiqueta. Vacío: sin etiqueta visible (queda para lectores de pantalla). */
  etiqueta?: string;
  /** Texto de la opción «todos los años». Sin él, no se ofrece. */
  todos?: string;
  /** Texto que se añade a un año (por ejemplo, «(cerrado)»). */
  sufijo?: (anio: number) => string;
  disabled?: boolean;
  /** Clases del select (por defecto, las del resto de filtros). */
  className?: string;
  /** Clases de la etiqueta. */
  claseEtiqueta?: string;
}

const CLASE_SELECT = 'mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900';
const CLASE_ETIQUETA = 'block text-sm font-medium text-slate-700';

export function aniosConElegido(anios: number[], valor: number | null): number[] {
  if (valor === null || anios.includes(valor)) return anios;
  return [...anios, valor].sort((a, b) => b - a);
}

export default function SelectorAnio({ id, valor, anios, onChange, etiqueta = 'Ejercicio', todos, sufijo, disabled, className, claseEtiqueta }: Props) {
  const lista = aniosConElegido(anios, valor);
  return (
    <div>
      <label htmlFor={id} className={etiqueta ? claseEtiqueta ?? CLASE_ETIQUETA : 'sr-only'}>
        {etiqueta || 'Año'}
      </label>
      <select
        id={id}
        value={valor === null ? '' : String(valor)}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className={className ?? CLASE_SELECT}
      >
        {todos !== undefined && <option value="">{todos}</option>}
        {lista.map((a) => (
          <option key={a} value={a}>
            {a}
            {sufijo ? ` ${sufijo(a)}`.trimEnd() : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
