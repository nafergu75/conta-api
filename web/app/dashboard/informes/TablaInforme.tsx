'use client';

/**
 * Pinta en pantalla la tabla de un informe contable tal y como la devuelve el
 * backend (la misma que va al PDF y al Excel): columnas con su tipo y filas con
 * su estilo (seccion, subtotal, total, nota).
 */

export type TipoColumna = 'texto' | 'codigo' | 'fecha' | 'importe';
export type EstiloFila = 'normal' | 'seccion' | 'subtotal' | 'total' | 'nota';

export interface Tabla {
  titulo: string;
  periodo: string;
  empresa: { nombre: string; nif: string };
  columnas: Array<{ titulo: string; tipo: TipoColumna; ancho: number }>;
  filas: Array<{ celdas: Array<string | number | null>; estilo?: EstiloFila; sangria?: number }>;
  notas?: string[];
}

/** 1234.5 -> "1.234,50" (Intl en es-ES no separa los miles de 4 cifras: 1234,50). */
export const importe = (n: number) => {
  const [ent, dec] = Math.abs(n).toFixed(2).split('.');
  return `${n < 0 ? '−' : ''}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
};
export const fecha = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso);

function celda(v: string | number | null, tipo: TipoColumna, estilo: EstiloFila): string {
  if (v === null || v === '') return '';
  if (tipo === 'importe' && typeof v === 'number') return estilo === 'normal' && v === 0 ? '' : importe(v);
  if (tipo === 'fecha' && typeof v === 'string') return fecha(v);
  return String(v);
}

/** Lo que hace falta para pintarla (Carmen la manda sin los datos de la empresa). */
export type TablaPintable = Pick<Tabla, 'columnas' | 'filas' | 'notas'>;

/**
 * `compacta`: letra y márgenes más pequeños y menos ancho mínimo, para la
 * ventana de Carmen (420 px); lo que no cabe se desplaza dentro de la tabla.
 */
export function TablaInforme({ tabla, maxFilas, compacta = false }: { tabla: TablaPintable; maxFilas?: number; compacta?: boolean }) {
  const filas = maxFilas ? tabla.filas.slice(0, maxFilas) : tabla.filas;
  const pesoTotal = tabla.columnas.reduce((s, c) => s + c.ancho, 0);
  const minAncho = compacta
    ? tabla.columnas.length > 4
      ? 'min-w-[520px]'
      : 'min-w-[320px]'
    : tabla.columnas.length > 4
      ? 'min-w-[860px]'
      : 'min-w-[520px]';
  const celdaX = compacta ? 'px-2' : 'px-3';
  const primeraTexto = tabla.columnas.findIndex((c) => c.tipo === 'texto');

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className={`w-full ${minAncho} ${compacta ? 'text-xs' : 'text-sm'}`}>
          <colgroup>
            {tabla.columnas.map((c, k) => (
              <col key={k} style={{ width: `${(c.ancho / pesoTotal) * 100}%` }} />
            ))}
          </colgroup>
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {tabla.columnas.map((c, k) => (
                <th key={k} scope="col" className={`${celdaX} ${compacta ? 'py-2' : 'py-2.5'} font-medium ${c.tipo === 'importe' ? 'text-right' : ''}`}>
                  {c.titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr>
                <td colSpan={tabla.columnas.length} className="px-4 py-8 text-center text-slate-500">
                  No hay datos en este periodo.
                </td>
              </tr>
            )}
            {filas.map((f, i) => {
              const estilo = f.estilo ?? 'normal';
              if (estilo === 'seccion') {
                const texto = f.celdas.map((v, k) => celda(v, tabla.columnas[k]?.tipo ?? 'texto', estilo)).filter(Boolean).join(' · ');
                return (
                  <tr key={i} className="border-t border-slate-200 bg-slate-50">
                    <td colSpan={tabla.columnas.length} className={`${celdaX} py-2 font-semibold text-slate-900`}>
                      {texto}
                    </td>
                  </tr>
                );
              }
              const clase =
                estilo === 'total'
                  ? 'border-t-2 border-emerald-700 bg-emerald-50 font-semibold text-slate-900'
                  : estilo === 'subtotal'
                    ? 'border-t border-slate-400 font-semibold text-slate-900'
                    : estilo === 'nota'
                      ? 'border-t border-slate-100 text-slate-500'
                      : 'border-t border-slate-100 text-slate-800';
              return (
                <tr key={i} className={clase}>
                  {tabla.columnas.map((c, k) => {
                    const v = celda(f.celdas[k] ?? null, c.tipo, estilo);
                    const sangria = k === primeraTexto && f.sangria ? { paddingLeft: (compacta ? 8 : 12) + f.sangria * (compacta ? 12 : 16) } : undefined;
                    return (
                      <td
                        key={k}
                        style={sangria}
                        className={`${celdaX} py-1.5 align-top ${c.tipo === 'importe' ? 'whitespace-nowrap text-right font-mono tabular-nums' : ''} ${c.tipo === 'codigo' || c.tipo === 'fecha' ? `whitespace-nowrap font-mono ${compacta ? 'text-[11px]' : 'text-[13px]'}` : ''}`}
                      >
                        {v}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {maxFilas && tabla.filas.length > maxFilas && (
        <p className="text-sm text-slate-500">
          Se muestran las primeras {maxFilas} filas de {tabla.filas.length}. Descarga el PDF o el Excel para verlo entero.
        </p>
      )}
      {tabla.notas?.map((n, i) => (
        <p key={i} className={`text-xs ${n.startsWith('Atención') ? 'font-medium text-red-700' : 'text-slate-500'}`}>
          {n}
        </p>
      ))}
    </div>
  );
}
