'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiDownload, apiFetch, companyPath, errorMessage } from '@/lib/api';
import { CaretLeft, Download, MagnifyingGlass, X } from '@phosphor-icons/react';
import { CasillasViewer } from '../components/CasillasViewer';
import { FormPresentar } from '../components/FormPresentar';

interface Tercero {
  nif: string;
  nombre: string;
  tipoTercero: 'cliente' | 'proveedor';
  totalOperaciones: number;
}

interface Modelo347 {
  id: string;
  ejercicio: number;
  terceros: Tercero[];
  totalTerceros: number;
  totalOperaciones: number;
  estado: 'vigente' | 'presentado';
  casillas: Record<string, any>;
}

export default function Modelo347Page() {
  const [modelo, setModelo] = useState<Modelo347 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [avisoDescarga, setAvisoDescarga] = useState('');
  const [ejercicio, setEjercicio] = useState(new Date().getFullYear());
  const [searchTercero, setSearchTercero] = useState('');

  useEffect(() => {
    const fetchModelo = async () => {
      try {
        setLoading(true);
        setError('');
        setModelo(await apiFetch<Modelo347>(companyPath(`/tax-models/347?ejercicio=${ejercicio}`)));
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setLoading(false);
      }
    };

    fetchModelo();
  }, [ejercicio]);

  const eur = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  });

  const descargarAEAT = () => {
    // El backend aun no genera el fichero de este modelo (solo el del 303).
    setAvisoDescarga(
      'La descarga del fichero AEAT de este modelo aún no está disponible. Puedes copiar las casillas desde esta pantalla.',
    );
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-32 animate-pulse rounded-lg bg-slate-200" />
        <div className="h-96 animate-pulse rounded-lg bg-slate-200" />
      </div>
    );
  }

  if (error || !modelo) {
    return (
      <div className="space-y-4">
        <Link href="/dashboard/fiscal" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700">
          <CaretLeft size={20} />
          Volver a Fiscal
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-red-800">{error || 'Modelo no encontrado'}</p>
        </div>
      </div>
    );
  }

  // Separar clientes y proveedores
  const clientes = modelo.terceros.filter((t) => t.tipoTercero === 'cliente');
  const proveedores = modelo.terceros.filter((t) => t.tipoTercero === 'proveedor');

  // Filtrar por búsqueda
  const filtrarTerceros = (terceros: Tercero[]) => {
    if (!searchTercero.trim()) return terceros;
    const search = searchTercero.toLowerCase();
    return terceros.filter((t) =>
      t.nombre.toLowerCase().includes(search) || t.nif.toLowerCase().includes(search)
    );
  };

  const clientesFiltrados = filtrarTerceros(clientes);
  const proveedoresFiltrados = filtrarTerceros(proveedores);

  const totalClientes = clientes.reduce((sum, t) => sum + t.totalOperaciones, 0);
  const totalProveedores = proveedores.reduce((sum, t) => sum + t.totalOperaciones, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link href="/dashboard/fiscal" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-4">
          <CaretLeft size={20} />
          Volver a Fiscal
        </Link>
        <h1 className="text-3xl font-bold text-slate-900">Modelo 347 – Operaciones con Terceros</h1>
        <p className="mt-2 text-slate-600">Declaración de operaciones con terceros superiores a 3.000,06€</p>
      </div>

      {/* Período Selector y Búsqueda */}
      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Ejercicio</label>
          <select
            value={ejercicio}
            onChange={(e) => setEjercicio(parseInt(e.target.value))}
            className="mt-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {[2024, 2025, 2026, 2027].map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        {/* Búsqueda de Terceros */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Buscar tercero
          </label>
          <div className="relative">
            <MagnifyingGlass
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={searchTercero}
              onChange={(e) => setSearchTercero(e.target.value)}
              placeholder="Buscar por nombre o NIF..."
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-9 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            {searchTercero && (
              <button
                onClick={() => setSearchTercero('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                title="Limpiar búsqueda"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Resumen Rápido */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <p className="text-sm text-slate-600">Total de Terceros Reportados</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{modelo.totalTerceros}</p>
          <p className="mt-1 text-xs text-slate-500">Clientes: {clientes.length}, Proveedores: {proveedores.length}</p>
        </div>

        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6">
          <p className="text-sm text-emerald-600">Volumen Clientes (Ventas)</p>
          <p className="mt-2 text-2xl font-bold text-emerald-900">{eur.format(totalClientes)}</p>
          <p className="mt-1 text-xs text-emerald-600">{clientes.length} clientes reportados</p>
        </div>

        <div className="rounded-lg border border-orange-200 bg-orange-50 p-6">
          <p className="text-sm text-orange-600">Volumen Proveedores (Compras)</p>
          <p className="mt-2 text-2xl font-bold text-orange-900">{eur.format(totalProveedores)}</p>
          <p className="mt-1 text-xs text-orange-600">{proveedores.length} proveedores reportados</p>
        </div>
      </div>

      {/* Casillas Completas */}
      <CasillasViewer
        casillas={modelo.casillas}
        titulo="Casillas del Modelo 347"
        descripcion={`Ejercicio ${modelo.ejercicio} – Operaciones superiores a 3.000,06€`}
        estado={modelo.estado}
      />

      {/* Desglose Clientes */}
      {clientes.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h3 className="mb-4 font-semibold text-slate-900">
            Clientes Reportados (Ventas) – {clientesFiltrados.length}/{clientes.length}
          </h3>
          {clientesFiltrados.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center">
              <p className="text-sm text-amber-800">
                No se encontraron clientes con ese nombre o NIF.
              </p>
              <button
                onClick={() => setSearchTercero('')}
                className="mt-2 text-sm text-amber-700 hover:text-amber-900 font-medium underline"
              >
                Limpiar búsqueda
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3">NIF/CIF</th>
                    <th className="text-left py-3">Nombre</th>
                    <th className="text-right py-3">Volumen Operaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {clientesFiltrados.slice(0, 10).map((cliente, i) => (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 font-mono">{cliente.nif}</td>
                      <td className="py-3">{cliente.nombre}</td>
                      <td className="text-right py-3 font-medium">{eur.format(cliente.totalOperaciones)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {clientesFiltrados.length > 10 && (
            <p className="mt-2 text-xs text-slate-500">
              ... y {clientesFiltrados.length - 10} clientes más
            </p>
          )}
        </div>
      )}

      {/* Desglose Proveedores */}
      {proveedores.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h3 className="mb-4 font-semibold text-slate-900">
            Proveedores Reportados (Compras) – {proveedoresFiltrados.length}/{proveedores.length}
          </h3>
          {proveedoresFiltrados.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center">
              <p className="text-sm text-amber-800">
                No se encontraron proveedores con ese nombre o NIF.
              </p>
              <button
                onClick={() => setSearchTercero('')}
                className="mt-2 text-sm text-amber-700 hover:text-amber-900 font-medium underline"
              >
                Limpiar búsqueda
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-3">NIF/CIF</th>
                    <th className="text-left py-3">Nombre</th>
                    <th className="text-right py-3">Volumen Operaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {proveedoresFiltrados.slice(0, 10).map((proveedor, i) => (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 font-mono">{proveedor.nif}</td>
                      <td className="py-3">{proveedor.nombre}</td>
                      <td className="text-right py-3 font-medium">{eur.format(proveedor.totalOperaciones)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {proveedoresFiltrados.length > 10 && (
            <p className="mt-2 text-xs text-slate-500">
              ... y {proveedoresFiltrados.length - 10} proveedores más
            </p>
          )}
        </div>
      )}

      {/* Nota Informativa */}
      <div className="rounded-lg border-l-4 border-l-blue-500 bg-blue-50 p-4">
        <p className="text-sm text-blue-900">
          <strong>Nota importante:</strong> El modelo 347 incluye operaciones realizadas con terceros superiores
          a 3.000,06€ durante el ejercicio. Se reportan por separado clientes (ventas) y proveedores (compras).
        </p>
      </div>

      {/* Acciones Finales */}
      <div className="space-y-4">
        {/* Botón de Descarga AEAT */}
        {modelo.estado === 'vigente' && (
          <>
            <button
              onClick={descargarAEAT}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-medium text-white hover:bg-emerald-700 transition"
            >
              <Download size={18} />
              Descargar Fichero AEAT (TXT)
            </button>
            {avisoDescarga && (
              <p role="status" className="mt-2 text-sm text-amber-700">{avisoDescarga}</p>
            )}
          </>
        )}

        {/* Formulario de Presentación */}
        {modelo.estado === 'vigente' && <FormPresentar codigo="347" ejercicio={ejercicio} />}
      </div>
    </div>
  );
}
