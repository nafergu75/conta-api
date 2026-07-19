'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, clearSession } from '@/lib/auth';
import { Upload, Download, Trash, FolderPlus, File } from '@phosphor-icons/react';

interface Archivo {
  id: string;
  nombre: string;
  tipo: string;
  tamaño: number;
  fechaSubida: string;
}

interface Carpeta {
  id: string;
  nombre: string;
  descripcion?: string;
  archivos: Archivo[];
}

const API = 'http://localhost:3000';

export default function ArchivoPage() {
  const router = useRouter();
  
  const companyId = useMemo(() => {
    const token = getToken();
    if (!token) return null;
    try {
      const parts = token.split('.');
      const payload = JSON.parse(atob(parts[1]));
      return payload.companies?.[0] || '1';
    } catch {
      return '1';
    }
  }, []);

  const [carpetas, setCarpetas] = useState<Carpeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadArchivos = async () => {
      const token = getToken();
      if (!token) {
        router.replace('/login');
        return;
      }

      try {
        setLoading(true);
        const res = await fetch(`${API}/companies/${companyId}/archivo`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) {
          clearSession();
          router.replace('/login');
          return;
        }

        if (!res.ok) throw new Error('Error cargando archivos');
        const data = await res.json();
        setCarpetas(data.data?.carpetas || data.carpetas || []);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    };

    if (companyId) loadArchivos();
  }, [companyId, router]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Archivo</h1>
        <p className="text-gray-600 mt-2">Gestión centralizada de documentos y archivos de la empresa</p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-2 mb-6">
        <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2">
          <FolderPlus size={18} />
          Nueva Carpeta
        </button>
        <button className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2">
          <Upload size={18} />
          Subir Archivo
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-8">Cargando archivos...</div>
      ) : carpetas.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          No hay carpetas. Crea una nueva para empezar.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {carpetas.map((carpeta) => (
            <div key={carpeta.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-2 mb-4">
                <FolderPlus size={24} className="text-blue-600" />
                <h3 className="font-semibold text-gray-900">{carpeta.nombre}</h3>
              </div>
              <div className="text-sm text-gray-500">
                {carpeta.archivos?.length || 0} archivos
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
        <p><strong>Gestión centralizada:</strong> Organiza tus documentos en carpetas.</p>
      </div>
    </div>
  );
}
