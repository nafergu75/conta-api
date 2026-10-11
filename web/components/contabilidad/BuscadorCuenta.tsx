'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { sinTildes } from '@/lib/subcuentas';

/**
 * Campo de cuenta para los informes (Libro mayor, Sumas y saldos) con
 * sugerencias del plan contable de la empresa: se puede escribir el codigo
 * (572) o buscar por el nombre («banco», «luz», el de un cliente) y elegir.
 * El valor del campo es siempre un codigo (solo digitos); lo que no es codigo
 * solo sirve para buscar.
 *
 * Lee el plan de GET /accounting/chart-of-accounts (contabilidad:read, el mismo
 * permiso que los informes). Si no se puede leer, el campo sigue admitiendo el
 * codigo escrito a mano.
 */

interface CuentaPlan {
  codigo: string;
  nombre: string;
  activo: boolean;
}

/** El plan de cada empresa se lee una vez y se reutiliza unos minutos (los dos campos del rango lo comparten). */
const cache = new Map<string, { hasta: number; promesa: Promise<CuentaPlan[]> }>();
const VIGENCIA_MS = 5 * 60 * 1000;

function leerPlan(): Promise<CuentaPlan[]> {
  const ruta = companyPath('/accounting/chart-of-accounts');
  const hit = cache.get(ruta);
  if (hit && hit.hasta > Date.now()) return hit.promesa;
  const promesa = apiFetch<{ cuentas: CuentaPlan[] }>(ruta).then((r) =>
    (r.cuentas ?? []).map((c) => ({ codigo: c.codigo, nombre: c.nombre, activo: c.activo !== false })).sort((a, b) => a.codigo.localeCompare(b.codigo)),
  );
  cache.set(ruta, { hasta: Date.now() + VIGENCIA_MS, promesa });
  promesa.catch(() => cache.delete(ruta));
  return promesa;
}

const MAXIMO = 50;
const soloDigitos = (s: string) => /^\d+$/.test(s);

export function BuscadorCuenta({
  id,
  valor,
  onCambiar,
  placeholder,
  derecha = false,
}: {
  id: string;
  /** Codigo de la cuenta (solo digitos; vacio = ninguna). */
  valor: string;
  onCambiar: (codigo: string) => void;
  placeholder?: string;
  /** En el movil la lista se abre hacia la izquierda (para el campo de la columna derecha). */
  derecha?: boolean;
}) {
  const [texto, setTexto] = useState(valor);
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(-1);
  const [plan, setPlan] = useState<CuentaPlan[] | null>(null);
  const [error, setError] = useState('');
  const caja = useRef<HTMLDivElement>(null);

  // Si el codigo cambia desde fuera (un enlace, otro informe), el campo lo enseña.
  useEffect(() => {
    setTexto((t) => (valor ? valor : soloDigitos(t.trim()) ? '' : t));
  }, [valor]);

  // El plan se pide la primera vez que se usa el campo.
  const cargar = () => {
    if (plan || error) return;
    leerPlan()
      .then(setPlan)
      .catch((e) => setError(errorMessage(e)));
  };

  // Un clic fuera cierra la lista.
  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);

  const t = texto.trim();
  const coinciden = useMemo(() => {
    if (!plan || !t) return [];
    if (soloDigitos(t)) return plan.filter((c) => c.codigo.startsWith(t));
    const q = sinTildes(t);
    return plan.filter((c) => sinTildes(c.nombre).includes(q));
  }, [plan, t]);
  const visibles = coinciden.slice(0, MAXIMO);

  const elegir = (codigo: string) => {
    setTexto(codigo);
    onCambiar(codigo);
    setAbierto(false);
    setActiva(-1);
  };

  const listaId = `${id}-lista`;
  const verLista = abierto && !!t;

  return (
    <div ref={caja} className="relative">
      <input
        id={id}
        value={texto}
        onFocus={() => {
          cargar();
          setAbierto(true);
        }}
        onChange={(e) => {
          const v = e.target.value;
          setTexto(v);
          setAbierto(true);
          setActiva(-1);
          cargar();
          // Lo que no es un codigo solo busca: la cuenta del informe queda vacia hasta elegir una.
          onCambiar(soloDigitos(v.trim()) ? v.trim() : '');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setAbierto(false);
            setActiva(-1);
          } else if (e.key === 'ArrowDown' && visibles.length) {
            e.preventDefault();
            setAbierto(true);
            setActiva((i) => Math.min(i + 1, visibles.length - 1));
          } else if (e.key === 'ArrowUp' && visibles.length) {
            e.preventDefault();
            setActiva((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter') {
            if (verLista && activa >= 0 && visibles[activa]) {
              e.preventDefault();
              elegir(visibles[activa].codigo);
            } else if (t && !soloDigitos(t)) {
              // Con un nombre escrito, Intro no lanza el informe: elige si solo hay una que coincide.
              e.preventDefault();
              if (coinciden.length === 1) elegir(coinciden[0].codigo);
            } else {
              // Con un codigo, Intro lanza el informe como siempre.
              setAbierto(false);
            }
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={verLista}
        aria-controls={listaId}
        aria-activedescendant={verLista && activa >= 0 ? `${id}-op-${activa}` : undefined}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
      />
      {verLista && (
        <ul
          id={listaId}
          role="listbox"
          aria-label="Cuentas del plan"
          className={`absolute z-30 mt-1 max-h-72 w-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-slate-200 bg-white text-sm shadow-lg ${
            derecha ? 'right-0 sm:left-0 sm:right-auto' : 'left-0'
          }`}
        >
          {error ? (
            <li className="px-3 py-2 text-slate-600">No se ha podido leer el plan contable ({error}). Escribe el código de la cuenta.</li>
          ) : !plan ? (
            <li className="px-3 py-2 text-slate-500">Cargando el plan contable…</li>
          ) : visibles.length === 0 ? (
            <li className="px-3 py-2 text-slate-500">Ninguna cuenta coincide con «{t}».</li>
          ) : (
            <>
              {visibles.map((c, i) => (
                <li
                  key={c.codigo}
                  id={`${id}-op-${i}`}
                  role="option"
                  aria-selected={i === activa}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => elegir(c.codigo)}
                  onMouseEnter={() => setActiva(i)}
                  className={`flex cursor-pointer gap-2 border-t border-slate-100 px-3 py-2 first:border-t-0 ${i === activa ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                >
                  <span className="shrink-0 font-mono text-slate-600">{c.codigo}</span>
                  <span className="min-w-0 flex-1 text-slate-800">
                    {c.nombre}
                    {!c.activo && <span className="text-slate-500"> (desactivada)</span>}
                  </span>
                </li>
              ))}
              {coinciden.length > MAXIMO && (
                <li className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
                  Hay {coinciden.length} cuentas que coinciden: sigue escribiendo para afinar.
                </li>
              )}
            </>
          )}
        </ul>
      )}
    </div>
  );
}
