'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { UserPlus, UsersThree } from '@phosphor-icons/react';
import { apiFetch, errorMessage } from '@/lib/api';
import { getCompanyId, type CatalogoPermisos } from '@/lib/auth';
import ContrasenaProvisional from '@/components/admin/ContrasenaProvisional';
import { Modal, PREGUNTA_COPIADA } from '@/components/admin/comunes';
import {
  empresasQueAdministra,
  OTRA_CONTRASENA,
  rutaUsuarios,
  type EmpresaGestionable,
  type ResultadoNuevaContrasena,
  type UsuarioEmpresa,
} from '@/lib/usuarios-empresa';
import { CabeceraBloque, Mensaje, SinAcceso, type MensajeConfig } from '../componentes';
import { useConfiguracion } from '../contexto';
import FilaUsuario from './FilaUsuario';
import FormularioUsuario from './FormularioUsuario';

/**
 * Configuracion > Usuarios: el administrador elige la empresa, ve quien entra
 * en ella y da de alta, cambia el acceso, genera contraseñas provisionales o
 * quita el acceso. El administrador global ve todas las empresas; el de una
 * empresa, solo las que administra. El servidor lo vuelve a comprobar todo
 * (rutas /companies/:companyId/usuarios con admin:empresa).
 */

interface EmpresaAdmin {
  id: string;
  nombre: string;
  pais: string | null;
  activa: boolean;
}

type Ventana =
  | { tipo: 'alta' }
  | { tipo: 'editar'; usuario: UsuarioEmpresa }
  | { tipo: 'contrasena'; quien: string; email: string; contrasena: string };

const FOCO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2';
const BOTON_PRIMARIO = `inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-accent-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${FOCO}`;
const CLASE_SELECT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-600';

export default function UsuariosPage() {
  const { user, listo } = useConfiguracion();
  const soyAdminGlobal = user?.esAdminGlobal === true;
  const miEmail = (user?.email ?? '').toLowerCase();
  // Las empresas que administra, como texto: el efecto solo se repite si cambian.
  const propias = useMemo(() => empresasQueAdministra(user), [user]);
  const clavePropias = propias.map((e) => `${e.companyId}:${e.nombre}`).join('|');

  const [empresas, setEmpresas] = useState<EmpresaGestionable[] | null>(null);
  const [errorEmpresas, setErrorEmpresas] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [usuarios, setUsuarios] = useState<UsuarioEmpresa[] | null>(null);
  const [errorLista, setErrorLista] = useState('');
  const [catalogo, setCatalogo] = useState<CatalogoPermisos | null>(null);
  const [errorCatalogo, setErrorCatalogo] = useState('');
  const [paises, setPaises] = useState<Record<string, string | null>>({});
  const [mensaje, setMensaje] = useState<MensajeConfig>(null);
  const [ventana, setVentana] = useState<Ventana | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  // Empresas del desplegable: todas para el administrador global; las suyas para el de empresa.
  useEffect(() => {
    if (!listo || !user) return;
    let vivo = true;
    const elegirInicial = (lista: EmpresaGestionable[]) => {
      const activa = getCompanyId();
      setCompanyId((actual) => (lista.some((e) => e.id === actual) ? actual : lista.some((e) => e.id === activa) ? activa : (lista[0]?.id ?? '')));
    };
    if (soyAdminGlobal) {
      apiFetch<EmpresaAdmin[]>('/admin/empresas')
        .then((lista) => {
          if (!vivo) return;
          const ordenadas = lista
            .map((e) => ({ id: e.id, nombre: e.nombre, pais: e.pais ?? null, activa: e.activa }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
          setEmpresas(ordenadas);
          setErrorEmpresas('');
          elegirInicial(ordenadas);
        })
        .catch((e) => vivo && setErrorEmpresas(errorMessage(e)));
    } else {
      const lista = propias
        .map((e) => ({ id: e.companyId, nombre: e.nombre, pais: null, activa: true }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
      setEmpresas(lista);
      elegirInicial(lista);
    }
    return () => {
      vivo = false;
    };
    // clavePropias resume `propias`: no hace falta repetir por cada lectura de la sesión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listo, soyAdminGlobal, clavePropias]);

  const cargarLista = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const lista = await apiFetch<UsuarioEmpresa[]>(rutaUsuarios(id));
      setUsuarios(lista);
      setErrorLista('');
    } catch (e) {
      setUsuarios(null);
      setErrorLista(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    if (!companyId) return;
    setUsuarios(null);
    setErrorLista('');
    cargarLista(companyId);
  }, [companyId, cargarLista]);

  // El catálogo de perfiles y áreas es el mismo en todas las empresas: se lee una vez.
  useEffect(() => {
    if (!companyId || catalogo) return;
    apiFetch<CatalogoPermisos>(rutaUsuarios(companyId, '/catalogo'))
      .then((c) => {
        if (c && Array.isArray(c.areas) && Array.isArray(c.perfiles)) setCatalogo(c);
        else setErrorCatalogo('No se ha podido leer la lista de permisos.');
      })
      .catch((e) => setErrorCatalogo(errorMessage(e)));
  }, [companyId, catalogo]);

  // País de la empresa elegida, para avisar de que Impuestos y Nóminas no se usan fuera de España.
  useEffect(() => {
    if (!companyId || companyId in paises) return;
    const conocido = empresas?.find((e) => e.id === companyId)?.pais;
    if (conocido) {
      setPaises((p) => ({ ...p, [companyId]: conocido }));
      return;
    }
    apiFetch<{ pais?: string | null }>(`/companies/${encodeURIComponent(companyId)}/legal-config`)
      .then((d) => setPaises((p) => ({ ...p, [companyId]: d?.pais ?? null })))
      .catch(() => setPaises((p) => ({ ...p, [companyId]: null })));
  }, [companyId, empresas, paises]);

  const empresasConPais = useMemo(
    () => (empresas ?? []).map((e) => ({ ...e, pais: e.pais ?? paises[e.id] ?? null })),
    [empresas, paises],
  );
  const empresa = empresasConPais.find((e) => e.id === companyId);
  const nombreEmpresa = empresa?.nombre ?? 'esta empresa';

  const accion = async (u: UsuarioEmpresa, fn: () => Promise<string | null>) => {
    setMensaje(null);
    setOcupado(u.userId);
    try {
      const texto = await fn();
      await cargarLista(companyId);
      if (texto) setMensaje({ ok: true, texto });
    } catch (e) {
      setMensaje({ ok: false, texto: errorMessage(e) });
    } finally {
      setOcupado(null);
    }
  };

  const nuevaContrasena = (u: UsuarioEmpresa) => {
    const quien = u.nombre || u.email;
    const pregunta =
      u.estado === 'contrasena_caducada'
        ? `Se creará una contraseña provisional nueva para ${quien}. Valdrá 7 días. ¿Seguir?`
        : `Se creará una contraseña provisional para ${quien}. La que tiene ahora dejará de servir y se cerrarán sus sesiones abiertas. ¿Seguir?`;
    if (!window.confirm(pregunta)) return;
    accion(u, async () => {
      const r = await apiFetch<ResultadoNuevaContrasena>(rutaUsuarios(companyId, `/${encodeURIComponent(u.userId)}/contrasena-provisional`), {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setVentana({ tipo: 'contrasena', quien, email: u.email, contrasena: r.contrasenaProvisional });
      return null;
    });
  };

  const quitar = (u: UsuarioEmpresa) => {
    const esYo = u.email.toLowerCase() === miEmail;
    const pregunta = esYo
      ? `¿Quitarte a ti el acceso a «${nombreEmpresa}»? Dejarás de verla en cuanto recargues la página.`
      : `¿Quitar a ${u.nombre || u.email} el acceso a «${nombreEmpresa}»? No se borra su usuario ni ningún dato de la empresa.`;
    if (!window.confirm(pregunta)) return;
    accion(u, async () => {
      await apiFetch(rutaUsuarios(companyId, `/${encodeURIComponent(u.userId)}`), { method: 'DELETE' });
      return `${u.nombre || u.email} ya no tiene acceso a «${nombreEmpresa}».`;
    });
  };

  /** Desactivar o reactivar la cuenta: solo el administrador global (ruta de Administración). */
  const alternarActivo = (u: UsuarioEmpresa) => {
    const quien = u.nombre || u.email;
    const pregunta = u.activo
      ? `¿Desactivar a ${quien}? Se le cierran las sesiones abiertas y no podrá entrar en ninguna empresa hasta que lo reactives. No se borra nada.`
      : `¿Reactivar a ${quien}?`;
    if (!window.confirm(pregunta)) return;
    accion(u, async () => {
      await apiFetch(`/admin/usuarios/${encodeURIComponent(u.userId)}`, { method: 'PATCH', body: JSON.stringify({ activo: !u.activo }) });
      return u.activo ? `${quien} queda desactivado.` : `${quien} vuelve a estar activo.`;
    });
  };

  const alGrabar = (id: string, texto: string | null) => {
    setMensaje(texto ? { ok: true, texto } : null);
    if (id !== companyId) setCompanyId(id);
    else cargarLista(id);
  };

  if (!listo) return null;

  const cabecera = (
    <CabeceraBloque
      icono={UsersThree}
      titulo="Usuarios"
      descripcion="Quién entra en cada empresa, con qué rol y qué puede ver y hacer. Desde aquí das de alta a personas nuevas y les generas la contraseña."
    />
  );

  if (!soyAdminGlobal && propias.length === 0) {
    return (
      <>
        {cabecera}
        <SinAcceso texto="Los usuarios de una empresa los gestiona su administrador. Tu acceso está en «Tu acceso y usuarios»." />
      </>
    );
  }

  return (
    <>
      {cabecera}

      <section aria-label="Empresa" className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1.5 sm:w-80">
            <label htmlFor="usuarios-empresa" className="text-sm font-medium text-slate-700">
              Empresa
            </label>
            <select
              id="usuarios-empresa"
              value={companyId}
              onChange={(e) => {
                setMensaje(null);
                setCompanyId(e.target.value);
              }}
              disabled={!empresas || empresas.length === 0}
              className={CLASE_SELECT}
            >
              {!empresas && <option value="">Cargando…</option>}
              {empresasConPais.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                  {e.activa ? '' : ' (desactivada)'}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => {
              setMensaje(null);
              setVentana({ tipo: 'alta' });
            }}
            disabled={!companyId || !catalogo}
            className={BOTON_PRIMARIO}
          >
            <UserPlus size={18} aria-hidden /> Nuevo usuario
          </button>
        </div>
        {!soyAdminGlobal && (
          <p className="mt-3 text-xs text-slate-500">Salen las empresas en las que tienes el rol Administrador.</p>
        )}
        {errorEmpresas && (
          <div className="mt-3">
            <Mensaje mensaje={{ ok: false, texto: `No se han podido cargar las empresas. ${errorEmpresas}` }} />
          </div>
        )}
        {errorCatalogo && (
          <div className="mt-3">
            <Mensaje mensaje={{ ok: false, texto: `No se han podido cargar los permisos: ${errorCatalogo}` }} />
          </div>
        )}
      </section>

      <Mensaje mensaje={mensaje} onCerrar={() => setMensaje(null)} />

      <section aria-labelledby="lista-usuarios" className="rounded-xl border border-slate-200 bg-white">
        <header className="border-b border-slate-200 px-4 py-3 md:px-5">
          <h2 id="lista-usuarios" className="font-semibold text-slate-900">
            Quién tiene acceso a {nombreEmpresa}
            {usuarios && <span className="ml-1 font-normal text-slate-500">({usuarios.length})</span>}
          </h2>
        </header>
        <div className="hidden border-b border-slate-100 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-5">
          <span>Persona</span>
          <span>Rol y permisos</span>
          <span>Estado</span>
        </div>
        {errorLista ? (
          <div className="flex flex-col gap-3 p-4 md:p-5">
            <Mensaje mensaje={{ ok: false, texto: errorLista }} />
            <button type="button" onClick={() => cargarLista(companyId)} className="self-start text-sm font-medium text-emerald-700 hover:underline">
              Volver a intentarlo
            </button>
          </div>
        ) : !usuarios ? (
          <p className="px-4 py-4 text-sm text-slate-500 md:px-5" role="status">
            Cargando…
          </p>
        ) : usuarios.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-600 md:px-5">Nadie tiene acceso a esta empresa todavía. Usa «Nuevo usuario» para dar de alta a alguien.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {usuarios.map((u) => (
              <FilaUsuario
                key={u.userId}
                usuario={u}
                catalogo={catalogo}
                esYo={u.email.toLowerCase() === miEmail}
                soyAdminGlobal={soyAdminGlobal}
                ocupado={ocupado !== null}
                onEditar={() => {
                  setMensaje(null);
                  setVentana({ tipo: 'editar', usuario: u });
                }}
                onNuevaContrasena={() => nuevaContrasena(u)}
                onQuitar={() => quitar(u)}
                onActivar={() => alternarActivo(u)}
              />
            ))}
          </ul>
        )}
        <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 md:px-5">
          Los cambios cuentan desde que los grabas. Si la persona tiene la sesión abierta, verá lo nuevo al recargar la página. Los
          administradores globales de la plataforma entran en todas las empresas aunque no salgan en esta lista.
        </p>
      </section>

      {ventana?.tipo === 'alta' && catalogo && (
        <FormularioUsuario
          modo="alta"
          catalogo={catalogo}
          empresas={empresasConPais}
          companyId={companyId}
          onClose={() => setVentana(null)}
          onGrabado={alGrabar}
        />
      )}
      {ventana?.tipo === 'editar' && catalogo && (
        <FormularioUsuario
          modo="editar"
          catalogo={catalogo}
          empresas={empresasConPais}
          companyId={companyId}
          usuario={ventana.usuario}
          esYo={ventana.usuario.email.toLowerCase() === miEmail}
          onClose={() => setVentana(null)}
          onGrabado={alGrabar}
        />
      )}
      {ventana?.tipo === 'contrasena' && (
        <Modal titulo="Nueva contraseña provisional" onClose={() => setVentana(null)} confirmarAlCerrar={PREGUNTA_COPIADA} ancho="max-w-lg">
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">
              Contraseña provisional de <strong className="break-all font-medium text-slate-900">{ventana.quien}</strong>. Sus sesiones abiertas se
              han cerrado.
            </p>
            <ContrasenaProvisional contrasena={ventana.contrasena} email={ventana.email} comoGenerarOtra={OTRA_CONTRASENA} onHecho={() => setVentana(null)} />
          </div>
        </Modal>
      )}
    </>
  );
}
