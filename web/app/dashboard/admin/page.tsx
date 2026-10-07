'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Buildings,
  CheckCircle,
  Key,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Power,
  ShieldCheck,
  Trash,
  UserPlus,
  Users,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import { apiFetch, campoDelError, errorMessage } from '@/lib/api';
import {
  cambiarEmpresa,
  EVENTO_SESION,
  getCompanyId,
  getUser,
  nombreRol,
  ROLES_EMPRESA,
  type SessionUser,
} from '@/lib/auth';
import {
  CAMPOS_EMPRESA,
  Campo,
  CamposEmpresa,
  DATOS_EMPRESA_VACIOS,
  datosParaGuardar,
  idParaFoco,
  nombrePais,
  primerCampoConError,
  revisarDatosEmpresa,
  type CampoEmpresa,
  type DatosEmpresa,
  type ErroresEmpresa,
} from '@/components/empresa/CamposEmpresa';

/**
 * Administracion de la plataforma (modo administrador global): todas las
 * empresas y todos los usuarios, con sus accesos y roles. Solo la ve quien
 * tiene esAdminGlobal; el backend lo vuelve a comprobar en cada peticion.
 *
 * Los cambios surten efecto en la siguiente peticion del usuario afectado (el
 * backend lee la BD, no el token): quitar un acceso o desactivar a alguien le
 * corta al momento, y lo que se le da lo ve en cuanto recarga la pagina.
 */

interface EmpresaAdmin {
  id: string;
  codigo: string | null;
  nombre: string;
  activa: boolean;
  creadoEn?: string;
  denominacion: string | null;
  nif: string | null;
  pais: string | null;
  usuarios: number;
  /** Solo en la respuesta del alta: si ya tiene todo para facturar y lo que falta. */
  completo?: boolean;
  pendientes?: string[];
}

interface AccesoEmpresa {
  companyId: string;
  nombre: string;
  codigo: string | null;
  activa: boolean;
  rol: string;
}

interface UsuarioAdmin {
  id: string;
  email: string;
  activo: boolean;
  esAdminGlobal: boolean;
  creadoEn?: string;
  empresas: AccesoEmpresa[];
}

type Pestana = 'empresas' | 'usuarios';

const CONTRASENA_MIN = 12;

/** Busqueda sin distinguir mayusculas ni tildes. */
const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Contrasena aleatoria de 16 caracteres sin los que se confunden (0/O, 1/l/I). */
function generarContrasena(): string {
  const letras = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const v = new Uint32Array(16);
  crypto.getRandomValues(v);
  return Array.from(v, (n) => letras[n % letras.length]).join('');
}

const fechaCorta = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('es-ES') : '');

const CLASE_INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-600';
const BOTON_PRIMARIO =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-accent-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50';
// Cada variante lleva sus colores completos (sin sobrescribir clases): asi la
// capa de modo noche (.dark .zona-app en globals.css) las traduce todas.
const BASE_BOTON =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border bg-white px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50';
const BOTON_SECUNDARIO = `${BASE_BOTON} py-1.5 border-slate-200 text-slate-700 hover:bg-slate-50`;
const BOTON_SECUNDARIO_ALTO = `${BASE_BOTON} py-2 border-slate-200 text-slate-700 hover:bg-slate-50`;
const BOTON_ENTRAR = `${BASE_BOTON} py-1.5 border-emerald-200 text-emerald-700 hover:bg-slate-50`;
const BOTON_INDIGO = `${BASE_BOTON} py-1.5 border-indigo-200 text-indigo-700 hover:bg-slate-50`;
const BOTON_PELIGRO = `${BASE_BOTON} py-1.5 border-rose-200 text-rose-700 hover:bg-rose-50`;
const CLASE_SELECT_PEQUENO =
  'rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 focus:border-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-600 disabled:opacity-50';

function Etiqueta({ tono, children }: { tono: 'verde' | 'gris' | 'indigo' | 'rojo' | 'ambar'; children: React.ReactNode }) {
  const tonos = {
    verde: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    gris: 'border-slate-200 bg-slate-100 text-slate-600',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    rojo: 'border-rose-200 bg-rose-50 text-rose-700',
    ambar: 'border-amber-200 bg-amber-50 text-amber-700',
  } as const;
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${tonos[tono]}`}>
      {children}
    </span>
  );
}

function Modal({
  titulo,
  onClose,
  children,
  ancho = 'max-w-md',
}: {
  titulo: string;
  onClose: () => void;
  children: React.ReactNode;
  ancho?: string;
}) {
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`max-h-[90dvh] w-full ${ancho} overflow-y-auto rounded-t-xl bg-white p-5 shadow-xl sm:rounded-xl sm:p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="min-w-0 break-words text-lg font-semibold text-slate-900">{titulo}</h2>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="p-1.5 text-slate-500 transition-colors hover:text-slate-900">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Mensajes({ error, aviso }: { error: string; aviso: string }) {
  return (
    <>
      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}
      {aviso && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {aviso}
        </div>
      )}
    </>
  );
}

export default function AdministracionPage() {
  // La sesion vive en localStorage: se lee tras montar (igual que el menu).
  const [user, setUser] = useState<SessionUser | null>(null);
  const [montado, setMontado] = useState(false);
  const [pestana, setPestana] = useState<Pestana>('empresas');
  const [busqueda, setBusqueda] = useState('');
  const [empresas, setEmpresas] = useState<EmpresaAdmin[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  // Si la carga falla, las listas vacias no significan "no hay nada": se dice
  // que no se han podido cargar y se ofrece reintentar.
  const [errorCarga, setErrorCarga] = useState('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [modal, setModal] = useState<'empresa' | 'usuario' | null>(null);
  const [gestionando, setGestionando] = useState<string | null>(null);

  useEffect(() => {
    setUser(getUser());
    setMontado(true);
    // El panel refresca los permisos con el servidor al entrar (GET /auth/me).
    const alActualizar = () => setUser(getUser());
    window.addEventListener(EVENTO_SESION, alActualizar);
    return () => window.removeEventListener(EVENTO_SESION, alActualizar);
  }, []);

  const esAdmin = user?.esAdminGlobal === true;
  const miEmail = (user?.email ?? '').toLowerCase();
  const empresaActual = montado ? getCompanyId() : '';

  const cargar = useCallback(async () => {
    try {
      const [e, u] = await Promise.all([
        apiFetch<EmpresaAdmin[]>('/admin/empresas'),
        apiFetch<UsuarioAdmin[]>('/admin/usuarios'),
      ]);
      setEmpresas([...e].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
      setUsuarios(u);
      setErrorCarga('');
    } catch (e) {
      setErrorCarga(errorMessage(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (esAdmin) cargar();
  }, [esAdmin, cargar]);

  const reintentar = () => {
    setCargando(true);
    cargar();
  };

  /** Ejecuta un cambio, muestra el resultado y recarga las listas. */
  const accion = async (fn: () => Promise<unknown>, ok: string): Promise<boolean> => {
    setError('');
    setAviso('');
    try {
      await fn();
      setAviso(ok);
      await cargar();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  };

  // El selector de empresas del menu se vuelve a cargar con este evento.
  const avisarMenu = () => window.dispatchEvent(new Event(EVENTO_SESION));

  const empresasFiltradas = useMemo(() => {
    const q = normalizar(busqueda.trim());
    if (!q) return empresas;
    return empresas.filter((e) =>
      [e.nombre, e.codigo ?? '', e.nif ?? '', e.denominacion ?? ''].some((t) => normalizar(t).includes(q)),
    );
  }, [empresas, busqueda]);

  const usuariosFiltrados = useMemo(() => {
    const q = normalizar(busqueda.trim());
    if (!q) return usuarios;
    return usuarios.filter((u) => normalizar(u.email).includes(q) || u.empresas.some((e) => normalizar(e.nombre).includes(q)));
  }, [usuarios, busqueda]);

  const entrar = (e: EmpresaAdmin) => {
    cambiarEmpresa(e.id, e.nombre);
    window.location.assign('/dashboard');
  };

  const renombrar = (e: EmpresaAdmin) => {
    const nombre = window.prompt('Nuevo nombre de la empresa', e.nombre)?.trim();
    if (!nombre || nombre === e.nombre) return;
    accion(
      () => apiFetch(`/admin/empresas/${encodeURIComponent(e.id)}`, { method: 'PATCH', body: JSON.stringify({ nombre }) }),
      `Empresa renombrada a «${nombre}».`,
    ).then((ok) => ok && avisarMenu());
  };

  const alternarEmpresa = (e: EmpresaAdmin) => {
    // La empresa en la que se trabaja no se queda abierta despues de
    // desactivarla: se pasa a otra activa (y si no hay otra, no se deja).
    const esLaActual = e.activa && e.id === empresaActual;
    const otra = esLaActual ? empresas.find((x) => x.activa && x.id !== e.id) : undefined;
    if (esLaActual && !otra) {
      setAviso('');
      setError(`Estás trabajando en «${e.nombre}» y no hay otra empresa activa a la que pasar. Crea o activa otra antes de desactivarla.`);
      return;
    }
    const pregunta = e.activa
      ? `¿Desactivar «${e.nombre}»? No se borra ningún dato y podrás volver a activarla cuando quieras.` +
        (otra ? `\n\nEstás trabajando en ella: pasarás a «${otra.nombre}».` : '')
      : `¿Volver a activar «${e.nombre}»?`;
    if (!window.confirm(pregunta)) return;
    accion(
      () => apiFetch(`/admin/empresas/${encodeURIComponent(e.id)}`, { method: 'PATCH', body: JSON.stringify({ activa: !e.activa }) }),
      e.activa ? `«${e.nombre}» desactivada.${otra ? ` Ahora trabajas en «${otra.nombre}».` : ''}` : `«${e.nombre}» activada.`,
    ).then((ok) => {
      if (!ok) return;
      if (otra) cambiarEmpresa(otra.id, otra.nombre);
      avisarMenu();
    });
  };

  if (!montado) {
    return <main className="mx-auto max-w-6xl px-4 py-8 md:px-8" aria-busy="true" />;
  }

  if (!esAdmin) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center md:px-8">
        <ShieldCheck size={40} className="mx-auto mb-4 text-slate-400" />
        <h1 className="mb-2 text-xl font-semibold text-slate-900">Administración</h1>
        <p className="mb-6 text-sm text-slate-600">
          Esta pantalla es solo para el administrador global de la plataforma. Si te acaban de dar el permiso, recarga la página.
        </p>
        <Link href="/dashboard" className="text-sm font-medium text-accent-600 hover:text-accent-700">
          Volver al resumen
        </Link>
      </main>
    );
  }

  const usuarioGestionado = gestionando ? usuarios.find((u) => u.id === gestionando) ?? null : null;

  return (
    <div>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 font-semibold text-slate-900">
              <ShieldCheck size={20} weight="duotone" className="text-indigo-600" />
              Administración
            </h1>
            <p className="text-xs text-slate-500">Todas las empresas y usuarios de la plataforma</p>
          </div>
          <button
            type="button"
            onClick={() => setModal(pestana === 'empresas' ? 'empresa' : 'usuario')}
            disabled={cargando || !!errorCarga}
            title={errorCarga ? 'Primero hay que poder cargar las listas' : undefined}
            className={BOTON_PRIMARIO}
          >
            {pestana === 'empresas' ? <Plus size={16} weight="bold" /> : <UserPlus size={16} weight="bold" />}
            {pestana === 'empresas' ? 'Nueva empresa' : 'Nuevo usuario'}
          </button>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div role="tablist" aria-label="Qué administrar" className="inline-flex self-start rounded-lg border border-slate-200 bg-white p-1">
            {(['empresas', 'usuarios'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={pestana === t}
                onClick={() => {
                  setPestana(t);
                  setBusqueda('');
                }}
                className={`inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  pestana === t ? 'bg-emerald-50 text-emerald-800' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {t === 'empresas' ? <Buildings size={16} /> : <Users size={16} />}
                {t === 'empresas' ? 'Empresas' : 'Usuarios'}
                {!cargando && !errorCarga && ` (${t === 'empresas' ? empresas.length : usuarios.length})`}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder={pestana === 'empresas' ? 'Buscar por nombre, código o NIF' : 'Buscar por email o empresa'}
              aria-label="Buscar"
              className={`${CLASE_INPUT} pl-9`}
            />
          </div>
        </div>

        <Mensajes error={error} aviso={aviso} />

        {cargando ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg border border-slate-200 bg-white" />
            ))}
          </div>
        ) : errorCarga ? (
          <section role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-rose-200 bg-white px-4 py-10 text-center">
            <p className="text-sm font-medium text-slate-900">No se han podido cargar las empresas y los usuarios.</p>
            <p className="max-w-md text-sm text-slate-600">{errorCarga}</p>
            <button type="button" onClick={reintentar} className={BOTON_SECUNDARIO_ALTO}>
              Reintentar
            </button>
          </section>
        ) : pestana === 'empresas' ? (
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_48px_64px_100px_176px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 lg:grid">
              <span>Empresa</span>
              <span>NIF</span>
              <span>País</span>
              <span>Usuarios</span>
              <span>Estado</span>
              <span className="text-right">Acciones</span>
            </div>
            {empresasFiltradas.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">
                {busqueda ? 'Ninguna empresa coincide con la búsqueda.' : 'Todavía no hay empresas.'}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {empresasFiltradas.map((e) => (
                  <li
                    key={e.id}
                    className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-4 py-3 text-sm lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_48px_64px_100px_176px] lg:items-center"
                  >
                    <div className="col-span-2 min-w-0 lg:col-span-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                        <span className="truncate">{e.nombre}</span>
                        {e.id === empresaActual && <Etiqueta tono="verde">Estás aquí</Etiqueta>}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {[e.codigo && `Código ${e.codigo}`, e.denominacion && e.denominacion !== e.nombre ? e.denominacion : null, e.creadoEn && `Alta ${fechaCorta(e.creadoEn)}`]
                          .filter(Boolean)
                          .join(' · ') || 'Sin datos fiscales todavía'}
                      </p>
                    </div>
                    <p className="font-mono text-xs text-slate-700">
                      <span className="font-sans text-slate-400 lg:hidden">NIF </span>
                      {e.nif || '—'}
                    </p>
                    <p className="text-xs text-slate-700">
                      <span className="text-slate-400 lg:hidden">País </span>
                      {e.pais || '—'}
                    </p>
                    <p className="text-xs text-slate-700">
                      <span className="text-slate-400 lg:hidden">Usuarios </span>
                      {e.usuarios}
                    </p>
                    <div>{e.activa ? <Etiqueta tono="verde">Activa</Etiqueta> : <Etiqueta tono="gris">Desactivada</Etiqueta>}</div>
                    <div className="col-span-2 mt-1 flex flex-wrap gap-2 lg:col-span-1 lg:mt-0 lg:flex-nowrap lg:justify-end">
                      <button
                        type="button"
                        onClick={() => entrar(e)}
                        disabled={!e.activa || e.id === empresaActual}
                        title={!e.activa ? 'Actívala para poder entrar' : e.id === empresaActual ? 'Ya estás en esta empresa' : 'Trabajar con esta empresa'}
                        className={BOTON_ENTRAR}
                      >
                        Entrar <ArrowRight size={14} />
                      </button>
                      {/* En la tabla (lg) solo el icono, con su texto para lectores de pantalla. */}
                      <button type="button" onClick={() => renombrar(e)} className={BOTON_SECUNDARIO} title="Renombrar">
                        <PencilSimple size={14} /> <span className="lg:sr-only">Renombrar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => alternarEmpresa(e)}
                        className={e.activa ? BOTON_PELIGRO : BOTON_SECUNDARIO}
                        title={e.activa ? 'Desactivar' : 'Activar'}
                      >
                        <Power size={14} /> <span className="lg:sr-only">{e.activa ? 'Desactivar' : 'Activar'}</span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,2.4fr)_112px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 md:grid">
              <span>Usuario</span>
              <span>Empresas y rol</span>
              <span className="text-right">Acciones</span>
            </div>
            {usuariosFiltrados.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">
                {busqueda ? 'Ningún usuario coincide con la búsqueda.' : 'Todavía no hay usuarios.'}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {usuariosFiltrados.map((u) => (
                  <li key={u.id} className="flex flex-col gap-2 px-4 py-3 text-sm md:grid md:grid-cols-[minmax(0,1.6fr)_minmax(0,2.4fr)_112px] md:items-center md:gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900" title={u.email}>
                        {u.email}
                        {u.email.toLowerCase() === miEmail && <span className="font-normal text-slate-500"> (tú)</span>}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {u.esAdminGlobal && <Etiqueta tono="indigo">Administrador global</Etiqueta>}
                        {!u.activo && <Etiqueta tono="rojo">Desactivado</Etiqueta>}
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-1.5">
                      {u.empresas.length === 0 ? (
                        <span className="text-xs text-slate-400">{u.esAdminGlobal ? 'Ve todas las empresas' : 'Sin acceso a ninguna empresa'}</span>
                      ) : (
                        u.empresas.map((a) => (
                          <span
                            key={a.companyId}
                            className="inline-flex max-w-full items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700"
                          >
                            <span className="truncate">{a.nombre}</span>
                            <span className="text-slate-400">·</span>
                            <span className="whitespace-nowrap font-medium">{nombreRol(a.rol)}</span>
                          </span>
                        ))
                      )}
                    </div>
                    <div className="md:text-right">
                      <button type="button" onClick={() => setGestionando(u.id)} className={BOTON_SECUNDARIO}>
                        <Key size={14} /> Gestionar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {!cargando && !errorCarga && (
          <p className="text-center text-xs text-slate-500">
            {pestana === 'empresas'
              ? `${empresasFiltradas.length} de ${empresas.length} empresas`
              : `${usuariosFiltrados.length} de ${usuarios.length} usuarios`}
          </p>
        )}
      </main>

      {modal === 'empresa' && (
        <ModalNuevaEmpresa
          onClose={() => setModal(null)}
          onCreada={async (e) => {
            // El modal se queda abierto con el resultado y el boton para entrar.
            setError('');
            setAviso(`Empresa «${e.nombre}» creada. Eres su administrador.`);
            await cargar();
            avisarMenu();
          }}
          onEntrar={entrar}
        />
      )}

      {modal === 'usuario' && (
        <ModalNuevoUsuario
          empresas={empresas}
          onClose={() => setModal(null)}
          onCreado={async (u) => {
            setModal(null);
            setError('');
            setAviso(`Usuario ${u.email} creado. Pásale su contraseña inicial por un canal seguro (no por el mismo correo).`);
            await cargar();
          }}
        />
      )}

      {usuarioGestionado && (
        <PanelUsuario
          usuario={usuarioGestionado}
          empresas={empresas}
          esYo={usuarioGestionado.email.toLowerCase() === miEmail}
          onClose={() => setGestionando(null)}
          onCambio={cargar}
        />
      )}
    </div>
  );
}

/** Errores del alta: los de los datos de la empresa y los del nombre corto y el codigo. */
type ErroresAlta = ErroresEmpresa & { nombre?: string; codigo?: string };

const DEL_REGISTRO = ['Registro Mercantil (provincia)', 'Tomo', 'Folio', 'Hoja', 'Inscripción'];

/** "Tomo, Folio, Hoja..." del backend dicho en una frase: "la inscripción en el Registro Mercantil". */
function textoPendientes(pendientes: string[]): string {
  const otros = pendientes.filter((p) => !DEL_REGISTRO.includes(p));
  const faltaRegistro = otros.length < pendientes.length;
  return [...otros, ...(faltaRegistro ? ['la inscripción en el Registro Mercantil'] : [])].join(', ');
}

/**
 * Alta de una empresa con sus datos completos (los de sus facturas), con los
 * mismos campos que "Datos de la empresa". El Registro Mercantil se puede dejar
 * para despues: la app lo pide al entrar. Al crearla ofrece entrar en ella.
 */
function ModalNuevaEmpresa({
  onClose,
  onCreada,
  onEntrar,
}: {
  onClose: () => void;
  onCreada: (e: EmpresaAdmin) => Promise<void>;
  onEntrar: (e: EmpresaAdmin) => void;
}) {
  const [datos, setDatos] = useState<DatosEmpresa>(DATOS_EMPRESA_VACIOS);
  const [nombre, setNombre] = useState('');
  const [codigo, setCodigo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [errores, setErrores] = useState<ErroresAlta>({});
  const [creada, setCreada] = useState<EmpresaAdmin | null>(null);
  // Campo al que llevar el foco cuando ya este pintado (y habilitado) el error.
  const [foco, setFoco] = useState<string | null>('denominacion');

  useEffect(() => {
    if (!foco || guardando) return;
    const el = document.getElementById(`alta-${foco}`);
    if (el) {
      el.focus({ preventScroll: true });
      // Al centro: el pie fijo del modal no lo tapa.
      el.scrollIntoView({ block: 'center' });
    }
    setFoco(null);
  }, [foco, guardando]);

  const conCambios = !!nombre.trim() || !!codigo.trim() || CAMPOS_EMPRESA.some((k) => datos[k] !== DATOS_EMPRESA_VACIOS[k]);

  // Escape, la X o un clic fuera no tiran un formulario a medias sin preguntar.
  const cerrar = () => {
    if (guardando) return;
    if (!creada && conCambios && !window.confirm('¿Descartar los datos de la nueva empresa?')) return;
    onClose();
  };

  const quitarError = (k: keyof ErroresAlta) => setErrores((e) => (e[k] ? { ...e, [k]: undefined } : e));
  const cambiar = (k: CampoEmpresa, v: string) => {
    setDatos((d) => ({ ...d, [k]: v }));
    quitarError(k);
  };
  // El error del pais se corrige en la caja del codigo si se eligio "Otro pais...".
  const enfocar = (campo: string) => setFoco(idParaFoco(campo, datos));

  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError('');
    const fallos = revisarDatosEmpresa(datos);
    const primero = primerCampoConError(fallos);
    if (primero) {
      setErrores(fallos);
      setError('Faltan datos o hay alguno mal: revisa los campos marcados en rojo.');
      enfocar(primero);
      return;
    }
    setErrores({});
    setGuardando(true);
    let empresa: EmpresaAdmin;
    try {
      empresa = await apiFetch<EmpresaAdmin>('/admin/empresas', {
        method: 'POST',
        body: JSON.stringify({ nombre: nombre.trim() || undefined, codigo: codigo.trim() || undefined, datos: datosParaGuardar(datos) }),
      });
    } catch (e) {
      // El servidor dice que campo falla (details.campo): se marca y se lleva el foco alli.
      const campo = campoDelError(e);
      setError(errorMessage(e));
      if (campo) {
        setErrores({ [campo]: errorMessage(e) });
        enfocar(campo);
      }
      setGuardando(false);
      return;
    }
    setCreada(empresa);
    setGuardando(false);
    await onCreada(empresa);
  };

  if (creada) {
    const pendientes = creada.pendientes ?? [];
    return (
      <Modal titulo="Empresa creada" onClose={onClose} ancho="max-w-lg">
        <div className="flex flex-col gap-4">
          <div role="status" className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <CheckCircle size={22} weight="fill" className="mt-0.5 shrink-0 text-emerald-600" />
            <div className="min-w-0">
              <p className="break-words font-medium text-emerald-800">«{creada.nombre}» ya está dada de alta.</p>
              <p className="mt-1 text-sm text-emerald-800">
                Eres su administrador.
                {creada.nif && ` NIF ${creada.nif}`}
                {creada.pais && ` · ${nombrePais(creada.pais)}`}
              </p>
            </div>
          </div>
          {pendientes.length > 0 ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <WarningCircle size={18} className="mt-0.5 shrink-0" />
              <p>
                Queda pendiente {textoPendientes(pendientes)}. Al entrar, la app te lo pedirá; puedes completarlo cuando lo tengas desde «Datos de
                la empresa».
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-600">Tiene todos los datos que necesita para facturar.</p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className={BOTON_SECUNDARIO_ALTO}>
              Seguir en Administración
            </button>
            <button type="button" onClick={() => onEntrar(creada)} className={BOTON_PRIMARIO} autoFocus>
              Entrar en la empresa <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal titulo="Nueva empresa" onClose={cerrar} ancho="max-w-3xl">
      <form onSubmit={enviar} noValidate className="flex flex-col gap-5">
        <p className="text-sm text-slate-600">
          Los datos que saldrán en sus facturas. Los marcados con <span className="text-red-600">*</span> son obligatorios. Quedarás como
          administrador de la empresa.
        </p>

        <div className="flex flex-col gap-5">
          <CamposEmpresa datos={datos} onCambio={cambiar} errores={errores} disabled={guardando} alta variante="llano" prefijoId="alta-" />

          <section className="space-y-3 border-t border-slate-200 pt-4">
            <h3 className="font-semibold text-slate-900">
              En la app <span className="text-xs font-normal text-slate-500">(opcional)</span>
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Campo
                id="alta-nombre"
                label="Nombre corto"
                valor={nombre}
                onChange={(v) => {
                  setNombre(v);
                  quitarError('nombre');
                }}
                error={errores.nombre}
                disabled={guardando}
                maxLength={120}
                placeholder={datos.denominacion.trim() || 'Igual que la denominación'}
                ayuda="Como aparece en el selector de empresas. Si lo dejas vacío, se usa la denominación."
              />
              <Campo
                id="alta-codigo"
                label="Código"
                valor={codigo}
                onChange={(v) => {
                  setCodigo(v);
                  quitarError('codigo');
                }}
                error={errores.codigo}
                disabled={guardando}
                maxLength={30}
                placeholder="IFBIO"
                ayuda="Corto y único (letras, números, - y _). Sirve para elegir la empresa al entrar."
              />
            </div>
          </section>
        </div>

        {/* Pie fijo: el error del servidor y los botones siempre a la vista, tambien en el movil.
            El bottom negativo compensa el relleno del modal para que el pie llegue al borde. */}
        <div className="sticky -bottom-5 -mx-5 -mb-5 flex flex-col gap-2 border-t border-slate-200 bg-white px-5 py-3 sm:-bottom-6 sm:-mx-6 sm:-mb-6 sm:px-6">
          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-700">
              <WarningCircle size={18} className="mt-0.5 shrink-0" />
              <span className="min-w-0 break-words">{error}</span>
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={cerrar} disabled={guardando} className={BOTON_SECUNDARIO_ALTO}>
              Cancelar
            </button>
            <button type="submit" disabled={guardando} className={BOTON_PRIMARIO}>
              {guardando ? 'Creando…' : 'Crear empresa'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function CampoContrasena({ id, valor, onChange }: { id: string; valor: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2">
      <input
        id={id}
        type="text"
        autoComplete="new-password"
        spellCheck={false}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        minLength={CONTRASENA_MIN}
        maxLength={128}
        className={`${CLASE_INPUT} font-mono`}
      />
      <button type="button" onClick={() => onChange(generarContrasena())} className={`${BOTON_SECUNDARIO_ALTO} shrink-0`}>
        Generar
      </button>
    </div>
  );
}

function ModalNuevoUsuario({
  empresas,
  onClose,
  onCreado,
}: {
  empresas: EmpresaAdmin[];
  onClose: () => void;
  onCreado: (u: UsuarioAdmin) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [rol, setRol] = useState('solo_lectura');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError('');
    if (password.length < CONTRASENA_MIN) {
      setError(`La contraseña debe tener al menos ${CONTRASENA_MIN} caracteres.`);
      return;
    }
    setGuardando(true);
    try {
      const u = await apiFetch<UsuarioAdmin>('/admin/usuarios', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), password, ...(companyId ? { companyId, rol } : {}) }),
      });
      onCreado(u);
    } catch (e) {
      setError(errorMessage(e));
      setGuardando(false);
    }
  };

  return (
    <Modal titulo="Nuevo usuario" onClose={onClose}>
      <form onSubmit={enviar} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="usuario-email" className="text-sm font-medium text-slate-700">
            Email *
          </label>
          <input
            id="usuario-email"
            type="email"
            required
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={CLASE_INPUT}
            autoFocus
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="usuario-password" className="text-sm font-medium text-slate-700">
            Contraseña inicial *
          </label>
          <CampoContrasena id="usuario-password" valor={password} onChange={setPassword} />
          <p className="text-xs text-slate-500">Mínimo {CONTRASENA_MIN} caracteres. Cópiala antes de crear el usuario: después no se puede ver.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="usuario-empresa" className="text-sm font-medium text-slate-700">
              Empresa <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <select id="usuario-empresa" value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={CLASE_INPUT}>
              <option value="">Sin empresa por ahora</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                  {e.activa ? '' : ' (desactivada)'}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="usuario-rol" className="text-sm font-medium text-slate-700">
              Rol
            </label>
            <select id="usuario-rol" value={rol} onChange={(e) => setRol(e.target.value)} disabled={!companyId} className={CLASE_INPUT}>
              {ROLES_EMPRESA.map((r) => (
                <option key={r.valor} value={r.valor}>
                  {r.etiqueta}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={BOTON_SECUNDARIO}>
            Cancelar
          </button>
          <button type="submit" disabled={guardando} className={BOTON_PRIMARIO}>
            {guardando ? 'Creando…' : 'Crear usuario'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PanelUsuario({
  usuario,
  empresas,
  esYo,
  onClose,
  onCambio,
}: {
  usuario: UsuarioAdmin;
  empresas: EmpresaAdmin[];
  esYo: boolean;
  onClose: () => void;
  onCambio: () => Promise<void>;
}) {
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [nuevaEmpresa, setNuevaEmpresa] = useState('');
  const [nuevoRol, setNuevoRol] = useState('solo_lectura');
  const [contrasena, setContrasena] = useState('');

  const base = `/admin/usuarios/${encodeURIComponent(usuario.id)}`;
  const sinAcceso = empresas.filter((e) => !usuario.empresas.some((a) => a.companyId === e.id));

  const hacer = async (fn: () => Promise<unknown>, ok: string) => {
    setError('');
    setAviso('');
    setOcupado(true);
    try {
      await fn();
      await onCambio();
      setAviso(ok);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const ponerRol = (companyId: string, rol: string) =>
    apiFetch(`${base}/empresas/${encodeURIComponent(companyId)}`, { method: 'PUT', body: JSON.stringify({ rol }) });

  const cambiarRol = (a: AccesoEmpresa, rol: string) => {
    if (rol === a.rol) return;
    if (!window.confirm(`¿Cambiar el rol de ${usuario.email} en «${a.nombre}» a ${nombreRol(rol)}?`)) return;
    hacer(() => ponerRol(a.companyId, rol), `Ahora es ${nombreRol(rol)} en «${a.nombre}».`);
  };

  const quitar = (a: AccesoEmpresa) => {
    if (!window.confirm(`¿Quitar a ${usuario.email} el acceso a «${a.nombre}»? No se borra ningún dato de la empresa.`)) return;
    hacer(
      () => apiFetch(`${base}/empresas/${encodeURIComponent(a.companyId)}`, { method: 'DELETE' }),
      `Ya no tiene acceso a «${a.nombre}».`,
    );
  };

  const darAcceso = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = empresas.find((x) => x.id === nuevaEmpresa);
    if (!e) return;
    const ok = await hacer(
      () => ponerRol(e.id, nuevoRol),
      `Acceso a «${e.nombre}» como ${nombreRol(nuevoRol)}. Si tiene la sesión abierta, lo verá al recargar la página.`,
    );
    if (ok) setNuevaEmpresa('');
  };

  const alternarActivo = () => {
    const pregunta = usuario.activo
      ? `¿Desactivar a ${usuario.email}? Se le cierran las sesiones abiertas y no podrá entrar hasta que lo reactives. No se borra nada.`
      : `¿Reactivar a ${usuario.email}?`;
    if (!window.confirm(pregunta)) return;
    hacer(
      () => apiFetch(base, { method: 'PATCH', body: JSON.stringify({ activo: !usuario.activo }) }),
      usuario.activo ? 'Usuario desactivado.' : 'Usuario reactivado.',
    );
  };

  const alternarAdmin = () => {
    const pregunta = usuario.esAdminGlobal
      ? `¿Quitar el modo administrador global a ${usuario.email}? Seguirá entrando en sus empresas con el rol que tenga en cada una.`
      : `¿Dar el modo administrador global a ${usuario.email}? Verá TODAS las empresas con todos los permisos y podrá gestionar usuarios.`;
    if (!window.confirm(pregunta)) return;
    hacer(
      () => apiFetch(base, { method: 'PATCH', body: JSON.stringify({ esAdminGlobal: !usuario.esAdminGlobal }) }),
      usuario.esAdminGlobal
        ? 'Ya no es administrador global.'
        : 'Ahora es administrador global. Si tiene la sesión abierta, lo verá al recargar la página.',
    );
  };

  const restablecer = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (contrasena.length < CONTRASENA_MIN) {
      setError(`La contraseña debe tener al menos ${CONTRASENA_MIN} caracteres.`);
      return;
    }
    // Cambiar la contrasena cierra todas las sesiones abiertas con la anterior,
    // tambien la propia: tras guardar la tuya, el panel te lleva a entrar de nuevo.
    const pregunta = esYo
      ? '¿Cambiar tu propia contraseña? Se cerrará tu sesión y tendrás que volver a entrar con la nueva.'
      : `¿Cambiar la contraseña de ${usuario.email}? La actual dejará de servir y se le cierran las sesiones abiertas.`;
    if (!window.confirm(pregunta)) return;
    const ok = await hacer(
      () => apiFetch(base, { method: 'PATCH', body: JSON.stringify({ nuevaContrasena: contrasena }) }),
      'Contraseña restablecida y sesiones abiertas cerradas. Pásasela por un canal seguro.',
    );
    if (ok) setContrasena('');
  };

  return (
    <Modal titulo={usuario.email} onClose={onClose} ancho="max-w-2xl">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-1.5">
          {usuario.esAdminGlobal && <Etiqueta tono="indigo">Administrador global</Etiqueta>}
          {usuario.activo ? <Etiqueta tono="verde">Activo</Etiqueta> : <Etiqueta tono="rojo">Desactivado</Etiqueta>}
          {esYo && <Etiqueta tono="gris">Eres tú</Etiqueta>}
        </div>

        <Mensajes error={error} aviso={aviso} />

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Accesos a empresas</h3>
          {usuario.esAdminGlobal && (
            <p className="text-xs text-slate-500">
              Como administrador global ya ve todas las empresas con todos los permisos. Estos accesos cuentan si deja de serlo.
            </p>
          )}
          {usuario.empresas.length === 0 ? (
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">No tiene acceso a ninguna empresa.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {usuario.empresas.map((a) => (
                <li key={a.companyId} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{a.nombre}</p>
                    {!a.activa && <Etiqueta tono="gris">Empresa desactivada</Etiqueta>}
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="sr-only" htmlFor={`rol-${a.companyId}`}>
                      Rol en {a.nombre}
                    </label>
                    <select
                      id={`rol-${a.companyId}`}
                      value={a.rol}
                      disabled={ocupado}
                      onChange={(e) => cambiarRol(a, e.target.value)}
                      className={CLASE_SELECT_PEQUENO}
                    >
                      {ROLES_EMPRESA.map((r) => (
                        <option key={r.valor} value={r.valor}>
                          {r.etiqueta}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => quitar(a)} disabled={ocupado} className={BOTON_PELIGRO} aria-label={`Quitar acceso a ${a.nombre}`}>
                      <Trash size={14} /> Quitar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {sinAcceso.length > 0 && (
            <form onSubmit={darAcceso} className="flex flex-col gap-2 rounded-lg border border-dashed border-slate-300 p-3 sm:flex-row sm:items-end">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <label htmlFor="acceso-empresa" className="text-xs font-medium text-slate-600">
                  Dar acceso a
                </label>
                <select id="acceso-empresa" value={nuevaEmpresa} onChange={(e) => setNuevaEmpresa(e.target.value)} className={CLASE_INPUT}>
                  <option value="">Elige una empresa</option>
                  {sinAcceso.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre}
                      {e.activa ? '' : ' (desactivada)'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="acceso-rol" className="text-xs font-medium text-slate-600">
                  Con el rol
                </label>
                <select id="acceso-rol" value={nuevoRol} onChange={(e) => setNuevoRol(e.target.value)} className={CLASE_INPUT}>
                  {ROLES_EMPRESA.map((r) => (
                    <option key={r.valor} value={r.valor}>
                      {r.etiqueta}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={!nuevaEmpresa || ocupado} className={BOTON_PRIMARIO}>
                <Plus size={14} weight="bold" /> Dar acceso
              </button>
            </form>
          )}
        </section>

        <section className="flex flex-col gap-3 border-t border-slate-200 pt-4">
          <h3 className="text-sm font-semibold text-slate-900">Cuenta</h3>
          {esYo && (
            <p className="text-xs text-slate-500">
              No puedes desactivarte ni quitarte el modo administrador a ti mismo: pídeselo a otro administrador global.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={alternarActivo} disabled={esYo || ocupado} className={usuario.activo ? BOTON_PELIGRO : BOTON_SECUNDARIO}>
              <Power size={14} /> {usuario.activo ? 'Desactivar usuario' : 'Reactivar usuario'}
            </button>
            <button
              type="button"
              onClick={alternarAdmin}
              disabled={esYo || ocupado}
              className={usuario.esAdminGlobal ? BOTON_PELIGRO : BOTON_INDIGO}
            >
              <ShieldCheck size={14} /> {usuario.esAdminGlobal ? 'Quitar modo administrador' : 'Dar modo administrador'}
            </button>
          </div>

          <form onSubmit={restablecer} className="flex flex-col gap-1.5">
            <label htmlFor="restablecer-password" className="text-xs font-medium text-slate-600">
              Restablecer contraseña
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="min-w-0 flex-1">
                <CampoContrasena id="restablecer-password" valor={contrasena} onChange={setContrasena} />
              </div>
              <button type="submit" disabled={!contrasena || ocupado} className={BOTON_SECUNDARIO_ALTO}>
                <Key size={14} /> Restablecer
              </button>
            </div>
            <p className="text-xs text-slate-500">Mínimo {CONTRASENA_MIN} caracteres. Cópiala antes de guardar: después no se puede ver.</p>
          </form>
        </section>
      </div>
    </Modal>
  );
}
