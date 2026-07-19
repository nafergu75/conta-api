'use client';

import { useState } from 'react';
import { Trash } from '@phosphor-icons/react';
import { getToken, clearSession } from '@/lib/auth';
import { useRouter } from 'next/navigation';

const API = '/api/conta';

interface Proveedor {
  id: string;
  nombreFiscal: string;
  nifCif: string;
  email?: string;
  telefono?: string;
  direccion?: string;
  provincia?: string;
  pais?: string;
  municipio?: string;
  cp?: string;
  activo?: boolean;
}

interface SupplierDatosTabProps {
  proveedor: Proveedor;
  companyId: string;
  onUpdate?: (proveedor: Proveedor) => void;
}

export function SupplierDatosTab({ proveedor, companyId, onUpdate }: SupplierDatosTabProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estados del formulario
  const [nombre, setNombre] = useState(proveedor.nombreFiscal || '');
  const [nif, setNif] = useState(proveedor.nifCif || '');
  const [email, setEmail] = useState(proveedor.email || '');
  const [telefono, setTelefono] = useState(proveedor.telefono || '');
  const [direccion, setDireccion] = useState(proveedor.direccion || '');
  const [provincia, setProvincia] = useState(proveedor.provincia || '');
  const [pais, setPais] = useState(proveedor.pais || 'ES');
  const [municipio, setMunicipio] = useState(proveedor.municipio || '');
  const [cp, setCp] = useState(proveedor.cp || '');

  const handleGuardar = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`${API}/companies/${companyId}/proveedores/${proveedor.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          nombreFiscal: nombre,
          nifCif: nif,
          email: email || undefined,
          telefono: telefono || undefined,
          direccion: direccion || undefined,
          provincia: provincia || undefined,
          pais: pais || 'ES',
          municipio: municipio || undefined,
          cp: cp || undefined,
        }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || `Error ${res.status}`);
      }

      const data = await res.json();
      const updated = data.data || data;
      setEditing(false);
      onUpdate?.(updated);
      alert('Proveedor actualizado correctamente');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleEliminar = async () => {
    if (!confirm('¿Estás seguro de que deseas eliminar este proveedor? Esta acción no se puede deshacer.')) {
      return;
    }

    try {
      const res = await fetch(`${API}/companies/${companyId}/proveedores/${proveedor.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || `Error ${res.status}`);
      }

      alert('Proveedor eliminado correctamente');
      router.push('/dashboard/proveedores');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al eliminar');
    }
  };

  const inputClass =
    'rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600 focus:border-accent-600 bg-white disabled:bg-slate-100 disabled:cursor-not-allowed';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-slate-900">Datos Básicos del Proveedor</h2>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button
                onClick={() => {
                  setEditing(false);
                  setError(null);
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
                onClick={() => setEditing(true)}
                className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors"
              >
                ✏️ Editar
              </button>
              <button
                onClick={handleEliminar}
                className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                aria-label="Eliminar"
              >
                <Trash size={20} />
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-700 p-4">
          {error}
        </div>
      )}

      {/* Formulario */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6 space-y-6">
        {/* Datos Básicos */}
        <div>
          <h3 className="text-base font-semibold text-slate-900 mb-4">Identificación</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">Nombre Fiscal</label>
              <input
                type="text"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                disabled={!editing}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">NIF/CIF</label>
              <input
                type="text"
                value={nif}
                onChange={e => setNif(e.target.value)}
                disabled={!editing}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Contacto */}
        <div className="border-t border-slate-200 pt-6">
          <h3 className="text-base font-semibold text-slate-900 mb-4">Contacto</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={!editing}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">Teléfono</label>
              <input
                type="tel"
                value={telefono}
                onChange={e => setTelefono(e.target.value)}
                disabled={!editing}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Dirección */}
        <div className="border-t border-slate-200 pt-6">
          <h3 className="text-base font-semibold text-slate-900 mb-4">Localización</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-slate-700 mb-2 block">Dirección</label>
              <input
                type="text"
                value={direccion}
                onChange={e => setDireccion(e.target.value)}
                disabled={!editing}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">Municipio</label>
              <input
                type="text"
                value={municipio}
                onChange={e => setMunicipio(e.target.value)}
                disabled={!editing}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">Provincia</label>
              <input
                type="text"
                value={provincia}
                onChange={e => setProvincia(e.target.value)}
                disabled={!editing}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">Código Postal</label>
              <input
                type="text"
                value={cp}
                onChange={e => setCp(e.target.value)}
                disabled={!editing}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">País</label>
              <input
                type="text"
                value={pais}
                onChange={e => setPais(e.target.value)}
                disabled={!editing}
                className={inputClass}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Info adicional */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
          <p className="text-xs text-slate-600 mb-1">Estado</p>
          <p className="text-lg font-semibold text-slate-900">{proveedor.activo !== false ? '✅ Activo' : '❌ Inactivo'}</p>
        </div>
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
          <p className="text-xs text-slate-600 mb-1">Identificador</p>
          <p className="text-sm font-mono text-slate-900">{proveedor.id}</p>
        </div>
      </div>
    </div>
  );
}
