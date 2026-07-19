'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, clearSession } from '@/lib/auth';
import { Plus, MagnifyingGlass, Eye } from '@phosphor-icons/react';
import Link from 'next/link';

interface Compra {
  id: string;
  idfactura?: string;
  codigo?: string;
  numero?: number;
  numeroCompleto: string;
  proveedor?: string;
  supplierNombre?: string;
  codproveedor?: string;
  nombre?: string;
  fechaRecepcion?: string;
  fechaEmision?: string;
  fecha?: string;
  base?: number;
  baseTotal?: number;
  neto?: number;
  iva?: number;
  ivaTotal?: number;
  totaliva?: number;
  total: number;
  totalFactura?: number;
  retencion?: number;
  estado: string;
  estado_factura?: string;
  contabilizado?: boolean;
}

export default function ComprasPage() {
  const router = useRouter();
  const [compras, setCompras] = useState<Compra[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    const loadCompras = async () => {
      try {
        const token = getToken();
        if (!token) {
          clearSession();
          router.push('/login');
          return;
        }

        // Cargar facturas de compra desde la API
        const res = await fetch('http://localhost:3000/companies/1/compras', {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
        });

        if (res.status === 401) {
          clearSession();
          router.push('/login');
          return;
        }

        if (!res.ok) {
          throw new Error(`Error ${res.status}`);
        }

        const data = await res.json();
        if (data.ok && data.data && data.data.items) {
          setCompras(data.data.items);
        } else if (Array.isArray(data)) {
          setCompras(data);
        } else {
          setCompras([]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar compras');
        console.error('Error loading compras:', err);
      } finally {
        setLoading(false);
      }
    };

    loadCompras();
  }, []);

  const comprasFiltradas = compras.filter((compra) => {
    const cumpleFiltro =
      filtroEstado === 'todos' || compra.estado.toLowerCase() === filtroEstado.toLowerCase();
    const cumpleBusqueda =
      compra.numeroCompleto.toLowerCase().includes(busqueda.toLowerCase()) ||
      (compra.supplierNombre?.toLowerCase().includes(busqueda.toLowerCase()) || false) ||
      (compra.proveedor?.toLowerCase().includes(busqueda.toLowerCase()) || false);
    return cumpleFiltro && cumpleBusqueda;
  });

  const totales = {
    compras: comprasFiltradas.length,
    base: comprasFiltradas.reduce((sum, c) => sum + (c.baseTotal || c.base || c.neto || 0), 0),
    iva: comprasFiltradas.reduce((sum, c) => sum + (c.ivaTotal || c.iva || c.totaliva || 0), 0),
    total: comprasFiltradas.reduce((sum, c) => sum + (c.totalFactura || c.total || 0), 0),
    pendientes: comprasFiltradas.filter((c) => c.estado.toUpperCase() === 'DRAFT').length,
    contabilizadas: comprasFiltradas.filter((c) => c.contabilizado).length,
  };

  const getEstadoBadgeColor = (estado: string) => {
    switch (estado) {
      case 'DRAFT':
        return 'bg-yellow-100 text-yellow-800';
      case 'REVISIÓN':
        return 'bg-blue-100 text-blue-800';
      case 'CONTABILIZADO':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Compras</h1>
          <p className="mt-2 text-gray-600">Gestionar facturas de proveedores y gastos</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
          <Plus size={20} />
          Nueva compra
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Estado</label>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="todos">Todos</option>
              <option value="draft">Borrador</option>
              <option value="revisión">Revisión</option>
              <option value="contabilizado">Contabilizado</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-2">Buscar</label>
            <div className="relative">
              <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Número de factura o proveedor..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">Total compras</p>
          <p className="text-2xl font-bold text-gray-900">{totales.compras}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">Pendientes revisión</p>
          <p className="text-2xl font-bold text-yellow-600">{totales.pendientes}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">Contabilizadas</p>
          <p className="text-2xl font-bold text-green-600">{totales.contabilizadas}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">Base total</p>
          <p className="text-2xl font-bold text-gray-900">€{totales.base.toFixed(2)}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">IVA total</p>
          <p className="text-2xl font-bold text-gray-900">€{totales.iva.toFixed(2)}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">Total compras</p>
          <p className="text-2xl font-bold text-gray-900">€{totales.total.toFixed(2)}</p>
        </div>
      </div>

      {/* Tabla de Compras */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <p className="text-gray-600">Cargando compras...</p>
          </div>
        ) : error ? (
          <div className="p-8 bg-red-50 border-t border-red-200">
            <p className="text-red-700">{error}</p>
          </div>
        ) : comprasFiltradas.length === 0 ? (
          <div className="p-8 text-center">
            <div className="text-6xl mb-4">📄</div>
            <p className="text-gray-600 font-medium">Sin compras</p>
            <p className="text-gray-500 text-sm">Crea la primera factura de compra para comenzar</p>
            <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition inline-flex items-center gap-2">
              <Plus size={18} />
              Nueva compra
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Número
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Proveedor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Fecha
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Base (€)
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                    IVA (€)
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Total (€)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {comprasFiltradas.map((compra) => (
                  <tr key={compra.id} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {compra.numeroCompleto}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {compra.nombre || compra.supplierNombre || compra.proveedor || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {compra.fechaEmision ? new Date(compra.fechaEmision).toLocaleDateString('es-ES') : (compra.fecha ? new Date(compra.fecha).toLocaleDateString('es-ES') : (compra.fechaRecepcion ? new Date(compra.fechaRecepcion).toLocaleDateString('es-ES') : '-'))}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                      €{(compra.baseTotal || compra.base || compra.neto || 0).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 font-medium">
                      €{(compra.ivaTotal || compra.iva || compra.totaliva || 0).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 font-bold">
                      €{(compra.totalFactura || compra.total).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getEstadoBadgeColor(compra.estado)}`}>
                        {compra.estado}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition">
                        <Eye size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>💡 Próximamente:</strong> Los asientos contables se generarán automáticamente al contabilizar estas compras
          en el módulo de Motor Contable. Verás cómo se mapean a IVA soportado, IRPF y cuentas de proveedores.
        </p>
      </div>
    </div>
  );
}
