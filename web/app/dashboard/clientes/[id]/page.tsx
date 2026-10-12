'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from '@phosphor-icons/react';
import { getToken } from '@/lib/auth';
import { ApiError, apiFetch, companyPath } from '@/lib/api';
import { anioEspana, nombreTrimestre, rangoFechas } from '@/lib/anios';
import { anioOTodosDeUrl, anioParaUrl, ponerEnUrl, trimestreDeUrl } from '@/lib/urlEstado';
import { useAniosEmpresa } from '@/lib/useAniosEmpresa';
import SelectorAnio from '@/components/SelectorAnio';
import { BloqueContabilidadTercero } from '@/components/contabilidad/BloqueContabilidadTercero';
import { DatosFiscalesCliente, type DatosFiscales } from './DatosFiscalesCliente';

interface Cliente extends DatosFiscales {
  email?: string;
  telefono?: string;
  /** Subcuenta propia (430 + numero). */
  subcuenta430?: string | null;
  /** Subcuentas que ya estan en el plan contable (con movimientos). */
  subcuentasEnPlan?: string[];
}

/** Factura del listado GET /income-invoices?customerId= */
interface FacturaApi {
  id: string;
  numeroCompleto: string | null;
  estadoDocumento: string;
  fechaEmision: string;
  fechaVencimiento?: string | null;
  estado: string;
  baseTotal: number;
  totalFactura: number;
}

interface Factura {
  id: string;
  numero: string;
  fecha: string;
  vencimiento?: string;
  total: number;
  estado: string;
  concepto?: string;
  base?: number;
}

export default function ClienteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const clienteId = params.id as string;

  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Año (null = todos) y trimestre: filtran de verdad las facturas que se piden. Se guardan
  // en la URL: al volver de una factura o del mayor, la ficha sigue en el mismo año.
  const [selectedYear, setSelectedYear] = useState<number | null>(() => {
    const url = anioOTodosDeUrl();
    return url === undefined ? anioEspana() : url;
  });
  const [selectedPeriod, setSelectedPeriod] = useState<'year' | 'q1' | 'q2' | 'q3' | 'q4'>(() => {
    const t = trimestreDeUrl();
    return t ? (`q${t}` as 'q1' | 'q2' | 'q3' | 'q4') : 'year';
  });
  const [cargandoFacturas, setCargandoFacturas] = useState(false);
  const aniosEmpresa = useAniosEmpresa();

  useEffect(() => {
    const loadData = async () => {
      const token = getToken();
      if (!token) {
        router.replace('/login');
        return;
      }

      setLoading(true);
      try {
        // apiFetch: un 401 lleva al login.
        const c = await apiFetch<Cliente>(companyPath(`/clientes/${encodeURIComponent(clienteId)}`)).catch((e) => {
          if (e instanceof ApiError && e.status === 404) return null;
          throw e;
        });
        setCliente(c);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [clienteId, router]);

  // Facturas del cliente en el año y trimestre elegidos (de la empresa activa).
  useEffect(() => {
    let vivo = true;
    const q = new URLSearchParams({ customerId: clienteId, take: '500' });
    if (selectedYear !== null) {
      const t = selectedPeriod === 'year' ? null : Number(selectedPeriod.slice(1));
      const { desde, hasta } = rangoFechas(selectedYear, t);
      q.set('desde', desde);
      q.set('hasta', hasta);
    }
    setCargandoFacturas(true);
    apiFetch<{ items: FacturaApi[]; total?: number }>(companyPath(`/income-invoices?${q.toString()}`))
      .catch(() => ({ items: [] as FacturaApi[] }))
      .then((f) => {
        if (!vivo) return;
        setFacturas(
          (f.items ?? [])
            .filter((x) => x.estadoDocumento !== 'BORRADOR')
            .map((x) => ({
              id: x.id,
              numero: x.numeroCompleto ?? '',
              fecha: x.fechaEmision,
              vencimiento: x.fechaVencimiento ?? undefined,
              total: Number(x.totalFactura) || 0,
              base: Number(x.baseTotal) || 0,
              estado: x.estado,
            })),
        );
      })
      .finally(() => vivo && setCargandoFacturas(false));
    return () => {
      vivo = false;
    };
  }, [clienteId, selectedYear, selectedPeriod]);

  const formatCurrency = (n: number) =>
    n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  // AAAA-MM-DD -> DD/MM/AAAA, sin Date (no cambia con la hora del navegador).
  const formatDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

  const totalFacturado = facturas.reduce((sum, f) => sum + f.total, 0);
  const totalCobrado = facturas
    .filter((f) => f.estado === 'PAID' || f.estado === 'Pagada')
    .reduce((sum, f) => sum + f.total, 0);
  const totalPendiente = totalFacturado - totalCobrado;
  const porcentajeCobrado = totalFacturado > 0 ? (totalCobrado / totalFacturado) * 100 : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-slate-600 mb-2">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-rose-600">Cliente no encontrado</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <header className="sticky top-0 z-40 h-16 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-full flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="font-semibold text-slate-900">{cliente.nombreFiscal}</h1>
            <p className="text-sm text-slate-500">{cliente.nifCif}</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 md:px-8 py-8">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 p-4 mb-6">
            {error}
          </div>
        )}

        <DatosFiscalesCliente cliente={cliente} onGuardado={(c) => setCliente((x) => (x ? { ...x, ...c } : x))} />

        <BloqueContabilidadTercero tipo="cliente" id={clienteId} subcuentas={[{ codigo: cliente.subcuenta430 }]} subcuentasEnPlan={cliente.subcuentasEnPlan} ejercicio={selectedYear} />

        {/* Tabs */}
        <div className="flex gap-4 border-b border-slate-200 mb-6">
          <button className="px-4 py-3 font-medium text-accent-600 border-b-2 border-accent-600">
            Facturas
          </button>
        </div>

        {/* Filtros: año (o todos) y trimestre */}
        <div className="flex gap-4 mb-6 flex-wrap items-end">
          <SelectorAnio
            id="cliente-anio"
            etiqueta="Año"
            todos="Todos los años"
            valor={selectedYear}
            anios={aniosEmpresa.anios([selectedYear])}
            onChange={(a) => {
              setSelectedYear(a);
              if (a === null) setSelectedPeriod('year');
              ponerEnUrl({ ejercicio: anioParaUrl(a), trimestre: a === null || selectedPeriod === 'year' ? null : selectedPeriod.slice(1) });
            }}
            className="mt-1 block px-4 py-2 border border-slate-300 rounded-lg text-sm bg-white"
          />

          <div>
            <label htmlFor="cliente-periodo" className="block text-sm font-medium text-slate-700">Periodo</label>
            <select
              id="cliente-periodo"
              value={selectedPeriod}
              disabled={selectedYear === null}
              onChange={(e) => {
                const p = e.target.value as typeof selectedPeriod;
                setSelectedPeriod(p);
                ponerEnUrl({ ejercicio: anioParaUrl(selectedYear), trimestre: p === 'year' ? null : p.slice(1) });
              }}
              className="mt-1 block px-4 py-2 border border-slate-300 rounded-lg text-sm bg-white disabled:opacity-60"
            >
              <option value="year">Todo el año</option>
              {[1, 2, 3, 4].map((t) => (
                <option key={t} value={`q${t}`}>
                  {nombreTrimestre(t)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Resumen de Cobros */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <p className="text-sm text-slate-600 mb-1">Total Facturado</p>
                <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalFacturado)}</p>
              </div>
              <div>
                <p className="text-sm text-slate-600 mb-1">Total Cobrado</p>
                <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalCobrado)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <p className="text-sm text-slate-600 mb-3">Estado de Cobro</p>
            <div className="mb-3">
              <div className="h-6 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${porcentajeCobrado}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-emerald-600 font-semibold">Cobrado</p>
                <p className="text-slate-900">{Math.round(porcentajeCobrado)}%</p>
              </div>
              <div>
                <p className="text-amber-600 font-semibold">Pendiente</p>
                <p className="text-slate-900">{formatCurrency(totalPendiente)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabla de Facturas */}
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold text-sm text-slate-900">
                    Estado
                  </th>
                  <th className="text-left px-6 py-3 font-semibold text-sm text-slate-900">
                    Número
                  </th>
                  <th className="text-left px-6 py-3 font-semibold text-sm text-slate-900">
                    Emisión
                  </th>
                  <th className="text-left px-6 py-3 font-semibold text-sm text-slate-900">
                    Vencimiento
                  </th>
                  <th className="text-left px-6 py-3 font-semibold text-sm text-slate-900">
                    Concepto
                  </th>
                  <th className="text-right px-6 py-3 font-semibold text-sm text-slate-900">
                    Base (€)
                  </th>
                  <th className="text-right px-6 py-3 font-semibold text-sm text-slate-900">
                    Total (€)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {facturas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                      {cargandoFacturas ? 'Cargando…' : selectedYear === null ? 'Sin facturas' : 'Sin facturas en este periodo'}
                    </td>
                  </tr>
                ) : (
                  facturas.map((factura) => (
                    <tr key={factura.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <span
                          className={`inline-block px-2.5 py-1 rounded text-xs font-semibold ${
                            factura.estado === 'PAID' || factura.estado === 'Pagada'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {factura.estado === 'PAID' || factura.estado === 'Pagada'
                            ? 'Pagada'
                            : 'Pendiente'}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-mono text-sm text-slate-900">
                        {factura.numero}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {formatDate(factura.fecha)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {factura.vencimiento ? formatDate(factura.vencimiento) : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">
                        {factura.concepto || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-slate-900 font-mono">
                        {formatCurrency(factura.base || 0)}
                      </td>
                      <td className="px-6 py-4 text-sm text-right text-slate-900 font-mono font-semibold">
                        {formatCurrency(factura.total)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 text-sm text-slate-600">
            {facturas.length === 1 ? '1 factura' : `${facturas.length} facturas`}
            {selectedYear !== null ? ` en ${selectedPeriod === 'year' ? selectedYear : `el ${selectedPeriod.slice(1)}T de ${selectedYear}`}` : ''}
          </div>
        </div>
      </main>
    </div>
  );
}
