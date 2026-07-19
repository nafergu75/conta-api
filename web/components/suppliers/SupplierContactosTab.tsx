'use client';

import { useEffect, useState } from 'react';
import { Trash, Plus, Check, X } from '@phosphor-icons/react';
import { getToken } from '@/lib/auth';

const API = '/api/conta';

interface Contacto {
  id: string;
  nombre: string;
  apellido?: string;
  email?: string;
  telefono?: string;
  rol: string;
  esPrincipal: boolean;
  observaciones?: string;
}

interface SupplierContactosTabProps {
  supplierId: string;
  companyId: string;
}

export function SupplierContactosTab({ supplierId, companyId }: SupplierContactosTabProps) {
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  // Formulario para nuevo/edición
  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    email: '',
    telefono: '',
    rol: 'general',
    esPrincipal: false,
    observaciones: '',
  });

  useEffect(() => {
    loadContactos();
  }, []);

  const loadContactos = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/companies/${companyId}/proveedores/${supplierId}/contacts`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (!res.ok) throw new Error(`Error ${res.status}`);

      const data = await res.json();
      setContactos(data.data || data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar contactos');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      nombre: '',
      apellido: '',
      email: '',
      telefono: '',
      rol: 'general',
      esPrincipal: false,
      observaciones: '',
    });
  };

  const handleCrear = async () => {
    if (!formData.nombre.trim()) {
      setError('El nombre es requerido');
      return;
    }

    try {
      const res = await fetch(`${API}/companies/${companyId}/proveedores/${supplierId}/contacts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error(`Error ${res.status}`);

      setCreando(false);
      resetForm();
      await loadContactos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear contacto');
    }
  };

  const handleEliminar = async (contactoId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este contacto?')) return;

    try {
      const res = await fetch(`${API}/companies/${companyId}/proveedores/${supplierId}/contacts/${contactoId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (!res.ok) throw new Error(`Error ${res.status}`);

      await loadContactos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <p className="text-slate-600">Cargando contactos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-700 p-4">{error}</div>}

      {/* Botón para agregar */}
      {!creando && (
        <button
          onClick={() => setCreando(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-accent-600 text-white font-semibold rounded-lg hover:bg-accent-700 transition-colors"
        >
          <Plus size={18} /> Añadir contacto
        </button>
      )}

      {/* Formulario de creación */}
      {creando && (
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 space-y-4">
          <h3 className="font-semibold text-slate-900">Nuevo Contacto</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Nombre *"
              value={formData.nombre}
              onChange={e => setFormData({ ...formData, nombre: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-600"
            />
            <input
              type="text"
              placeholder="Apellido"
              value={formData.apellido}
              onChange={e => setFormData({ ...formData, apellido: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-600"
            />
            <input
              type="email"
              placeholder="Email"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-600"
            />
            <input
              type="tel"
              placeholder="Teléfono"
              value={formData.telefono}
              onChange={e => setFormData({ ...formData, telefono: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-600"
            />
            <select
              value={formData.rol}
              onChange={e => setFormData({ ...formData, rol: e.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-600"
            >
              <option value="general">General</option>
              <option value="administración">Administración</option>
              <option value="facturación">Facturación</option>
              <option value="comercial">Comercial</option>
              <option value="logística">Logística</option>
            </select>
            <label className="flex items-center gap-2 py-2">
              <input
                type="checkbox"
                checked={formData.esPrincipal}
                onChange={e => setFormData({ ...formData, esPrincipal: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300"
              />
              <span className="text-sm text-slate-700">Contacto principal</span>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCrear}
              className="inline-flex items-center gap-2 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700"
            >
              <Check size={16} /> Guardar
            </button>
            <button
              onClick={() => {
                setCreando(false);
                resetForm();
              }}
              className="inline-flex items-center gap-2 px-3 py-2 border border-slate-300 text-slate-700 text-sm font-medium rounded hover:bg-slate-100"
            >
              <X size={16} /> Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista de contactos */}
      {contactos.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-8 text-center">
          <p className="text-slate-600">No hay contactos registrados</p>
        </div>
      ) : (
        <div className="space-y-3">
          {contactos.map(contacto => (
            <div key={contacto.id} className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-slate-900">
                      {contacto.nombre} {contacto.apellido ? contacto.apellido : ''}
                    </h4>
                    {contacto.esPrincipal && <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded">Principal</span>}
                  </div>
                  <p className="text-sm text-slate-600 mt-1">Rol: {contacto.rol}</p>
                  {contacto.email && <p className="text-sm text-slate-600">Email: {contacto.email}</p>}
                  {contacto.telefono && <p className="text-sm text-slate-600">Teléfono: {contacto.telefono}</p>}
                </div>
                <button
                  onClick={() => handleEliminar(contacto.id)}
                  className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                  aria-label="Eliminar"
                >
                  <Trash size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
