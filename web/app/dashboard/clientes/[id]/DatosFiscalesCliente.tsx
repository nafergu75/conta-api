'use client';

import { useState } from 'react';
import { CheckCircle, PencilSimple, WarningCircle } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { nombrePais, PAISES, PAISES_UE, pareceNifIvaUe } from '@/lib/fiscal';
import { NOMBRE_MONEDA } from '@/lib/moneda';

/**
 * Pais, direccion y moneda preferida del cliente. El pais decide el tipo de
 * operacion de IVA que se sugiere al facturarle (nacional, intracomunitaria,
 * exportacion...); la moneda solo se propone en el formulario de la factura.
 */

export interface DatosFiscales {
  id: string;
  nombreFiscal: string;
  nifCif: string;
  pais?: string;
  direccion?: string;
  cp?: string;
  municipio?: string;
  provincia?: string;
  monedaPreferida?: string | null;
}

const campo = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const etq = 'mb-1 block text-xs font-medium text-slate-600';

export function DatosFiscalesCliente({ cliente, onGuardado }: { cliente: DatosFiscales; onGuardado: (c: DatosFiscales) => void }) {
  const puedeEditar = tieneAlgunPermiso(getUser(), ['ventas:write']);
  const [editando, setEditando] = useState(false);
  const [d, setD] = useState({
    pais: cliente.pais || 'ES',
    nifCif: cliente.nifCif,
    direccion: cliente.direccion ?? '',
    cp: cliente.cp ?? '',
    municipio: cliente.municipio ?? '',
    provincia: cliente.provincia ?? '',
    monedaPreferida: cliente.monedaPreferida ?? '',
  });
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const ue = d.pais !== 'ES' && PAISES_UE.has(d.pais);
  const s = (k: keyof typeof d) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD((x) => ({ ...x, [k]: e.target.value }));

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setMensaje(null);
    try {
      const c = await apiFetch<DatosFiscales>(companyPath(`/clientes/${cliente.id}`), {
        method: 'PUT',
        body: JSON.stringify({ ...d, monedaPreferida: d.monedaPreferida || null }),
      });
      onGuardado({ ...cliente, ...c });
      setEditando(false);
      setMensaje({ ok: true, texto: 'Datos guardados.' });
    } catch (err) {
      setMensaje({ ok: false, texto: errorMessage(err) });
    } finally {
      setGuardando(false);
    }
  };

  if (!editando) {
    const poblacion = [cliente.cp, cliente.municipio].filter(Boolean).join(' ');
    return (
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid flex-1 grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">País</p>
              <p className="font-medium text-slate-900">{nombrePais(cliente.pais || 'ES')}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Dirección</p>
              <p className="text-slate-900">{cliente.direccion || '—'}</p>
              {(poblacion || cliente.provincia) && (
                <p className="text-slate-600">
                  {poblacion}
                  {cliente.provincia ? ` (${cliente.provincia})` : ''}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Moneda al facturarle</p>
              <p className="text-slate-900">
                {cliente.monedaPreferida ? `${cliente.monedaPreferida} — ${NOMBRE_MONEDA[cliente.monedaPreferida] ?? ''}` : 'La de la contabilidad'}
              </p>
            </div>
          </div>
          {puedeEditar && (
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <PencilSimple size={16} /> Editar
            </button>
          )}
        </div>
        {mensaje && (
          <p className={`mt-3 flex items-center gap-2 text-sm ${mensaje.ok ? 'text-green-700' : 'text-red-700'}`}>
            {mensaje.ok ? <CheckCircle size={16} /> : <WarningCircle size={16} />} {mensaje.texto}
          </p>
        )}
      </section>
    );
  }

  return (
    <form onSubmit={guardar} className="mb-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold text-slate-900">Datos fiscales y dirección</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        <div>
          <label htmlFor="cli-pais" className={etq}>País</label>
          <select id="cli-pais" value={d.pais} onChange={s('pais')} className={campo}>
            {PAISES.map(([c, n]) => (
              <option key={c} value={c}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cli-nif" className={etq}>
            {d.pais === 'ES' ? 'NIF/CIF' : ue ? 'NIF-IVA (con el prefijo del país)' : 'Identificación fiscal (Tax ID)'}
          </label>
          <input id="cli-nif" value={d.nifCif} onChange={s('nifCif')} className={`${campo} font-mono`} />
          {ue && d.nifCif.trim() && !pareceNifIvaUe(d.nifCif) && (
            <p className="mt-1 text-xs text-amber-700">Falta el prefijo del país (p. ej. FR…, DE…; EL para Grecia).</p>
          )}
        </div>
        <div>
          <label htmlFor="cli-moneda" className={etq}>Moneda al facturarle</label>
          <select id="cli-moneda" value={d.monedaPreferida} onChange={s('monedaPreferida')} className={campo}>
            <option value="">La de la contabilidad</option>
            <option value="EUR">EUR — Euro</option>
            <option value="USD">USD — Dólar estadounidense</option>
          </select>
        </div>
        <div className="sm:col-span-2 md:col-span-3">
          <label htmlFor="cli-dir" className={etq}>Dirección</label>
          <input id="cli-dir" value={d.direccion} onChange={s('direccion')} className={campo} />
        </div>
        <div>
          <label htmlFor="cli-cp" className={etq}>Código postal</label>
          <input id="cli-cp" value={d.cp} onChange={s('cp')} className={campo} />
        </div>
        <div>
          <label htmlFor="cli-mun" className={etq}>Municipio</label>
          <input id="cli-mun" value={d.municipio} onChange={s('municipio')} className={campo} />
        </div>
        <div>
          <label htmlFor="cli-prov" className={etq}>{d.pais === 'ES' ? 'Provincia' : 'Región o estado'}</label>
          <input id="cli-prov" value={d.provincia} onChange={s('provincia')} className={campo} />
        </div>
      </div>
      {mensaje && !mensaje.ok && (
        <p role="alert" className="text-sm text-red-700">
          {mensaje.texto}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => setEditando(false)}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancelar
        </button>
        <button type="submit" disabled={guardando} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
