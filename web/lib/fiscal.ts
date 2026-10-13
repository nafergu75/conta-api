'use client';

import { useEffect, useState } from 'react';
import { ApiError, apiFetch, companyPath, errorMessage } from './api';

/**
 * Tipo de operacion de IVA de las facturas de venta (lo que devuelve
 * GET /income-invoices/tipos-operacion). La regla vive en el backend
 * (domain/tipo-operacion.model.ts): aqui solo se pinta.
 */

export interface TipoOperacionInfo {
  codigo: string;
  etiqueta: string;
  etiquetaCorta: string;
  etiquetaEn: string;
  llevaCuota: boolean;
  admiteRetencion: boolean;
  tiposFacturaProhibidos: string[];
  exigeSupuesto: boolean;
  admiteReferencia: boolean;
}

export interface Supuesto {
  codigo: string;
  causa?: string;
  etiqueta: string;
  referenciaLegal: string | null;
}

export interface AvisoFiscal {
  codigo: string;
  mensaje: string;
}

export interface ContextoFiscal {
  /** false: empresa no establecida en Espana. Sus facturas van sin IVA, en su moneda y en ingles. */
  empresaEspanola: boolean;
  pais: string;
  idiomaPdf: 'es' | 'en';
  monedaCuenta: string;
  monedasFactura: Array<{ codigo: string; nombre: string; simbolo: string }>;
  tipos: TipoOperacionInfo[];
  supuestosExencion: Supuesto[];
  supuestosIsp: Supuesto[];
  paisesUe: string[];
  sugerencia?: { tipoOperacion: string | null; avisos: AvisoFiscal[] };
  avisosCliente?: AvisoFiscal[];
}

/** Etiqueta corta para listados y fichas (la misma que el backend). */
export const ETIQUETA_CORTA: Record<string, string> = {
  NACIONAL: 'Nacional',
  INTRACOMUNITARIA: 'Intracom.',
  EXPORTACION: 'Export.',
  SERVICIOS_EXTRANJERO: 'No sujeta',
  EXENTA: 'Exenta',
  ISP_NACIONAL: 'ISP',
  EMPRESA_EXTRANJERA: 'Sin IVA',
};

export const ETIQUETA_LARGA: Record<string, string> = {
  NACIONAL: 'Nacional (con IVA)',
  INTRACOMUNITARIA: 'Entrega intracomunitaria exenta (art. 25 LIVA)',
  EXPORTACION: 'Exportación exenta (art. 21 LIVA)',
  SERVICIOS_EXTRANJERO: 'Servicios a cliente extranjero, no sujeta (arts. 69-70 LIVA)',
  EXENTA: 'Exenta (art. 20 LIVA y otros)',
  ISP_NACIONAL: 'Inversión del sujeto pasivo (art. 84.Uno.2.º LIVA)',
  EMPRESA_EXTRANJERA: 'Sin IVA (empresa no establecida en España)',
};

/**
 * Paises para la ficha de la empresa, del cliente y del proveedor (ISO-2): los
 * 249 de la ISO 3166-1, Espana primero y el resto por orden alfabetico. Los de
 * la UE deciden la entrega intracomunitaria; el resto, la exportacion. Antes
 * habia solo 50 y faltaban paises como la Republica Dominicana.
 */
export const PAISES: Array<[string, string]> = [
  ['ES', 'España'],
  ['AF', 'Afganistán'],
  ['AL', 'Albania'],
  ['DE', 'Alemania'],
  ['AD', 'Andorra'],
  ['AO', 'Angola'],
  ['AI', 'Anguila'],
  ['AQ', 'Antártida'],
  ['AG', 'Antigua y Barbuda'],
  ['SA', 'Arabia Saudí'],
  ['DZ', 'Argelia'],
  ['AR', 'Argentina'],
  ['AM', 'Armenia'],
  ['AW', 'Aruba'],
  ['AU', 'Australia'],
  ['AT', 'Austria'],
  ['AZ', 'Azerbaiyán'],
  ['BS', 'Bahamas'],
  ['BD', 'Bangladés'],
  ['BB', 'Barbados'],
  ['BH', 'Baréin'],
  ['BE', 'Bélgica'],
  ['BZ', 'Belice'],
  ['BJ', 'Benín'],
  ['BM', 'Bermudas'],
  ['BY', 'Bielorrusia'],
  ['BO', 'Bolivia'],
  ['BA', 'Bosnia y Herzegovina'],
  ['BW', 'Botsuana'],
  ['BR', 'Brasil'],
  ['BN', 'Brunéi'],
  ['BG', 'Bulgaria'],
  ['BF', 'Burkina Faso'],
  ['BI', 'Burundi'],
  ['BT', 'Bután'],
  ['CV', 'Cabo Verde'],
  ['KH', 'Camboya'],
  ['CM', 'Camerún'],
  ['CA', 'Canadá'],
  ['BQ', 'Caribe neerlandés'],
  ['QA', 'Catar'],
  ['TD', 'Chad'],
  ['CL', 'Chile'],
  ['CN', 'China'],
  ['CY', 'Chipre'],
  ['VA', 'Ciudad del Vaticano'],
  ['CO', 'Colombia'],
  ['KM', 'Comoras'],
  ['CG', 'Congo'],
  ['KP', 'Corea del Norte'],
  ['KR', 'Corea del Sur'],
  ['CI', 'Costa de Marfil'],
  ['CR', 'Costa Rica'],
  ['HR', 'Croacia'],
  ['CU', 'Cuba'],
  ['CW', 'Curazao'],
  ['DK', 'Dinamarca'],
  ['DM', 'Dominica'],
  ['EC', 'Ecuador'],
  ['EG', 'Egipto'],
  ['SV', 'El Salvador'],
  ['AE', 'Emiratos Árabes Unidos'],
  ['ER', 'Eritrea'],
  ['SK', 'Eslovaquia'],
  ['SI', 'Eslovenia'],
  ['US', 'Estados Unidos'],
  ['EE', 'Estonia'],
  ['SZ', 'Esuatini'],
  ['ET', 'Etiopía'],
  ['PH', 'Filipinas'],
  ['FI', 'Finlandia'],
  ['FJ', 'Fiyi'],
  ['FR', 'Francia'],
  ['GA', 'Gabón'],
  ['GM', 'Gambia'],
  ['GE', 'Georgia'],
  ['GH', 'Ghana'],
  ['GI', 'Gibraltar'],
  ['GD', 'Granada'],
  ['GR', 'Grecia'],
  ['GL', 'Groenlandia'],
  ['GP', 'Guadalupe'],
  ['GU', 'Guam'],
  ['GT', 'Guatemala'],
  ['GF', 'Guayana Francesa'],
  ['GG', 'Guernesey'],
  ['GN', 'Guinea'],
  ['GQ', 'Guinea Ecuatorial'],
  ['GW', 'Guinea-Bisáu'],
  ['GY', 'Guyana'],
  ['HT', 'Haití'],
  ['HN', 'Honduras'],
  ['HK', 'Hong Kong'],
  ['HU', 'Hungría'],
  ['IN', 'India'],
  ['ID', 'Indonesia'],
  ['IQ', 'Irak'],
  ['IR', 'Irán'],
  ['IE', 'Irlanda'],
  ['BV', 'Isla Bouvet'],
  ['IM', 'Isla de Man'],
  ['CX', 'Isla de Navidad'],
  ['NF', 'Isla Norfolk'],
  ['IS', 'Islandia'],
  ['AX', 'Islas Åland'],
  ['KY', 'Islas Caimán'],
  ['CC', 'Islas Cocos'],
  ['CK', 'Islas Cook'],
  ['FO', 'Islas Feroe'],
  ['GS', 'Islas Georgia del Sur y Sandwich del Sur'],
  ['HM', 'Islas Heard y McDonald'],
  ['FK', 'Islas Malvinas'],
  ['MP', 'Islas Marianas del Norte'],
  ['MH', 'Islas Marshall'],
  ['UM', 'Islas menores alejadas de EE. UU.'],
  ['PN', 'Islas Pitcairn'],
  ['SB', 'Islas Salomón'],
  ['TC', 'Islas Turcas y Caicos'],
  ['VG', 'Islas Vírgenes Británicas'],
  ['VI', 'Islas Vírgenes de EE. UU.'],
  ['IL', 'Israel'],
  ['IT', 'Italia'],
  ['JM', 'Jamaica'],
  ['JP', 'Japón'],
  ['JE', 'Jersey'],
  ['JO', 'Jordania'],
  ['KZ', 'Kazajistán'],
  ['KE', 'Kenia'],
  ['KG', 'Kirguistán'],
  ['KI', 'Kiribati'],
  ['KW', 'Kuwait'],
  ['LA', 'Laos'],
  ['LS', 'Lesoto'],
  ['LV', 'Letonia'],
  ['LB', 'Líbano'],
  ['LR', 'Liberia'],
  ['LY', 'Libia'],
  ['LI', 'Liechtenstein'],
  ['LT', 'Lituania'],
  ['LU', 'Luxemburgo'],
  ['MO', 'Macao'],
  ['MK', 'Macedonia del Norte'],
  ['MG', 'Madagascar'],
  ['MY', 'Malasia'],
  ['MW', 'Malaui'],
  ['MV', 'Maldivas'],
  ['ML', 'Mali'],
  ['MT', 'Malta'],
  ['MA', 'Marruecos'],
  ['MQ', 'Martinica'],
  ['MU', 'Mauricio'],
  ['MR', 'Mauritania'],
  ['YT', 'Mayotte'],
  ['MX', 'México'],
  ['FM', 'Micronesia'],
  ['MD', 'Moldavia'],
  ['MC', 'Mónaco'],
  ['MN', 'Mongolia'],
  ['ME', 'Montenegro'],
  ['MS', 'Montserrat'],
  ['MZ', 'Mozambique'],
  ['MM', 'Myanmar'],
  ['NA', 'Namibia'],
  ['NR', 'Nauru'],
  ['NP', 'Nepal'],
  ['NI', 'Nicaragua'],
  ['NE', 'Níger'],
  ['NG', 'Nigeria'],
  ['NU', 'Niue'],
  ['NO', 'Noruega'],
  ['NC', 'Nueva Caledonia'],
  ['NZ', 'Nueva Zelanda'],
  ['OM', 'Omán'],
  ['NL', 'Países Bajos'],
  ['PK', 'Pakistán'],
  ['PW', 'Palaos'],
  ['PS', 'Palestina'],
  ['PA', 'Panamá'],
  ['PG', 'Papúa Nueva Guinea'],
  ['PY', 'Paraguay'],
  ['PE', 'Perú'],
  ['PF', 'Polinesia Francesa'],
  ['PL', 'Polonia'],
  ['PT', 'Portugal'],
  ['PR', 'Puerto Rico'],
  ['GB', 'Reino Unido'],
  ['CF', 'República Centroafricana'],
  ['CZ', 'República Checa'],
  ['CD', 'República Democrática del Congo'],
  ['DO', 'República Dominicana'],
  ['RE', 'Reunión'],
  ['RW', 'Ruanda'],
  ['RO', 'Rumanía'],
  ['RU', 'Rusia'],
  ['EH', 'Sáhara Occidental'],
  ['WS', 'Samoa'],
  ['AS', 'Samoa Americana'],
  ['BL', 'San Bartolomé'],
  ['KN', 'San Cristóbal y Nieves'],
  ['SM', 'San Marino'],
  ['MF', 'San Martín'],
  ['PM', 'San Pedro y Miquelón'],
  ['VC', 'San Vicente y las Granadinas'],
  ['SH', 'Santa Elena'],
  ['LC', 'Santa Lucía'],
  ['ST', 'Santo Tomé y Príncipe'],
  ['SN', 'Senegal'],
  ['RS', 'Serbia'],
  ['SC', 'Seychelles'],
  ['SL', 'Sierra Leona'],
  ['SG', 'Singapur'],
  ['SX', 'Sint Maarten'],
  ['SY', 'Siria'],
  ['SO', 'Somalia'],
  ['LK', 'Sri Lanka'],
  ['ZA', 'Sudáfrica'],
  ['SD', 'Sudán'],
  ['SS', 'Sudán del Sur'],
  ['SE', 'Suecia'],
  ['CH', 'Suiza'],
  ['SR', 'Surinam'],
  ['SJ', 'Svalbard y Jan Mayen'],
  ['TH', 'Tailandia'],
  ['TW', 'Taiwán'],
  ['TZ', 'Tanzania'],
  ['TJ', 'Tayikistán'],
  ['IO', 'Territorio Británico del Océano Índico'],
  ['TF', 'Territorios Australes Franceses'],
  ['TL', 'Timor Oriental'],
  ['TG', 'Togo'],
  ['TK', 'Tokelau'],
  ['TO', 'Tonga'],
  ['TT', 'Trinidad y Tobago'],
  ['TN', 'Túnez'],
  ['TM', 'Turkmenistán'],
  ['TR', 'Turquía'],
  ['TV', 'Tuvalu'],
  ['UA', 'Ucrania'],
  ['UG', 'Uganda'],
  ['UY', 'Uruguay'],
  ['UZ', 'Uzbekistán'],
  ['VU', 'Vanuatu'],
  ['VE', 'Venezuela'],
  ['VN', 'Vietnam'],
  ['WF', 'Wallis y Futuna'],
  ['YE', 'Yemen'],
  ['DJ', 'Yibuti'],
  ['ZM', 'Zambia'],
  ['ZW', 'Zimbabue'],
];

export const PAISES_UE = new Set([
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
]);

export const nombrePais = (codigo: string | null | undefined): string =>
  PAISES.find(([c]) => c === (codigo ?? '').toUpperCase())?.[1] ?? (codigo ?? '');

// ---------------------------------------------------------------------------
// Nombre del numero fiscal de un cliente o proveedor segun su pais
// ---------------------------------------------------------------------------

/**
 * Paises con un nombre propio para su numero fiscal (fuera de la UE). La
 * misma tabla que el servidor (domain/numero-fiscal.ts), que la usa en los
 * mensajes de los lectores, en las altas y en el PDF de la factura.
 */
const NOMBRE_NUMERO_FISCAL: Readonly<Record<string, string>> = {
  DO: 'RNC',
  US: 'EIN',
  MX: 'RFC',
  AR: 'CUIT',
  CL: 'RUT',
  UY: 'RUT',
  CO: 'NIT',
  PE: 'RUC',
  EC: 'RUC',
  VE: 'RIF',
  BR: 'CNPJ',
  MA: 'ICE',
  GB: 'VAT number',
  CH: 'UID (VAT)',
};
export const NUMERO_FISCAL_ESPANA = 'NIF';
export const NUMERO_FISCAL_UE = 'NIF-IVA (VAT)';
export const NUMERO_FISCAL_GENERICO = 'Número fiscal (Tax ID)';

/** 'el' -> 'GR', 'uk' -> 'GB', ' fr ' -> 'FR'. */
const paisIso = (pais: string | null | undefined): string => {
  const p = String(pais ?? '').trim().toUpperCase();
  return p === 'EL' ? 'GR' : p === 'UK' ? 'GB' : p;
};

/**
 * Como se llama el numero fiscal de un tercero de ese pais: «NIF» (España o
 * sin pais), «NIF-IVA (VAT)» (resto de la UE), «RNC», «EIN»... y, si no hay
 * uno propio, «Número fiscal (Tax ID)». El de la propia empresa es siempre NIF.
 */
export function nombreNumeroFiscal(pais: string | null | undefined): string {
  const p = paisIso(pais);
  if (!p || p === 'ES') return NUMERO_FISCAL_ESPANA;
  if (PAISES_UE.has(p)) return NUMERO_FISCAL_UE;
  return NOMBRE_NUMERO_FISCAL[p] ?? NUMERO_FISCAL_GENERICO;
}

/** El mismo nombre dentro de una frase: «Escribe el RNC del cliente», «el número fiscal (Tax ID) del cliente». */
export function numeroFiscalEnFrase(pais: string | null | undefined): string {
  const n = nombreNumeroFiscal(pais);
  return n === NUMERO_FISCAL_GENERICO ? 'número fiscal (Tax ID)' : n;
}

/** De donde es un cliente o proveedor: España, otro pais de la UE o fuera de la UE. */
export type OrigenTercero = 'ES' | 'UE' | 'FUERA';

/** Pais ISO-2 -> su lado (ES, UE o FUERA), o null si no hay pais. */
export function origenDePais(pais: string | null | undefined): OrigenTercero | null {
  const p = paisIso(pais);
  if (!/^[A-Z]{2}$/.test(p)) return null;
  if (p === 'ES') return 'ES';
  return PAISES_UE.has(p) ? 'UE' : 'FUERA';
}

/** El nombre del numero fiscal cuando quiza solo se sabe el lado (UE o fuera) y no el pais. */
export function nombreNumeroFiscalDe(origen: OrigenTercero | null | undefined, pais: string | null | undefined): string {
  if (pais) return nombreNumeroFiscal(pais);
  if (origen === 'UE') return NUMERO_FISCAL_UE;
  if (origen === 'FUERA') return NUMERO_FISCAL_GENERICO;
  return NUMERO_FISCAL_ESPANA;
}

/** «RNC 131123456»: el numero de un tercero con el nombre que tiene en su pais. */
export const conNombreNumeroFiscal = (nif: string | null | undefined, pais: string | null | undefined): string =>
  nif ? `${nombreNumeroFiscal(pais)} ${nif}` : '';

/** NIF-IVA con el prefijo de un Estado de la UE (FR..., DE..., EL para Grecia). Solo ayuda: el backend decide. */
export function pareceNifIvaUe(nif: string | null | undefined): boolean {
  const n = String(nif ?? '').toUpperCase().replace(/[\s.\-]/g, '');
  const m = /^([A-Z]{2})[0-9A-Z+*]{2,12}$/.exec(n);
  if (!m || !/\d/.test(n.slice(2))) return false;
  const prefijo = m[1] === 'EL' ? 'GR' : m[1];
  return PAISES_UE.has(prefijo) || m[1] === 'XI';
}

/**
 * Contexto fiscal de la empresa (y la sugerencia para un cliente): si es
 * espanola, sus tipos de operacion, monedas y moneda de cuenta. Si falla la
 * carga, `error` y contexto null: nunca se da por hecho que la empresa es
 * espanola.
 */
export function useContextoFiscal(customerId?: string): {
  contexto: ContextoFiscal | null;
  cargando: boolean;
  error: string;
} {
  const [contexto, setContexto] = useState<ContextoFiscal | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    const q = customerId ? `?customerId=${encodeURIComponent(customerId)}` : '';
    apiFetch<ContextoFiscal>(companyPath(`/income-invoices/tipos-operacion${q}`))
      .then((c) => {
        if (!vivo) return;
        setContexto(c);
        setError('');
      })
      .catch((e) => {
        if (!vivo) return;
        setError(errorMessage(e));
      })
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [customerId]);
  return { contexto, cargando, error };
}

/** Evento que avisa de que han cambiado los datos de la empresa activa (su pais, por ejemplo). */
export const EVENTO_DATOS_EMPRESA = 'conta:datos-empresa-actualizados';

/**
 * ¿La empresa activa esta establecida en Espana? Lee el pais de /legal-config,
 * que puede leer cualquier usuario de la empresa, con la misma regla que el
 * backend (esPaisEspana: vacio, ES o ESP). Se vuelve a leer con
 * EVENTO_DATOS_EMPRESA. null mientras carga o si falla (demo sin backend):
 * quien lo usa no oculta nada, y el servidor sigue impidiendo lo que no toca.
 */
export function useEmpresaEspanola(): boolean | null {
  const [espanola, setEspanola] = useState<boolean | null>(null);
  useEffect(() => {
    let vivo = true;
    const leer = () =>
      apiFetch<{ pais?: string | null }>(companyPath('/legal-config'))
        .then((cfg) => {
          const p = String(cfg?.pais ?? '').trim().toUpperCase();
          if (vivo) setEspanola(p === '' || p === 'ES' || p === 'ESP');
        })
        .catch(() => {
          if (vivo) setEspanola(null);
        });
    leer();
    window.addEventListener(EVENTO_DATOS_EMPRESA, leer);
    return () => {
      vivo = false;
      window.removeEventListener(EVENTO_DATOS_EMPRESA, leer);
    };
  }, []);
  return espanola;
}

/** Código del 409 de una venta cuya operación es de un periodo cuyo 303 presenta la gestoría. */
export const CODIGO_DEVENGO_FUERA = 'DEVENGO_FUERA_APP';

/**
 * Pasa a factura una venta (o registra una compra intracomunitaria) y, si el
 * servidor avisa de que su IVA es de un periodo cuyo 303 presenta la gestoría
 * (por ejemplo, una entrega de diciembre de 2026 facturada en enero), enseña el
 * aviso y repite con la confirmación.
 * Devuelve null si la persona no la confirma, y el aviso si se confirmó.
 */
export async function conDevengoFuera<T>(
  hacer: (extra: { confirmaDevengoFuera?: true }) => Promise<T>,
  pregunta = '¿La pasas a factura igualmente?',
): Promise<{ r: T; aviso: string | null } | null> {
  try {
    return { r: await hacer({}), aviso: null };
  } catch (e) {
    const d = e instanceof ApiError && e.detalles && typeof e.detalles === 'object' ? (e.detalles as { codigo?: unknown }) : null;
    if (!(e instanceof ApiError) || d?.codigo !== CODIGO_DEVENGO_FUERA) throw e;
    if (!window.confirm(`${e.message}

${pregunta}`)) return null;
    return { r: await hacer({ confirmaDevengoFuera: true }), aviso: e.message };
  }
}
