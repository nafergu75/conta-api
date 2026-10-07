'use client';

/**
 * Estado de Carmen en el panel: ventana abierta o cerrada, conversación en
 * curso, sugerencias de la pantalla actual y estado de la IA. Se monta una vez
 * en app/dashboard/layout.tsx, así que la conversación sigue al navegar (un
 * enlace de una respuesta lleva a la pantalla con la ventana abierta). La
 * ventana y la conversación también se guardan en sessionStorage por empresa,
 * para que sobrevivan a una recarga.
 *
 * El id de la conversación lo crea siempre el servidor: la primera pregunta va
 * sin sessionId y las siguientes con el que devolvió la respuesta.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ApiError, errorMessage } from '@/lib/api';
import { EVENTO_SESION, getCompanyId, getToken, getUser } from '@/lib/auth';
import {
  EVENTO_AJUSTES_CARMEN,
  MAX_PREGUNTA,
  MAX_TEXTO_BOTON,
  catalogoCarmen,
  estadoCarmen,
  claveVentana,
  guardarVentana,
  leerConversacion,
  leerVentana,
  olvidarOtrasVentanas,
  preguntarACarmen,
  valorarRespuesta,
  type Accion,
  type Boton,
  type CatalogoCarmen,
  type EstadoCarmen,
  type MensajeGuardado,
  type PeticionCarmen,
  type RespuestaCarmen,
  type RespuestaVista,
} from '@/lib/carmen';

export const RUTA_CARMEN = '/dashboard/carmen';
const TOKEN_DEMO = 'demo-local-sin-backend';

/** Lo que se manda a Carmen: el texto que ve el usuario y la pregunta o el botón. */
export interface Envio {
  visible: string;
  message?: string;
  accion?: Accion;
}

export interface MensajeUsuario {
  id: string;
  rol: 'usuario';
  texto: string;
}

export interface MensajeCarmen {
  id: string;
  rol: 'carmen';
  r: RespuestaVista;
  valoracion: 0 | 1 | null;
  /** Calculada con un permiso que el usuario ya no tiene: solo se ve el aviso. */
  oculto: boolean;
  /** Pregunta escrita que dio pie a esta respuesta (la necesita «Preguntar a la IA»). */
  pregunta?: string;
}

export interface MensajeError {
  id: string;
  rol: 'error';
  texto: string;
  /** Si se puede reintentar, lo que se mandó. */
  reintento?: Envio;
}

export type MensajeVista = MensajeUsuario | MensajeCarmen | MensajeError;

interface ContextoCarmen {
  /** Ya se ha leído la sesión del navegador (antes no se sabe si hay Carmen). */
  iniciado: boolean;
  /** Hay sesión real (en la demo sin backend Carmen no está). */
  disponible: boolean;
  /** Estamos en la página de Carmen (allí no hay botón flotante ni ventana). */
  enPagina: boolean;
  pagina: string;
  abierto: boolean;
  abrir: () => void;
  /** Cierra la ventana y devuelve el foco al botón flotante. */
  cerrar: () => void;
  sessionId?: string;
  mensajes: MensajeVista[];
  enviando: boolean;
  cargandoConversacion: boolean;
  errorConversacion: string | null;
  /**
   * Lo que el lector de pantalla tiene que leer de la última respuesta (solo el texto).
   * Cambia solo con las respuestas nuevas, no al cargar una conversación guardada.
   */
  anuncio: { id: string; texto: string } | null;
  enviar: (envio: Envio) => void;
  enviarTexto: (texto: string) => void;
  pulsarBoton: (b: Boton, origen?: MensajeCarmen) => void;
  reintentar: (m: MensajeError) => void;
  noEraEsto: (m: MensajeCarmen) => void;
  actualizarRespuesta: (m: MensajeCarmen) => void;
  valorar: (m: MensajeCarmen, util: boolean) => void;
  nuevaConversacion: () => void;
  abrirConversacion: (id: string) => Promise<void>;
  conversacionBorrada: (id: string) => void;
  /** Cambia cada vez que la lista de conversaciones puede haber cambiado. */
  versionLista: number;
  estado: EstadoCarmen | null;
  catalogo: CatalogoCarmen | null;
  errorCatalogo: boolean;
  entradaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  botonRef: React.MutableRefObject<HTMLButtonElement | null>;
}

const Contexto = createContext<ContextoCarmen | null>(null);

export function useCarmen(): ContextoCarmen {
  const c = useContext(Contexto);
  if (!c) throw new Error('useCarmen fuera de <CarmenProvider>');
  return c;
}

let contadorLocal = 0;
const idLocal = () => `local-${Date.now()}-${++contadorLocal}`;

/** Mensajes guardados (GET /:sessionId/messages) a mensajes de la ventana. */
function desdeGuardados(guardados: MensajeGuardado[]): MensajeVista[] {
  let pregunta: string | undefined;
  return guardados.map((m): MensajeVista => {
    if (m.role === 'user') {
      pregunta = m.content;
      return { id: m.id, rol: 'usuario', texto: m.content };
    }
    return {
      id: m.id,
      rol: 'carmen',
      oculto: m.oculto,
      valoracion: m.valoracion === 1 ? 1 : m.valoracion === 0 ? 0 : null,
      pregunta,
      r: {
        mensajeId: m.id,
        origen: m.origen ?? 'sistema',
        ...(m.intencion ? { intencion: m.intencion } : {}),
        texto: m.content,
        ...(m.datos ?? {}),
        ...(m.calculadoEn ? { calculadoEn: m.calculadoEn } : {}),
      },
    };
  });
}

/** Error de una pregunta, en palabras del usuario, y si tiene sentido reintentarla. */
function errorDeEnvio(e: unknown, envio: Envio): Omit<MensajeError, 'id' | 'rol'> {
  if (!(e instanceof ApiError)) return { texto: 'Carmen no ha podido responder ahora mismo.', reintento: envio };
  if (e.status === 0)
    return { texto: 'No se puede conectar con el servidor. Comprueba la conexión y vuelve a intentarlo.', reintento: envio };
  if (e.status === 401) return { texto: e.message };
  if (e.status === 403) return { texto: 'No tienes acceso a Carmen en esta empresa.' };
  if (e.status === 429) {
    // El tope diario de mensajes lo explica el servidor; el freno por minuto se puede reintentar.
    return /carmen/i.test(e.message)
      ? { texto: e.message }
      : { texto: 'Vas muy deprisa. Espera un minuto y vuelve a intentarlo.', reintento: envio };
  }
  if (e.status === 400 || e.status === 413) return { texto: e.message };
  if (e.status >= 500) return { texto: 'Carmen no ha podido responder ahora mismo.', reintento: envio };
  return { texto: errorMessage(e), reintento: envio };
}

export function CarmenProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/dashboard';
  const enPagina = pathname === RUTA_CARMEN || pathname.startsWith(`${RUTA_CARMEN}/`);

  const [iniciado, setIniciado] = useState(false);
  const [disponible, setDisponible] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [mensajes, setMensajes] = useState<MensajeVista[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [cargandoConversacion, setCargandoConversacion] = useState(false);
  const [errorConversacion, setErrorConversacion] = useState<string | null>(null);
  const [anuncio, setAnuncio] = useState<{ id: string; texto: string } | null>(null);
  const [versionLista, setVersionLista] = useState(0);
  const [estado, setEstado] = useState<EstadoCarmen | null>(null);
  const [catalogo, setCatalogo] = useState<CatalogoCarmen | null>(null);
  const [errorCatalogo, setErrorCatalogo] = useState(false);
  /** Conversación guardada en sessionStorage que falta por cargar. */
  const [pendiente, setPendiente] = useState<string | undefined>(undefined);
  /** Sube cuando hay que volver a pedir las sugerencias (han cambiado los permisos). */
  const [versionCatalogo, setVersionCatalogo] = useState(0);

  const sesionRef = useRef<string | undefined>(undefined);
  const paginaRef = useRef(pathname);
  const enPaginaRef = useRef(enPagina);
  const enviandoRef = useRef(false);
  const catalogos = useRef(new Map<string, CatalogoCarmen>());
  const entradaRef = useRef<HTMLTextAreaElement | null>(null);
  const botonRef = useRef<HTMLButtonElement | null>(null);

  const abiertoRef = useRef(false);
  paginaRef.current = pathname;
  enPaginaRef.current = enPagina;
  abiertoRef.current = abierto;

  const fijarSesion = useCallback((id: string | undefined) => {
    sesionRef.current = id;
    setSessionId(id);
  }, []);

  const reiniciar = useCallback(() => {
    fijarSesion(undefined);
    setMensajes([]);
    setPendiente(undefined);
    setErrorConversacion(null);
    setEstado(null);
    setCatalogo(null);
    catalogos.current.clear();
  }, [fijarSesion]);

  // Sesión, empresa y ventana guardada (solo en el navegador).
  useEffect(() => {
    setIniciado(true);
    const token = getToken();
    if (!token || token === TOKEN_DEMO) return;
    const empresa = getCompanyId();
    const clave = claveVentana(getUser()?.email ?? '', empresa);
    olvidarOtrasVentanas(clave);
    const v = leerVentana(clave);
    setCompanyId(empresa);
    setDisponible(true);
    setAbierto(v.abierto && !enPaginaRef.current);
    if (v.sessionId) {
      sesionRef.current = v.sessionId;
      setSessionId(v.sessionId);
      setPendiente(v.sessionId);
    }
  }, []);

  // Si cambian la empresa o los permisos sin recargar, se empieza de cero en la nueva.
  useEffect(() => {
    if (!disponible) return;
    const alCambiar = () => {
      const empresa = getCompanyId();
      catalogos.current.clear();
      if (empresa !== companyId) {
        reiniciar();
        olvidarOtrasVentanas(claveVentana(getUser()?.email ?? '', empresa));
        setCompanyId(empresa);
      }
      // Los permisos pueden haber cambiado: las sugerencias se vuelven a pedir.
      setVersionCatalogo((v) => v + 1);
    };
    window.addEventListener(EVENTO_SESION, alCambiar);
    return () => window.removeEventListener(EVENTO_SESION, alCambiar);
  }, [disponible, companyId, reiniciar]);

  // Se guarda la ventana (abierta o no) y la conversación de este usuario en esta empresa.
  useEffect(() => {
    if (disponible && companyId)
      guardarVentana(claveVentana(getUser()?.email ?? '', companyId), { abierto, ...(sessionId ? { sessionId } : {}) });
  }, [disponible, companyId, abierto, sessionId]);

  // En la página de Carmen no hay ventana.
  useEffect(() => {
    if (enPagina) setAbierto(false);
  }, [enPagina]);

  const visible = disponible && (abierto || enPagina);

  const cargarEstado = useCallback(() => {
    estadoCarmen()
      .then(setEstado)
      .catch(() => {
        // Sin estado no se enseña el pie de la IA; lo demás funciona igual.
      });
  }, []);

  // Estado de la IA: al abrir y cuando un administrador cambia los ajustes.
  useEffect(() => {
    if (visible && !estado) cargarEstado();
  }, [visible, estado, cargarEstado]);
  useEffect(() => {
    window.addEventListener(EVENTO_AJUSTES_CARMEN, cargarEstado);
    return () => window.removeEventListener(EVENTO_AJUSTES_CARMEN, cargarEstado);
  }, [cargarEstado]);

  // Sugerencias de la pantalla actual (una petición por pantalla).
  useEffect(() => {
    if (!visible) return;
    const guardado = catalogos.current.get(pathname);
    if (guardado) {
      setCatalogo(guardado);
      setErrorCatalogo(false);
      return;
    }
    let vigente = true;
    setErrorCatalogo(false);
    catalogoCarmen(pathname)
      .then((c) => {
        catalogos.current.set(pathname, c);
        if (vigente) setCatalogo(c);
      })
      .catch(() => {
        if (!vigente) return;
        setCatalogo(null);
        setErrorCatalogo(true);
      });
    return () => {
      vigente = false;
    };
  }, [visible, pathname, versionCatalogo]);

  const abrirConversacion = useCallback(
    async (id: string, silencioso = false) => {
      setCargandoConversacion(true);
      setErrorConversacion(null);
      // Una conversación guardada no se anuncia: el lector solo lee las respuestas nuevas.
      setAnuncio(null);
      try {
        const c = await leerConversacion(id);
        fijarSesion(c.sessionId);
        setMensajes(desdeGuardados(c.mensajes));
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          // Borrada en otra pestaña o caducada: se empieza otra.
          fijarSesion(undefined);
          setMensajes([]);
          setVersionLista((v) => v + 1);
          if (!silencioso) setErrorConversacion('Esa conversación ya no existe.');
        } else if (!silencioso) {
          setErrorConversacion(errorMessage(e));
        }
      } finally {
        setCargandoConversacion(false);
      }
    },
    [fijarSesion],
  );

  // La conversación guardada se carga la primera vez que se ve la ventana o la página.
  useEffect(() => {
    if (!visible || !pendiente) return;
    setPendiente(undefined);
    if (sesionRef.current === pendiente) void abrirConversacion(pendiente, true);
  }, [visible, pendiente, abrirConversacion]);

  const enviar = useCallback(
    async (envio: Envio) => {
      if (!disponible || enviandoRef.current) return;
      enviandoRef.current = true;
      setEnviando(true);
      setErrorConversacion(null);
      setMensajes((ms) => [...ms, { id: idLocal(), rol: 'usuario', texto: envio.visible }]);
      const textoBoton = envio.accion ? envio.visible.trim().slice(0, MAX_TEXTO_BOTON) : '';
      const cuerpo: PeticionCarmen = {
        ...(envio.message ? { message: envio.message } : {}),
        ...(envio.accion ? { accion: envio.accion } : {}),
        // Con un botón, el historial guarda el texto que vio el usuario («¿Y el trimestre pasado?»).
        ...(textoBoton ? { textoBoton } : {}),
        currentPage: paginaRef.current.slice(0, 200),
      };
      try {
        const sid = sesionRef.current;
        let r: RespuestaCarmen;
        try {
          r = await preguntarACarmen(sid ? { ...cuerpo, sessionId: sid } : cuerpo);
        } catch (e) {
          if (!(sid && e instanceof ApiError && e.status === 404)) throw e;
          // La conversación ya no existe (borrada o caducada): la pregunta abre otra.
          setMensajes((ms) => ms.slice(-1));
          r = await preguntarACarmen(cuerpo);
        }
        fijarSesion(r.sessionId);
        setVersionLista((v) => v + 1);
        const { sessionId: _sesion, ...vista } = r;
        setMensajes((ms) => [
          ...ms,
          { id: r.mensajeId, rol: 'carmen', r: vista, valoracion: null, oculto: false, pregunta: envio.message },
        ]);
        setAnuncio({ id: r.mensajeId, texto: `Carmen: ${r.texto}` });
        // Una respuesta de IA gasta tope; una aclaración puede decir que se ha agotado.
        if (r.origen === 'ia' || r.origen === 'aclaracion') cargarEstado();
      } catch (e) {
        const error = errorDeEnvio(e, envio);
        setMensajes((ms) => [...ms, { id: idLocal(), rol: 'error', ...error }]);
        setAnuncio({ id: idLocal(), texto: error.texto });
      } finally {
        enviandoRef.current = false;
        setEnviando(false);
      }
    },
    [disponible, fijarSesion, cargarEstado],
  );

  const enviarTexto = useCallback(
    (texto: string) => {
      const t = texto.trim().slice(0, MAX_PREGUNTA);
      if (t) void enviar({ visible: t, message: t });
    },
    [enviar],
  );

  const pulsarBoton = useCallback(
    (b: Boton, origen?: MensajeCarmen) => {
      if (b.accion.tipo === 'ia') {
        // La IA necesita la pregunta escrita que no supe responder.
        if (origen?.pregunta) void enviar({ visible: b.texto, accion: b.accion, message: origen.pregunta });
        return;
      }
      void enviar({ visible: b.texto, accion: b.accion });
    },
    [enviar],
  );

  const reintentar = useCallback(
    (m: MensajeError) => {
      if (!m.reintento || enviandoRef.current) return;
      const envio = m.reintento;
      setMensajes((ms) => {
        const i = ms.findIndex((x) => x.id === m.id);
        if (i < 0) return ms;
        // Fuera el error y la pregunta que falló: se vuelven a poner al reenviar.
        const desde = i > 0 && ms[i - 1].rol === 'usuario' ? i - 1 : i;
        return [...ms.slice(0, desde), ...ms.slice(i + 1)];
      });
      void enviar(envio);
    },
    [enviar],
  );

  const valorar = useCallback((m: MensajeCarmen, util: boolean) => {
    const nuevo: 0 | 1 = util ? 1 : 0;
    const previo = m.valoracion;
    if (previo === nuevo) return;
    const poner = (v: 0 | 1 | null) =>
      setMensajes((ms) => ms.map((x) => (x.id === m.id && x.rol === 'carmen' ? { ...x, valoracion: v } : x)));
    poner(nuevo);
    valorarRespuesta(m.r.mensajeId, util).catch(() => poner(previo));
  }, []);

  const noEraEsto = useCallback(
    (m: MensajeCarmen) => {
      valorar(m, false);
      // Se vuelve a mirar la pregunta escrita, sin la consulta que no era: fichas parecidas,
      // otras consultas y, si es una duda general, la IA. Sin pregunta escrita, el catálogo.
      void enviar({
        visible: 'No era esto',
        accion: { tipo: 'noEraEsto', ...(m.r.intencion ? { intencion: m.r.intencion } : {}) },
        ...(m.pregunta ? { message: m.pregunta } : {}),
      });
    },
    [valorar, enviar],
  );

  const actualizarRespuesta = useCallback(
    (m: MensajeCarmen) => {
      if (m.r.actualizar) void enviar({ visible: 'Actualiza estos datos', accion: m.r.actualizar });
    },
    [enviar],
  );

  const nuevaConversacion = useCallback(() => {
    if (enviandoRef.current) return;
    fijarSesion(undefined);
    setMensajes([]);
    setErrorConversacion(null);
    requestAnimationFrame(() => entradaRef.current?.focus());
  }, [fijarSesion]);

  const conversacionBorrada = useCallback(
    (id: string) => {
      setVersionLista((v) => v + 1);
      if (sesionRef.current === id) {
        fijarSesion(undefined);
        setMensajes([]);
      }
    },
    [fijarSesion],
  );

  const abrir = useCallback(() => {
    if (!enPaginaRef.current) setAbierto(true);
  }, []);

  const cerrar = useCallback(() => {
    setAbierto(false);
    setAnuncio(null);
    requestAnimationFrame(() => botonRef.current?.focus());
  }, []);

  // Ctrl+/ (o Cmd+/) abre y cierra la ventana; en la página de Carmen, va a la pregunta.
  useEffect(() => {
    if (!disponible) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key !== '/') return;
      e.preventDefault();
      if (enPaginaRef.current) {
        entradaRef.current?.focus();
        return;
      }
      if (abiertoRef.current) {
        setAbierto(false);
        requestAnimationFrame(() => botonRef.current?.focus());
      } else {
        setAbierto(true);
      }
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [disponible]);

  const valor = useMemo<ContextoCarmen>(
    () => ({
      iniciado,
      disponible,
      enPagina,
      pagina: pathname,
      abierto: abierto && !enPagina,
      abrir,
      cerrar,
      sessionId,
      mensajes,
      enviando,
      cargandoConversacion,
      errorConversacion,
      anuncio,
      enviar: (e) => void enviar(e),
      enviarTexto,
      pulsarBoton,
      reintentar,
      noEraEsto,
      actualizarRespuesta,
      valorar,
      nuevaConversacion,
      abrirConversacion: (id) => abrirConversacion(id),
      conversacionBorrada,
      versionLista,
      estado,
      catalogo,
      errorCatalogo,
      entradaRef,
      botonRef,
    }),
    [
      iniciado,
      disponible,
      enPagina,
      pathname,
      abierto,
      abrir,
      cerrar,
      sessionId,
      mensajes,
      enviando,
      cargandoConversacion,
      errorConversacion,
      anuncio,
      enviar,
      enviarTexto,
      pulsarBoton,
      reintentar,
      noEraEsto,
      actualizarRespuesta,
      valorar,
      nuevaConversacion,
      abrirConversacion,
      conversacionBorrada,
      versionLista,
      estado,
      catalogo,
      errorCatalogo,
    ],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}
