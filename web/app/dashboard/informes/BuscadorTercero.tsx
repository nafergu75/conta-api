'use client';

import { useEffect, useRef, useState } from 'react';
import { MagnifyingGlass, X } from '@phosphor-icons/react';
import { errorMessage } from '@/lib/api';
import { buscarTerceros, type TerceroEncontrado } from '@/lib/subcuentas';

/**
 * Buscador de un cliente o proveedor por nombre, NIF o subcuenta, para sacar
 * el Libro mayor de sus subcuentas. Con uno elegido se ve su nombre y un
 * boton para quitarlo.
 */
export function BuscadorTercero({
  elegido,
  onElegir,
  id = 'inf-tercero',
}: {
  elegido: { nombre: string; nif: string | null; tipo: 'cliente' | 'proveedor'; subcuentas: string[] } | null;
  onElegir: (t: TerceroEncontrado | null) => void;
  id?: string;
}) {
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<TerceroEncontrado[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);

  // Busca en el servidor 250 ms despues de dejar de escribir.
  useEffect(() => {
    const texto = q.trim();
    if (texto.length < 2) {
      setResultados(null);
      setError('');
      return;
    }
    let vigente = true;
    const t = setTimeout(() => {
      setBuscando(true);
      buscarTerceros(texto)
        .then((r) => vigente && (setResultados(r), setError('')))
        .catch((e) => vigente && setError(errorMessage(e)))
        .finally(() => vigente && setBuscando(false));
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [q]);

  // Un clic fuera cierra la lista.
  useEffect(() => {
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);

  if (elegido) {
    return (
      <div className="mt-1 flex min-h-[38px] items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm">
        <span className="min-w-0 flex-1">
          <span className="font-medium text-slate-900">{elegido.nombre || 'Cargando…'}</span>
          <span className="text-slate-600">
            {' '}
            · {elegido.tipo === 'cliente' ? 'Cliente' : 'Proveedor'}
            {elegido.nif ? ` · ${elegido.nif}` : ''}
            {elegido.subcuentas.length > 0 && <span className="font-mono"> · {elegido.subcuentas.join(' y ')}</span>}
          </span>
        </span>
        <button
          type="button"
          onClick={() => {
            onElegir(null);
            setQ('');
          }}
          className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          aria-label="Quitar el cliente o proveedor elegido"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div ref={caja} className="relative">
      <div className="relative mt-1">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          id={id}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setAbierto(true);
          }}
          onFocus={() => setAbierto(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setAbierto(false);
            if (e.key === 'Enter') {
              // Intro elige el primero, sin enviar el formulario.
              e.preventDefault();
              if (resultados?.[0]) {
                onElegir(resultados[0]);
                setAbierto(false);
              }
            }
          }}
          placeholder="Nombre, NIF o subcuenta"
          autoComplete="off"
          role="combobox"
          aria-expanded={abierto && !!resultados}
          aria-controls={`${id}-lista`}
          className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
        />
      </div>
      {abierto && q.trim().length >= 2 && (
        <ul
          id={`${id}-lista`}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white text-sm shadow-lg"
        >
          {error ? (
            <li className="px-3 py-2 text-red-700">{error}</li>
          ) : buscando && !resultados ? (
            <li className="px-3 py-2 text-slate-500">Buscando…</li>
          ) : resultados && resultados.length === 0 ? (
            <li className="px-3 py-2 text-slate-500">Ningún cliente ni proveedor coincide con «{q.trim()}».</li>
          ) : (
            resultados?.map((t) => (
              <li key={`${t.tipo}-${t.id}`} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => {
                    onElegir(t);
                    setAbierto(false);
                  }}
                  className="flex w-full flex-col items-start gap-0.5 border-t border-slate-100 px-3 py-2 text-left hover:bg-slate-50"
                >
                  <span className="font-medium text-slate-900">{t.nombre}</span>
                  <span className="text-xs text-slate-500">
                    {t.tipo === 'cliente' ? 'Cliente' : 'Proveedor'}
                    {t.nif ? ` · ${t.nif}` : ''}
                    {t.subcuentas.length ? <span className="font-mono"> · {t.subcuentas.join(' y ')}</span> : ' · sin subcuenta'}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
