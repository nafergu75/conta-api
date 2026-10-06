'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Books,
  CalendarCheck,
  DownloadSimple,
  FileArchive,
  FilePdf,
  Lock,
  Stamp,
  UploadSimple,
  X,
} from '@phosphor-icons/react';
import { Tooltip } from '@/app/dashboard/components/Tooltip';
import { ConfirmationModal } from '@/components/dashboard/ConfirmationModal';
import { apiDownload, apiFetch, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';

/**
 * Registro Mercantil: cierre del ejercicio, legalizacion de libros (4 meses
 * desde el cierre) y deposito de cuentas anuales (7 meses), con el historial de
 * versiones y presentaciones. La presentacion se hace en sede.registradores.org
 * con el certificado de la empresa; aqui se preparan los ficheros y se anota el
 * numero de entrada y el CSV del justificante.
 */

interface Ejercicio {
  id: string;
  label: string;
  fechaInicio: string;
  fechaFin: string;
  estado: 'OPEN' | 'CLOSED';
  closingDate: string | null;
  legalizationDeadline: string | null;
  accountsDepositDeadline: string | null;
}

interface Libro {
  id: string;
  type: string;
  status: string;
  filePath: string;
  updatedAt: string;
}

interface Expediente {
  id: string;
  status: string;
  size: number;
  createdAt: string;
  filedAt: string | null;
  registryEntryNumber: string | null;
  csv: string | null;
  diligencePath: string | null;
}

interface Cuentas {
  id: string;
  modelo: string;
  version: number;
  isLatestVersion: boolean;
  status: string;
  createdAt: string;
  filedAt: string | null;
  registryEntryNumber: string | null;
  csv: string | null;
}

const NOMBRE_LIBRO: Record<string, string> = {
  DIARIO: 'Libro Diario',
  INVENTARIOS_CUENTAS_ANUALES: 'Libro de Inventarios y Cuentas Anuales',
  ACTAS: 'Libro de Actas',
  SOCIOS: 'Libro Registro de Socios',
  CONTRATOS: 'Libro Registro de Contratos con el socio único',
};

const ESTADO: Record<string, { label: string; color: string }> = {
  // Libros
  PENDING: { label: 'Pendiente', color: 'bg-amber-100 text-amber-800' },
  GENERATED: { label: 'Generado', color: 'bg-blue-100 text-blue-800' },
  PACKAGE_READY: { label: 'En expediente', color: 'bg-indigo-100 text-indigo-800' },
  // Expedientes
  CREATED: { label: 'Preparado', color: 'bg-blue-100 text-blue-800' },
  ACCEPTED: { label: 'Legalizado', color: 'bg-green-100 text-green-800' },
  REJECTED: { label: 'Rechazado', color: 'bg-red-100 text-red-800' },
  // Cuentas anuales
  DRAFT: { label: 'Borrador', color: 'bg-slate-100 text-slate-700' },
  READY: { label: 'Lista para presentar', color: 'bg-blue-100 text-blue-800' },
  FILED: { label: 'Presentada', color: 'bg-indigo-100 text-indigo-800' },
  APROBADO: { label: 'Depositada', color: 'bg-green-100 text-green-800' },
  DEFECTOS: { label: 'Con defectos', color: 'bg-amber-100 text-amber-800' },
  RECHAZADO: { label: 'Rechazada', color: 'bg-red-100 text-red-800' },
};

const MODELOS = [
  { valor: 'PYME', label: 'PYMES', ayuda: 'Para la mayoría de pymes: balance y PyG abreviados, memoria PYMES.' },
  { valor: 'ABREVIADO', label: 'Abreviado', ayuda: 'Balance, ECPN y memoria abreviados.' },
  { valor: 'NORMAL', label: 'Normal', ayuda: 'Para empresas que superan los límites del abreviado.' },
];

function Estado({ status }: { status: string }) {
  const e = ESTADO[status] ?? { label: status, color: 'bg-slate-100 text-slate-700' };
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${e.color}`}>{e.label}</span>;
}

function fecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-ES');
}

function diasHasta(iso: string | null): number | null {
  if (!iso) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.round((new Date(`${iso}T00:00:00`).getTime() - hoy.getTime()) / 86_400_000);
}

function Plazo({ titulo, fechaLimite, hecho }: { titulo: string; fechaLimite: string | null; hecho: boolean }) {
  const dias = diasHasta(fechaLimite);
  let nota = 'Se calcula al cerrar el ejercicio';
  let color = 'text-slate-500';
  if (hecho) {
    nota = 'Hecho';
    color = 'text-green-700';
  } else if (dias !== null) {
    nota = dias < 0 ? `Vencido hace ${-dias} días` : dias === 0 ? 'Vence hoy' : `Quedan ${dias} días`;
    color = dias < 0 ? 'text-red-700' : dias <= 30 ? 'text-amber-700' : 'text-slate-600';
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-600">{titulo}</p>
      <p className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">{fecha(fechaLimite)}</p>
      <p className={`mt-1 text-sm ${color}`}>{nota}</p>
    </div>
  );
}

type Dialogo =
  | { tipo: 'presentarCuentas'; cuentas: Cuentas }
  | { tipo: 'resolucion'; cuentas: Cuentas }
  | { tipo: 'presentarExpediente'; expediente: Expediente }
  | { tipo: 'diligencia'; expediente: Expediente };

export default function RegistroMercantilPage() {
  const puedeEditar = tieneAlgunPermiso(getUser(), ['contabilidad:write']);

  const [ejercicios, setEjercicios] = useState<Ejercicio[]>([]);
  const [fyId, setFyId] = useState('');
  const [libros, setLibros] = useState<Libro[]>([]);
  const [expedientes, setExpedientes] = useState<Expediente[]>([]);
  const [cuentas, setCuentas] = useState<Cuentas[]>([]);
  const [modelo, setModelo] = useState('PYME');

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState('');
  const [confirmarCierre, setConfirmarCierre] = useState(false);
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);

  const ejercicio = useMemo(() => ejercicios.find((e) => e.id === fyId) ?? null, [ejercicios, fyId]);

  const cargarEjercicios = useCallback(async (seleccionar?: string) => {
    const lista = await apiFetch<Ejercicio[]>(companyPath('/fiscal-years'));
    setEjercicios(lista);
    setFyId((actual) => seleccionar ?? (lista.some((e) => e.id === actual) ? actual : lista[0]?.id ?? ''));
  }, []);

  const cargarDetalle = useCallback(async (id: string) => {
    if (!id) return;
    const [l, x, c] = await Promise.all([
      apiFetch<Libro[]>(`/fiscal-years/${id}/books`),
      apiFetch<Expediente[]>(`/fiscal-years/${id}/legalization-packages`),
      apiFetch<Cuentas[]>(`/fiscal-years/${id}/annual-accounts`),
    ]);
    setLibros(l);
    setExpedientes(x);
    setCuentas(c);
  }, []);

  useEffect(() => {
    cargarEjercicios()
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setCargando(false));
  }, [cargarEjercicios]);

  useEffect(() => {
    setLibros([]);
    setExpedientes([]);
    setCuentas([]);
    cargarDetalle(fyId).catch((e) => setError(errorMessage(e)));
  }, [fyId, cargarDetalle]);

  /** Ejecuta una accion, recarga y muestra el resultado. */
  const accion = async (clave: string, fn: () => Promise<unknown>, ok: string) => {
    setOcupado(clave);
    setAviso(null);
    try {
      await fn();
      await Promise.all([cargarEjercicios(fyId || undefined), cargarDetalle(fyId)]);
      setAviso({ tipo: 'ok', texto: ok });
    } catch (e) {
      setAviso({ tipo: 'error', texto: errorMessage(e) });
    } finally {
      setOcupado('');
    }
  };

  const crearEjercicio = async (anio: string) => {
    setOcupado('crear');
    setAviso(null);
    try {
      const fy = await apiFetch<Ejercicio>(companyPath('/fiscal-years'), {
        method: 'POST',
        body: JSON.stringify({ label: anio, fechaInicio: `${anio}-01-01`, fechaFin: `${anio}-12-31` }),
      });
      await cargarEjercicios(fy.id);
      setAviso({ tipo: 'ok', texto: `Ejercicio ${anio} creado.` });
    } catch (e) {
      setAviso({ tipo: 'error', texto: errorMessage(e) });
    } finally {
      setOcupado('');
    }
  };

  const cerrar = () =>
    accion('cerrar', () => apiFetch(`/fiscal-years/${fyId}/close`, { method: 'POST', body: '{}' }), `Ejercicio ${ejercicio?.label} cerrado.`).then(() =>
      setConfirmarCierre(false),
    );

  const generarLibros = () => {
    const tipos = libros.length ? libros.map((l) => l.type) : ['DIARIO', 'INVENTARIOS_CUENTAS_ANUALES', 'ACTAS'];
    return accion(
      'libros',
      () => apiFetch(`/fiscal-years/${fyId}/books/generate`, { method: 'POST', body: JSON.stringify({ tipos }) }),
      'Libros generados en PDF/A.',
    );
  };

  const crearExpediente = () =>
    accion(
      'expediente',
      () => apiFetch(`/fiscal-years/${fyId}/legalization-package`, { method: 'POST', body: '{}' }),
      'Expediente de legalización preparado. Descárgalo, fírmalo y preséntalo en el Registro.',
    );

  const generarCuentas = () =>
    accion(
      'cuentas',
      () => apiFetch(`/fiscal-years/${fyId}/annual-accounts/generate`, { method: 'POST', body: JSON.stringify({ modelo }) }),
      'Cuentas anuales generadas.',
    );

  const descargar = (clave: string, ruta: string, nombre: string) =>
    accion(clave, () => apiDownload(ruta, nombre), 'Descarga iniciada.');

  if (cargando) {
    return <p className="py-24 text-center text-slate-600">Cargando Registro Mercantil...</p>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        No se ha podido cargar el Registro Mercantil: {error}
      </div>
    );
  }

  const cerrado = ejercicio?.estado === 'CLOSED';
  const librosGenerados = libros.filter((l) => l.filePath).length;
  const legalizado = expedientes.some((x) => x.status === 'ACCEPTED');
  const depositado = cuentas.some((c) => c.status === 'APROBADO');
  const anioActual = new Date().getFullYear();
  const aniosLibres = [anioActual - 1, anioActual, anioActual - 2].map(String).filter((a) => !ejercicios.some((e) => e.label === a));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-slate-900">Registro Mercantil</h1>
            <Tooltip text="Tras cerrar el ejercicio: legaliza los libros (4 meses desde el cierre) y deposita las cuentas anuales (1 mes desde su aprobación por la junta, y como tarde 7 meses desde el cierre)." />
          </div>
          <p className="mt-2 text-slate-600">Legalización de libros y depósito de cuentas anuales.</p>
        </div>
        {ejercicios.length > 0 && (
          <div>
            <label htmlFor="ejercicio" className="block text-sm font-medium text-slate-700">Ejercicio</label>
            <select
              id="ejercicio"
              value={fyId}
              onChange={(e) => setFyId(e.target.value)}
              className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {ejercicios.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label} {e.estado === 'CLOSED' ? '(cerrado)' : '(abierto)'}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {aviso && (
        <div
          role={aviso.tipo === 'error' ? 'alert' : 'status'}
          className={`flex items-start justify-between gap-4 rounded-lg border px-4 py-3 text-sm ${
            aviso.tipo === 'ok' ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {aviso.texto}
          <button onClick={() => setAviso(null)} aria-label="Cerrar aviso"><X size={16} /></button>
        </div>
      )}

      {!ejercicio ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <CalendarCheck size={32} className="mx-auto text-slate-400" />
          <p className="mt-3 text-slate-700">Todavía no hay ningún ejercicio contable.</p>
          {puedeEditar ? (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {aniosLibres.map((a) => (
                <button
                  key={a}
                  onClick={() => crearEjercicio(a)}
                  disabled={ocupado === 'crear'}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Crear ejercicio {a}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Pide a un contable de la empresa que lo cree.</p>
          )}
        </div>
      ) : (
        <>
          {/* Estado y plazos */}
          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-600">Ejercicio {ejercicio.label}</p>
              <p className="mt-1 flex items-center gap-2 text-xl font-semibold text-slate-900">
                {cerrado && <Lock size={18} />}
                {cerrado ? 'Cerrado' : 'Abierto'}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {cerrado ? `Cierre: ${fecha(ejercicio.closingDate)}` : `Del ${fecha(ejercicio.fechaInicio)} al ${fecha(ejercicio.fechaFin)}`}
              </p>
              {!cerrado && puedeEditar && (
                <button
                  onClick={() => setConfirmarCierre(true)}
                  className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
                >
                  Cerrar ejercicio
                </button>
              )}
            </div>
            <Plazo titulo="Legalización de libros" fechaLimite={ejercicio.legalizationDeadline} hecho={legalizado} />
            <Plazo titulo="Depósito de cuentas anuales (plazo máximo)" fechaLimite={ejercicio.accountsDepositDeadline} hecho={depositado} />
          </section>

          {/* 1. Legalizacion de libros */}
          <section className="rounded-lg border border-slate-200 bg-white">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-2">
                <Books size={20} className="text-slate-500" />
                <h2 className="text-lg font-semibold text-slate-900">1. Legalización de libros</h2>
              </div>
              {puedeEditar && (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={generarLibros}
                    disabled={!cerrado || ocupado === 'libros'}
                    title={cerrado ? undefined : 'Cierra el ejercicio antes de generar los libros'}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {ocupado === 'libros' ? 'Generando...' : librosGenerados ? 'Regenerar libros' : 'Generar libros'}
                  </button>
                  <button
                    onClick={crearExpediente}
                    disabled={!librosGenerados || ocupado === 'expediente'}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {ocupado === 'expediente' ? 'Preparando...' : 'Preparar expediente (ZIP)'}
                  </button>
                </div>
              )}
            </header>
            {!cerrado && (
              <p className="px-5 pt-4 text-sm text-slate-600">
                Los libros se generan cuando el ejercicio está cerrado. Al cerrarlo se bloquean los asientos de ese año.
              </p>
            )}
            <ul className="divide-y divide-slate-100">
              {libros.length === 0 ? (
                <li className="px-5 py-4 text-sm text-slate-500">Sin libros todavía.</li>
              ) : (
                libros.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <FilePdf size={18} className="text-slate-400" />
                    <span className="flex-1 text-sm text-slate-800">{NOMBRE_LIBRO[l.type] ?? l.type}</span>
                    <Estado status={l.status} />
                    {l.filePath && (
                      <button
                        onClick={() => descargar(`libro-${l.id}`, `/books/${l.id}/download`, `libro-${l.type.toLowerCase()}-${ejercicio.label}.pdf`)}
                        className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
                      >
                        <DownloadSimple size={16} /> PDF
                      </button>
                    )}
                  </li>
                ))
              )}
            </ul>
            {expedientes.length > 0 && (
              <div className="border-t border-slate-200 px-5 py-4">
                <h3 className="mb-2 text-sm font-semibold text-slate-700">Expedientes</h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="text-left text-slate-500">
                      <tr>
                        <th className="py-2 pr-4 font-medium">Preparado</th>
                        <th className="py-2 pr-4 font-medium">Estado</th>
                        <th className="py-2 pr-4 font-medium">Nº de entrada</th>
                        <th className="py-2 pr-4 font-medium">Presentado</th>
                        <th className="py-2 font-medium"><span className="sr-only">Acciones</span></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {expedientes.map((x) => (
                        <tr key={x.id}>
                          <td className="py-2 pr-4 tabular-nums">{fecha(x.createdAt)}</td>
                          <td className="py-2 pr-4"><Estado status={x.status} /></td>
                          <td className="py-2 pr-4 font-mono">{x.registryEntryNumber ?? '—'}</td>
                          <td className="py-2 pr-4 tabular-nums">{fecha(x.filedAt)}</td>
                          <td className="py-2">
                            <div className="flex flex-wrap justify-end gap-3">
                              <button
                                onClick={() => descargar(`exp-${x.id}`, `/legalization-packages/${x.id}/download`, `expediente-legalizacion-${ejercicio.label}.zip`)}
                                className="flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700"
                              >
                                <FileArchive size={16} /> ZIP
                              </button>
                              {puedeEditar && x.status === 'CREATED' && (
                                <button onClick={() => setDialogo({ tipo: 'presentarExpediente', expediente: x })} className="font-medium text-slate-700 hover:text-slate-900">
                                  Anotar presentación
                                </button>
                              )}
                              {puedeEditar && x.status === 'FILED' && (
                                <button onClick={() => setDialogo({ tipo: 'diligencia', expediente: x })} className="flex items-center gap-1 font-medium text-slate-700 hover:text-slate-900">
                                  <UploadSimple size={16} /> Subir diligencia
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* 2. Deposito de cuentas anuales */}
          <section className="rounded-lg border border-slate-200 bg-white">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-2">
                <Stamp size={20} className="text-slate-500" />
                <h2 className="text-lg font-semibold text-slate-900">2. Depósito de cuentas anuales</h2>
              </div>
              {puedeEditar && (
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="modelo" className="text-sm text-slate-600">Modelo</label>
                  <select
                    id="modelo"
                    value={modelo}
                    onChange={(e) => setModelo(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    title={MODELOS.find((m) => m.valor === modelo)?.ayuda}
                  >
                    {MODELOS.map((m) => (
                      <option key={m.valor} value={m.valor}>{m.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={generarCuentas}
                    disabled={ocupado === 'cuentas'}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {ocupado === 'cuentas' ? 'Generando...' : cuentas.length ? 'Generar nueva versión' : 'Generar cuentas anuales'}
                  </button>
                </div>
              )}
            </header>
            <p className="px-5 pt-4 text-sm text-slate-600">
              Balance, cuenta de pérdidas y ganancias, estado de cambios en el patrimonio neto y memoria, a partir de los asientos contabilizados.
              {!cerrado && ' Puedes generar un borrador antes de cerrar para revisarlo.'}
            </p>
            <div className="overflow-x-auto px-5 py-4">
              {cuentas.length === 0 ? (
                <p className="text-sm text-slate-500">Todavía no se han generado.</p>
              ) : (
                <table className="w-full min-w-[720px] text-sm">
                  <caption className="sr-only">Historial de versiones y presentaciones de las cuentas anuales</caption>
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="py-2 pr-4 font-medium">Versión</th>
                      <th className="py-2 pr-4 font-medium">Modelo</th>
                      <th className="py-2 pr-4 font-medium">Generada</th>
                      <th className="py-2 pr-4 font-medium">Estado</th>
                      <th className="py-2 pr-4 font-medium">Nº de entrada</th>
                      <th className="py-2 pr-4 font-medium">Presentada</th>
                      <th className="py-2 font-medium"><span className="sr-only">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cuentas.map((c) => (
                      <tr key={c.id} className={c.isLatestVersion ? '' : 'text-slate-500'}>
                        <td className="py-2 pr-4 tabular-nums">
                          v{c.version}
                          {c.isLatestVersion && <span className="ml-2 text-xs text-slate-500">(última)</span>}
                        </td>
                        <td className="py-2 pr-4">{MODELOS.find((m) => m.valor === c.modelo)?.label ?? c.modelo}</td>
                        <td className="py-2 pr-4 tabular-nums">{fecha(c.createdAt)}</td>
                        <td className="py-2 pr-4"><Estado status={c.status} /></td>
                        <td className="py-2 pr-4 font-mono">{c.registryEntryNumber ?? '—'}</td>
                        <td className="py-2 pr-4 tabular-nums">{fecha(c.filedAt)}</td>
                        <td className="py-2">
                          <div className="flex flex-wrap justify-end gap-3">
                            <button
                              onClick={() => descargar(`cuentas-${c.id}`, `/annual-accounts/${c.id}/download`, `cuentas-anuales-${ejercicio.label}-v${c.version}.pdf`)}
                              className="flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700"
                            >
                              <DownloadSimple size={16} /> PDF
                            </button>
                            {/* Solo se presenta la ultima version; las anteriores quedan como historial. */}
                            {puedeEditar && c.isLatestVersion && (c.status === 'READY' || c.status === 'DEFECTOS') && (
                              <button onClick={() => setDialogo({ tipo: 'presentarCuentas', cuentas: c })} className="font-medium text-slate-700 hover:text-slate-900">
                                {c.status === 'DEFECTOS' ? 'Anotar subsanación' : 'Anotar presentación'}
                              </button>
                            )}
                            {puedeEditar && c.status === 'FILED' && (
                              <button onClick={() => setDialogo({ tipo: 'resolucion', cuentas: c })} className="font-medium text-slate-700 hover:text-slate-900">
                                Anotar resolución
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}

      <ConfirmationModal
        isOpen={confirmarCierre}
        title={`Cerrar el ejercicio ${ejercicio?.label ?? ''}`}
        message="Se bloquean los asientos de este ejercicio y empiezan a contar los plazos: legalización de libros en 4 meses y depósito de cuentas como tarde en 7."
        confirmLabel="Cerrar ejercicio"
        isDangerous
        isLoading={ocupado === 'cerrar'}
        onConfirm={cerrar}
        onCancel={() => setConfirmarCierre(false)}
      />

      {dialogo && (
        <DialogoRegistro
          dialogo={dialogo}
          onCerrar={() => setDialogo(null)}
          onEnviar={(fn, ok) => accion('dialogo', fn, ok).then(() => setDialogo(null))}
          ocupado={ocupado === 'dialogo'}
        />
      )}
    </div>
  );
}

function DialogoRegistro({
  dialogo,
  onCerrar,
  onEnviar,
  ocupado,
}: {
  dialogo: Dialogo;
  onCerrar: () => void;
  onEnviar: (fn: () => Promise<unknown>, ok: string) => void;
  ocupado: boolean;
}) {
  const [entrada, setEntrada] = useState('');
  const [csv, setCsv] = useState('');
  const [fechaPresentacion, setFechaPresentacion] = useState(new Date().toISOString().slice(0, 10));
  const [resolucion, setResolucion] = useState('APROBADO');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [falta, setFalta] = useState('');

  const titulo = {
    presentarCuentas: 'Anotar presentación de las cuentas',
    resolucion: 'Anotar resolución del Registro',
    presentarExpediente: 'Anotar presentación del expediente',
    diligencia: 'Subir diligencia de legalización',
  }[dialogo.tipo];

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    setFalta('');
    if (dialogo.tipo === 'presentarCuentas') {
      if (!entrada.trim()) return setFalta('Escribe el número de entrada del justificante.');
      onEnviar(
        () =>
          apiFetch(`/annual-accounts/${dialogo.cuentas.id}/filing`, {
            method: 'POST',
            body: JSON.stringify({ registryEntryNumber: entrada.trim(), csv: csv.trim() || undefined, filedAt: fechaPresentacion }),
          }),
        'Presentación anotada.',
      );
    } else if (dialogo.tipo === 'resolucion') {
      onEnviar(
        () => apiFetch(`/annual-accounts/${dialogo.cuentas.id}/resolution`, { method: 'POST', body: JSON.stringify({ status: resolucion }) }),
        'Resolución anotada.',
      );
    } else if (dialogo.tipo === 'presentarExpediente') {
      if (!entrada.trim()) return setFalta('Escribe el número de entrada del justificante.');
      onEnviar(
        () =>
          apiFetch(`/legalization-packages/${dialogo.expediente.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'FILED', registryEntryNumber: entrada.trim(), csvJustificante: csv.trim() || undefined, filedAt: fechaPresentacion }),
          }),
        'Presentación anotada.',
      );
    } else {
      if (!archivo) return setFalta('Elige el PDF de la diligencia.');
      const datos = new FormData();
      datos.append('archivo', archivo);
      onEnviar(
        () => apiFetch(`/legalization-packages/${dialogo.expediente.id}/diligence`, { method: 'POST', body: datos }),
        'Diligencia guardada: libros legalizados.',
      );
    }
  };

  const conDatosPresentacion = dialogo.tipo === 'presentarCuentas' || dialogo.tipo === 'presentarExpediente';
  const campo = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-labelledby="dialogo-titulo">
      <form onSubmit={enviar} className="mx-4 w-full max-w-md space-y-4 rounded-lg bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 id="dialogo-titulo" className="text-lg font-semibold text-slate-900">{titulo}</h2>
          <button type="button" onClick={onCerrar} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Cerrar"><X size={20} /></button>
        </div>

        {conDatosPresentacion && (
          <>
            <p className="text-sm text-slate-600">Datos del justificante que te da sede.registradores.org al presentar.</p>
            <div>
              <label htmlFor="d-entrada" className="block text-sm font-medium text-slate-700">Número de entrada</label>
              <input id="d-entrada" value={entrada} onChange={(e) => setEntrada(e.target.value)} className={`${campo} font-mono`} autoFocus />
            </div>
            <div>
              <label htmlFor="d-csv" className="block text-sm font-medium text-slate-700">CSV del justificante <span className="font-normal text-slate-500">(opcional)</span></label>
              <input id="d-csv" value={csv} onChange={(e) => setCsv(e.target.value)} className={`${campo} font-mono`} />
            </div>
            <div>
              <label htmlFor="d-fecha" className="block text-sm font-medium text-slate-700">Fecha de presentación</label>
              <input id="d-fecha" type="date" value={fechaPresentacion} onChange={(e) => setFechaPresentacion(e.target.value)} className={campo} />
            </div>
          </>
        )}

        {dialogo.tipo === 'resolucion' && (
          <fieldset className="space-y-2">
            <legend className="text-sm text-slate-600">¿Qué ha resuelto el Registro?</legend>
            {[
              ['APROBADO', 'Depositadas', 'Las cuentas quedan depositadas.'],
              ['DEFECTOS', 'Con defectos', 'Hay que subsanar y volver a presentar.'],
              ['RECHAZADO', 'Rechazadas', 'No admite subsanación.'],
            ].map(([valor, label, ayuda]) => (
              <label key={valor} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm">
                <input type="radio" name="resolucion" value={valor} checked={resolucion === valor} onChange={() => setResolucion(valor)} className="mt-0.5" />
                <span>
                  <span className="font-medium text-slate-800">{label}</span>
                  <span className="block text-slate-500">{ayuda}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {dialogo.tipo === 'diligencia' && (
          <div>
            <label htmlFor="d-archivo" className="block text-sm font-medium text-slate-700">PDF de la diligencia</label>
            <input id="d-archivo" type="file" accept="application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" />
            <p className="mt-1 text-xs text-slate-500">El expediente quedará como legalizado.</p>
          </div>
        )}

        {falta && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{falta}</p>}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={onCerrar} disabled={ocupado} className="flex-1 rounded-lg bg-slate-100 px-4 py-2 font-medium text-slate-700 hover:bg-slate-200">
            Cancelar
          </button>
          <button type="submit" disabled={ocupado} className="flex-1 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {ocupado ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );
}
