'use client';

import { useMemo, useState } from 'react';
import { formatoImporte } from '@/lib/moneda';

/** Casilla del 303 tal como la da el servidor: número, descripción oficial e importe (los mismos que el fichero). */
export interface Casilla303 {
  pagina: '01' | '03';
  numero: string;
  seccion: string;
  concepto: string;
  columna: string;
  formula?: string;
  descripcion: string;
  valor: number;
  unidad: 'eur' | 'porcentaje';
}

interface Fila {
  concepto: string;
  casillas: Casilla303[];
}

interface Seccion {
  titulo: string;
  pagina: '01' | '03';
  filas: Fila[];
}

/** Casillas que se ven siempre, aunque estén a cero: totales y resultado. */
const SIEMPRE = new Set(['27', '45', '46', '64', '66', '69', '71']);

// Mismo formato que el resto de la app: punto de miles también en cuatro cifras (1.500,00 €).
const eur = { format: (n: number) => formatoImporte(n, 'EUR') };
const pct = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Agrupa las casillas como en el formulario de la AEAT: por bloque (IVA
 * devengado, IVA deducible, información adicional, resultado) y, dentro, una
 * fila por concepto con sus columnas (base, tipo, cuota). Una fila nueva
 * empieza cuando cambia el concepto o vuelve a salir la columna de la base.
 * Un bloque que vuelve a salir más adelante (el «Resultado» de la página 3
 * viene en dos trozos) se junta con el primero: cada bloque sale una sola vez,
 * en el orden en que aparece por primera vez.
 */
function agrupar(casillas: Casilla303[]): Seccion[] {
  const secciones: Seccion[] = [];
  const porClave = new Map<string, Seccion>();
  for (const c of casillas) {
    const clave = `${c.pagina}-${c.seccion}`;
    let s = porClave.get(clave);
    if (!s) {
      s = { titulo: c.seccion, pagina: c.pagina, filas: [] };
      secciones.push(s);
      porClave.set(clave, s);
    }
    const ultima = s.filas[s.filas.length - 1];
    const empiezaBase = /^Base/.test(c.columna) && !!ultima?.casillas.length;
    if (!ultima || ultima.concepto !== c.concepto || empiezaBase) s.filas.push({ concepto: c.concepto, casillas: [c] });
    else ultima.casillas.push(c);
  }
  return secciones;
}

const conImporte = (f: Fila) => f.casillas.some((c) => c.unidad === 'eur' && Math.round(c.valor * 100) !== 0);
const visible = (f: Fila) => conImporte(f) || f.casillas.some((c) => SIEMPRE.has(c.numero));

function Valor({ c }: { c: Casilla303 }) {
  if (c.unidad === 'porcentaje') return <>{pct.format(c.valor)} %</>;
  return <span className={c.valor < 0 ? 'text-red-700' : undefined}>{eur.format(c.valor)}</span>;
}

/** Casillas del borrador del 303 con su número y la descripción del diseño 2026 de la AEAT. */
export function Casillas303({ casillas }: { casillas: Casilla303[] }) {
  const [todas, setTodas] = useState(false);
  const secciones = useMemo(() => agrupar(casillas), [casillas]);
  const ocultas = secciones.reduce((a, s) => a + s.filas.filter((f) => !visible(f)).length, 0);

  return (
    <section className="space-y-4" aria-labelledby="casillas-303">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <h2 id="casillas-303" className="text-xl font-bold text-slate-900">
            Casillas del modelo 303
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Con la numeración y los textos del diseño de registro 2026 de la AEAT. Son los importes que lleva el fichero.
          </p>
        </div>
        {ocultas > 0 && (
          <button type="button" onClick={() => setTodas((v) => !v)} className="text-sm font-medium text-blue-700 hover:text-blue-800">
            {todas ? 'Ver solo las casillas con importe' : `Ver todas las casillas (${ocultas} filas a cero)`}
          </button>
        )}
      </div>

      {secciones.map((s) => {
        const filas = todas ? s.filas : s.filas.filter(visible);
        if (!filas.length) return null;
        return (
          <div key={`${s.pagina}-${s.titulo}`} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <h3 className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800">
              {s.titulo} <span className="font-normal text-slate-500">· página {Number(s.pagina)}</span>
            </h3>
            <ul className="divide-y divide-slate-100">
              {filas.map((f, i) => (
                <li key={`${i}-${f.casillas.map((c) => c.numero).join('-')}`} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-center">
                  <div className="text-sm text-slate-700">
                    {f.concepto}
                    {f.casillas[0]?.formula && <span className="block text-xs text-slate-500">{f.casillas[0].formula}</span>}
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-2 md:justify-end">
                    {f.casillas.map((c) => (
                      <div key={c.numero} className="min-w-[8rem] text-right" title={c.descripcion}>
                        <div className="text-xs text-slate-500">
                          {c.columna && <span>{c.columna} </span>}
                          <span className="font-mono font-semibold text-slate-700">[{c.numero}]</span>
                        </div>
                        <div className={`text-sm tabular-nums ${SIEMPRE.has(c.numero) ? 'font-bold text-slate-900' : 'font-medium text-slate-800'}`}>
                          <Valor c={c} />
                        </div>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
