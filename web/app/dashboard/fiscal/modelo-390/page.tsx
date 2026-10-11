'use client';

import { useEffect, useState } from 'react';
import { apiFetch, errorMessage } from '@/lib/api';
import { ejercicioAnualAPresentar } from '@/lib/aeatCalendar';
import { Declaraciones } from '../components/Declaraciones';
import {
  CabeceraBorrador,
  Cargando,
  Cifra,
  DescargarFichero,
  ErrorCarga,
  ErroresYAvisos,
  eur,
  PaginaCasillas,
  rutaBorrador,
  SelectorEjercicio,
  type PaginaBorrador,
} from '../components/BorradorAeat';

interface Borrador390 {
  ejercicio: number;
  diseno: string;
  revisar: string;
  paginas: PaginaBorrador[];
  casillas: Record<string, number | string>;
  liquidaciones: { casilla85: number; casilla95: number; casilla97: number; casilla98: number; casilla662: number; finales: number[] };
  paginasNoGeneradas: Array<{ codigo: string; motivo: string }>;
  advertencias: string[];
  errores: string[];
}

const num = (c: Record<string, number | string>, k: string) => (typeof c[k] === 'number' ? (c[k] as number) : 0);

/** [87] y [118] son porcentajes con 2 decimales implícitos. */
const FORMATO = {
  '87': (v: number | string) => `${(Number(v) / 100).toLocaleString('es-ES', { minimumFractionDigits: 2 })} %`,
  '118': (v: number | string) => `${(Number(v) / 100).toLocaleString('es-ES', { minimumFractionDigits: 2 })} %`,
};

export default function Modelo390Page() {
  // Modelo anual: se presenta por el ejercicio anterior.
  const [ejercicio, setEjercicio] = useState(ejercicioAnualAPresentar);
  const [ultimoPeriodo, setUltimoPeriodo] = useState<'compensar' | 'devolver'>('compensar');
  const [borrador, setBorrador] = useState<Borrador390 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    setError('');
    apiFetch<Borrador390>(rutaBorrador('390', ejercicio, { ultimoPeriodo }))
      .then((b) => vivo && setBorrador(b))
      .catch((e) => vivo && setError(errorMessage(e)))
      .finally(() => vivo && setLoading(false));
    return () => {
      vivo = false;
    };
  }, [ejercicio, ultimoPeriodo, recarga]);

  if (loading && !borrador) return <Cargando />;
  if (error || !borrador) return <ErrorCarga mensaje={error || 'No se ha podido preparar el borrador.'} />;

  const b = borrador;
  const c = b.casillas;
  const trimestres = b.liquidaciones.finales;

  return (
    <div className="space-y-6">
      <CabeceraBorrador
        titulo="Modelo 390 · Resumen anual del IVA"
        subtitulo="Resumen del IVA devengado y deducible del año, el resultado de los 303 y el volumen de operaciones."
        diseno={`Borrador con el diseño oficial de la AEAT, versión ${b.diseno}. ${b.revisar}`}
      />

      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <SelectorEjercicio ejercicio={ejercicio} onChange={setEjercicio} />
        <label className="block text-sm font-medium text-slate-700">
          Si el último periodo salió negativo
          <select
            value={ultimoPeriodo}
            onChange={(e) => setUltimoPeriodo(e.target.value as 'compensar' | 'devolver')}
            className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="compensar">Lo dejé a compensar [97]</option>
            <option value="devolver">Pedí la devolución [98]</option>
          </select>
        </label>
      </div>

      <ErroresYAvisos errores={b.errores} advertencias={b.advertencias} ejercicio={ejercicio} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Cifra etiqueta="[47] Total cuotas devengadas" valor={eur.format(num(c, '47'))} />
        <Cifra etiqueta="[64] Suma de deducciones" valor={eur.format(num(c, '64'))} />
        <Cifra etiqueta="[65] Resultado del régimen general" valor={eur.format(num(c, '65'))} />
        <Cifra etiqueta="[86] Resultado de la liquidación" valor={eur.format(num(c, '86'))} nota={`Con [85] compensado del año anterior: ${eur.format(num(c, '85'))}`} />
        <Cifra etiqueta="[95] Total a ingresar en los 303" valor={eur.format(num(c, '95'))} />
        <Cifra etiqueta="[97] / [98] Último periodo" valor={eur.format(num(c, '97') || num(c, '98'))} nota={num(c, '98') ? 'A devolver' : 'A compensar'} />
        <Cifra etiqueta="[662] Pendiente de compensar" valor={eur.format(num(c, '662'))} />
        <Cifra etiqueta="[108] Volumen de operaciones" valor={eur.format(num(c, '108'))} />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-900">Resultado de los 303 del año</h2>
        <p className="mt-1 text-sm text-slate-600">Sirve para comprobar que el 390 cuadra con lo que presentaste cada trimestre.</p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {trimestres.map((t, i) => (
            <Cifra key={i} etiqueta={`${i + 1}T`} valor={eur.format(t)} nota={t > 0 ? 'A ingresar' : t < 0 ? 'Negativo' : 'Sin actividad o compensado'} />
          ))}
        </div>
      </section>

      <div className="space-y-3">
        {b.paginas.map((p) => (
          <PaginaCasillas key={p.codigo} pagina={p} formato={FORMATO} />
        ))}
      </div>

      {b.paginasNoGeneradas.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <h2 className="font-semibold text-slate-900">Páginas que no van en el fichero</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {b.paginasNoGeneradas.map((p) => (
              <li key={p.codigo}>
                <span className="font-mono">{p.codigo}</span>: {p.motivo}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="space-y-4">
        <DescargarFichero ruta={rutaBorrador('390', ejercicio, { ultimoPeriodo }, true)} nombre={`390_${ejercicio}.txt`} bloqueado={b.errores.length > 0} />
        <Declaraciones codigo="390" ejercicio={ejercicio} opcionesPresentar={{ ultimoPeriodo }} recarga={recarga} onCambio={() => setRecarga((n) => n + 1)} />
      </div>
    </div>
  );
}
