'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Download } from '@phosphor-icons/react';
import { getToken, getCompanyId } from '@/lib/auth';
import { ApiError, apiFetch, companyPath } from '@/lib/api';
import { mensajeSinAcceso, PantallaSinAcceso } from '@/components/dashboard/SinAcceso';
import { BloqueContabilidadTercero } from '@/components/contabilidad/BloqueContabilidadTercero';
import { anioEspana } from '@/lib/anios';
import { conNombreNumeroFiscal } from '@/lib/fiscal';
import { anioOTodosDeUrl, anioParaUrl, ponerEnUrl } from '@/lib/urlEstado';

import { SupplierTabs } from '@/components/suppliers/SupplierTabs';
import { SupplierDatosTab } from '@/components/suppliers/SupplierDatosTab';
import { SupplierFacturasTab } from '@/components/suppliers/SupplierFacturasTab';
import { SupplierContactosTab } from '@/components/suppliers/SupplierContactosTab';
import { SupplierCuentasTab } from '@/components/suppliers/SupplierCuentasTab';
import { SupplierHistorialTab } from '@/components/suppliers/SupplierHistorialTab';
import { ExportSupplierModal } from '@/components/suppliers/ExportSupplierModal';

interface Proveedor {
  id: string;
  nombreFiscal: string;
  nifCif: string;
  email?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  provincia?: string | null;
  pais?: string | null;
  municipio?: string | null;
  cp?: string | null;
  activo?: boolean;
  companyId?: string;
  /** Subcuentas propias con el mismo numero: 400 (compras) y 410 (servicios). */
  subcuenta400?: string | null;
  subcuenta410?: string | null;
  subcuentasEnPlan?: string[];
}

export default function DetalleProveedorPage() {
  const router = useRouter();
  const params = useParams();
  const proveedorId = params.id as string;
  // Empresa activa de la sesion (antes estaba fijada a '1').
  const companyId = getCompanyId();

  const [proveedor, setProveedor] = useState<Proveedor | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  // Texto del 403 si su acceso no incluye proveedores (antes salia «Proveedor no encontrado»).
  const [sinAcceso, setSinAcceso] = useState<string | null>(null);
  // Año de emisión de la pestaña Facturas (null = todos): el actual, como en la ficha de cliente,
  // o el de la URL. Se guarda en la URL y abre el mayor del proveedor en ese año.
  const [anio, setAnio] = useState<number | null>(() => {
    const url = anioOTodosDeUrl();
    return url === undefined ? anioEspana() : url;
  });
  const elegirAnio = (a: number | null) => {
    setAnio(a);
    ponerEnUrl({ ejercicio: anioParaUrl(a) });
  };

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
      // apiFetch: un 401 lleva al login y la contraseña provisional, a cambiarla.
      const prov = await apiFetch<Proveedor>(companyPath(`/proveedores/${encodeURIComponent(proveedorId)}`));
      setProveedor(prov);
      setError(null);
      setSinAcceso(null);
    } catch (e) {
      const sinPermiso = mensajeSinAcceso(e);
      if (sinPermiso) setSinAcceso(sinPermiso);
      // El motivo del servidor, no solo el codigo; un 404 dice «Proveedor no encontrado».
      else if (e instanceof ApiError && e.status === 404) setError('Error 404');
      else setError(e instanceof Error ? e.message : 'Error al cargar proveedor');
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

  if (sinAcceso) return <PantallaSinAcceso titulo="Proveedor" mensaje={sinAcceso} />;

  if (!proveedor) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-slate-600 font-medium mb-4">{error && error !== 'Error 404' ? error : 'Proveedor no encontrado'}</p>
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
      component: (
        <>
          <BloqueContabilidadTercero
            tipo="proveedor"
            id={proveedorId}
            subcuentas={[
              { codigo: proveedor.subcuenta400, etiqueta: 'compras' },
              { codigo: proveedor.subcuenta410, etiqueta: 'servicios' },
            ]}
            subcuentasEnPlan={proveedor.subcuentasEnPlan}
            ejercicio={anio}
          />
          <SupplierDatosTab proveedor={proveedor} companyId={companyId} onUpdate={setProveedor} />
        </>
      ),
    },
    {
      id: 'facturas',
      label: 'Facturas',
      icon: '📄',
      component: <SupplierFacturasTab supplierId={proveedorId} companyId={companyId} anio={anio} onAnio={elegirAnio} />,
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
          <div className="flex min-w-0 items-center gap-4">
            <button
              onClick={() => router.push('/dashboard/proveedores')}
              className="p-2 text-slate-500 hover:text-slate-900 transition-colors"
              aria-label="Volver"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0">
              <h1 className="font-semibold text-slate-900 truncate">{proveedor.nombreFiscal}</h1>
              {/* Con el nombre de su número fiscal en su país: «EIN 123456789». */}
              <p className="text-sm text-slate-500 font-mono truncate">{conNombreNumeroFiscal(proveedor.nifCif, proveedor.pais)}</p>
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
