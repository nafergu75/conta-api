'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle, Info, WarningCircle } from '@phosphor-icons/react';
import { apiFetch, ApiError, campoDelError, errorMessage } from '@/lib/api';
import { nombreRol, ROLES_EMPRESA, type Areas, type CatalogoPermisos } from '@/lib/auth';
import EditorPermisos from '@/components/admin/EditorPermisos';
import ContrasenaProvisional from '@/components/admin/ContrasenaProvisional';
import { Modal, PREGUNTA_CAMBIO_PERFIL, PREGUNTA_COPIADA, ResumenDelPerfil } from '@/components/admin/comunes';
import { areasParaEnviar, difiereDelPerfil, esAdministrador, esEmpresaEspanola, perfilDe, todoNinguno } from '@/components/admin/permisos';
import {
  CODIGO_YA_TIENE_ACCESO,
  OTRA_CONTRASENA,
  rutaUsuarios,
  type ComprobacionCorreo,
  type EmpresaGestionable,
  type ResultadoAltaUsuario,
  type UsuarioEmpresa,
} from '@/lib/usuarios-empresa';
import { BOTON_SECUNDARIO } from './FilaUsuario';

/**
 * Formulario de Configuracion > Usuarios, para dar de alta a alguien en una
 * empresa o para cambiar su acceso. Se graba con «Grabar».
 *
 * - Alta: la contraseña la genera siempre el servidor; se enseña una sola vez
 *   al terminar, con «Copiar», y es provisional (7 días, hay que cambiarla al
 *   entrar). Si el correo ya tiene usuario, no se crea otro: se le da acceso.
 * - Edición: perfil y permisos en esta empresa y, si el servidor lo permite,
 *   nombre y teléfono.
 */

const FOCO = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2';
const CLASE_INPUT =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-600 disabled:cursor-not-allowed disabled:opacity-60';
const CLASE_INPUT_ERROR = 'border-rose-400';
const BOTON_PRIMARIO = `inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-accent-600 px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-accent-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${FOCO}`;

const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Campo = 'nombre' | 'email' | 'telefono' | 'rol' | 'areas';
type Errores = Partial<Record<Campo, string>>;

const ID_CAMPO: Record<Campo, string> = {
  nombre: 'usuario-nombre',
  email: 'usuario-email',
  telefono: 'usuario-telefono',
  rol: 'usuario-rol',
  areas: 'usuario-permisos',
};

function ErrorCampo({ id, texto }: { id: string; texto?: string }) {
  if (!texto) return null;
  return (
    <p id={id} className="flex items-start gap-1 text-xs text-rose-700">
      <WarningCircle size={14} className="mt-px shrink-0" aria-hidden />
      {texto}
    </p>
  );
}

interface PropsComunes {
  catalogo: CatalogoPermisos;
  empresas: EmpresaGestionable[];
  onClose: () => void;
}

type Props =
  | (PropsComunes & {
      modo: 'alta';
      /** Empresa elegida arriba en la pantalla. */
      companyId: string;
      /** Tras grabar: la empresa (puede haberse cambiado aquí) y un texto para la lista. */
      onGrabado: (companyId: string, texto: string | null) => void;
    })
  | (PropsComunes & {
      modo: 'editar';
      companyId: string;
      usuario: UsuarioEmpresa;
      /** El usuario es quien está usando la pantalla. */
      esYo: boolean;
      onGrabado: (companyId: string, texto: string | null) => void;
    });

export default function FormularioUsuario(props: Props) {
  const { catalogo, empresas, onClose } = props;
  const editando = props.modo === 'editar' ? props.usuario : null;

  const [companyId, setCompanyId] = useState(props.companyId);
  const [nombre, setNombre] = useState(editando?.nombre ?? '');
  const [email, setEmail] = useState(editando?.email ?? '');
  const [telefono, setTelefono] = useState(editando?.telefono ?? '');
  const [rol, setRol] = useState(editando?.rol ?? 'solo_lectura');
  // null = los del perfil elegido.
  const [areas, setAreas] = useState<Areas | null>(editando?.areas ?? null);
  const [errores, setErrores] = useState<Errores>({});
  const [error, setError] = useState('');
  const [grabando, setGrabando] = useState(false);
  const [correo, setCorreo] = useState<ComprobacionCorreo | null>(null);
  const [comprobando, setComprobando] = useState(false);
  // La contraseña provisional vive SOLO aquí: ni en el navegador ni en la URL.
  const [creado, setCreado] = useState<{ email: string; contrasena: string; acceso: string } | null>(null);
  const consulta = useRef(0);

  const empresa = empresas.find((e) => e.id === companyId);
  const nombreEmpresa = empresa?.nombre ?? 'esta empresa';
  const esAdmin = esAdministrador(rol);
  const areasElegidas = esAdmin ? null : areas;
  const vacio = !!areasElegidas && todoNinguno(areasElegidas);
  const aMedida = difiereDelPerfil(catalogo, rol, areasElegidas);
  const nombrePerfil = (r: string) => perfilDe(catalogo, r)?.nombre ?? nombreRol(r);

  // En la edición, el nombre y el teléfono los toca quien también podría darle
  // una contraseña (su cuenta no entra en empresas que no administre) o él mismo.
  const datosEditables = !editando || (props.modo === 'editar' && (editando.puedes.nuevaContrasena || props.esYo));
  // Alta con un correo que ya tiene usuario: no se crea otro ni se tocan sus datos.
  const correoExistente = !editando && correo?.existe === true;
  const yaTieneAcceso = !editando && correo?.yaTieneAcceso === true;

  // Comprueba el correo (alta) al dejar de escribir y al cambiar de empresa.
  useEffect(() => {
    if (editando) return;
    const limpio = email.trim();
    setCorreo(null);
    if (!CORREO_VALIDO.test(limpio)) {
      setComprobando(false);
      return;
    }
    const n = ++consulta.current;
    setComprobando(true);
    const t = window.setTimeout(() => {
      apiFetch<ComprobacionCorreo>(rutaUsuarios(companyId, '/comprobar-correo'), { method: 'POST', body: JSON.stringify({ email: limpio }) })
        .then((r) => {
          if (n === consulta.current) setCorreo(r);
        })
        .catch(() => {
          // Si no se puede comprobar, el servidor lo vuelve a mirar al grabar.
        })
        .finally(() => {
          if (n === consulta.current) setComprobando(false);
        });
    }, 450);
    return () => window.clearTimeout(t);
  }, [email, companyId, editando]);

  const cambiarPerfil = (valor: string) => {
    if (aMedida && !window.confirm(PREGUNTA_CAMBIO_PERFIL)) return;
    setRol(valor);
    setAreas(null); // Se vuelve a partir del perfil nuevo.
    setErrores((e) => ({ ...e, rol: undefined, areas: undefined }));
  };

  const enfocar = (campo: Campo) => {
    window.setTimeout(() => document.getElementById(ID_CAMPO[campo])?.focus(), 0);
  };

  /** Lo que se puede revisar sin preguntar al servidor. */
  const revisar = (): Errores => {
    const e: Errores = {};
    if (!editando) {
      const limpio = email.trim();
      if (!limpio) e.email = 'Escribe el correo.';
      else if (!CORREO_VALIDO.test(limpio)) e.email = 'El correo no es válido.';
    }
    if (datosEditables && !correoExistente) {
      const n = nombre.trim();
      const obligatorio = !editando || !!editando.nombre;
      if ((obligatorio || n) && n.length < 2) e.nombre = 'Escribe el nombre y apellidos.';
      else if (n.length > 120) e.nombre = 'El nombre es demasiado largo (120 caracteres como mucho).';
      if (telefono.trim().length > 30) e.telefono = 'El teléfono es demasiado largo.';
    }
    if (vacio) e.areas = 'Marca al menos un permiso o elige otro perfil.';
    return e;
  };

  const grabar = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError('');
    const e = revisar();
    setErrores(e);
    const primero = (Object.keys(ID_CAMPO) as Campo[]).find((c) => e[c]);
    if (primero) {
      enfocar(primero);
      return;
    }
    if (yaTieneAcceso) return;

    const aMedidaEnviar = areasParaEnviar(catalogo, rol, areasElegidas);
    setGrabando(true);
    try {
      if (!editando) {
        const cuerpo: Record<string, unknown> = { email: email.trim(), rol };
        if (!correoExistente) {
          cuerpo.nombre = nombre.trim();
          cuerpo.telefono = telefono.trim() || null;
        }
        if (aMedidaEnviar) cuerpo.areas = aMedidaEnviar;
        const r = await apiFetch<ResultadoAltaUsuario>(rutaUsuarios(companyId), { method: 'POST', body: JSON.stringify(cuerpo) });
        const acceso = `Entra en «${nombreEmpresa}» como ${nombrePerfil(r.usuario.rol)}${r.usuario.personalizado ? ', con permisos a medida' : ''}.`;
        if (r.usuarioNuevo) {
          setCreado({ email: r.usuario.email, contrasena: r.contrasenaProvisional, acceso });
          props.onGrabado(companyId, null);
        } else {
          props.onGrabado(companyId, `${r.usuario.email} ya tenía usuario. ${acceso} Su contraseña no ha cambiado.`);
          onClose();
        }
      } else {
        const cuerpo: Record<string, unknown> = { rol, areas: aMedidaEnviar };
        if (datosEditables) {
          const n = nombre.trim();
          if (n && n !== (editando.nombre ?? '')) cuerpo.nombre = n;
          const t = telefono.trim() || null;
          if (t !== (editando.telefono ?? null)) cuerpo.telefono = t;
        }
        const r = await apiFetch<UsuarioEmpresa & { cambiado: boolean }>(rutaUsuarios(companyId, `/${encodeURIComponent(editando.userId)}`), {
          method: 'PUT',
          body: JSON.stringify(cuerpo),
        });
        const quien = r.nombre || r.email;
        props.onGrabado(
          companyId,
          r.cambiado
            ? `Cambios de ${quien} grabados. Si tiene la sesión abierta, los verá al recargar la página.`
            : `No había nada que cambiar en el acceso de ${quien}.`,
        );
        onClose();
      }
    } catch (err) {
      const campo = campoDelError(err) as Campo | undefined;
      const detalles = err instanceof ApiError ? (err.detalles as { codigo?: string } | undefined) : undefined;
      if (campo && campo in ID_CAMPO) {
        setErrores({ [campo]: errorMessage(err) });
        enfocar(campo);
      } else if (detalles?.codigo === CODIGO_YA_TIENE_ACCESO) {
        setCorreo({ existe: true, yaTieneAcceso: true });
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setGrabando(false);
    }
  };

  if (creado) {
    return (
      <Modal titulo="Usuario creado" onClose={onClose} confirmarAlCerrar={PREGUNTA_COPIADA} ancho="max-w-lg">
        <div className="flex flex-col gap-3">
          <p className="flex items-start gap-2 text-sm text-slate-700">
            <CheckCircle size={18} className="mt-0.5 shrink-0 text-emerald-700" aria-hidden />
            <span>{creado.acceso}</span>
          </p>
          <p className="text-sm text-slate-600">
            Contraseña provisional de <strong className="break-all font-medium text-slate-900">{creado.email}</strong>:
          </p>
          <ContrasenaProvisional contrasena={creado.contrasena} email={creado.email} comoGenerarOtra={OTRA_CONTRASENA} onHecho={onClose} />
        </div>
      </Modal>
    );
  }

  const titulo = editando ? `Editar acceso de ${editando.nombre || editando.email}` : 'Nuevo usuario';
  const describe = (campo: Campo, extra?: string) => [errores[campo] ? `${ID_CAMPO[campo]}-error` : '', extra ?? ''].filter(Boolean).join(' ') || undefined;

  return (
    <Modal titulo={titulo} onClose={onClose} ancho="max-w-2xl">
      <form onSubmit={grabar} noValidate className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-4">
          <legend className="mb-3 text-sm font-semibold text-slate-900">Datos de la persona</legend>

          {editando ? (
            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-sm font-medium text-slate-700">Empresa</dt>
                <dd className="mt-1 text-sm text-slate-900">{nombreEmpresa}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-sm font-medium text-slate-700">Correo (usuario para entrar)</dt>
                <dd className="mt-1 break-all text-sm text-slate-900">{editando.email}</dd>
              </div>
            </dl>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="usuario-empresa" className="text-sm font-medium text-slate-700">
                Empresa
              </label>
              <select
                id="usuario-empresa"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                disabled={grabando}
                className={CLASE_INPUT}
              >
                {empresas.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                    {e.activa ? '' : ' (desactivada)'}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!editando && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="usuario-email" className="text-sm font-medium text-slate-700">
              Correo <span aria-hidden>*</span>
            </label>
              <input
                id="usuario-email"
                type="email"
                inputMode="email"
                required
                autoComplete="off"
                autoFocus
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setErrores((x) => ({ ...x, email: undefined }));
                }}
                disabled={grabando}
                aria-invalid={!!errores.email}
                aria-describedby={describe('email', 'usuario-email-ayuda')}
                className={`${CLASE_INPUT} ${errores.email ? CLASE_INPUT_ERROR : ''}`}
              />
            <ErrorCampo id="usuario-email-error" texto={errores.email} />
            <p id="usuario-email-ayuda" className="text-xs text-slate-500">
              Es el usuario con el que entrará en la aplicación.
            </p>
            {comprobando && <p className="text-xs text-slate-500">Comprobando el correo…</p>}
            <div aria-live="polite">
              {correoExistente && !yaTieneAcceso && (
                <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <Info size={18} className="mt-0.5 shrink-0" aria-hidden />
                  <span>
                    Este correo ya tiene usuario: se le dará acceso a esta empresa. No se cambian su nombre, su teléfono ni su contraseña.
                  </span>
                </p>
              )}
              {yaTieneAcceso && (
                <p role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden />
                  <span>
                    Este correo ya tiene acceso a «{nombreEmpresa}». Para cambiar su rol o sus permisos, usa «Editar acceso» en la lista.
                  </span>
                </p>
              )}
            </div>
          </div>
          )}

          {!correoExistente && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="usuario-nombre" className="text-sm font-medium text-slate-700">
                  Nombre y apellidos {(!editando || editando.nombre) && <span aria-hidden>*</span>}
                </label>
                <input
                  id="usuario-nombre"
                  type="text"
                  autoComplete="off"
                  maxLength={120}
                  value={nombre}
                  onChange={(e) => {
                    setNombre(e.target.value);
                    setErrores((x) => ({ ...x, nombre: undefined }));
                  }}
                  disabled={grabando || !datosEditables}
                  required={!editando}
                  aria-invalid={!!errores.nombre}
                  aria-describedby={describe('nombre', !datosEditables ? 'usuario-datos-ajenos' : undefined)}
                  className={`${CLASE_INPUT} ${errores.nombre ? CLASE_INPUT_ERROR : ''}`}
                />
                <ErrorCampo id="usuario-nombre-error" texto={errores.nombre} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="usuario-telefono" className="text-sm font-medium text-slate-700">
                  Teléfono <span className="font-normal text-slate-500">(opcional)</span>
                </label>
                <input
                  id="usuario-telefono"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  maxLength={30}
                  value={telefono}
                  onChange={(e) => {
                    setTelefono(e.target.value);
                    setErrores((x) => ({ ...x, telefono: undefined }));
                  }}
                  disabled={grabando || !datosEditables}
                  aria-invalid={!!errores.telefono}
                  aria-describedby={describe('telefono', !datosEditables ? 'usuario-datos-ajenos' : undefined)}
                  className={`${CLASE_INPUT} ${errores.telefono ? CLASE_INPUT_ERROR : ''}`}
                />
                <ErrorCampo id="usuario-telefono-error" texto={errores.telefono} />
              </div>
              {!datosEditables && (
                <p id="usuario-datos-ajenos" className="text-xs text-slate-500 sm:col-span-2">
                  También entra en empresas que tú no administras: su nombre y su teléfono solo los cambia el administrador global.
                </p>
              )}
            </div>
          )}
        </fieldset>

        <fieldset className="flex flex-col gap-3 border-t border-slate-200 pt-4">
          <legend className="sr-only">Rol y permisos</legend>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="usuario-rol" className="text-sm font-semibold text-slate-900">
              Rol
            </label>
            <select
              id="usuario-rol"
              value={rol}
              onChange={(e) => cambiarPerfil(e.target.value)}
              disabled={grabando}
              aria-describedby={describe('rol', 'usuario-rol-resumen')}
              className={`${CLASE_INPUT} sm:max-w-xs`}
            >
              {ROLES_EMPRESA.map((r) => (
                <option key={r.valor} value={r.valor}>
                  {r.etiqueta}
                </option>
              ))}
            </select>
            <ResumenDelPerfil catalogo={catalogo} rol={rol} id="usuario-rol-resumen" />
            <ErrorCampo id="usuario-rol-error" texto={errores.rol} />
          </div>

          <div className="flex flex-col gap-2" id="usuario-permisos" tabIndex={-1}>
            <h3 className="text-sm font-semibold text-slate-900">Lo que puede ver y hacer</h3>
            <p className="text-xs text-slate-500">
              El rol marca las casillas. Puedes ajustarlas a mano para esta persona. La configuración de la empresa y los usuarios solo los
              gestiona el rol Administrador.
            </p>
            <EditorPermisos
              catalogo={catalogo}
              rol={rol}
              areas={areas}
              onChange={(a) => {
                setAreas(a);
                setErrores((x) => ({ ...x, areas: undefined }));
              }}
              empresaEspanola={esEmpresaEspanola(empresa?.pais)}
              esAdminGlobal={editando?.esAdminGlobal}
              deshabilitado={grabando}
              onVolverAlPerfil={() => setAreas(null)}
            />
            <ErrorCampo id="usuario-permisos-error" texto={errores.areas} />
          </div>
        </fieldset>

        {!editando && (
          <fieldset className="flex flex-col gap-2 border-t border-slate-200 pt-4">
            <legend className="mb-2 text-sm font-semibold text-slate-900">Contraseña</legend>
            {correoExistente ? (
              <p className="text-sm text-slate-600">Ya tiene su propia contraseña: no se le genera otra.</p>
            ) : (
              <>
                <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  <CheckCircle size={18} weight="fill" className="shrink-0 text-emerald-600" aria-hidden />
                  Generar contraseña provisional
                </p>
                <p className="text-xs text-slate-500">
                  La crea la aplicación al grabar y la verás una sola vez, con el botón «Copiar». Vale 7 días y, la primera vez que entre,
                  tendrá que cambiarla por una suya.
                </p>
              </>
            )}
          </fieldset>
        )}

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden />
            <span>{error}</span>
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={grabando} className={`${BOTON_SECUNDARIO} min-h-[44px]`}>
            Cancelar
          </button>
          <button type="submit" disabled={grabando || yaTieneAcceso || vacio} className={BOTON_PRIMARIO}>
            {grabando ? 'Grabando…' : 'Grabar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
