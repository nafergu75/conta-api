'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, MagnifyingGlass, X, Trash } from '@phosphor-icons/react';
import { getToken, clearSession, getCompanyId } from '@/lib/auth';
import { nombrePais, PAISES, PAISES_UE, pareceNifIvaUe } from '@/lib/fiscal';

const API = '/api/conta';

interface Cliente {
  id: string;
  nombreFiscal: string;
  nifCif: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  provincia?: string;
  pais?: string;
  monedaPreferida?: string | null;
}

export default function ClientesPage() {
  const router = useRouter();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);

  const loadClientes = useCallback(async () => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`${API}/companies/${getCompanyId()}/clientes?limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.status === 401) {
        clearSession();
        router.replace('/login');
        return;
      }
      if (!r.ok) throw new Error(`Error ${r.status}`);
      const j = await r.json();
      setClientes(j.data.items ?? j.data ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadClientes();
  }, [loadClientes]);

  const filtered = useMemo(() => {
    return clientes.filter((c) =>
      c.nombreFiscal.toLowerCase().includes(search.toLowerCase()) ||
      c.nifCif.includes(search)
    );
  }, [clientes, search]);

  return (
    <div>
      <header className="sticky top-0 z-40 h-16 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 md:px-8 h-full flex items-center justify-between">
          <h1 className="font-semibold text-slate-900">Clientes</h1>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent-600 text-white text-sm font-semibold rounded-lg hover:bg-accent-700 active:scale-[0.98] transition-all"
          >
            <Plus size={16} weight="bold" /> Nuevo cliente
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-8 flex flex-col gap-6">
        {/* Buscador */}
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Buscar cliente
          </label>
          <div className="relative">
            <MagnifyingGlass
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              placeholder="Buscar por nombre o NIF..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-9 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                title="Limpiar búsqueda"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 p-4 text-sm">
            {error}
          </div>
        )}

        {/* Grid de clientes */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-48 rounded-xl bg-white border border-slate-200 animate-pulse"
              />
            ))
          ) : filtered.length === 0 ? (
            <div className="col-span-full rounded-xl bg-slate-50 border border-slate-200 p-12 text-center">
              <p className="text-slate-600 font-medium mb-2">
                {search ? 'Sin resultados' : 'Sin clientes'}
              </p>
              <p className="text-sm text-slate-500 mb-4">
                {search
                  ? 'Prueba con otro término de búsqueda'
                  : 'Crea el primer cliente para comenzar'}
              </p>
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-accent-600 hover:text-accent-700"
              >
                <Plus size={16} /> Nuevo cliente
              </button>
            </div>
          ) : (
            filtered.map((cliente) => (
              <div
                key={cliente.id}
                className="rounded-xl bg-white border border-slate-200 p-5 hover:border-emerald-300 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">
                      {cliente.nombreFiscal}
                    </h3>
                    <p className="text-sm font-mono text-slate-500">
                      {cliente.nifCif}
                      {cliente.pais && cliente.pais !== 'ES' && (
                        <span className="ml-2 font-sans">{nombrePais(cliente.pais)}</span>
                      )}
                      {cliente.monedaPreferida && <span className="ml-2 font-sans">· {cliente.monedaPreferida}</span>}
                    </p>
                  </div>
                  <button
                    className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors shrink-0"
                    aria-label="Eliminar cliente"
                  >
                    <Trash size={16} />
                  </button>
                </div>

                <div className="space-y-2 text-sm">
                  {cliente.email && (
                    <p className="text-slate-600 truncate">
                      📧 {cliente.email}
                    </p>
                  )}
                  {cliente.telefono && (
                    <p className="text-slate-600">📞 {cliente.telefono}</p>
                  )}
                  {cliente.provincia && (
                    <p className="text-slate-500">📍 {cliente.provincia}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </section>

        <p className="text-sm text-slate-500 text-center">
          {loading ? 'Cargando...' : search ? `${filtered.length}/${clientes.length} cliente${filtered.length !== 1 ? 's' : ''}` : `${clientes.length} cliente${clientes.length !== 1 ? 's' : ''}`}
        </p>
      </main>

      {showForm && (
        <NuevoClienteModal
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            loadClientes();
          }}
        />
      )}
    </div>
  );
}

function NuevoClienteModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [nif, setNif] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [provincia, setProvincia] = useState('');
  const [pais, setPais] = useState('ES');
  const [direccion, setDireccion] = useState('');
  const [cp, setCp] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [monedaPreferida, setMonedaPreferida] = useState('');
  const ue = pais !== 'ES' && PAISES_UE.has(pais);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`${API}/companies/${getCompanyId()}/clientes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          nombreFiscal: nombre,
          nifCif: nif,
          email: email || undefined,
          telefono: telefono || undefined,
          provincia: provincia || undefined,
          pais,
          direccion: direccion || undefined,
          cp: cp || undefined,
          municipio: municipio || undefined,
          monedaPreferida: monedaPreferida || undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || `Error ${res.status}`);
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
      setSaving(false);
    }
  }

  const inputClass =
    'rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600 focus:border-accent-600 bg-white';

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-xl shadow-xl p-6 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-900">
            Nuevo cliente
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="p-1.5 text-slate-500 hover:text-slate-900 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="nombre" className="text-sm font-medium text-slate-700">
              Nombre fiscal *
            </label>
            <input
              id="nombre"
              type="text"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="pais" className="text-sm font-medium text-slate-700">
              País
            </label>
            <select id="pais" value={pais} onChange={(e) => setPais(e.target.value)} className={inputClass}>
              {PAISES.map(([c, n]) => (
                <option key={c} value={c}>
                  {n}
                </option>
              ))}
            </select>
            {pais !== 'ES' && (
              <p className="text-xs text-slate-500">
                {ue
                  ? 'Cliente de la UE: con su NIF-IVA (VIES) la venta suele ir sin IVA español (intracomunitaria).'
                  : 'Cliente de fuera de la UE: las ventas suelen ir sin IVA (exportación o servicio no sujeto).'}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="nif" className="text-sm font-medium text-slate-700">
              {pais === 'ES' ? 'NIF/CIF' : ue ? 'NIF-IVA (con el prefijo del país)' : 'Identificación fiscal (Tax ID)'} *
            </label>
            <input
              id="nif"
              type="text"
              required
              value={nif}
              onChange={(e) => setNif(e.target.value)}
              className={inputClass}
            />
            {ue && nif.trim() && !pareceNifIvaUe(nif) && (
              <p className="text-xs text-amber-700">Falta el prefijo del país (p. ej. FR…, DE…; EL para Grecia).</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="dir" className="text-sm font-medium text-slate-700">
              Dirección
            </label>
            <input id="dir" type="text" value={direccion} onChange={(e) => setDireccion(e.target.value)} className={inputClass} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <label htmlFor="cp" className="text-sm font-medium text-slate-700">
                Código postal
              </label>
              <input id="cp" type="text" value={cp} onChange={(e) => setCp(e.target.value)} className={inputClass} />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="mun" className="text-sm font-medium text-slate-700">
                Municipio
              </label>
              <input id="mun" type="text" value={municipio} onChange={(e) => setMunicipio(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="email" className="text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="tel" className="text-sm font-medium text-slate-700">
              Teléfono
            </label>
            <input
              id="tel"
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="prov" className="text-sm font-medium text-slate-700">
              {pais === 'ES' ? 'Provincia' : 'Región o estado'}
            </label>
            <input
              id="prov"
              type="text"
              value={provincia}
              onChange={(e) => setProvincia(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="moneda" className="text-sm font-medium text-slate-700">
              Moneda en la que se le factura
            </label>
            <select id="moneda" value={monedaPreferida} onChange={(e) => setMonedaPreferida(e.target.value)} className={inputClass}>
              <option value="">La de la contabilidad</option>
              <option value="EUR">EUR — Euro</option>
              <option value="USD">USD — Dólar estadounidense</option>
            </select>
            <p className="text-xs text-slate-500">Se propone al hacerle una factura; se puede cambiar en cada una.</p>
          </div>

          {error && (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2.5 bg-accent-600 text-white font-semibold rounded-lg hover:bg-accent-700 active:scale-[0.98] transition-all disabled:opacity-60 disabled:pointer-events-none"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
