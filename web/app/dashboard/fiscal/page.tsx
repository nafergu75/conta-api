'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { FileText, ArrowRight } from '@phosphor-icons/react';

interface ModeloResumen {
  codigo: '303' | '111' | '200' | '347' | '115' | '390' | '190';
  nombre: string;
  descripcion: string;
  estado: 'vigente' | 'presentado';
  periodo: string;
}

export default function FiscalPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const [modelos, setModelos] = useState<ModeloResumen[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchModelos = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/companies/${companyId}/tax-models`);

        if (response.ok) {
          const data = await response.json();
          // Transformar datos para mostrar resumen
          setModelos(
            (data.data || []).slice(0, 6).map((m: any) => ({
              codigo: m.codigo,
              nombre: m.nombre,
              descripcion: m.descripcion,
              estado: m.estado,
              periodo: `${m.ejercicio}${m.trimestre ? ` Q${m.trimestre}` : ''}`,
            }))
          );
        }
      } catch (err) {
        console.error('Error fetching modelos:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchModelos();
  }, [companyId]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold text-slate-900">Modelos Fiscales</h1>
        <p className="mt-2 text-lg text-slate-600">
          Gestión centralizada de declaraciones fiscales (IVA, Retenciones, Impuesto de Sociedades)
        </p>
      </div>

      {/* Modelos Principales */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-slate-900">Declaraciones Disponibles</h2>

        <div className="grid gap-4 md:grid-cols-3">
          {/* Modelo 303 */}
          <Link
            href={`/dashboard/fiscal/modelo-303`}
            className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-6 transition hover:shadow-lg"
          >
            <div className="absolute right-0 top-0 h-32 w-32 bg-gradient-to-br from-blue-50 to-transparent" />

            <div className="relative">
              <div className="inline-flex items-center justify-center rounded-lg bg-blue-50 p-3">
                <FileText size={24} className="text-blue-600" />
              </div>

              <h3 className="mt-4 text-lg font-semibold text-slate-900">Modelo 303</h3>
              <p className="mt-1 text-sm text-slate-600">IVA Trimestral</p>

              <p className="mt-3 text-xs text-slate-500">
                Declare y gestione el IVA repercutido y soportado de cada trimestre
              </p>

              <div className="mt-4 flex items-center gap-2 text-sm font-medium text-blue-600 group-hover:gap-3 transition-all">
                Abrir modelo
                <ArrowRight size={16} />
              </div>
            </div>
          </Link>

          {/* Modelo 111 */}
          <Link
            href={`/dashboard/fiscal/modelo-111`}
            className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-6 transition hover:shadow-lg"
          >
            <div className="absolute right-0 top-0 h-32 w-32 bg-gradient-to-br from-amber-50 to-transparent" />

            <div className="relative">
              <div className="inline-flex items-center justify-center rounded-lg bg-amber-50 p-3">
                <FileText size={24} className="text-amber-600" />
              </div>

              <h3 className="mt-4 text-lg font-semibold text-slate-900">Modelo 111</h3>
              <p className="mt-1 text-sm text-slate-600">Retenciones e Ingresos a Cuenta</p>

              <p className="mt-3 text-xs text-slate-500">
                Gestione retenciones practicadas en pagos a profesionales (IRPF)
              </p>

              <div className="mt-4 flex items-center gap-2 text-sm font-medium text-amber-600 group-hover:gap-3 transition-all">
                Abrir modelo
                <ArrowRight size={16} />
              </div>
            </div>
          </Link>

          {/* Modelo 200 */}
          <Link
            href={`/dashboard/fiscal/modelo-200`}
            className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-6 transition hover:shadow-lg"
          >
            <div className="absolute right-0 top-0 h-32 w-32 bg-gradient-to-br from-emerald-50 to-transparent" />

            <div className="relative">
              <div className="inline-flex items-center justify-center rounded-lg bg-emerald-50 p-3">
                <FileText size={24} className="text-emerald-600" />
              </div>

              <h3 className="mt-4 text-lg font-semibold text-slate-900">Modelo 200</h3>
              <p className="mt-1 text-sm text-slate-600">Impuesto de Sociedades</p>

              <p className="mt-3 text-xs text-slate-500">
                Declare la cuota íntegra y líquida del Impuesto sobre Sociedades
              </p>

              <div className="mt-4 flex items-center gap-2 text-sm font-medium text-emerald-600 group-hover:gap-3 transition-all">
                Abrir modelo
                <ArrowRight size={16} />
              </div>
            </div>
          </Link>

          {/* Modelo 347 */}
          <Link
            href={`/dashboard/fiscal/modelo-347`}
            className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-6 transition hover:shadow-lg"
          >
            <div className="absolute right-0 top-0 h-32 w-32 bg-gradient-to-br from-violet-50 to-transparent" />

            <div className="relative">
              <div className="inline-flex items-center justify-center rounded-lg bg-violet-50 p-3">
                <FileText size={24} className="text-violet-600" />
              </div>

              <h3 className="mt-4 text-lg font-semibold text-slate-900">Modelo 347</h3>
              <p className="mt-1 text-sm text-slate-600">Operaciones con Terceros</p>

              <p className="mt-3 text-xs text-slate-500">
                Declare operaciones con clientes y proveedores superiores a 3.000€
              </p>

              <div className="mt-4 flex items-center gap-2 text-sm font-medium text-violet-600 group-hover:gap-3 transition-all">
                Abrir modelo
                <ArrowRight size={16} />
              </div>
            </div>
          </Link>

          {/* Modelo 115 */}
          <Link
            href={`/dashboard/fiscal/modelo-115`}
            className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-6 transition hover:shadow-lg"
          >
            <div className="absolute right-0 top-0 h-32 w-32 bg-gradient-to-br from-rose-50 to-transparent" />

            <div className="relative">
              <div className="inline-flex items-center justify-center rounded-lg bg-rose-50 p-3">
                <FileText size={24} className="text-rose-600" />
              </div>

              <h3 className="mt-4 text-lg font-semibold text-slate-900">Modelo 115</h3>
              <p className="mt-1 text-sm text-slate-600">Arrendamientos Locales</p>

              <p className="mt-3 text-xs text-slate-500">
                Declare las retenciones IRPF practicadas sobre arrendamientos
              </p>

              <div className="mt-4 flex items-center gap-2 text-sm font-medium text-rose-600 group-hover:gap-3 transition-all">
                Abrir modelo
                <ArrowRight size={16} />
              </div>
            </div>
          </Link>

          {/* Modelo 390 */}
          <Link
            href={`/dashboard/fiscal/modelo-390`}
            className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-6 transition hover:shadow-lg"
          >
            <div className="absolute right-0 top-0 h-32 w-32 bg-gradient-to-br from-cyan-50 to-transparent" />

            <div className="relative">
              <div className="inline-flex items-center justify-center rounded-lg bg-cyan-50 p-3">
                <FileText size={24} className="text-cyan-600" />
              </div>

              <h3 className="mt-4 text-lg font-semibold text-slate-900">Modelo 390</h3>
              <p className="mt-1 text-sm text-slate-600">Resumen Anual de IVA</p>

              <p className="mt-3 text-xs text-slate-500">
                Consolidación anual de los 4 trimestres (303) en resumen de IVA
              </p>

              <div className="mt-4 flex items-center gap-2 text-sm font-medium text-cyan-600 group-hover:gap-3 transition-all">
                Abrir modelo
                <ArrowRight size={16} />
              </div>
            </div>
          </Link>

          {/* Modelo 190 */}
          <Link
            href={`/dashboard/fiscal/modelo-190`}
            className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-6 transition hover:shadow-lg"
          >
            <div className="absolute right-0 top-0 h-32 w-32 bg-gradient-to-br from-indigo-50 to-transparent" />

            <div className="relative">
              <div className="inline-flex items-center justify-center rounded-lg bg-indigo-50 p-3">
                <FileText size={24} className="text-indigo-600" />
              </div>

              <h3 className="mt-4 text-lg font-semibold text-slate-900">Modelo 190</h3>
              <p className="mt-1 text-sm text-slate-600">Resumen Anual de Retenciones</p>

              <p className="mt-3 text-xs text-slate-500">
                Consolidación anual de los 4 trimestres (111) en resumen de retenciones
              </p>

              <div className="mt-4 flex items-center gap-2 text-sm font-medium text-indigo-600 group-hover:gap-3 transition-all">
                Abrir modelo
                <ArrowRight size={16} />
              </div>
            </div>
          </Link>

          {/* Modelo 347 */}
          <Link
            href={`/dashboard/fiscal/modelo-347`}
            className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-6 transition hover:shadow-lg"
          >
            <div className="absolute right-0 top-0 h-32 w-32 bg-gradient-to-br from-violet-50 to-transparent" />

            <div className="relative">
              <div className="inline-flex items-center justify-center rounded-lg bg-violet-50 p-3">
                <FileText size={24} className="text-violet-600" />
              </div>

              <h3 className="mt-4 text-lg font-semibold text-slate-900">Modelo 347</h3>
              <p className="mt-1 text-sm text-slate-600">Operaciones con Terceros</p>

              <p className="mt-3 text-xs text-slate-500">
                Declaración anual de operaciones con terceros superiores a 3.005€
              </p>

              <div className="mt-4 flex items-center gap-2 text-sm font-medium text-violet-600 group-hover:gap-3 transition-all">
                Abrir modelo
                <ArrowRight size={16} />
              </div>
            </div>
          </Link>

          {/* Modelo 115 */}
          <Link
            href={`/dashboard/fiscal/modelo-115`}
            className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-6 transition hover:shadow-lg"
          >
            <div className="absolute right-0 top-0 h-32 w-32 bg-gradient-to-br from-fuchsia-50 to-transparent" />

            <div className="relative">
              <div className="inline-flex items-center justify-center rounded-lg bg-fuchsia-50 p-3">
                <FileText size={24} className="text-fuchsia-600" />
              </div>

              <h3 className="mt-4 text-lg font-semibold text-slate-900">Modelo 115</h3>
              <p className="mt-1 text-sm text-slate-600">Retenciones Arrendamientos</p>

              <p className="mt-3 text-xs text-slate-500">
                Consolidación anual de retenciones IRPF sobre arrendamientos de locales
              </p>

              <div className="mt-4 flex items-center gap-2 text-sm font-medium text-fuchsia-600 group-hover:gap-3 transition-all">
                Abrir modelo
                <ArrowRight size={16} />
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* Información General */}
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6">
        <h3 className="font-semibold text-slate-900">¿Cómo usar los modelos fiscales?</h3>

        <div className="mt-4 space-y-3 text-sm text-slate-600">
          <div className="flex gap-3">
            <div className="flex-shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
              1
            </div>
            <div>
              <strong>Selecciona el modelo</strong> que necesites gestionar (303, 111 o 200)
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
              2
            </div>
            <div>
              <strong>Elige el período</strong> (ejercicio y trimestre cuando sea necesario)
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
              3
            </div>
            <div>
              <strong>Revisa las casillas</strong> generadas automáticamente desde tus movimientos
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
              4
            </div>
            <div>
              <strong>Marca como presentado</strong> una vez hayas presentado el modelo en Hacienda
            </div>
          </div>
        </div>
      </div>

      {/* Historial Reciente */}
      {modelos.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <h3 className="mb-4 font-semibold text-slate-900">Últimos Modelos</h3>

          <div className="space-y-2">
            {modelos.slice(0, 3).map((modelo) => (
              <div key={`${modelo.codigo}-${modelo.periodo}`} className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
                <div>
                  <p className="font-medium text-slate-900">
                    Modelo {modelo.codigo} – {modelo.periodo}
                  </p>
                  <p className="text-xs text-slate-500">{modelo.descripcion}</p>
                </div>

                <div className="flex items-center gap-3">
                  <div
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                      modelo.estado === 'presentado'
                        ? 'border border-green-200 bg-green-50 text-green-700'
                        : 'border border-amber-200 bg-amber-50 text-amber-700'
                    }`}
                  >
                    {modelo.estado === 'presentado' ? '✓ Presentado' : 'Borrador'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notas Legales */}
      <div className="rounded-lg border-l-4 border-l-blue-500 bg-blue-50 px-4 py-4">
        <p className="text-sm text-blue-900">
          <strong>Nota importante:</strong> Los modelos fiscales se generan automáticamente a partir de tus
          movimientos contables registrados. Verifica siempre que los datos sean correctos antes de presentar
          la declaración en Hacienda. Para cambios o ajustes, contacta con tu asesor fiscal.
        </p>
      </div>
    </div>
  );
}
