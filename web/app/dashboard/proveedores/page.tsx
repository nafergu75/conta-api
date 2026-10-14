'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { EnvelopeSimple, MagnifyingGlass, MapPin, Phone, Plus, Trash, X } from '@phosphor-icons/react';
import { ApiError, apiFetch, campoDelError, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { nombreNumeroFiscal, nombrePais, PAISES, PAISES_UE, pareceNifIvaUe } from '@/lib/fiscal';
import { paisDelPrefijo } from '@/lib/compras';
import { mensajeSinAcceso, PantallaSinAcceso } from '@/components/dashboard/SinAcceso';
import { useAvisoPlanAnterior } from '@/components/contabilidad/AvisoPlanAnterior';
import { CampoWeb, EnlaceWeb } from '@/components/terceros/Web';

interface Proveedor {
  id: string;
  nombreFiscal: string;
  nifCif: string;
  email?: string | null;
  telefono?: string | null;
  /** Con https:// delante (el servidor se lo pone). */
  web?: string | null;
  direccion?: string | null;
  provincia?: string | null;
  municipio?: string | null;
  cp?: string | null;
  pais?: string | null;
  activo?: boolean;
  /** Subcuentas contables propias: 400 (compras) y 410 (servicios), con el mismo numero. */
  subcuenta400?: string | null;
  subcuenta410?: string | null;
}

interface Pagina {
  items: Proveedor[];
  total: number;
  page: number;
}

const POR_PAGINA = 50;

export default function ProveedoresPage() {
  const puedeEscribir = tieneAlgunPermiso(getUser(), ['compras:write']);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; desactivar?: Proveedor } | null>(null);
  // Texto del 403 si su acceso no incluye proveedores (null = si lo incluye).
  const [sinAcceso, setSinAcceso] = useState<string | null>(null);
  // Desde el plan contable (+ bajo la 430, 400 o 410): ?nuevo=1 abre el alta.
  useEffect(() => {
    try {
      if (puedeEscribir && new URLSearchParams(window.location.search).get('nuevo') === '1') setShowForm(true);
    } catch {
      // Sin acceso a la URL: se abre con el boton.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const peticion = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setQ(busqueda.trim()), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  /** Carga la pagina `p` (1 = de nuevo desde el principio; las demas se anaden: «Cargar más»). */
  const cargar = useCallback(
    async (p: number) => {
      const n = ++peticion.current;
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(p), limit: String(POR_PAGINA) });
        if (q) params.set('q', q);
        const r = await apiFetch<Pagina | Proveedor[]>(companyPath(`/proveedores?${params}`));
        if (n !== peticion.current) return;
        const items = Array.isArray(r) ? r : r.items ?? [];
        setProveedores((prev) => (p === 1 ? items : [...prev, ...items]));
        setTotal(Array.isArray(r) ? items.length : r.total ?? items.length);
        setPagina(p);
        setError(null);
        setSinAcceso(null);
      } catch (e) {
        if (n !== peticion.current) return;
        const sin = mensajeSinAcceso(e);
        if (sin) setSinAcceso(sin);
        else setError(errorMessage(e));
      } finally {
        if (n === peticion.current) setLoading(false);
      }
    },
    [q],
  );

  useEffect(() => {
    cargar(1);
  }, [cargar]);

  const borrar = async (p: Proveedor) => {
    if (!confirm(`¿Borrar el proveedor ${p.nombreFiscal}? No se puede deshacer.`)) return;
    setAviso(null);
    try {
      await apiFetch(companyPath(`/proveedores/${encodeURIComponent(p.id)}`), { method: 'DELETE' });
      setAviso({ texto: `Proveedor ${p.nombreFiscal} borrado.` });
      cargar(1);
    } catch (e) {
      // 409: tiene facturas. Se ofrece desactivarlo para que no salga al registrar gastos.
      setAviso({ texto: errorMessage(e), desactivar: e instanceof ApiError && e.status === 409 ? p : undefined });
    }
  };

  const desactivar = async (p: Proveedor) => {
    try {
      await apiFetch(companyPath(`/proveedores/${encodeURIComponent(p.id)}`), { method: 'PATCH', body: JSON.stringify({ activo: false }) });
      setAviso({ texto: `${p.nombreFiscal} queda inactivo: ya no sale al registrar facturas de gasto.` });
      cargar(1);
    } catch (e) {
      setAviso({ texto: errorMessage(e) });
    }
  };

  if (sinAcceso) return <PantallaSinAcceso titulo="Proveedores" mensaje={sinAcceso} />;

  return (
    <div>
      <header className="sticky top-0 z-40 h-16 bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 md:px-8 h-full flex items-center justify-between">
          <h1 className="font-semibold text-slate-900">Proveedores</h1>
          {puedeEscribir && (
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent-600 text-white text-sm font-semibold rounded-lg hover:bg-accent-700 active:scale-[0.98] transition-all"
            >
              <Plus size={16} weight="bold" /> Nuevo proveedor
            </button>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-8 flex flex-col gap-6">
        {/* Buscador (en el servidor: encuentra a todos, no solo a los cargados) */}
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <label htmlFor="pr-buscar" className="block text-sm font-medium text-slate-700 mb-2">
            Buscar proveedor
          </label>
          <div className="relative">
            <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="pr-buscar"
              type="text"
              placeholder="Nombre, NIF, email o subcuenta"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-9 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            {busqueda && (
              <button onClick={() => setBusqueda('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label="Limpiar búsqueda">
                <X size={16} />
              </button>
            )}
          </div>
        </section>

        {aviso && (
          <div role="status" className={`flex flex-wrap items-center gap-3 rounded-xl border p-4 text-sm ${aviso.desactivar ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-700'}`}>
            <span className="min-w-0 flex-1">{aviso.texto}</span>
            {aviso.desactivar && (
              <button type="button" onClick={() => desactivar(aviso.desactivar!)} className="rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700">
                Desactivar
              </button>
            )}
            <button type="button" onClick={() => setAviso(null)} aria-label="Cerrar aviso" className="text-slate-500">
              <X size={16} />
            </button>
          </div>
        )}

        {error && <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 p-4 text-sm">{error}</div>}

        {/* Tarjetas: cada una abre la ficha */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading && proveedores.length === 0 ? (
            Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-40 rounded-xl bg-white border border-slate-200 animate-pulse" />)
          ) : proveedores.length === 0 ? (
            <div className="col-span-full rounded-xl bg-slate-50 border border-slate-200 p-12 text-center">
              <p className="text-slate-600 font-medium mb-2">{q ? 'Sin resultados' : 'Sin proveedores'}</p>
              <p className="text-sm text-slate-500 mb-4">{q ? 'Prueba con otro nombre o NIF.' : 'Da de alta el primero, o se creará al registrar una factura de gasto.'}</p>
              {puedeEscribir && !q && (
                <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-accent-600 hover:text-accent-700">
                  <Plus size={16} /> Nuevo proveedor
                </button>
              )}
            </div>
          ) : (
            proveedores.map((proveedor) => (
              <div
                key={proveedor.id}
                className="relative rounded-xl bg-white border border-slate-200 p-5 hover:border-emerald-200 hover:bg-slate-50 transition-colors focus-within:ring-2 focus-within:ring-accent-600"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900 break-words">
                      {/* El enlace cubre toda la tarjeta (after:inset-0); la papelera queda por encima y fuera de el. */}
                      <Link href={`/dashboard/proveedores/${proveedor.id}`} className="after:absolute after:inset-0 after:rounded-xl focus:outline-none">
                        {proveedor.nombreFiscal}
                      </Link>
                    </h3>
                    <p className="text-sm font-mono text-slate-500 break-all">{proveedor.nifCif}</p>
                    {(proveedor.subcuenta400 || proveedor.subcuenta410) && (
                      <p className="text-xs text-slate-500">
                        Subcuentas <span className="font-mono">{[proveedor.subcuenta400, proveedor.subcuenta410].filter(Boolean).join(' · ')}</span>
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {proveedor.activo === false && <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Inactivo</span>}
                      {proveedor.pais && proveedor.pais !== 'ES' && (
                        <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">{nombrePais(proveedor.pais)}</span>
                      )}
                    </div>
                  </div>
                  {puedeEscribir && (
                    <button
                      type="button"
                      onClick={() => borrar(proveedor)}
                      className="relative z-10 p-1.5 text-slate-400 hover:text-rose-600 transition-colors shrink-0"
                      aria-label={`Borrar el proveedor ${proveedor.nombreFiscal}`}
                      title="Borrar"
                    >
                      <Trash size={16} />
                    </button>
                  )}
                </div>

                <div className="space-y-1.5 text-sm">
                  {proveedor.email && (
                    <p className="flex items-center gap-1.5 text-slate-600 min-w-0">
                      <EnvelopeSimple size={14} className="shrink-0 text-slate-400" />
                      <span className="truncate">{proveedor.email}</span>
                    </p>
                  )}
                  {proveedor.telefono && (
                    <p className="flex items-center gap-1.5 text-slate-600">
                      <Phone size={14} className="shrink-0 text-slate-400" /> {proveedor.telefono}
                    </p>
                  )}
                  {proveedor.web && (
                    // Por encima del enlace de la tarjeta: abre la web, no la ficha.
                    <p className="relative z-10 min-w-0">
                      <EnlaceWeb web={proveedor.web} className="text-sm" />
                    </p>
                  )}
                  {(proveedor.municipio || proveedor.provincia) && (
                    <p className="flex items-center gap-1.5 text-slate-500">
                      <MapPin size={14} className="shrink-0 text-slate-400" /> {[proveedor.municipio, proveedor.provincia].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </section>

        {proveedores.length > 0 && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-slate-500">
              {proveedores.length} de {total} proveedor{total !== 1 ? 'es' : ''}
            </p>
            {proveedores.length < total && (
              <button
                type="button"
                onClick={() => cargar(pagina + 1)}
                disabled={loading}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {loading ? 'Cargando...' : 'Cargar más'}
              </button>
            )}
          </div>
        )}
      </main>

      {showForm && (
        <NuevoProveedorModal
          onClose={() => setShowForm(false)}
          onCreated={(p) => {
            setShowForm(false);
            setAviso({ texto: `Proveedor ${p.nombreFiscal} dado de alta.` });
            cargar(1);
          }}
        />
      )}
    </div>
  );
}

function NuevoProveedorModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: Proveedor) => void }) {
  const [d, setD] = useState({ nombreFiscal: '', nifCif: '', pais: 'ES', direccion: '', cp: '', municipio: '', provincia: '', email: '', telefono: '', web: '' });
  const [saving, setSaving] = useState(false);
  const avisoPlan = useAvisoPlanAnterior();
  const [error, setError] = useState<string | null>(null);
  const [campo, setCampo] = useState<string | undefined>();

  // Escape cierra la ventana.
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const set = (k: keyof typeof d) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const v = e.target.value;
    setD((prev) => {
      const sig = { ...prev, [k]: v };
      // NIF-IVA de otro pais de la UE: el pais sale del prefijo (como hace el servidor).
      if (k === 'nifCif' && prev.pais === 'ES' && pareceNifIvaUe(v)) {
        const p = paisDelPrefijo(v);
        if (p && p !== 'ES') sig.pais = p;
      }
      return sig;
    });
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCampo(undefined);
    setSaving(true);
    try {
      const cuerpo = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v.trim()]).filter(([k, v]) => v !== '' || k === 'pais'));
      // Primer proveedor de una empresa española sin el plan de la gestoría: se pregunta antes.
      const creado = await avisoPlan.intentar((extra) => apiFetch<Proveedor>(companyPath('/proveedores'), { method: 'POST', body: JSON.stringify({ ...cuerpo, ...extra }) }));
      if (creado === null) {
        setSaving(false);
        return;
      }
      onCreated(creado);
    } catch (err) {
      setError(errorMessage(err));
      const c = campoDelError(err);
      setCampo(c);
      setSaving(false);
      // La web mal escrita: el motivo sale junto a su casilla, y el foco va a ella.
      if (c === 'web') requestAnimationFrame(() => document.getElementById('np-web')?.focus());
    }
  }

  const es = d.pais === 'ES';
  const ue = !es && PAISES_UE.has(d.pais);
  const inputClass =
    'w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600 focus:border-accent-600 bg-white aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50';
  const label = 'text-sm font-medium text-slate-700';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center px-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="np-titulo" className="w-full max-w-lg bg-white rounded-xl shadow-xl p-6 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 id="np-titulo" className="text-lg font-semibold text-slate-900">
            Nuevo proveedor
          </h2>
          <button onClick={onClose} aria-label="Cerrar" className="p-1.5 text-slate-500 hover:text-slate-900 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 flex flex-col gap-1.5">
            <label htmlFor="np-nombre" className={label}>
              Nombre fiscal *
            </label>
            <input id="np-nombre" autoFocus required value={d.nombreFiscal} onChange={set('nombreFiscal')} aria-invalid={campo === 'nombreFiscal'} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="np-pais" className={label}>
              País
            </label>
            <select id="np-pais" value={d.pais} onChange={set('pais')} aria-invalid={campo === 'pais'} className={inputClass}>
              {PAISES.map(([c, n]) => (
                <option key={c} value={c}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="np-nif" className={label}>
              {/* Como se llama en su país (NIF, NIF-IVA (VAT), RNC, EIN...): cambia con el país. */}
              {nombreNumeroFiscal(d.pais)}
              {ue ? ' (con el prefijo del país)' : ''} *
            </label>
            <input id="np-nif" required value={d.nifCif} onChange={set('nifCif')} aria-invalid={campo === 'nifCif'} className={`${inputClass} font-mono`} autoComplete="off" />
          </div>
          <div className="sm:col-span-2 flex flex-col gap-1.5">
            <label htmlFor="np-dir" className={label}>
              Dirección
            </label>
            <input id="np-dir" value={d.direccion} onChange={set('direccion')} aria-invalid={campo === 'direccion'} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="np-cp" className={label}>
              Código postal
            </label>
            <input id="np-cp" inputMode={es ? 'numeric' : 'text'} value={d.cp} onChange={set('cp')} aria-invalid={campo === 'cp'} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="np-mun" className={label}>
              Municipio
            </label>
            <input id="np-mun" value={d.municipio} onChange={set('municipio')} aria-invalid={campo === 'municipio'} className={inputClass} />
          </div>
          <div className="sm:col-span-2 flex flex-col gap-1.5">
            <label htmlFor="np-prov" className={label}>
              {es ? 'Provincia' : 'Región o estado'}
            </label>
            <input id="np-prov" value={d.provincia} onChange={set('provincia')} aria-invalid={campo === 'provincia'} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="np-email" className={label}>
              Email
            </label>
            <input id="np-email" type="email" value={d.email} onChange={set('email')} aria-invalid={campo === 'email'} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="np-tel" className={label}>
              Teléfono
            </label>
            <input id="np-tel" type="tel" value={d.telefono} onChange={set('telefono')} aria-invalid={campo === 'telefono'} className={inputClass} />
          </div>
          <div className="sm:col-span-2 flex flex-col gap-1.5">
            <CampoWeb id="np-web" value={d.web} onChange={set('web')} error={campo === 'web' ? error : null} claseEtiqueta={label} claseCampo={inputClass} />
          </div>

          {error && campo !== 'web' && <p className="sm:col-span-2 text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="sm:col-span-2 flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors">
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
        {avisoPlan.dialogo}
      </div>
    </div>
  );
}
