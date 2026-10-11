'use client';

import { useEffect, useMemo, useState } from 'react';
import { MagnifyingGlass, X } from '@phosphor-icons/react';
import { apiFetch, errorMessage } from '@/lib/api';
import { ejercicioAnualAPresentar } from '@/lib/aeatCalendar';
import { FormPresentar } from '../components/FormPresentar';
import {
  CabeceraBorrador,
  Cargando,
  Cifra,
  DescargarFichero,
  ErrorCarga,
  ErroresYAvisos,
  eur,
  rutaBorrador,
  SelectorEjercicio,
} from '../components/BorradorAeat';

interface Declarado {
  nif: string;
  nifFichero: string;
  nombre: string;
  clave: 'A' | 'B';
  provincia: string | null;
  importeAnual: number;
  trimestres: [number, number, number, number];
  metalico?: number;
  arrendamiento?: boolean;
}

interface Borrador347 {
  ejercicio: number;
  diseno: string;
  revisar: string;
  declarante: { nif: string; razonSocial: string; telefono: string; contacto: string; numeroIdentificativo: string };
  resumen: { numeroDeclarados: number; importeTotal: number; numeroInmuebles: number; importeArrendamientos: number };
  declarados: Declarado[];
  advertencias: string[];
  errores: string[];
}

const CLAVES: Record<string, string> = { A: 'A · Compras', B: 'B · Ventas' };

export default function Modelo347Page() {
  // Modelo anual: se presenta por el ejercicio anterior.
  const [ejercicio, setEjercicio] = useState(ejercicioAnualAPresentar);
  const [borrador, setBorrador] = useState<Borrador347 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  // Persona de contacto y teléfono del registro del declarante (posiciones 59-107).
  const [contacto, setContacto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [aplicados, setAplicados] = useState({ contacto: '', telefono: '' });

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    setError('');
    apiFetch<Borrador347>(rutaBorrador('347', ejercicio, aplicados))
      .then((b) => vivo && setBorrador(b))
      .catch((e) => vivo && setError(errorMessage(e)))
      .finally(() => vivo && setLoading(false));
    return () => {
      vivo = false;
    };
  }, [ejercicio, aplicados]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = borrador?.declarados ?? [];
    return q ? lista.filter((d) => d.nombre.toLowerCase().includes(q) || d.nif.toLowerCase().includes(q)) : lista;
  }, [borrador, busqueda]);

  if (loading && !borrador) return <Cargando />;
  if (error || !borrador) return <ErrorCarga mensaje={error || 'No se ha podido preparar el borrador.'} />;

  const b = borrador;
  return (
    <div className="space-y-6">
      <CabeceraBorrador
        titulo="Modelo 347 · Operaciones con terceras personas"
        subtitulo="Clientes y proveedores con los que has operado más de 3.005,06 € en el año (IVA incluido)."
        diseno={`Borrador con el diseño oficial de la AEAT «${b.diseno}». ${b.revisar}`}
      />

      <div className="grid gap-4 rounded-lg border border-slate-200 bg-white p-4 md:grid-cols-[auto_1fr_1fr_auto] md:items-end">
        <SelectorEjercicio ejercicio={ejercicio} onChange={setEjercicio} />
        <label className="block text-sm font-medium text-slate-700">
          Persona de contacto
          <input
            value={contacto}
            onChange={(e) => setContacto(e.target.value)}
            placeholder="Primer apellido, segundo apellido y nombre"
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Teléfono de contacto
          <input
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder={b.declarante.telefono || '9 cifras'}
            inputMode="tel"
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="button"
          onClick={() => setAplicados({ contacto: contacto.trim(), telefono: telefono.trim() })}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Aplicar
        </button>
      </div>

      <ErroresYAvisos errores={b.errores} advertencias={b.advertencias} ejercicio={ejercicio} />

      {/* Registro de tipo 1: declarante y resumen */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-900">Declarante</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-slate-500">NIF</dt>
            <dd className="font-mono">{b.declarante.nif || '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Razón social</dt>
            <dd>{b.declarante.razonSocial || '—'}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Persona de contacto y teléfono</dt>
            <dd>
              {b.declarante.contacto || '—'} · {b.declarante.telefono || '—'}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Número identificativo</dt>
            <dd className="font-mono">{b.declarante.numeroIdentificativo}</dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Cifra etiqueta="Número total de personas y entidades" valor={String(b.resumen.numeroDeclarados)} />
        <Cifra etiqueta="Importe total de las operaciones" valor={eur.format(b.resumen.importeTotal)} />
        <Cifra etiqueta="Número total de inmuebles" valor={String(b.resumen.numeroInmuebles)} />
        <Cifra etiqueta="Importe de arrendamientos de locales" valor={eur.format(b.resumen.importeArrendamientos)} />
      </div>

      {/* Registros de tipo 2: declarados */}
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-900">
            Declarados ({filtrados.length} de {b.declarados.length})
          </h2>
          <div className="relative w-full sm:w-72">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o NIF"
              aria-label="Buscar declarado"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-9 text-sm"
            />
            {busqueda && (
              <button type="button" onClick={() => setBusqueda('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" title="Limpiar búsqueda">
                <X size={16} />
              </button>
            )}
          </div>
        </div>
        {b.declarados.length === 0 ? (
          <p className="text-sm text-slate-600">Nadie supera 3.005,06 € en {ejercicio}: no hace falta presentar el 347.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600">
                  <th className="py-2 text-left font-medium">NIF</th>
                  <th className="py-2 text-left font-medium">Nombre o razón social</th>
                  <th className="py-2 text-left font-medium">Provincia</th>
                  <th className="py-2 text-left font-medium">Clave</th>
                  <th className="py-2 text-right font-medium">Importe anual</th>
                  <th className="py-2 text-right font-medium">1T</th>
                  <th className="py-2 text-right font-medium">2T</th>
                  <th className="py-2 text-right font-medium">3T</th>
                  <th className="py-2 text-right font-medium">4T</th>
                  <th className="py-2 text-right font-medium">En metálico</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((d) => (
                  <tr key={`${d.clave}-${d.nifFichero || d.nif}-${d.arrendamiento ? 'X' : ''}`} className="border-b border-slate-100">
                    <td className="py-2 font-mono">{d.nifFichero || d.nif || '—'}</td>
                    <td className="py-2">
                      {d.nombre}
                      {d.arrendamiento && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">Arrendamiento de local</span>}
                    </td>
                    <td className={`py-2 font-mono ${d.provincia ? '' : 'text-red-700'}`}>{d.provincia ?? 'Falta'}</td>
                    <td className="py-2">{CLAVES[d.clave] ?? d.clave}</td>
                    <td className="py-2 text-right font-medium tabular-nums">{eur.format(d.importeAnual)}</td>
                    {d.trimestres.map((t, i) => (
                      <td key={i} className="py-2 text-right tabular-nums">
                        {eur.format(t)}
                      </td>
                    ))}
                    <td className="py-2 text-right tabular-nums">{d.metalico ? eur.format(d.metalico) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="rounded-lg border-l-4 border-l-blue-500 bg-blue-50 p-4 text-sm text-blue-900">
        Se declaran los clientes (clave B) y proveedores (clave A) que superan 3.005,06 € en el año, con IVA. No entran las compras con
        retención de IRPF (van en el 190 o el 180) ni las operaciones con el extranjero (las intracomunitarias van en el 349). El fichero se importa en la sede de la AEAT
        (presentación mediante fichero).
      </div>

      <div className="space-y-4">
        <DescargarFichero ruta={rutaBorrador('347', ejercicio, aplicados, true)} nombre={`347_${ejercicio}.txt`} bloqueado={b.errores.length > 0} />
        <FormPresentar codigo="347" ejercicio={ejercicio} />
      </div>
    </div>
  );
}
