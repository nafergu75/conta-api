'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PencilSimple, Trash } from '@phosphor-icons/react';
import { ApiError, apiFetch, campoDelError, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { nombreNumeroFiscal, nombrePais, PAISES, PAISES_UE, pareceNifIvaUe } from '@/lib/fiscal';
import { paisDelPrefijo } from '@/lib/compras';
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
  pais?: string | null;
  municipio?: string | null;
  cp?: string | null;
  activo?: boolean;
}

interface SupplierDatosTabProps {
  proveedor: Proveedor;
  companyId: string;
  onUpdate?: (proveedor: Proveedor) => void;
}

const datosDe = (p: Proveedor) => ({
  nombreFiscal: p.nombreFiscal || '',
  nifCif: p.nifCif || '',
  email: p.email || '',
  telefono: p.telefono || '',
  web: p.web || '',
  direccion: p.direccion || '',
  provincia: p.provincia || '',
  pais: p.pais || 'ES',
  municipio: p.municipio || '',
  cp: p.cp || '',
  activo: p.activo !== false,
});

/**
 * Datos del proveedor. Se guardan todos (antes se perdian la direccion, la
 * provincia, el municipio, el CP y el pais) con PATCH; un email, un telefono
 * o una web vacios se borran. Borrar un proveedor con facturas da 409: se
 * ofrece desactivarlo. La web sale como enlace (pestaña nueva) mientras no se
 * edita, y su error, junto a su casilla.
 */
export function SupplierDatosTab({ proveedor, companyId, onUpdate }: SupplierDatosTabProps) {
  const router = useRouter();
  const puedeEscribir = tieneAlgunPermiso(getUser(), ['compras:write']);
  const ruta = `/companies/${encodeURIComponent(companyId)}/proveedores/${encodeURIComponent(proveedor.id)}`;

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [campo, setCampo] = useState<string | undefined>();
  const [aviso, setAviso] = useState<string | null>(null);
  const [ofrecerDesactivar, setOfrecerDesactivar] = useState(false);
  const [d, setD] = useState(() => datosDe(proveedor));

  const set = (k: Exclude<keyof typeof d, 'activo'>) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const v = e.target.value;
    setD((prev) => {
      const sig = { ...prev, [k]: v };
      if (k === 'nifCif' && prev.pais === 'ES' && pareceNifIvaUe(v)) {
        const p = paisDelPrefijo(v);
        if (p && p !== 'ES') sig.pais = p;
      }
      return sig;
    });
  };

  const guardar = async (cambios: Record<string, unknown>, texto: string) => {
    setError(null);
    setCampo(undefined);
    setAviso(null);
    setOfrecerDesactivar(false);
    setSaving(true);
    try {
      const actualizado = await apiFetch<Proveedor>(ruta, { method: 'PATCH', body: JSON.stringify(cambios) });
      setD(datosDe(actualizado));
      setEditing(false);
      onUpdate?.(actualizado);
      setAviso(texto);
    } catch (err) {
      setError(errorMessage(err));
      const c = campoDelError(err);
      setCampo(c);
      if (c === 'web') requestAnimationFrame(() => document.getElementById('sd-web')?.focus());
    } finally {
      setSaving(false);
    }
  };

  const handleGuardar = () =>
    guardar(
      {
        nombreFiscal: d.nombreFiscal.trim(),
        nifCif: d.nifCif.trim(),
        // Vacios: se borran (antes no se podian vaciar).
        email: d.email.trim(),
        telefono: d.telefono.trim(),
        web: d.web.trim(),
        direccion: d.direccion.trim(),
        provincia: d.provincia.trim(),
        municipio: d.municipio.trim(),
        cp: d.cp.trim(),
        pais: d.pais || 'ES',
        activo: d.activo,
      },
      'Datos del proveedor guardados.',
    );

  const handleEliminar = async () => {
    if (!confirm(`¿Borrar el proveedor ${proveedor.nombreFiscal}? No se puede deshacer.`)) return;
    setError(null);
    setAviso(null);
    try {
      await apiFetch(ruta, { method: 'DELETE' });
      router.push('/dashboard/proveedores');
    } catch (err) {
      setError(errorMessage(err));
      setOfrecerDesactivar(err instanceof ApiError && err.status === 409);
    }
  };

  const es = d.pais === 'ES';
  const ue = !es && PAISES_UE.has(d.pais);
  const inputClass =
    'w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600 focus:border-accent-600 bg-white disabled:bg-slate-100 disabled:cursor-not-allowed aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50';
  const label = 'text-sm font-medium text-slate-700 mb-2 block';

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Datos del proveedor</h2>
        {puedeEscribir && (
          <div className="flex gap-2">
            {editing ? (
              <>
                <button
                  onClick={() => {
                    setEditing(false);
                    setError(null);
                    setCampo(undefined);
                    setD(datosDe(proveedor));
                  }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleGuardar}
                  disabled={saving}
                  className="px-4 py-2 bg-accent-600 text-white font-semibold rounded-lg hover:bg-accent-700 active:scale-[0.98] transition-all disabled:opacity-60 disabled:pointer-events-none"
                >
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setEditing(true);
                    setAviso(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <PencilSimple size={16} /> Editar
                </button>
                <button onClick={handleEliminar} className="p-2 text-slate-400 hover:text-rose-600 transition-colors" aria-label="Borrar el proveedor" title="Borrar">
                  <Trash size={20} />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {aviso && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 p-4 text-sm">
          {aviso}
        </div>
      )}
      {/* El de la web sale junto a su casilla. */}
      {error && campo !== 'web' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 p-4 text-sm">
          <span className="min-w-0 flex-1">{error}</span>
          {ofrecerDesactivar && d.activo && (
            <button
              type="button"
              onClick={() => guardar({ activo: false }, 'Proveedor desactivado: ya no sale al registrar facturas de gasto.')}
              className="rounded-lg bg-amber-600 px-3 py-1.5 font-semibold text-white hover:bg-amber-700"
            >
              Desactivar
            </button>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 md:p-6 space-y-6">
        <div>
          <h3 className="text-base font-semibold text-slate-900 mb-4">Identificación</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="sd-nombre" className={label}>
                Nombre fiscal
              </label>
              <input id="sd-nombre" type="text" value={d.nombreFiscal} onChange={set('nombreFiscal')} disabled={!editing} aria-invalid={campo === 'nombreFiscal'} className={inputClass} />
            </div>
            <div>
              <label htmlFor="sd-pais" className={label}>
                País
              </label>
              {editing ? (
                <select id="sd-pais" value={d.pais} onChange={set('pais')} aria-invalid={campo === 'pais'} className={inputClass}>
                  {/* Un pais guardado que no esta en la lista se conserva. */}
                  {!PAISES.some(([c]) => c === d.pais) && <option value={d.pais}>{d.pais}</option>}
                  {PAISES.map(([c, n]) => (
                    <option key={c} value={c}>
                      {n}
                    </option>
                  ))}
                </select>
              ) : (
                <input id="sd-pais" type="text" value={nombrePais(d.pais) || d.pais} disabled className={inputClass} />
              )}
            </div>
            <div>
              <label htmlFor="sd-nif" className={label}>
                {/* Como se llama en su país (NIF, NIF-IVA (VAT), RNC, EIN...): cambia con el país. */}
                {nombreNumeroFiscal(d.pais)}
                {ue ? ' (con el prefijo del país)' : ''}
              </label>
              <input id="sd-nif" type="text" value={d.nifCif} onChange={set('nifCif')} disabled={!editing} aria-invalid={campo === 'nifCif'} className={`${inputClass} font-mono`} />
            </div>
            <div className="flex items-end">
              <label className={`flex items-center gap-2 text-sm ${editing ? 'cursor-pointer text-slate-700' : 'text-slate-500'}`}>
                <input type="checkbox" checked={d.activo} disabled={!editing} onChange={(e) => setD((prev) => ({ ...prev, activo: e.target.checked }))} className="h-4 w-4 accent-emerald-600" />
                Activo (sale al registrar facturas de gasto)
              </label>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-6">
          <h3 className="text-base font-semibold text-slate-900 mb-4">Contacto</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="sd-email" className={label}>
                Email
              </label>
              <input id="sd-email" type="email" value={d.email} onChange={set('email')} disabled={!editing} aria-invalid={campo === 'email'} className={inputClass} />
            </div>
            <div>
              <label htmlFor="sd-tel" className={label}>
                Teléfono
              </label>
              <input id="sd-tel" type="tel" value={d.telefono} onChange={set('telefono')} disabled={!editing} aria-invalid={campo === 'telefono'} className={inputClass} />
            </div>
            <div className="md:col-span-2">
              {editing ? (
                <CampoWeb id="sd-web" value={d.web} onChange={set('web')} error={campo === 'web' ? error : null} claseEtiqueta={label} claseCampo={inputClass} />
              ) : d.web ? (
                <>
                  <p className={label}>Web</p>
                  {/* Con el aspecto de las casillas desactivadas, también de noche (campo-lectura en globals.css). */}
                  <div className="campo-lectura flex min-h-[2.75rem] min-w-0 items-center rounded-lg border border-slate-300 bg-slate-100 px-3.5 py-2.5 text-sm">
                    <EnlaceWeb web={d.web} />
                  </div>
                </>
              ) : (
                <>
                  <label htmlFor="sd-web" className={label}>
                    Web
                  </label>
                  <input id="sd-web" type="text" value="" placeholder="Sin web" disabled className={inputClass} />
                </>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-6">
          <h3 className="text-base font-semibold text-slate-900 mb-4">Dirección</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label htmlFor="sd-dir" className={label}>
                Dirección
              </label>
              <input id="sd-dir" type="text" value={d.direccion} onChange={set('direccion')} disabled={!editing} aria-invalid={campo === 'direccion'} className={inputClass} />
            </div>
            <div>
              <label htmlFor="sd-cp" className={label}>
                Código postal
              </label>
              <input id="sd-cp" type="text" inputMode={es ? 'numeric' : 'text'} value={d.cp} onChange={set('cp')} disabled={!editing} aria-invalid={campo === 'cp'} className={inputClass} />
            </div>
            <div>
              <label htmlFor="sd-mun" className={label}>
                Municipio
              </label>
              <input id="sd-mun" type="text" value={d.municipio} onChange={set('municipio')} disabled={!editing} aria-invalid={campo === 'municipio'} className={inputClass} />
            </div>
            <div>
              <label htmlFor="sd-prov" className={label}>
                {es ? 'Provincia' : 'Región o estado'}
              </label>
              <input id="sd-prov" type="text" value={d.provincia} onChange={set('provincia')} disabled={!editing} aria-invalid={campo === 'provincia'} className={inputClass} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
