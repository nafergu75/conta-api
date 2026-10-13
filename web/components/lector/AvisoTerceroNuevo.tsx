'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLineLeft, ArrowLineRight, CheckCircle, DotsSixVertical, MagnifyingGlass, UserPlus, WarningCircle, X } from '@phosphor-icons/react';
import { ApiError, apiFetch, campoDelError, companyPath, errorMessage } from '@/lib/api';
import { nombreNumeroFiscal, numeroFiscalEnFrase, origenDePais, PAISES, pareceNifIvaUe, type OrigenTercero } from '@/lib/fiscal';
import { paisDelPrefijo } from '@/lib/compras';
import { useAvisoPlanAnterior } from '@/components/contabilidad/AvisoPlanAnterior';

/**
 * Proveedor o cliente de una factura leida que no esta dado de alta (lector de
 * gastos y de ventas).
 *
 * Decision del usuario (12-10-2026): la factura no se registra hasta dar de
 * alta el tercero o elegir uno que ya exista. El servidor tambien lo exige
 * (400 TERCERO_NO_DADO_DE_ALTA al confirmar).
 *
 * - Aviso ambar con «Dar de alta este proveedor» (dialogo con la ficha rellena
 *   con lo leido, todo editable; POST /proveedores o /clientes, que le ponen su
 *   subcuenta 400/410 o 430) y «Es uno que ya tengo» (buscador por nombre o
 *   NIF, por si el NIF se leyo mal).
 * - Si cambia el NIF (en el formulario o en el dialogo), se vuelve a mirar si
 *   ya hay uno con ese NIF y, si lo hay, se ofrece usarlo.
 * - Sin permiso de alta (compras:write o ventas:write), el aviso lo dice y
 *   solo queda «Es uno que ya tengo».
 * - Si es el primer cliente o proveedor de una empresa española que aun no ha
 *   traido el plan de cuentas de la gestoria, el alta da 409
 *   PLAN_ANTERIOR_PENDIENTE y sale el mismo aviso que en Clientes y
 *   Proveedores (AvisoPlanAnterior), encima de la ficha.
 * - Una vez enlazado, el aviso pasa a verde («Dado de alta»).
 * - El numero fiscal lleva el nombre que tiene en el pais del tercero (NIF,
 *   NIF-IVA (VAT), RNC, EIN...) y cambia si se cambia el pais. Si se ha dicho
 *   que es de fuera de España y no se sabe el pais, la ficha pide elegirlo.
 * - En pantallas anchas (desde 1024 px) las dos ventanas son flotantes: se
 *   mueven arrastrando su barra de titulo y no tapan la pagina con un fondo
 *   oscuro, para poder comparar con la factura y con lo leido. En el movil
 *   siguen siendo un modal a pantalla completa.
 */

export type TipoTercero = 'proveedor' | 'cliente';

/** El tercero con que queda enlazada la factura: dado de alta ahora o elegido de los que ya habia. */
export interface TerceroEnlazado {
  id: string;
  nombre: string;
  nif: string;
  pais: string;
  como: 'alta' | 'elegido';
}

/** Campos de la direccion en la ficha del alta. */
export type CampoDireccion = 'direccion' | 'cp' | 'municipio' | 'provincia';

/** Lo leido (y corregido) del tercero: rellena la ficha del alta. */
export interface DatosTercero {
  nombreFiscal: string;
  nifCif: string;
  pais?: string;
  direccion?: string;
  cp?: string;
  municipio?: string;
  provincia?: string;
  email?: string;
  telefono?: string;
  /** Campos de la direccion leidos con poca seguridad: salen en ambar en la ficha hasta que se cambian. */
  dudosos?: CampoDireccion[];
  /** De donde se ha dicho que es (o se ha deducido). De la UE o de fuera y sin pais: la ficha pide elegirlo. */
  origen?: OrigenTercero | null;
}

/** Direccion leida en la factura (direccionProveedor en gastos, direccionCliente en ventas). */
type DireccionLeida = { calle: string | null; cp: string | null; municipio: string | null; provincia: string | null; revisar: boolean };

/**
 * Los campos de la direccion leida con poca seguridad (`revisar`) que hay que
 * marcar en la ficha del alta. Con `actual` (lo que hay ahora en el formulario
 * de la factura), solo los que siguen con el valor leido: si ya se ha
 * corregido, no se marca.
 */
export function camposDudosos(d: DireccionLeida | null | undefined, actual?: Partial<Record<CampoDireccion, string>>): CampoDireccion[] {
  if (!d?.revisar) return [];
  const leido: Record<CampoDireccion, string | null> = { direccion: d.calle, cp: d.cp, municipio: d.municipio, provincia: d.provincia };
  return (Object.keys(leido) as CampoDireccion[]).filter((c) => {
    const v = (leido[c] ?? '').trim();
    return !!v && (actual === undefined || (actual[c] ?? '').trim() === v);
  });
}

const TEXTOS: Record<TipoTercero, { este: string; el: string; plural: string; ruta: string; idRepetido: 'proveedorId' | 'clienteId' }> = {
  proveedor: { este: 'Este proveedor', el: 'el proveedor', plural: 'proveedores', ruta: '/proveedores', idRepetido: 'proveedorId' },
  cliente: { este: 'Este cliente', el: 'el cliente', plural: 'clientes', ruta: '/clientes', idRepetido: 'clienteId' },
};

/** Ficha que devuelven el alta, /:id y /por-nif/:nif. */
interface Ficha {
  id: string;
  nombreFiscal: string;
  nifCif: string;
  pais?: string;
}

/** Fila de /proveedores/buscar y /clientes/buscar. */
interface Encontrado {
  id: string;
  nombre: string;
  nif: string;
  pais?: string;
  activo?: boolean;
}

const deFicha = (f: Ficha, como: TerceroEnlazado['como']): TerceroEnlazado => ({ id: f.id, nombre: f.nombreFiscal, nif: f.nifCif, pais: f.pais || 'ES', como });

/** «Nombre (NIF)», o lo que haya. */
export function quienEs(nombre: string | null | undefined, nif: string | null | undefined): string {
  const n = (nombre ?? '').trim();
  const i = (nif ?? '').trim();
  return n && i ? `${n} (${i})` : n || i;
}

const sinSignos = (nif: string) => nif.toUpperCase().replace(/[\s.\-]/g, '');

/**
 * ¿Hay ya un tercero con este NIF? Se mira medio segundo despues de dejar de
 * escribir. No se mira el NIF de `yaMirado` (el de la lectura: lo miro el servidor).
 */
export function useTerceroPorNif(tipo: TipoTercero, nif: string, yaMirado?: string): Ficha | null {
  const [encontrado, setEncontrado] = useState<Ficha | null>(null);
  useEffect(() => {
    const limpio = sinSignos(nif);
    setEncontrado(null);
    if (limpio.length < 5 || (yaMirado !== undefined && limpio === sinSignos(yaMirado))) return;
    let vigente = true;
    const t = setTimeout(() => {
      apiFetch<Ficha>(companyPath(`${TEXTOS[tipo].ruta}/por-nif/${encodeURIComponent(limpio)}`))
        .then((f) => {
          if (vigente && f?.id) setEncontrado(f);
        })
        // 404: no hay ninguno. Cualquier otro fallo: no se ofrece nada y el alta lo dira (409).
        .catch(() => undefined);
    }, 500);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [tipo, nif, yaMirado]);
  return encontrado;
}

interface Props {
  tipo: TipoTercero;
  /** Lo leido y corregido. */
  datos: DatosTercero;
  /** NIF que ya miro el servidor al leer (no hace falta volver a mirarlo). */
  nifLeido?: string;
  /** Nombre leido en la factura: con nifLeido, la linea «En la factura» de las ventanas, para comparar mientras se edita. */
  nombreLeido?: string;
  /** El tercero ya enlazado en esta lectura (aviso en verde), o null. */
  enlazado: TerceroEnlazado | null;
  /** Permiso de alta: proveedores con compras:write, clientes con ventas:write. */
  puedeDarDeAlta: boolean;
  onEnlazar: (t: TerceroEnlazado) => void;
  /** Ventas: deshacer el enlace y volver a elegir (en gastos lo hace «Cambiar» del formulario). */
  onCambiar?: () => void;
  /** id del aviso, para el aria-describedby del boton de registrar. */
  id?: string;
  /** El servidor ha dicho que no hay permiso de alta (403): la pagina ajusta sus textos. */
  onSinPermiso?: () => void;
}

export default function AvisoTerceroNuevo({ tipo, datos, nifLeido, nombreLeido, enlazado, puedeDarDeAlta, onEnlazar, onCambiar, id, onSinPermiso }: Props) {
  const t = TEXTOS[tipo];
  const [dialogo, setDialogo] = useState<'alta' | 'buscar' | null>(null);
  // El servidor dijo que no hay permiso (la sesion puede ser de antes de un cambio de permisos).
  const [sinPermiso, setSinPermiso] = useState(false);
  const yaExiste = useTerceroPorNif(tipo, enlazado ? '' : datos.nifCif, nifLeido);
  const verdeRef = useRef<HTMLDivElement>(null);
  // Tras dar de alta o elegir aqui, el foco pasa al aviso verde (el boton que lo abrio ya no esta).
  const recienRef = useRef(false);
  const permiso = puedeDarDeAlta && !sinPermiso;
  const enlazar = (e: TerceroEnlazado) => {
    recienRef.current = true;
    setDialogo(null);
    onEnlazar(e);
  };

  useEffect(() => {
    if (enlazado && recienRef.current) {
      recienRef.current = false;
      verdeRef.current?.focus({ preventScroll: true });
    }
  }, [enlazado]);

  if (enlazado) {
    return (
      <div ref={verdeRef} tabIndex={-1} id={id} role="status" className="flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 focus:outline-none sm:flex-row sm:items-start sm:justify-between">
        <p className="flex min-w-0 items-start gap-2">
          <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">
            {enlazado.como === 'alta' ? (
              <>
                <strong>Dado de alta:</strong> {quienEs(enlazado.nombre, enlazado.nif)}. La factura queda a su nombre.
              </>
            ) : (
              <>
                <strong>Enlazado</strong> con {quienEs(enlazado.nombre, enlazado.nif)}, que ya tenías dado de alta.
              </>
            )}
          </span>
        </p>
        {onCambiar && (
          <button type="button" onClick={onCambiar} className="shrink-0 self-start font-semibold text-emerald-800 underline hover:no-underline">
            Cambiar
          </button>
        )}
      </div>
    );
  }

  const quien = quienEs(datos.nombreFiscal, datos.nifCif);
  const usarExistente = (f: Ficha) => enlazar(deFicha(f, 'elegido'));
  // Lo que se leyo en la factura, a la vista dentro de la ventana aunque se cambie en la ficha.
  const leidoEnFactura = quienEs(nombreLeido, nifLeido);
  const referencia = leidoEnFactura ? (
    <>
      En la factura: <strong className="font-semibold text-slate-900">{leidoEnFactura}</strong>
    </>
  ) : undefined;

  return (
    <div id={id} className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      <div className="flex items-start gap-2">
        <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 space-y-1 break-words">
          {yaExiste ? (
            <p>
              Ya tienes dado de alta un {tipo} con este {nombreNumeroFiscal(yaExiste.pais ?? datos.pais)}: <strong>{quienEs(yaExiste.nombreFiscal, yaExiste.nifCif)}</strong>. Úsalo para
              registrar la factura.
            </p>
          ) : quien ? (
            <p>
              {t.este} no está dado de alta: <strong>{quien}</strong>.{' '}
              {permiso ? 'Dalo de alta para poder registrar la factura.' : 'Hasta que esté dado de alta no se puede registrar la factura.'}
            </p>
          ) : (
            <p>Antes de registrar la factura, da de alta {t.el} o elige uno que ya tengas.</p>
          )}
          {!permiso && !yaExiste && (
            <p>
              No tienes permiso para dar de alta {t.plural}: pide a un administrador que lo dé de alta. Si ya lo tienes (por ejemplo, con el NIF bien escrito), elígelo con «Es
              uno que ya tengo».
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {yaExiste ? (
          <button
            type="button"
            onClick={() => usarExistente(yaExiste)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2"
          >
            Usar este {tipo}
          </button>
        ) : (
          permiso && (
            <button
              type="button"
              onClick={() => setDialogo('alta')}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2"
            >
              <UserPlus size={18} aria-hidden="true" /> Dar de alta {tipo === 'proveedor' ? 'este proveedor' : 'este cliente'}
            </button>
          )
        )}
        <button
          type="button"
          onClick={() => setDialogo('buscar')}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-white px-4 py-2 font-semibold text-amber-800 transition-colors hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600"
        >
          <MagnifyingGlass size={18} aria-hidden="true" /> Es uno que ya tengo
        </button>
      </div>

      {dialogo === 'alta' && (
        <DialogoAlta
          tipo={tipo}
          datos={datos}
          referencia={referencia}
          onCerrar={() => setDialogo(null)}
          onSinPermiso={() => {
            setSinPermiso(true);
            onSinPermiso?.();
          }}
          onHecho={enlazar}
        />
      )}
      {dialogo === 'buscar' && (
        <DialogoBuscar
          tipo={tipo}
          inicial={datos.nombreFiscal}
          referencia={referencia}
          onCerrar={() => setDialogo(null)}
          onElegir={enlazar}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialogo comun. Desde 1024 px, una ventana flotante que se mueve arrastrando
// su barra de titulo y deja ver, desplazar y usar la pagina de detras (la
// factura y lo leido). En el movil, modal a pantalla completa, con el foco
// dentro. En los dos: Escape cierra y el foco vuelve a donde estaba.
// ---------------------------------------------------------------------------

/** Desde este ancho (lg de Tailwind), ventana movible en vez de modal. */
const PANTALLA_ANCHA = '(min-width: 1024px)';
/** Hueco que queda siempre entre la ventana y el borde de la pantalla. */
const MARGEN = 16;
/** Altura a la que se abre: justo debajo de la cabecera fija de la pagina (64 px). */
const ARRIBA = 80;

function usePantallaAncha(): boolean {
  const [ancha, setAncha] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(PANTALLA_ANCHA).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(PANTALLA_ANCHA);
    if (!mq) return;
    const alCambiar = () => setAncha(mq.matches);
    alCambiar();
    mq.addEventListener('change', alCambiar);
    return () => mq.removeEventListener('change', alCambiar);
  }, []);
  return ancha;
}

type Punto = { x: number; y: number };

/** La posicion mas cercana a `p` con la ventana entera dentro de la pantalla. */
function dentroDePantalla(p: Punto, caja: HTMLElement): Punto {
  const { width, height } = caja.getBoundingClientRect();
  const maxX = Math.max(MARGEN, window.innerWidth - width - MARGEN);
  const maxY = Math.max(MARGEN, window.innerHeight - height - MARGEN);
  return { x: Math.round(Math.min(Math.max(p.x, MARGEN), maxX)), y: Math.round(Math.min(Math.max(p.y, MARGEN), maxY)) };
}

const botonBarra = 'shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900';

function Dialogo({
  titulo,
  referencia,
  onCerrar,
  children,
  ancho = 'max-w-lg',
}: {
  titulo: string;
  /** Linea pequeña bajo el titulo (lo leido en la factura), siempre a la vista. */
  referencia?: React.ReactNode;
  onCerrar: () => void;
  children: React.ReactNode;
  ancho?: string;
}) {
  const tituloId = useId();
  const cajaRef = useRef<HTMLDivElement>(null);
  const antesRef = useRef<Element | null>(null);
  const onCerrarRef = useRef(onCerrar);
  onCerrarRef.current = onCerrar;
  const ventana = usePantallaAncha();
  const ventanaRef = useRef(ventana);
  ventanaRef.current = ventana;
  // Donde esta la ventana: null es donde se abre (arriba, a la derecha o a la izquierda segun `lado`);
  // con un punto, donde la ha dejado la persona. Se monta al abrirla: cada vez vuelve a su sitio.
  const [pos, setPos] = useState<Punto | null>(null);
  const [lado, setLado] = useState<'derecha' | 'izquierda'>('derecha');
  const arrastre = useRef<{ id: number; dx: number; dy: number } | null>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const movida = pos !== null;

  useEffect(() => {
    antesRef.current = document.activeElement;
    // El primer campo (o el primer boton que no sea de la barra) recibe el foco.
    const primero = cajaRef.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-barra])');
    primero?.focus({ preventScroll: true });
    const alEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Cierra aunque el foco se haya perdido (un boton que se desactiva al guardar) o este en la pagina.
      // En la ventana flotante la pagina de detras se sigue usando: si se esta escribiendo en uno de
      // sus campos, Escape es de ese campo y no cierra la ventana.
      const activo = document.activeElement;
      const campoDeLaPagina =
        activo instanceof HTMLElement && !cajaRef.current?.contains(activo) && (activo.matches('input, select, textarea') || activo.isContentEditable);
      if (ventanaRef.current && campoDeLaPagina) return;
      onCerrarRef.current();
    };
    document.addEventListener('keydown', alEscape);
    return () => {
      document.removeEventListener('keydown', alEscape);
      const antes = antesRef.current;
      if (antes instanceof HTMLElement && document.contains(antes)) antes.focus({ preventScroll: true });
    };
  }, []);

  // Movida a mano: si cambia su alto (un aviso de error) o el de la pantalla, que siga entera a la vista.
  useEffect(() => {
    const caja = cajaRef.current;
    if (!ventana || !movida || !caja) return;
    const recolocar = () =>
      setPos((p) => {
        if (!p) return p;
        const q = dentroDePantalla(p, caja);
        return q.x === p.x && q.y === p.y ? p : q;
      });
    window.addEventListener('resize', recolocar);
    const obs = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(recolocar) : null;
    obs?.observe(caja);
    return () => {
      window.removeEventListener('resize', recolocar);
      obs?.disconnect();
    };
  }, [ventana, movida]);

  const alTeclear = (e: React.KeyboardEvent) => {
    // En la ventana flotante el tabulador sigue por la pagina; en el modal no sale del dialogo.
    if (ventana || e.key !== 'Tab' || !cajaRef.current) return;
    const enfocables = Array.from(cajaRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'));
    if (!enfocables.length) return;
    const primero = enfocables[0];
    const ultimo = enfocables[enfocables.length - 1];
    if (e.shiftKey && document.activeElement === primero) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primero.focus();
    }
  };

  // Arrastre desde la barra de titulo (raton, lapiz o dedo), sin salirse de la pantalla.
  const enBoton = (e: React.SyntheticEvent) => e.target instanceof Element && !!e.target.closest('button');
  const empezarArrastre = (e: React.PointerEvent<HTMLDivElement>) => {
    const caja = cajaRef.current;
    if (!ventana || !caja || e.button !== 0 || enBoton(e)) return;
    const r = caja.getBoundingClientRect();
    arrastre.current = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top };
    e.currentTarget.setPointerCapture(e.pointerId);
    setPos({ x: Math.round(r.left), y: Math.round(r.top) });
    setArrastrando(true);
  };
  const arrastrar = (e: React.PointerEvent<HTMLDivElement>) => {
    const a = arrastre.current;
    const caja = cajaRef.current;
    if (!a || a.id !== e.pointerId || !caja) return;
    setPos(dentroDePantalla({ x: e.clientX - a.dx, y: e.clientY - a.dy }, caja));
  };
  const soltar = (e: React.PointerEvent<HTMLDivElement>) => {
    if (arrastre.current?.id !== e.pointerId) return;
    arrastre.current = null;
    setArrastrando(false);
    const r = cajaRef.current?.getBoundingClientRect();
    if (r) setLado(r.left + r.width / 2 > window.innerWidth / 2 ? 'derecha' : 'izquierda');
  };
  // Lo mismo sin arrastrar (con un clic o con el teclado): la ventana pasa al otro lado de la pantalla.
  const pasarAlOtroLado = () => {
    setPos(null);
    setLado((l) => (l === 'derecha' ? 'izquierda' : 'derecha'));
  };

  // Fuera del formulario de la factura (en gastos el aviso va dentro de el: un <form> dentro de otro
  // enviaria los dos), pero dentro de .zona-app, que es la que lleva el modo noche.
  const destino = typeof document !== 'undefined' ? (document.querySelector('.zona-app') ?? document.body) : null;
  if (!destino) return null;
  const sitio: React.CSSProperties = pos ? { left: pos.x, top: pos.y } : lado === 'derecha' ? { right: MARGEN, top: ARRIBA } : { left: MARGEN, top: ARRIBA };
  return createPortal(
    // Ventana: la capa no recoge el raton (la pagina de detras se desplaza con la rueda y responde a los clics).
    <div
      className={ventana ? 'pointer-events-none fixed inset-0 z-[70]' : 'fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4'}
      onMouseDown={(e) => !ventana && e.target === e.currentTarget && onCerrar()}
    >
      <div
        ref={cajaRef}
        role="dialog"
        aria-modal={ventana ? undefined : true}
        aria-labelledby={tituloId}
        onKeyDown={alTeclear}
        style={ventana ? { ...sitio, maxHeight: `calc(100dvh - ${ARRIBA + MARGEN}px)` } : undefined}
        className={
          ventana
            ? `pointer-events-auto absolute flex w-full ${ancho} flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-2xl`
            : `flex max-h-[90dvh] w-full ${ancho} flex-col overflow-hidden rounded-xl bg-white text-slate-900 shadow-xl`
        }
      >
        {/* El titulo no se va con el desplazamiento: el formulario puede ser mas alto que la pantalla. En la ventana, es la barra para moverla. */}
        <div
          onPointerDown={empezarArrastre}
          onPointerMove={arrastrar}
          onPointerUp={soltar}
          onPointerCancel={soltar}
          // Al arrastrar no se selecciona texto ni se pierde el foco del campo en que se esta escribiendo.
          onMouseDown={(e) => ventana && !enBoton(e) && e.preventDefault()}
          title={ventana ? 'Arrastra la ventana desde esta barra para moverla' : undefined}
          className={
            ventana
              ? `flex shrink-0 touch-none select-none items-start justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 ${arrastrando ? 'cursor-grabbing' : 'cursor-grab'}`
              : 'flex shrink-0 items-start justify-between gap-3 px-5 pt-5 pb-3 sm:px-6 sm:pt-6'
          }
        >
          <div className="flex min-w-0 items-start gap-2">
            {ventana && <DotsSixVertical size={20} weight="bold" className="mt-1 shrink-0 text-slate-400" aria-hidden="true" />}
            <div className="min-w-0">
              <h2 id={tituloId} className="text-lg font-semibold text-slate-900">
                {titulo}
              </h2>
              {ventana && <p className="text-xs text-slate-500">Arrástrala desde esta barra para moverla.</p>}
              {referencia && <p className="mt-1 break-words text-xs text-slate-600">{referencia}</p>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {ventana && (
              <button
                type="button"
                data-barra
                onClick={pasarAlOtroLado}
                aria-label={lado === 'derecha' ? 'Llevar la ventana a la izquierda' : 'Llevar la ventana a la derecha'}
                title={lado === 'derecha' ? 'Llevar la ventana a la izquierda' : 'Llevar la ventana a la derecha'}
                className={botonBarra}
              >
                {lado === 'derecha' ? <ArrowLineLeft size={20} aria-hidden="true" /> : <ArrowLineRight size={20} aria-hidden="true" />}
              </button>
            )}
            <button type="button" data-barra onClick={onCerrar} aria-label="Cerrar" title={ventana ? 'Cerrar' : undefined} className={botonBarra}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className={`min-h-0 overflow-y-auto overscroll-contain ${ventana ? 'px-5 py-4' : 'px-5 pb-5 sm:px-6 sm:pb-6'}`}>{children}</div>
      </div>
    </div>,
    destino,
  );
}

const campo =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600 focus:border-accent-600 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50 data-[lector=revisar]:border-amber-500 data-[lector=revisar]:bg-amber-50';
const etiqueta = 'mb-1 block text-sm font-medium text-slate-700';

const esEspana = (pais: string) => ['ES', 'ESP', ''].includes((pais || '').trim().toUpperCase());

// ---------------------------------------------------------------------------
// «Dar de alta»: la ficha rellena con lo leido, todo editable
// ---------------------------------------------------------------------------

function DialogoAlta({
  tipo,
  datos,
  referencia,
  onCerrar,
  onSinPermiso,
  onHecho,
}: {
  tipo: TipoTercero;
  datos: DatosTercero;
  referencia?: React.ReactNode;
  onCerrar: () => void;
  onSinPermiso: () => void;
  onHecho: (t: TerceroEnlazado) => void;
}) {
  const t = TEXTOS[tipo];
  const [f, setF] = useState(() => {
    const nif = (datos.nifCif ?? '').trim();
    // Sin pais: el del prefijo del NIF-IVA; si se ha dicho que es de fuera de España, vacio (se pide); si no, España.
    const pais = (datos.pais || (pareceNifIvaUe(nif) ? paisDelPrefijo(nif) : null) || (datos.origen && datos.origen !== 'ES' ? '' : 'ES')).toUpperCase();
    return {
      nombreFiscal: (datos.nombreFiscal ?? '').trim(),
      nifCif: nif,
      pais,
      direccion: datos.direccion ?? '',
      cp: datos.cp ?? '',
      municipio: datos.municipio ?? '',
      provincia: datos.provincia ?? '',
      email: datos.email ?? '',
      telefono: datos.telefono ?? '',
    };
  });
  // Lo que traia la ficha al abrirla: un dato dudoso deja de marcarse en cuanto se cambia.
  const leidosRef = useRef(f);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [campoMal, setCampoMal] = useState<string | undefined>();
  const [repetidoId, setRepetidoId] = useState<string | null>(null);
  const [sinPermiso, setSinPermiso] = useState(false);
  const yaExiste = useTerceroPorNif(tipo, f.nifCif, datos.nifCif);
  // Primer tercero sin el plan de la gestoria: se pregunta antes de darlo de alta.
  const avisoPlan = useAvisoPlanAnterior();
  const ids = useId();
  const idDe = (c: string) => `${ids}-${c}`;

  const cambiar = (c: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const v = e.target.value;
    setF((x) => {
      const sig = { ...x, [c]: v };
      // NIF-IVA de otro pais de la UE (FR..., DE...): el pais sale del prefijo.
      if (c === 'nifCif' && (esEspana(x.pais) || !x.pais) && pareceNifIvaUe(v)) {
        const p = paisDelPrefijo(v);
        if (p && p !== 'ES') sig.pais = p;
      }
      return sig;
    });
    if (campoMal === c) {
      setCampoMal(undefined);
      setError('');
    }
  };

  const usar = async (idTercero: string) => {
    try {
      const ficha = await apiFetch<Ficha>(companyPath(`${t.ruta}/${encodeURIComponent(idTercero)}`));
      onHecho(deFicha(ficha, 'elegido'));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    // En React el envio sube por el arbol aunque el dialogo este en un portal: que no llegue al formulario de la factura.
    e.stopPropagation();
    setError('');
    setCampoMal(undefined);
    setRepetidoId(null);
    if (!f.nombreFiscal.trim()) {
      setError(`Escribe el nombre fiscal del ${tipo}.`);
      setCampoMal('nombreFiscal');
      document.getElementById(idDe('nombreFiscal'))?.focus();
      return;
    }
    if (!f.pais) {
      setError(`Elige el país del ${tipo}.`);
      setCampoMal('pais');
      document.getElementById(idDe('pais'))?.focus();
      return;
    }
    if (!f.nifCif.trim()) {
      setError(
        esEspana(f.pais)
          ? `Escribe el NIF del ${tipo}.`
          : `Escribe el ${numeroFiscalEnFrase(f.pais)} del ${tipo}. Si no tiene, escribe otro documento que lo identifique (por ejemplo, su pasaporte o su número de registro mercantil).`,
      );
      setCampoMal('nifCif');
      document.getElementById(idDe('nifCif'))?.focus();
      return;
    }
    const cuerpo: Record<string, string> = { nombreFiscal: f.nombreFiscal.trim(), nifCif: f.nifCif.trim(), pais: f.pais };
    for (const c of ['direccion', 'cp', 'municipio', 'provincia', 'email', 'telefono'] as const) {
      if (f[c].trim()) cuerpo[c] = f[c].trim();
    }
    setGuardando(true);
    try {
      const ficha = await avisoPlan.intentar((extra) => apiFetch<Ficha>(companyPath(t.ruta), { method: 'POST', body: JSON.stringify({ ...cuerpo, ...extra }) }));
      // null: ha elegido traer antes el plan (se va a ese apartado) o ha cerrado el aviso sin seguir.
      if (ficha) onHecho(deFicha(ficha, 'alta'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setSinPermiso(true);
        onSinPermiso();
        setError(`No tienes permiso para dar de alta ${t.plural}: pide a un administrador que lo dé de alta. Si ya lo tienes, elígelo con «Es uno que ya tengo».`);
        // El boton de guardar se desactiva: el foco pasa al aviso.
        requestAnimationFrame(() => document.getElementById(idDe('error'))?.focus());
        return;
      }
      setError(errorMessage(err));
      const c = campoDelError(err);
      if (c) {
        setCampoMal(c);
        document.getElementById(idDe(c))?.focus();
      }
      if (err instanceof ApiError && err.status === 409 && err.detalles && typeof err.detalles === 'object') {
        const otro = (err.detalles as Record<string, unknown>)[t.idRepetido];
        if (typeof otro === 'string') setRepetidoId(otro);
      }
    } finally {
      setGuardando(false);
    }
  };

  /** Direccion leida con poca seguridad que sigue como se leyo: va en ambar. */
  const dudoso = (c: string): boolean => {
    if (!(datos.dudosos ?? []).some((d) => d === c)) return false;
    const v = f[c as CampoDireccion];
    return v.trim() !== '' && v === leidosRef.current[c as CampoDireccion];
  };
  const hayDudas = (['direccion', 'cp', 'municipio', 'provincia'] as const).some(dudoso);
  /** aria-invalid con el error del servidor o, si no lo hay, la marca ambar de un dato dudoso. */
  const mal = (c: string) => {
    if (campoMal === c) return { 'aria-invalid': true, 'aria-describedby': idDe('error') };
    if (dudoso(c)) return { 'aria-invalid': false, 'aria-describedby': idDe('dudas'), 'data-lector': 'revisar' };
    return { 'aria-invalid': false, 'aria-describedby': undefined };
  };
  const es = esEspana(f.pais);
  const ue = origenDePais(f.pais) === 'UE';
  // Como se llama su numero fiscal en su pais (cambia con el pais elegido).
  const numeroFiscal = f.pais ? nombreNumeroFiscal(f.pais) : 'Número fiscal';

  return (
    <Dialogo titulo={tipo === 'proveedor' ? 'Dar de alta el proveedor' : 'Dar de alta el cliente'} referencia={referencia} onCerrar={onCerrar}>
      {avisoPlan.dialogo}
      <form onSubmit={guardar} noValidate className="flex flex-col gap-4">
        <p className="text-sm text-slate-600">
          Lo hemos rellenado con lo que pone la factura, menos el correo y el teléfono, que no se leen. Corrige lo que haga falta: se guarda en tu lista de {t.plural} con su
          subcuenta y la factura queda a su nombre.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor={idDe('nombreFiscal')} className={etiqueta}>
              Nombre fiscal *
            </label>
            <input id={idDe('nombreFiscal')} value={f.nombreFiscal} onChange={cambiar('nombreFiscal')} maxLength={200} {...mal('nombreFiscal')} className={campo} />
          </div>
          <div>
            <label htmlFor={idDe('pais')} className={etiqueta}>
              País
            </label>
            <select id={idDe('pais')} value={f.pais} onChange={cambiar('pais')} {...mal('pais')} className={campo}>
              {f.pais === '' ? <option value="">Elige el país</option> : !PAISES.some(([c]) => c === f.pais) && <option value={f.pais}>{f.pais}</option>}
              {PAISES.map(([c, n]) => (
                <option key={c} value={c}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={idDe('nifCif')} className={etiqueta}>
              {numeroFiscal}
              {ue ? ' (con el prefijo del país)' : ''} *
            </label>
            <input id={idDe('nifCif')} value={f.nifCif} onChange={cambiar('nifCif')} maxLength={30} autoComplete="off" {...mal('nifCif')} className={`${campo} font-mono`} />
            {ue && f.nifCif.trim() && !pareceNifIvaUe(f.nifCif) && <p className="mt-1 text-xs text-amber-700">Falta el prefijo del país (p. ej. FR…, DE…; EL para Grecia).</p>}
            {!es && f.pais && !f.nifCif.trim() && (
              <p className="mt-1 text-xs text-slate-500">Si no tiene número fiscal, escribe otro documento que lo identifique (pasaporte, registro mercantil…).</p>
            )}
          </div>
          {yaExiste && (
            <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="min-w-0 break-words">
                Ya tienes un {tipo} con este {numeroFiscal === 'Número fiscal' ? 'número' : numeroFiscal}: <strong>{quienEs(yaExiste.nombreFiscal, yaExiste.nifCif)}</strong>.
              </p>
              <button type="button" onClick={() => onHecho(deFicha(yaExiste, 'elegido'))} className="shrink-0 self-start rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold text-amber-800 hover:bg-amber-100">
                Usar ese
              </button>
            </div>
          )}
          {hayDudas && (
            <p id={idDe('dudas')} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 sm:col-span-2">
              La dirección se ha leído con poca seguridad: compara con la factura los datos marcados en ámbar. La marca se quita al cambiarlos.
            </p>
          )}
          <div className="sm:col-span-2">
            <label htmlFor={idDe('direccion')} className={etiqueta}>
              Dirección
            </label>
            <input id={idDe('direccion')} value={f.direccion} onChange={cambiar('direccion')} maxLength={200} {...mal('direccion')} className={campo} />
          </div>
          <div>
            <label htmlFor={idDe('cp')} className={etiqueta}>
              Código postal
            </label>
            <input id={idDe('cp')} inputMode={es ? 'numeric' : 'text'} value={f.cp} onChange={cambiar('cp')} maxLength={12} {...mal('cp')} className={campo} />
          </div>
          <div>
            <label htmlFor={idDe('municipio')} className={etiqueta}>
              Municipio
            </label>
            <input id={idDe('municipio')} value={f.municipio} onChange={cambiar('municipio')} maxLength={100} {...mal('municipio')} className={campo} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={idDe('provincia')} className={etiqueta}>
              {es ? 'Provincia' : 'Región o estado'}
            </label>
            <input id={idDe('provincia')} value={f.provincia} onChange={cambiar('provincia')} maxLength={100} {...mal('provincia')} className={campo} />
          </div>
          <div>
            <label htmlFor={idDe('email')} className={etiqueta}>
              Correo electrónico
            </label>
            <input id={idDe('email')} type="email" value={f.email} onChange={cambiar('email')} maxLength={200} autoComplete="off" {...mal('email')} className={campo} />
          </div>
          <div>
            <label htmlFor={idDe('telefono')} className={etiqueta}>
              Teléfono
            </label>
            <input id={idDe('telefono')} type="tel" value={f.telefono} onChange={cambiar('telefono')} maxLength={30} autoComplete="off" {...mal('telefono')} className={campo} />
          </div>
        </div>

        {error && (
          <div id={idDe('error')} role="alert" tabIndex={-1} className="flex flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 focus:outline-none text-sm text-rose-700">
            <p className="flex items-start gap-2">
              <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">{error}</span>
            </p>
            {repetidoId && (
              <button type="button" onClick={() => usar(repetidoId)} className="self-start font-semibold underline">
                Usar el que ya tengo
              </button>
            )}
          </div>
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCerrar} className="rounded-lg border border-slate-300 px-4 py-2.5 font-semibold text-slate-700 transition-colors hover:bg-slate-50">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando || sinPermiso}
            className="rounded-lg bg-accent-600 px-5 py-2.5 font-semibold text-white transition-colors hover:bg-accent-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60"
          >
            {guardando ? 'Guardando…' : `Dar de alta el ${tipo}`}
          </button>
        </div>
      </form>
    </Dialogo>
  );
}

// ---------------------------------------------------------------------------
// «Es uno que ya tengo»: buscador por nombre o NIF
// ---------------------------------------------------------------------------

function DialogoBuscar({
  tipo,
  inicial,
  referencia,
  onCerrar,
  onElegir,
}: {
  tipo: TipoTercero;
  inicial: string;
  referencia?: React.ReactNode;
  onCerrar: () => void;
  onElegir: (t: TerceroEnlazado) => void;
}) {
  const t = TEXTOS[tipo];
  const [q, setQ] = useState(inicial.trim());
  const [resultados, setResultados] = useState<Encontrado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');
  const peticion = useRef(0);
  const ids = useId();
  const campoRef = useRef<HTMLInputElement>(null);

  // Se abre con lo leído seleccionado: lo normal es buscar otra cosa (por eso se abre este
  // buscador), y así lo que se escribe lo sustituye en lugar de pegarse detrás.
  useEffect(() => {
    campoRef.current?.select();
  }, []);

  useEffect(() => {
    const n = ++peticion.current;
    const espera = setTimeout(async () => {
      setBuscando(true);
      try {
        // Proveedores: solo los activos (los mismos que ofrece el formulario).
        const ruta = tipo === 'proveedor' ? `/proveedores/buscar?activos=true&limit=8&q=${encodeURIComponent(q.trim())}` : `/clientes/buscar?limit=8&q=${encodeURIComponent(q.trim())}`;
        const r = await apiFetch<Encontrado[]>(companyPath(ruta));
        if (n === peticion.current) {
          setResultados(Array.isArray(r) ? r : []);
          setError('');
        }
      } catch (err) {
        if (n === peticion.current) setError(errorMessage(err));
      } finally {
        if (n === peticion.current) setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(espera);
  }, [q, tipo]);

  return (
    <Dialogo titulo={tipo === 'proveedor' ? 'Elegir un proveedor que ya tengo' : 'Elegir un cliente que ya tengo'} referencia={referencia} onCerrar={onCerrar}>
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-600">Por si el NIF se ha leído mal: busca por el nombre o por el NIF bueno. La factura queda a nombre del que elijas.</p>
        <label htmlFor={`${ids}-q`} className={etiqueta}>
          Nombre o NIF
        </label>
        <div className="relative">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input ref={campoRef} id={`${ids}-q`} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" aria-describedby={`${ids}-estado`} className={`${campo} pl-9`} />
        </div>
        {error && <p className="text-sm text-rose-700">{error}</p>}
        <p id={`${ids}-estado`} role="status" className="sr-only">
          {buscando ? 'Buscando…' : resultados.length === 1 ? 'Un resultado.' : `${resultados.length} resultados.`}
        </p>
        <ul className="flex max-h-72 flex-col divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
          {buscando && resultados.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Buscando…</li>}
          {!buscando && resultados.length === 0 && (
            <li className="px-3 py-2 text-sm text-slate-500">{q.trim() ? `No hay ningún ${tipo} con ese nombre o NIF. Prueba con una parte del nombre.` : `Aún no tienes ${t.plural} dados de alta.`}</li>
          )}
          {resultados.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onElegir({ id: r.id, nombre: r.nombre, nif: r.nif, pais: r.pais || 'ES', como: 'elegido' })}
                className="flex w-full flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3 py-2.5 text-left text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
              >
                <span className="min-w-0 break-words font-medium text-slate-900">{r.nombre}</span>
                <span className="font-mono text-xs text-slate-500">{r.nif}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex justify-end">
          <button type="button" onClick={onCerrar} className="rounded-lg border border-slate-300 px-4 py-2.5 font-semibold text-slate-700 transition-colors hover:bg-slate-50">
            Cancelar
          </button>
        </div>
      </div>
    </Dialogo>
  );
}
