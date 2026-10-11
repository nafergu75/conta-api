'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowCounterClockwise,
  ArrowRight,
  Buildings,
  CaretDown,
  CheckCircle,
  Key,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Power,
  ShieldCheck,
  SlidersHorizontal,
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
  RUTA_CAMBIAR_CONTRASENA,
  type Areas,
  type CatalogoPermisos,
  type SessionUser,
} from '@/lib/auth';
import EditorPermisos from '@/components/admin/EditorPermisos';
import ContrasenaProvisional from '@/components/admin/ContrasenaProvisional';
import RedSeguridadVerifactu from '@/components/admin/RedSeguridadVerifactu';
import {
  areasDelPerfil,
  areasParaEnviar,
  difiereDelPerfil,
  esAdministrador,
  esEmpresaEspanola,
  mismasAreas,
  perfilDe,
  resumenAreas,
  resumenPerfil,
  todoNinguno,
} from '@/components/admin/permisos';
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
  /** Permisos a medida (no los de su perfil). */
  personalizado?: boolean;
  /** Lo que puede en cada area por este acceso. null con el perfil Administrador (todo). */
  areas?: Areas | null;
}

interface UsuarioAdmin {
  id: string;
  email: string;
  activo: boolean;
  esAdminGlobal: boolean;
  creadoEn?: string;
  /** Todavia no ha cambiado la contrasena provisional que le dio un administrador. */
  debeCambiarContrasena?: boolean;
  /**
   * Hasta cuando vale la contrasena provisional que le puso un administrador
   * (ISO). null si no tiene provisional o si es la suya de siempre marcada para
   * cambiar (esa no caduca).
   */
  contrasenaProvisionalHasta?: string | null;
  /** La provisional ya no vale: no puede entrar hasta que se le genere otra. */
  contrasenaProvisionalCaducada?: boolean;
  empresas: AccesoEmpresa[];
}

/** Respuesta del alta y del restablecimiento: la contrasena solo viene si la genero el servidor. */
type UsuarioConProvisional = UsuarioAdmin & { contrasenaProvisional?: string };

/** Respuesta de PUT /admin/usuarios/:userId/empresas/:companyId. */
interface ResultadoAcceso {
  rol: string;
  personalizado: boolean;
  areas: Areas | null;
  cambiado: boolean;
}

type Pestana = 'empresas' | 'usuarios';

/** Busqueda sin distinguir mayusculas ni tildes. */
const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const fechaCorta = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('es-ES') : '');

/** "15 de octubre de 2026 a las 10:30" (hora de Espana). */
const fechaYHora = (iso: string) => {
  const d = new Date(iso);
  const dia = d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' });
  const hora = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  return `${dia} a las ${hora}`;
};

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
  confirmarAlCerrar,
}: {
  titulo: string;
  onClose: () => void;
  children: React.ReactNode;
  ancho?: string;
  /** Si se pasa, cerrar con Escape, la X o un clic fuera pregunta esto antes. */
  confirmarAlCerrar?: string;
}) {
  const cerrar = useCallback(() => {
    if (confirmarAlCerrar && !window.confirm(confirmarAlCerrar)) return;
    onClose();
  }, [confirmarAlCerrar, onClose]);

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [cerrar]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:px-4" onClick={cerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`max-h-[90dvh] w-full ${ancho} overflow-y-auto rounded-t-xl bg-white p-5 shadow-xl sm:rounded-xl sm:p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="min-w-0 break-words text-lg font-semibold text-slate-900">{titulo}</h2>
          <button type="button" onClick={cerrar} aria-label="Cerrar" className="p-1.5 text-slate-500 transition-colors hover:text-slate-900">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Etiqueta de la contrasena: provisional pendiente o ya caducada. */
function EtiquetaContrasena({ usuario }: { usuario: UsuarioAdmin }) {
  if (!usuario.debeCambiarContrasena) return null;
  if (usuario.contrasenaProvisionalCaducada) {
    return (
      <span title="No puede entrar con ella: genérale otra">
        <Etiqueta tono="rojo">Contraseña provisional caducada</Etiqueta>
      </span>
    );
  }
  const hasta = usuario.contrasenaProvisionalHasta;
  return (
    <span
      title={
        hasta
          ? `Todavía no ha puesto su propia contraseña. La provisional vale hasta el ${fechaYHora(hasta)}.`
          : 'Todavía no ha puesto su propia contraseña'
      }
    >
      <Etiqueta tono="ambar">Contraseña provisional</Etiqueta>
    </span>
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
  // Catalogo de areas y perfiles. Si no se puede cargar (servidor antiguo), los
  // accesos se gestionan solo con el perfil y no se ensena «Permisos».
  const [catalogo, setCatalogo] = useState<CatalogoPermisos | null>(null);

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

  useEffect(() => {
    if (!esAdmin) return;
    apiFetch<CatalogoPermisos>('/admin/permisos/catalogo')
      .then((c) => setCatalogo(c && Array.isArray(c.areas) && Array.isArray(c.perfiles) ? c : null))
      .catch(() => setCatalogo(null));
  }, [esAdmin]);

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
        {/* VERI*FACTU: bloqueo de emision desde el 1-1-2027 (afecta a toda la plataforma). */}
        <RedSeguridadVerifactu />

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
                        <EtiquetaContrasena usuario={u} />
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-1.5">
                      {u.empresas.length === 0 ? (
                        <span className="text-xs text-slate-400">{u.esAdminGlobal ? 'Ve todas las empresas' : 'Sin acceso a ninguna empresa'}</span>
                      ) : (
                        u.empresas.map((a) => (
                          <span
                            key={a.companyId}
                            title={a.personalizado ? 'Permisos a medida, distintos de los de su perfil' : undefined}
                            className={`inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${
                              a.personalizado ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-slate-50 text-slate-700'
                            }`}
                          >
                            <span className="truncate">{a.nombre}</span>
                            <span className={a.personalizado ? 'text-amber-600' : 'text-slate-400'}>·</span>
                            <span className="whitespace-nowrap font-medium">
                              {nombreRol(a.rol)}
                              {a.personalizado && ' a medida'}
                            </span>
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
          catalogo={catalogo}
          onClose={() => setModal(null)}
          onCreado={async (u) => {
            // El modal se queda abierto con la contrasena provisional y el boton Copiar.
            setError('');
            setAviso(`Usuario ${u.email} creado.`);
            await cargar();
          }}
        />
      )}

      {usuarioGestionado && (
        <PanelUsuario
          usuario={usuarioGestionado}
          empresas={empresas}
          catalogo={catalogo}
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

const PREGUNTA_COPIADA = '¿Has copiado la contraseña? Después no se puede volver a ver.';

/** Boton que abre o cierra el editor de permisos («Ajustar permisos (opcional)»). */
function BotonAjustar({
  abierto,
  onClick,
  controla,
  personalizado,
}: {
  abierto: boolean;
  onClick: () => void;
  controla: string;
  /** Hay casillas cambiadas: se guardan aunque el editor este plegado, y se dice. */
  personalizado?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={abierto}
      aria-controls={controla}
      className="inline-flex min-h-[44px] flex-wrap items-center gap-1.5 self-start rounded-lg px-1 text-sm font-medium text-slate-700 hover:text-slate-900"
    >
      <CaretDown size={14} className={`transition-transform ${abierto ? 'rotate-180' : ''}`} aria-hidden />
      Ajustar permisos <span className="font-normal text-slate-500">(opcional)</span>
      {personalizado && (
        <span className="inline-flex items-center whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
          Personalizado
        </span>
      )}
    </button>
  );
}

const PREGUNTA_CAMBIO_PERFIL =
  'Al cambiar de perfil se quitan los permisos que has marcado y se parte de los del perfil nuevo. ¿Seguir?';

/** Una linea bajo el desplegable de perfil que dice lo que incluye. */
function ResumenDelPerfil({ catalogo, rol, id }: { catalogo: CatalogoPermisos | null; rol: string; id?: string }) {
  const texto = resumenPerfil(catalogo, rol);
  return texto ? (
    <p id={id} className="text-xs text-slate-500">
      {texto}
    </p>
  ) : null;
}

/**
 * Alta de un usuario. La contrasena la genera el servidor: se ensena una vez al
 * terminar, con el boton Copiar, y es provisional (el usuario la cambia por una
 * suya al entrar por primera vez).
 */
function ModalNuevoUsuario({
  empresas,
  catalogo,
  onClose,
  onCreado,
}: {
  empresas: EmpresaAdmin[];
  catalogo: CatalogoPermisos | null;
  onClose: () => void;
  onCreado: (u: UsuarioAdmin) => Promise<void>;
}) {
  const [email, setEmail] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [rol, setRol] = useState('solo_lectura');
  const [ajustar, setAjustar] = useState(false);
  // null = los del perfil elegido.
  const [areas, setAreas] = useState<Areas | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  // La contrasena provisional vive SOLO aqui: ni en el navegador ni en la URL.
  const [creado, setCreado] = useState<{ email: string; contrasena?: string; acceso?: string } | null>(null);

  const empresa = empresas.find((e) => e.id === companyId);
  const puedeAjustar = !!catalogo && !!companyId && !esAdministrador(rol);
  // Lo marcado se envia este el editor abierto o plegado: lo que se ve al
  // reabrirlo es lo que se guarda (y el boton dice «Personalizado»).
  const areasElegidas = puedeAjustar ? areas : null;
  const vacio = !!areasElegidas && todoNinguno(areasElegidas);
  const aMedidaAhora = puedeAjustar && difiereDelPerfil(catalogo, rol, areas);

  const cambiarPerfil = (valor: string) => {
    if (aMedidaAhora && !window.confirm(PREGUNTA_CAMBIO_PERFIL)) return;
    setRol(valor);
    setAreas(null); // Se vuelve a partir del perfil nuevo.
  };

  const enviar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError('');
    if (vacio) {
      setError('Marca al menos un permiso, o no le des acceso a la empresa.');
      return;
    }
    const aMedida = companyId ? areasParaEnviar(catalogo, rol, areasElegidas) : null;
    setGuardando(true);
    try {
      const u = await apiFetch<UsuarioConProvisional>('/admin/usuarios', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim(), ...(companyId ? { companyId, rol } : {}), ...(aMedida ? { areas: aMedida } : {}) }),
      });
      // Con que acceso ha quedado, segun el servidor (no segun la pantalla).
      const a = u.empresas?.[0];
      const acceso = a
        ? `Acceso a «${a.nombre}»: ${perfilDe(catalogo, a.rol)?.nombre ?? nombreRol(a.rol)}${a.personalizado ? ' a medida' : ''}.`
        : 'Todavía no tiene acceso a ninguna empresa.';
      setCreado({ email: u.email, contrasena: u.contrasenaProvisional, acceso });
      setGuardando(false);
      await onCreado(u);
    } catch (e) {
      setError(errorMessage(e));
      setGuardando(false);
    }
  };

  if (creado) {
    return (
      <Modal titulo="Usuario creado" onClose={onClose} confirmarAlCerrar={creado.contrasena ? PREGUNTA_COPIADA : undefined}>
        {creado.acceso && <p className="mb-3 text-sm text-slate-600">{creado.acceso}</p>}
        {creado.contrasena ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              Contraseña provisional de <strong className="break-all font-medium text-slate-900">{creado.email}</strong>:
            </p>
            <ContrasenaProvisional contrasena={creado.contrasena} email={creado.email} onHecho={onClose} />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-slate-600">
              {creado.email} ya está dado de alta. La primera vez que entre tendrá que cambiar su contraseña por una suya.
            </p>
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className={BOTON_SECUNDARIO_ALTO}>
                Hecho
              </button>
            </div>
          </div>
        )}
      </Modal>
    );
  }

  return (
    <Modal titulo="Nuevo usuario" onClose={onClose} ancho={puedeAjustar && ajustar ? 'max-w-2xl' : 'max-w-md'}>
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
          <p className="text-xs text-slate-500">
            La contraseña la crea la aplicación y la verás una sola vez al terminar. Es provisional: al entrar tendrá que poner una suya.
          </p>
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
              Perfil
            </label>
            <select
              id="usuario-rol"
              value={rol}
              onChange={(e) => cambiarPerfil(e.target.value)}
              disabled={!companyId}
              aria-describedby={companyId ? 'usuario-rol-resumen' : undefined}
              className={CLASE_INPUT}
            >
              {ROLES_EMPRESA.map((r) => (
                <option key={r.valor} value={r.valor}>
                  {r.etiqueta}
                </option>
              ))}
            </select>
          </div>
        </div>

        {companyId && <ResumenDelPerfil catalogo={catalogo} rol={rol} id="usuario-rol-resumen" />}

        {puedeAjustar && catalogo && (
          <div className="flex flex-col gap-2">
            <BotonAjustar abierto={ajustar} onClick={() => setAjustar((v) => !v)} controla="usuario-permisos" personalizado={aMedidaAhora} />
            {ajustar && (
              <div id="usuario-permisos">
                <EditorPermisos
                  catalogo={catalogo}
                  rol={rol}
                  areas={areas}
                  onChange={setAreas}
                  empresaEspanola={esEmpresaEspanola(empresa?.pais)}
                  deshabilitado={guardando}
                  onVolverAlPerfil={() => setAreas(null)}
                />
              </div>
            )}
          </div>
        )}

        {error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={BOTON_SECUNDARIO}>
            Cancelar
          </button>
          <button type="submit" disabled={guardando || vacio} className={BOTON_PRIMARIO}>
            {guardando ? 'Creando…' : 'Crear usuario'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** En que punto esta la contrasena del usuario, dicho en una frase. */
function EstadoContrasena({ usuario }: { usuario: UsuarioAdmin }) {
  if (!usuario.debeCambiarContrasena) return null;
  const hasta = usuario.contrasenaProvisionalHasta;
  if (usuario.contrasenaProvisionalCaducada) {
    return (
      <p role="status" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
        <WarningCircle size={18} className="mt-0.5 shrink-0" />
        <span>
          Su contraseña provisional caducó{hasta ? ` el ${fechaYHora(hasta)}` : ''} sin que la cambiara, así que ya no puede entrar. Genérale otra y
          pásasela.
        </span>
      </p>
    );
  }
  return (
    <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      {hasta
        ? `Tiene una contraseña provisional que todavía no ha cambiado. Vale hasta el ${fechaYHora(hasta)}; si no entra antes, tendrás que generarle otra.`
        : 'Tiene que cambiar su contraseña la próxima vez que entre. Puede seguir entrando con la que tiene, que no caduca.'}
    </p>
  );
}

function PanelUsuario({
  usuario,
  empresas,
  catalogo,
  esYo,
  onClose,
  onCambio,
}: {
  usuario: UsuarioAdmin;
  empresas: EmpresaAdmin[];
  catalogo: CatalogoPermisos | null;
  esYo: boolean;
  onClose: () => void;
  onCambio: () => Promise<void>;
}) {
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [nuevaEmpresa, setNuevaEmpresa] = useState('');
  const [nuevoRol, setNuevoRol] = useState('solo_lectura');
  const [ajustarNuevo, setAjustarNuevo] = useState(false);
  const [nuevasAreas, setNuevasAreas] = useState<Areas | null>(null);
  // Acceso cuyo editor de permisos esta abierto y lo que se lleva marcado.
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Areas | null>(null);
  // Contrasena provisional recien generada: solo en este estado, se pierde al cerrar.
  const [provisional, setProvisional] = useState<string | null>(null);

  const base = `/admin/usuarios/${encodeURIComponent(usuario.id)}`;
  const sinAcceso = empresas.filter((e) => !usuario.empresas.some((a) => a.companyId === e.id));
  const paisDe = (companyId: string) => empresas.find((e) => e.id === companyId)?.pais;
  const nombrePerfil = (rol: string) => catalogo?.perfiles.find((p) => p.rol === rol)?.nombre ?? nombreRol(rol);

  const hacer = async <T,>(fn: () => Promise<T>, ok: string | ((r: T) => string)) => {
    setError('');
    setAviso('');
    setOcupado(true);
    try {
      const r = await fn();
      await onCambio();
      setAviso(typeof ok === 'function' ? ok(r) : ok);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setOcupado(false);
    }
  };

  /**
   * Sustituye el acceso entero: perfil y permisos (areas null = los del perfil).
   * Con un servidor sin catalogo de permisos se manda solo el perfil.
   */
  const ponerAcceso = (companyId: string, rol: string, areas: Areas | null) =>
    apiFetch<ResultadoAcceso>(`${base}/empresas/${encodeURIComponent(companyId)}`, {
      method: 'PUT',
      body: JSON.stringify(catalogo ? { rol, areas } : { rol }),
    });

  const perfilDelAcceso = (a: AccesoEmpresa) => areasDelPerfil(catalogo, a.rol);
  const guardadas = (a: AccesoEmpresa) => a.areas ?? perfilDelAcceso(a);
  const hayCambios = (a: AccesoEmpresa) => editando === a.companyId && !!borrador && !mismasAreas(borrador, guardadas(a));

  const cambiarRol = (a: AccesoEmpresa, rol: string) => {
    if (rol === a.rol) return;
    const pregunta = a.personalizado
      ? `Al cambiar de perfil se pierden los permisos a medida en «${a.nombre}». ¿Seguir?`
      : `¿Cambiar el perfil de ${usuario.email} en «${a.nombre}» a ${nombrePerfil(rol)}?`;
    if (!window.confirm(pregunta)) return;
    if (editando === a.companyId) setEditando(null);
    hacer(() => ponerAcceso(a.companyId, rol, null), `Ahora es ${nombrePerfil(rol)} en «${a.nombre}».`);
  };

  const alternarEditor = (a: AccesoEmpresa) => {
    if (editando === a.companyId) {
      setEditando(null);
      return;
    }
    setEditando(a.companyId);
    setBorrador(guardadas(a));
  };

  const guardarPermisos = async (a: AccesoEmpresa) => {
    if (!borrador || todoNinguno(borrador)) return;
    const ok = await hacer(
      () => ponerAcceso(a.companyId, a.rol, borrador),
      (r) =>
        r.personalizado
          ? `Permisos de «${a.nombre}» guardados. Si tiene la sesión abierta, los verá al recargar la página.`
          : 'Coincide con el perfil: queda sin personalizar.',
    );
    if (ok) setEditando(null);
  };

  const volverAlPerfil = async (a: AccesoEmpresa) => {
    // Solo hay cambios sin guardar: se deshacen sin preguntar.
    if (!a.personalizado) {
      setBorrador(perfilDelAcceso(a));
      return;
    }
    if (!window.confirm(`¿Quitar los permisos a medida y dejar los de ${nombrePerfil(a.rol)}?`)) return;
    const ok = await hacer(
      () => ponerAcceso(a.companyId, a.rol, null),
      `En «${a.nombre}» vuelve a tener los permisos de ${nombrePerfil(a.rol)}. Si tiene la sesión abierta, los verá al recargar la página.`,
    );
    if (ok) setEditando(null);
  };

  const quitar = (a: AccesoEmpresa) => {
    if (!window.confirm(`¿Quitar a ${usuario.email} el acceso a «${a.nombre}»? No se borra ningún dato de la empresa.`)) return;
    if (editando === a.companyId) setEditando(null);
    hacer(
      () => apiFetch(`${base}/empresas/${encodeURIComponent(a.companyId)}`, { method: 'DELETE' }),
      `Ya no tiene acceso a «${a.nombre}».`,
    );
  };

  const puedeAjustarNuevo = !!catalogo && !!nuevaEmpresa && !esAdministrador(nuevoRol);
  // Igual que en el alta: lo marcado cuenta aunque el editor este plegado.
  const areasNuevas = puedeAjustarNuevo ? nuevasAreas : null;
  const nuevoVacio = !!areasNuevas && todoNinguno(areasNuevas);
  const nuevoAMedida = puedeAjustarNuevo && difiereDelPerfil(catalogo, nuevoRol, nuevasAreas);

  const darAcceso = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = empresas.find((x) => x.id === nuevaEmpresa);
    if (!e || nuevoVacio) return;
    const ok = await hacer(
      () => ponerAcceso(e.id, nuevoRol, areasParaEnviar(catalogo, nuevoRol, areasNuevas)),
      (r) =>
        `Acceso a «${e.nombre}» como ${nombrePerfil(nuevoRol)}${r?.personalizado ? ' a medida' : ''}. Si tiene la sesión abierta, lo verá al recargar la página.`,
    );
    if (ok) {
      setNuevaEmpresa('');
      setNuevasAreas(null);
      setAjustarNuevo(false);
    }
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
      ? `¿Quitar el modo administrador global a ${usuario.email}? Seguirá entrando en sus empresas con el perfil y los permisos que tenga en cada una.`
      : `¿Dar el modo administrador global a ${usuario.email}? Verá TODAS las empresas con todos los permisos y podrá gestionar usuarios.`;
    if (!window.confirm(pregunta)) return;
    hacer(
      () => apiFetch(base, { method: 'PATCH', body: JSON.stringify({ esAdminGlobal: !usuario.esAdminGlobal }) }),
      usuario.esAdminGlobal
        ? 'Ya no es administrador global.'
        : 'Ahora es administrador global. Si tiene la sesión abierta, lo verá al recargar la página.',
    );
  };

  const caducada = usuario.contrasenaProvisionalCaducada === true;

  const generarProvisional = () => {
    const pregunta = caducada
      ? `Se creará una contraseña provisional nueva para ${usuario.email}. Valdrá 7 días. ¿Seguir?`
      : `Se creará una contraseña provisional para ${usuario.email}. La que tiene ahora dejará de servir y se cerrarán sus sesiones abiertas. ¿Seguir?`;
    if (!window.confirm(pregunta)) return;
    setProvisional(null);
    hacer(
      async () => {
        const r = await apiFetch<UsuarioConProvisional>(base, { method: 'PATCH', body: JSON.stringify({ restablecerContrasena: true }) });
        setProvisional(r.contrasenaProvisional ?? null);
        return r;
      },
      'Contraseña provisional creada. Sus sesiones abiertas se han cerrado.',
    );
  };

  /** Le marca la contrasena que ya tiene para que la cambie al entrar, sin tocarla. */
  const pedirCambio = () => {
    const pregunta =
      `¿Pedir a ${usuario.email} que cambie su contraseña?\n\n` +
      'Su contraseña actual no cambia y la sigue usando para entrar, pero antes de hacer nada más tendrá que poner una nueva. ' +
      'Si ahora tiene la sesión abierta, se le pedirá en cuanto haga algo.';
    if (!window.confirm(pregunta)) return;
    hacer(
      () => apiFetch<UsuarioAdmin>(base, { method: 'PATCH', body: JSON.stringify({ exigirCambioContrasena: true }) }),
      'Hecho: la próxima vez que use la aplicación tendrá que poner una contraseña nueva.',
    );
  };

  return (
    <Modal titulo={usuario.email} onClose={onClose} ancho="max-w-2xl" confirmarAlCerrar={provisional ? PREGUNTA_COPIADA : undefined}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-1.5">
          {usuario.esAdminGlobal && <Etiqueta tono="indigo">Administrador global</Etiqueta>}
          {usuario.activo ? <Etiqueta tono="verde">Activo</Etiqueta> : <Etiqueta tono="rojo">Desactivado</Etiqueta>}
          <EtiquetaContrasena usuario={usuario} />
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
              {usuario.empresas.map((a) => {
                const abierto = editando === a.companyId;
                const conPermisos = !!catalogo && !esAdministrador(a.rol);
                const idEditor = `permisos-${a.companyId}`;
                return (
                  <li key={a.companyId} className="flex flex-col">
                    <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{a.nombre}</p>
                        {catalogo && (
                          <p className="mt-0.5 text-xs text-slate-500">
                            {a.personalizado && a.areas
                              ? `Permisos distintos de los del perfil ${nombrePerfil(a.rol)}. ${resumenAreas(catalogo, a.areas)}`
                              : resumenPerfil(catalogo, a.rol)}
                          </p>
                        )}
                        {(a.personalizado || !a.activa) && (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {a.personalizado && <Etiqueta tono="ambar">Personalizado</Etiqueta>}
                            {!a.activa && <Etiqueta tono="gris">Empresa desactivada</Etiqueta>}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="sr-only" htmlFor={`rol-${a.companyId}`}>
                          Perfil en {a.nombre}
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
                        {conPermisos && (
                          <button
                            type="button"
                            onClick={() => alternarEditor(a)}
                            disabled={ocupado}
                            aria-expanded={abierto}
                            aria-controls={idEditor}
                            className={abierto ? BOTON_ENTRAR : BOTON_SECUNDARIO}
                          >
                            <SlidersHorizontal size={14} /> Permisos
                          </button>
                        )}
                        <button type="button" onClick={() => quitar(a)} disabled={ocupado} className={BOTON_PELIGRO} aria-label={`Quitar acceso a ${a.nombre}`}>
                          <Trash size={14} /> Quitar
                        </button>
                      </div>
                    </div>

                    {abierto && catalogo && (
                      <div id={idEditor} className="flex flex-col gap-3 border-t border-slate-100 p-3">
                        <EditorPermisos
                          catalogo={catalogo}
                          rol={a.rol}
                          areas={borrador}
                          onChange={setBorrador}
                          empresaEspanola={esEmpresaEspanola(paisDe(a.companyId))}
                          esAdminGlobal={usuario.esAdminGlobal}
                          deshabilitado={ocupado}
                        />
                        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                          <button type="button" onClick={() => setEditando(null)} disabled={ocupado} className={BOTON_SECUNDARIO_ALTO}>
                            Cancelar
                          </button>
                          {(a.personalizado || hayCambios(a)) && (
                            <button type="button" onClick={() => volverAlPerfil(a)} disabled={ocupado} className={BOTON_SECUNDARIO_ALTO}>
                              <ArrowCounterClockwise size={14} /> Volver al perfil
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => guardarPermisos(a)}
                            disabled={ocupado || !hayCambios(a) || !borrador || todoNinguno(borrador)}
                            className={BOTON_PRIMARIO}
                          >
                            {ocupado ? 'Guardando…' : 'Guardar permisos'}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {sinAcceso.length > 0 && (
            <form onSubmit={darAcceso} className="flex flex-col gap-3 rounded-lg border border-dashed border-slate-300 p-3">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="flex min-w-0 flex-col gap-1">
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
                    Con el perfil
                  </label>
                  <select
                    id="acceso-rol"
                    value={nuevoRol}
                    onChange={(e) => {
                      if (nuevoAMedida && !window.confirm(PREGUNTA_CAMBIO_PERFIL)) return;
                      setNuevoRol(e.target.value);
                      setNuevasAreas(null); // Se vuelve a partir del perfil nuevo.
                    }}
                    aria-describedby={nuevaEmpresa ? 'acceso-rol-resumen' : undefined}
                    className={CLASE_INPUT}
                  >
                    {ROLES_EMPRESA.map((r) => (
                      <option key={r.valor} value={r.valor}>
                        {r.etiqueta}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {nuevaEmpresa && <ResumenDelPerfil catalogo={catalogo} rol={nuevoRol} id="acceso-rol-resumen" />}

              {puedeAjustarNuevo && catalogo && (
                <>
                  <BotonAjustar
                    abierto={ajustarNuevo}
                    onClick={() => setAjustarNuevo((v) => !v)}
                    controla="acceso-permisos"
                    personalizado={nuevoAMedida}
                  />
                  {ajustarNuevo && (
                    <div id="acceso-permisos">
                      <EditorPermisos
                        catalogo={catalogo}
                        rol={nuevoRol}
                        areas={nuevasAreas}
                        onChange={setNuevasAreas}
                        empresaEspanola={esEmpresaEspanola(paisDe(nuevaEmpresa))}
                        esAdminGlobal={usuario.esAdminGlobal}
                        deshabilitado={ocupado}
                        onVolverAlPerfil={() => setNuevasAreas(null)}
                      />
                    </div>
                  )}
                </>
              )}

              <div className="flex justify-end">
                <button type="submit" disabled={!nuevaEmpresa || ocupado || nuevoVacio} className={BOTON_PRIMARIO}>
                  <Plus size={14} weight="bold" /> Dar acceso
                </button>
              </div>
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

          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-medium text-slate-600">Contraseña</h4>
            {esYo ? (
              <p className="text-sm text-slate-600">
                Tu contraseña la cambias tú en{' '}
                <Link href={RUTA_CAMBIAR_CONTRASENA} className="font-medium text-accent-600 hover:text-accent-700">
                  «Cambiar contraseña»
                </Link>
                .
              </p>
            ) : provisional ? (
              <ContrasenaProvisional contrasena={provisional} email={usuario.email} onHecho={() => setProvisional(null)} />
            ) : (
              <>
                <EstadoContrasena usuario={usuario} />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={generarProvisional}
                    disabled={ocupado}
                    className={caducada ? BOTON_PRIMARIO : BOTON_SECUNDARIO_ALTO}
                  >
                    <Key size={14} /> {caducada ? 'Generar otra contraseña provisional' : 'Generar contraseña provisional'}
                  </button>
                  {!usuario.debeCambiarContrasena && (
                    <button type="button" onClick={pedirCambio} disabled={ocupado} className={BOTON_SECUNDARIO_ALTO}>
                      <ArrowCounterClockwise size={14} /> Pedir que cambie su contraseña
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  La contraseña provisional la verás una sola vez y vale 7 días. Al entrar con ella tendrá que poner una suya, que tú no
                  conocerás.
                  {!usuario.debeCambiarContrasena &&
                    ' Si solo quieres que cambie la que ya tiene (por ejemplo, porque se la pusiste tú), usa «Pedir que cambie su contraseña».'}
                </p>
              </>
            )}
          </div>
        </section>
      </div>
    </Modal>
  );
}
