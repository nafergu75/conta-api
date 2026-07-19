'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Download } from '@phosphor-icons/react';
import { getToken, clearSession } from '@/lib/auth';

import { SupplierTabs } from '@/components/suppliers/SupplierTabs';
import { SupplierDatosTab } from '@/components/suppliers/SupplierDatosTab';
import { SupplierFacturasTab } from '@/components/suppliers/SupplierFacturasTab';
import { SupplierContactosTab } from '@/components/suppliers/SupplierContactosTab';
import { SupplierCuentasTab } from '@/components/suppliers/SupplierCuentasTab';
import { SupplierHistorialTab } from '@/components/suppliers/SupplierHistorialTab';
import { ExportSupplierModal } from '@/components/suppliers/ExportSupplierModal';

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
  companyId?: string;
}

export default function DetalleProveedorPage() {
  const router = useRouter();
  const params = useParams();
  const proveedorId = params.id as string;
  const companyId = '1'; // Hardcodeado por ahora (TODO: obtener del contexto)

  const [proveedor, setProveedor] = useState<Proveedor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  useEffect(() => {
    loadProveedor();
  }, [proveedorId]);

  const loadProveedor = async () => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API}/companies/${companyId}/proveedores/${proveedorId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        clearSession();
        router.replace('/login');
        return;
      }

      if (!res.ok) throw new Error(`Error ${res.status}`);

      const data = await res.json();
      const prov = data.data || data;
      setProveedor(prov);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar proveedor');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-accent-600 mb-4"></div>
          <p className="text-slate-600">Cargando proveedor...</p>
        </div>
      </div>
    );
  }

  if (!proveedor) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-slate-600 font-medium mb-4">Proveedor no encontrado</p>
          <button
            onClick={() => router.push('/dashboard/proveedores')}
            className="inline-flex items-center gap-2 px-4 py-2 text-accent-600 hover:text-accent-700 font-semibold"
          >
            <ArrowLeft size={16} /> Volver a proveedores
          </button>
        </div>
      </div>
    );
  }

  // Definir las pestañas
  const tabs = [
    {
      id: 'datos',
      label: 'Datos',
      icon: '📋',
      component: <SupplierDatosTab proveedor={proveedor} companyId={companyId} onUpdate={setProveedor} />,
    },
    {
      id: 'facturas',
      label: 'Facturas',
      icon: '📄',
      component: <SupplierFacturasTab supplierId={proveedorId} companyId={companyId} />,
    },
    {
      id: 'contactos',
      label: 'Contactos',
      icon: '👥',
      component: <SupplierContactosTab supplierId={proveedorId} companyId={companyId} />,
    },
    {
      id: 'bancos',
      label: 'Cuentas Bancarias',
      icon: '🏦',
      component: <SupplierCuentasTab supplierId={proveedorId} companyId={companyId} />,
    },
    {
      id: 'historial',
      label: 'Historial',
      icon: '📜',
      component: <SupplierHistorialTab supplierId={proveedorId} companyId={companyId} />,
    },
  ];

  return (
    <div>
      {/* Header */}
      <header className="sticky top-0 z-40 h-16 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-full flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard/proveedores')}
              className="p-2 text-slate-500 hover:text-slate-900 transition-colors"
              aria-label="Volver"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="font-semibold text-slate-900">{proveedor.nombreFiscal}</h1>
              <p className="text-sm text-slate-500 font-mono">{proveedor.nifCif}</p>
            </div>
          </div>

          <button
            onClick={() => setShowExportModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Download size={18} /> Exportar
          </button>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-700 p-4 mb-6">
            {error}
          </div>
        )}

        <SupplierTabs tabs={tabs} defaultTab="datos" />
      </main>

      {/* Modal de exportación */}
      <ExportSupplierModal
        supplierId={proveedorId}
        companyId={companyId}
        nombreFiscal={proveedor.nombreFiscal}
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
      />
    </div>
  );
}
