/**
 * Carmen, el asistente del panel: tipos del contrato con el backend y llamadas
 * a /companies/:companyId/chat-assistant.
 *
 * Los tipos son copia de backend src/services/carmen/tipos.ts (RespuestaCarmen y
 * compañía). Si cambian allí, hay que cambiarlos aquí.
 *
 * Carmen solo lee: las cifras las calcula la app, las dudas se responden con
 * fichas revisadas y la IA (si la empresa la activa) solo atiende dudas
 * generales sin ver datos de la empresa.
 */
import { apiFetch, companyPath } from './api';
import type { Tabla } from '@/app/dashboard/informes/TablaInforme';

// ---------------------------------------------------------------- Contrato

/** De dónde sale una respuesta. Solo 'ia' ha pasado por el modelo de lenguaje. */
export type OrigenRespuesta = 'datos' | 'faq' | 'ia' | 'aclaracion' | 'sistema';

export type AreaIntencion = 'cobros' | 'pagos' | 'facturacion' | 'contabilidad' | 'tesoreria' | 'impuestos' | 'resumen';

/** Huecos que llevan los botones (códigos e ids, nunca nombres). */
export interface HuecosEntrada {
  periodo?: string;
  sentido?: 'cobros' | 'pagos';
  modelo?: string;
  terceroId?: string;
  rol?: 'cliente' | 'proveedor' | 'banco';
  importeMinimo?: number;
  diasMinimos?: number;
  ibanFinal?: string;
  numeroFactura?: string;
  soloVencidas?: boolean;
  foco?: 'ventas' | 'gastos';
}

/** Lo que manda un botón: el servidor lo ejecuta tal cual, sin clasificar texto. */
export type Accion =
  | { tipo: 'intencion'; id: string; huecos?: HuecosEntrada }
  | { tipo: 'faq'; id: string }
  | { tipo: 'tercero'; terceroId: string; rol: 'cliente' | 'proveedor' | 'banco'; intencion?: string }
  | { tipo: 'ia' }
  | { tipo: 'catalogo' }
  /** «No era esto»: el servidor vuelve a mirar la pregunta (message) sin la intención descartada. */
  | { tipo: 'noEraEsto'; intencion?: string };

/** Texto de un botón que se guarda como pregunta en el historial (el servidor admite 120 caracteres). */
export const MAX_TEXTO_BOTON = 120;

export interface Boton {
  texto: string;
  accion: Accion;
}

export interface Kpi {
  etiqueta: string;
  valor: string;
  detalle?: string;
}

export interface Enlace {
  texto: string;
  href: string;
}

export interface Descarga {
  texto: string;
  /** Ruta de la API relativa a /companies/:companyId. */
  ruta: string;
  formato: 'pdf' | 'xlsx';
}

/** Tabla de la respuesta: la de los informes sin empresa, 15 filas como máximo. */
export interface TablaCarmen {
  titulo: string;
  periodo: string;
  columnas: Tabla['columnas'];
  filas: Tabla['filas'];
  /** Filas que había en total antes de recortar. */
  totalFilas: number;
  notas?: string[];
}

export interface FuenteFicha {
  titulo: string;
  /** https://... (AEAT, BOE) o una pantalla de la app (/dashboard/...). */
  url: string;
  verificadaEl: string;
}

/** Respuesta de POST /chat-assistant. */
export interface RespuestaCarmen {
  sessionId: string;
  mensajeId: string;
  origen: OrigenRespuesta;
  intencion?: string;
  entendido?: string;
  texto: string;
  kpis?: Kpi[];
  tabla?: TablaCarmen;
  enlaces?: Enlace[];
  descargas?: Descarga[];
  botones?: Boton[];
  avisos?: string[];
  fuente?: FuenteFicha;
  calculadoEn?: string;
  etiquetaIA?: string;
  /** Solo en respuestas de datos: repite la consulta con cifras de ahora. */
  actualizar?: Accion;
}

/** Una respuesta tal como la pinta la ventana (la conversación ya se sabe cuál es). */
export type RespuestaVista = Omit<RespuestaCarmen, 'sessionId'>;

export interface PeticionCarmen {
  message?: string;
  accion?: Accion;
  sessionId?: string;
  currentPage?: string;
  /** Con un botón: su texto tal como lo vio el usuario, para guardarlo como su pregunta. */
  textoBoton?: string;
}

export type MotivoSinIA = 'apagada' | 'sin_clave' | 'desactivada_empresa' | 'tope_mensual' | 'tope_empresa' | 'tope_usuario';

export interface UsoMesCarmen {
  /** Gasto del mes de toda la plataforma (el tope es común). */
  gastoMesEur: number;
  topeMesEur: number;
  porcentajeMes: number;
  /** A partir del 80 % del tope. */
  avisoTope: boolean;
  consultasEmpresaHoy: number;
  topeEmpresaDia: number;
  consultasEmpresaMes: number;
  gastoEmpresaMesEur: number;
}

/** GET /estado. `usoMes` solo llega a los administradores de la empresa. */
export interface EstadoCarmen {
  iaDisponible: boolean;
  iaActivaEmpresa: boolean;
  motivo?: MotivoSinIA;
  textoMotivo?: string;
  usoMes?: UsoMesCarmen;
}

/** GET /catalogo?pagina=: lo que el usuario puede preguntar, por áreas, y chips de la pantalla. */
export interface CatalogoCarmen {
  areas: Array<{ area: AreaIntencion; intenciones: Array<{ id: string; titulo: string; ejemplos: string[] }> }>;
  chips: Boton[];
  fichas: Array<{ id: string; pregunta: string }>;
}

export interface SesionResumen {
  id: string;
  titulo: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface ListaSesiones {
  total: number;
  pagina: number;
  porPagina: number;
  sesiones: SesionResumen[];
}

/** Bloques guardados con cada respuesta para repintar el historial. */
export type DatosGuardados = Partial<
  Pick<
    RespuestaCarmen,
    'entendido' | 'kpis' | 'tabla' | 'enlaces' | 'descargas' | 'botones' | 'avisos' | 'fuente' | 'etiquetaIA' | 'actualizar'
  >
>;

export interface MensajeGuardado {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  origen: OrigenRespuesta | null;
  intencion: string | null;
  datos: DatosGuardados | null;
  calculadoEn: string | null;
  valoracion: number | null;
  createdAt: string;
  /** La respuesta se calculó con un permiso que el usuario ya no tiene. */
  oculto: boolean;
}

export interface ConversacionGuardada {
  sessionId: string;
  titulo: string | null;
  mensajes: MensajeGuardado[];
}

/** GET /ajustes (solo administradores de la empresa). */
export interface AjustesCarmen {
  iaActiva: boolean;
  /** Tope propio de preguntas diarias a la IA; null = el general. */
  topeConsultasDia: number | null;
  conservarDias: number;
  actualizadoEn?: string | null;
  topeGeneralDia: number;
  llmActivoPlataforma: boolean;
}

/** GET /uso (solo administradores de la empresa). */
export interface UsoCarmen {
  mes: string;
  consultasEmpresaMes: number;
  gastoEmpresaMesEur: number;
  consultasEmpresaHoy: number;
  topeEmpresaDia: number;
  porcentajeTopeGlobal: number;
  avisoTope: boolean;
}

// ---------------------------------------------------------------- Llamadas

const BASE = '/chat-assistant';
/** Igual que en el backend (MAX_MENSAJE). */
export const MAX_PREGUNTA = 500;
/** A partir de aquí se enseña el contador de caracteres. */
export const AVISO_PREGUNTA = 400;

export function preguntarACarmen(p: PeticionCarmen): Promise<RespuestaCarmen> {
  return apiFetch<RespuestaCarmen>(companyPath(BASE), { method: 'POST', body: JSON.stringify(p) });
}

export function estadoCarmen(): Promise<EstadoCarmen> {
  return apiFetch<EstadoCarmen>(companyPath(`${BASE}/estado`));
}

export function catalogoCarmen(pagina: string): Promise<CatalogoCarmen> {
  return apiFetch<CatalogoCarmen>(companyPath(`${BASE}/catalogo?pagina=${encodeURIComponent(pagina.slice(0, 200))}`));
}

export function listarConversaciones(pagina = 1): Promise<ListaSesiones> {
  return apiFetch<ListaSesiones>(companyPath(`${BASE}/sesiones?pagina=${pagina}`));
}

export function leerConversacion(sessionId: string): Promise<ConversacionGuardada> {
  return apiFetch<ConversacionGuardada>(companyPath(`${BASE}/${encodeURIComponent(sessionId)}/messages`));
}

export function borrarConversacion(sessionId: string): Promise<unknown> {
  return apiFetch(companyPath(`${BASE}/${encodeURIComponent(sessionId)}`), { method: 'DELETE' });
}

export function valorarRespuesta(mensajeId: string, util: boolean): Promise<unknown> {
  return apiFetch(companyPath(`${BASE}/mensajes/${encodeURIComponent(mensajeId)}/valoracion`), {
    method: 'POST',
    body: JSON.stringify({ util }),
  });
}

export function leerAjustesCarmen(): Promise<AjustesCarmen> {
  return apiFetch<AjustesCarmen>(companyPath(`${BASE}/ajustes`));
}

export function guardarAjustesCarmen(
  cambios: Partial<Pick<AjustesCarmen, 'iaActiva' | 'topeConsultasDia' | 'conservarDias'>>,
): Promise<AjustesCarmen> {
  return apiFetch<AjustesCarmen>(companyPath(`${BASE}/ajustes`), { method: 'PUT', body: JSON.stringify(cambios) });
}

export function usoCarmen(): Promise<UsoCarmen> {
  return apiFetch<UsoCarmen>(companyPath(`${BASE}/uso`));
}

/** Aviso a la ventana de Carmen de que un administrador ha cambiado los ajustes. */
export const EVENTO_AJUSTES_CARMEN = 'conta:carmen-ajustes';

// ---------------------------------------------------------------- Formatos

export const NOMBRE_AREA: Record<AreaIntencion, string> = {
  cobros: 'Cobros',
  pagos: 'Pagos',
  facturacion: 'Facturación',
  contabilidad: 'Contabilidad',
  tesoreria: 'Bancos',
  impuestos: 'Impuestos',
  resumen: 'Resumen',
};

/** 1234.5 -> "1.234,50 €" (a mano: Intl en es-ES no separa los miles de 4 cifras). */
export function euros(n: number): string {
  const v = Math.round(n * 100) / 100;
  const [ent, dec] = Math.abs(v).toFixed(2).split('.');
  return `${v < 0 ? '-' : ''}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec} €`;
}

/** Gasto de la IA: unas décimas de céntimo no se enseñan como «0,00 €». */
export function gastoIA(n: number): string {
  return n > 0 && n < 0.005 ? 'menos de 0,01 €' : euros(n);
}

/** AAAA-MM-DD... -> DD/MM/AAAA. */
export function fechaCorta(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso;
}

const dosCifras = (n: number) => String(n).padStart(2, '0');

/** «hoy 10:32», «ayer 18:05» o «07/10/2026 10:32» (hora del navegador). */
export function momento(iso: string, ahora: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hora = `${dosCifras(d.getHours())}:${dosCifras(d.getMinutes())}`;
  const mismoDia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (mismoDia(d, ahora)) return `hoy ${hora}`;
  const ayer = new Date(ahora);
  ayer.setDate(ayer.getDate() - 1);
  if (mismoDia(d, ayer)) return `ayer ${hora}`;
  return `${dosCifras(d.getDate())}/${dosCifras(d.getMonth() + 1)}/${d.getFullYear()} ${hora}`;
}

/** Solo se enlazan pantallas del panel (las respuestas no pueden llevar a otro sitio). */
export function esEnlaceInterno(href: string): boolean {
  return /^\/dashboard(?:[/?#]|$)/.test(href) && !href.includes('//');
}

export function esEnlaceExterno(url: string): boolean {
  return /^https:\/\/[^\s]+$/.test(url);
}

// ---------------------------------------------------------------- Copiar

const limpiar = (s: string) => s.replace(/[\t\r\n]+/g, ' ').trim();

/** Celda de texto que Excel tomaría por fórmula («=…», «+…», «@…»): se pega como texto. */
function textoSeguro(s: string): string {
  const t = limpiar(s);
  return /^[=+@]/.test(t) || /^-[^\d]/.test(t) ? `'${t}` : t;
}

function celdaTSV(v: string | number | null | undefined, tipo: Tabla['columnas'][number]['tipo']): string {
  if (v === null || v === undefined || v === '') return '';
  // Importes sin separador de miles y con coma decimal: Excel en español los lee como número.
  if (tipo === 'importe' && typeof v === 'number') return v.toFixed(2).replace('.', ',');
  if (tipo === 'fecha' && typeof v === 'string') return fechaCorta(v);
  return typeof v === 'number' ? String(v).replace('.', ',') : textoSeguro(v);
}

/** Tabla en TSV (tabuladores) para pegarla en Excel. */
export function tablaEnTSV(t: TablaCarmen): string {
  const lineas = [
    textoSeguro(`${t.titulo}${t.periodo ? ` (${t.periodo})` : ''}`),
    t.columnas.map((c) => textoSeguro(c.titulo)).join('\t'),
    ...t.filas.map((f) => t.columnas.map((c, k) => celdaTSV(f.celdas[k], c.tipo)).join('\t')),
  ];
  if (t.totalFilas > t.filas.length) lineas.push(`(${t.filas.length} de ${t.totalFilas} filas)`);
  return lineas.join('\n');
}

/** Lo que copia el botón «Copiar» de una respuesta: el texto y, si la hay, la tabla en TSV. */
export function textoParaCopiar(r: RespuestaVista): string {
  const partes: string[] = [];
  if (r.entendido) partes.push(`He entendido: ${r.entendido}`);
  partes.push(r.texto);
  if (r.kpis?.length)
    partes.push(
      r.kpis
        .map((k) =>
          [k.etiqueta, k.valor, k.detalle]
            .filter(Boolean)
            .map((x) => limpiar(String(x)))
            .join('\t'),
        )
        .join('\n'),
    );
  if (r.tabla) partes.push(tablaEnTSV(r.tabla));
  if (r.avisos?.length) partes.push(r.avisos.join('\n'));
  if (r.fuente) partes.push(`Fuente: ${r.fuente.titulo} (${r.fuente.url}), verificada el ${fechaCorta(r.fuente.verificadaEl)}`);
  return partes.join('\n\n');
}

/** Copia al portapapeles; si el navegador no deja, con el método antiguo. */
export async function copiarAlPortapapeles(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // Se intenta con el método antiguo.
  }
  try {
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- Ventana

/**
 * Ventana abierta y conversación en curso, por usuario y empresa (sobreviven a
 * recargar la página). Con otro usuario en el mismo navegador no se reutilizan:
 * el servidor tampoco le enseñaría la conversación de otro.
 */
export interface EstadoVentana {
  abierto: boolean;
  sessionId?: string;
}

const PREFIJO_VENTANA = 'carmen:ventana:';

/** Clave de la ventana: usuario y empresa. */
export function claveVentana(usuario: string, companyId: string): string {
  return `${PREFIJO_VENTANA}${usuario}|${companyId}`;
}

export function leerVentana(clave: string): EstadoVentana {
  try {
    const crudo = sessionStorage.getItem(clave);
    const v = crudo ? (JSON.parse(crudo) as Partial<EstadoVentana>) : null;
    return { abierto: v?.abierto === true, ...(typeof v?.sessionId === 'string' ? { sessionId: v.sessionId } : {}) };
  } catch {
    return { abierto: false };
  }
}

export function guardarVentana(clave: string, v: EstadoVentana): void {
  try {
    sessionStorage.setItem(clave, JSON.stringify(v));
  } catch {
    // Sin sessionStorage: la ventana se cierra al recargar, nada más.
  }
}

/** Al entrar se olvida la ventana de las demás empresas (y de otros usuarios). */
export function olvidarOtrasVentanas(clave: string): void {
  try {
    const claves: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(PREFIJO_VENTANA) && k !== clave) claves.push(k);
    }
    claves.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // Nada que limpiar.
  }
}
