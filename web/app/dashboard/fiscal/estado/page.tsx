'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { CheckCircle, Clock, WarningCircle, ArrowRight, Calendar, MagnifyingGlass, X } from '@phosphor-icons/react';

interface ModeloEstado {
  codigo: string;
  nombre: string;
  periodo?: string;
  estado: 'vigente' | 'presentado' | 'no-generado';
}

const MODELOS_INFO: Record<string, { nombre: string; color: string }> = {
  '303': { nombre: 'IVA Trimestral', color: 'blue' },
  '111': { nombre: 'Retenciones Trimestral', color: 'amber' },
  '200': { nombre: 'Impuesto de Sociedades', color: 'emerald' },
  '347': { nombre: 'Operaciones con Terceros', color: 'violet' },
  '115': { nombre: 'Arrendamientos', color: 'rose' },
  '390': { nombre: 'Resumen Anual IVA', color: 'cyan' },
  '190': { nombre: 'Resumen Retenciones', color: 'indigo' },
};

const VENCIMIENTOS = [
  { modelo: '303 Q1', fecha: '30 de abril', diasRestantes: 90 },
  { modelo: '111 Q1', fecha: '30 de abril', diasRestantes: 90 },
  { modelo: '347', fecha: '1 de febrero', diasRestantes: 160 },
  { modelo: '390', fecha: '1 de febrero', diasRestantes: 160 },
  { modelo: '190', fecha: '1 de febrero', diasRestantes: 160 },
  { modelo: '200', fecha: '25 de junio', diasRestantes: 328 },
];

export default function EstadoFiscalPage() {
  const [ejercicio, setEjercicio] = useState(new Date().getFullYear());
  const [estados, setEstados] = useState<Record<number, ModeloEstado[]>>({});
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'presentado' | 'borrador' | 'no-generado'>('todos');

  useEffect(() => {
    const fetchEstados = async () => {
      try {
        setLoading(true);
        setErrorCarga('');
        const lista = await apiFetch<any[]>(companyPath('/tax-models'));
        const grouped: Record<number, ModeloEstado[]> = {};

        (lista || []).forEach((modelo: any) => {
          if (!grouped[modelo.ejercicio]) grouped[modelo.ejercicio] = [];
          grouped[modelo.ejercicio].push({
            codigo: modelo.codigo,
            nombre: modelo.nombre,
            estado: modelo.estado || 'vigente',
            periodo: `${modelo.ejercicio}${modelo.trimestre ? ` Q${modelo.trimestre}` : ''}`,
          });
        });

        setEstados(grouped);
      } catch (err) {
        setErrorCarga(errorMessage(err));
      } finally {
        setLoading(false);
      }
    };

    fetchEstados();
  }, []);

  const ejercicioModelos = estados[ejercicio] || [];
  const modelosCodigos = Object.keys(MODELOS_INFO);
  const modelosGenerados = ejercicioModelos.length;
  const modelosPresentados = ejercicioModelos.filter(m => m.estado === 'presentado').length;

  // Lógica de filtrado
  const modelosFiltrados = modelosCodigos.filter((codigo) => {
    const modelo = ejercicioModelos.find(m => m.codigo === codigo);
    const matchesBusqueda = codigo.includes(busqueda) || MODELOS_INFO[codigo].nombre.toLowerCase().includes(busqueda.toLowerCase());
    const matchesEstado = filtroEstado === 'todos' ||
      (filtroEstado === 'presentado' && modelo?.estado === 'presentado') ||
      (filtroEstado === 'borrador' && modelo?.estado === 'vigente') ||
      (filtroEstado === 'no-generado' && !modelo);
    return matchesBusqueda && matchesEstado;
  });

  if (loading) {
    return <div className="h-96 animate-pulse rounded-lg bg-slate-200" />;
  }

  return (
    <div className="space-y-8">
      {errorCarga && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {errorCarga}
        </div>
      )}
      <div>
        <h1 className="text-4xl font-bold text-slate-900">Estado Fiscal</h1>
        <p className="mt-2 text-lg text-slate-600">Visión global de modelos generados, presentados y próximos vencimientos</p>
      </div>

      <div className="flex items-end gap-4 rounded-lg border border-slate-200 bg-white p-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">Ejercicio</label>
          <select
            value={ejercicio}
            onChange={(e) => setEjercicio(parseInt(e.target.value))}
            className="mt-2 rounded-lg border border-slate-300 px-4 py-2 text-base font-medium"
          >
            {[2024, 2025, 2026, 2027].map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-emerald-600">Modelos Generados</p>
              <p className="mt-2 text-3xl font-bold text-emerald-900">{modelosGenerados}</p>
              <p className="mt-1 text-xs text-emerald-600">de {modelosCodigos.length} total</p>
            </div>
            <CheckCircle size={40} className="text-emerald-600" />
          </div>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600">Presentados</p>
              <p className="mt-2 text-3xl font-bold text-blue-900">{modelosPresentados}</p>
              <p className="mt-1 text-xs text-blue-600">a Hacienda</p>
            </div>
            <CheckCircle size={40} className="text-blue-600" />
          </div>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-amber-600">Pendientes</p>
              <p className="mt-2 text-3xl font-bold text-amber-900">{modelosCodigos.length - modelosGenerados}</p>
              <p className="mt-1 text-xs text-amber-600">por generar</p>
            </div>
            <WarningCircle size={40} className="text-amber-600" />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Estado de Modelos – {ejercicio}</h2>

        {/* Búsqueda y Filtros */}
        <div className="mb-6 space-y-4">
          {/* Barra de Búsqueda */}
          <div className="relative">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Buscar por código o nombre (ej. 303, IVA)..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full rounded-lg border border-slate-300 pl-10 pr-10 py-2 text-sm placeholder-slate-400 focus:border-blue-500 focus:outline-none transition"
            />
            {busqueda && (
              <button
                onClick={() => setBusqueda('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            )}
          </div>

          {/* Filtros de Estado */}
          <div className="flex flex-wrap gap-2">
            {(['todos', 'presentado', 'borrador', 'no-generado'] as const).map((filtro) => (
              <button
                key={filtro}
                onClick={() => setFiltroEstado(filtro)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                  filtroEstado === filtro
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {filtro === 'todos' ? 'Todos' : filtro === 'presentado' ? 'Presentados' : filtro === 'borrador' ? 'Borradores' : 'No generados'}
              </button>
            ))}
          </div>
        </div>

        {/* Grid de Modelos */}
        {modelosFiltrados.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
            <WarningCircle size={32} className="mx-auto mb-2 text-amber-600" />
            <p className="text-sm font-medium text-amber-900">No se encontraron modelos</p>
            <p className="mt-1 text-xs text-amber-700">
              {busqueda || filtroEstado !== 'todos'
                ? 'Intenta ajustar la búsqueda o los filtros'
                : 'No hay modelos fiscales para este ejercicio'}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 transition-all duration-300">
            {modelosFiltrados.map((codigo) => {
            const modelo = ejercicioModelos.find(m => m.codigo === codigo);
            const info = MODELOS_INFO[codigo];
            const colorMap: Record<string, string> = {
              blue: 'border-blue-200 bg-blue-50',
              amber: 'border-amber-200 bg-amber-50',
              emerald: 'border-emerald-200 bg-emerald-50',
              violet: 'border-violet-200 bg-violet-50',
              rose: 'border-rose-200 bg-rose-50',
              cyan: 'border-cyan-200 bg-cyan-50',
              indigo: 'border-indigo-200 bg-indigo-50',
            };

            return (
              <Link
                key={codigo}
                href={`/dashboard/fiscal/modelo-${codigo}`}
                className={`group rounded-lg border-2 p-4 transition hover:shadow-md ${colorMap[info.color]}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">Modelo {codigo}</p>
                    <p className="text-xs text-slate-600">{info.nombre}</p>
                  </div>
                  {modelo?.estado === 'presentado' ? (
                    <CheckCircle size={20} className="text-green-600" weight="fill" />
                  ) : modelo ? (
                    <Clock size={20} className="text-amber-600" weight="fill" />
                  ) : (
                    <WarningCircle size={20} className="text-red-600" weight="fill" />
                  )}
                </div>

                {modelo ? (
                  <div className="mt-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                        modelo.estado === 'presentado'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {modelo.estado === 'presentado' ? '✓ Presentado' : '⏳ Borrador'}
                    </span>
                  </div>
                ) : (
                  <div className="mt-3">
                    <span className="inline-flex rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
                      ✕ No generado
                    </span>
                  </div>
                )}
              </Link>
            );
          })}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900">
          <Calendar size={24} className="text-blue-600" />
          Próximos Vencimientos
        </h2>

        <div className="space-y-3">
          {VENCIMIENTOS.map((v, idx) => {
            const urgencia = v.diasRestantes <= 30 ? 'rojo' : v.diasRestantes <= 90 ? 'ámbar' : 'verde';
            const colorBg = urgencia === 'rojo' ? 'border-l-red-500 bg-red-50' : urgencia === 'ámbar' ? 'border-l-amber-500 bg-amber-50' : 'border-l-green-500 bg-green-50';

            return (
              <div key={idx} className={`flex items-center justify-between rounded-lg border-l-4 p-4 ${colorBg}`}>
                <div className="flex-1">
                  <p className="font-semibold text-slate-900">Modelo {v.modelo}</p>
                  <p className="text-sm text-slate-600">Vencimiento: {v.fecha}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-slate-600">{v.diasRestantes} días</p>
                  <p className="text-xs text-slate-500">
                    {urgencia === 'rojo' ? '🔴 Urgente' : urgencia === 'ámbar' ? '🟡 Próximo' : '🟢 Tiempo'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border-l-4 border-l-blue-500 bg-blue-50 p-4">
        <p className="text-sm text-blue-900">
          <strong>Consejo:</strong> Revisa esta página regularmente para asegurar que todos tus modelos estén generados y presentados a tiempo.
        </p>
      </div>
    </div>
  );
}
