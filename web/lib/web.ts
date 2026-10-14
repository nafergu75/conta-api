/**
 * Web de un cliente o de un proveedor. El servidor la guarda sin espacios y
 * con https:// (o http://) delante, y rechaza lo que no es una web.
 */

/** Ejemplo que se ensena en la casilla y en su ayuda. */
export const EJEMPLO_WEB = 'www.empresa.com';

/** Largo maximo (el de la columna del servidor). */
export const LARGO_MAXIMO_WEB = 255;

const PROTOCOLO = /^https?:\/\//i;

/**
 * Direccion para el enlace: la guardada, o con https:// si no lo lleva. Asi
 * el enlace nunca es otra cosa que una pagina web (ni javascript: ni similar).
 * null sin web.
 */
export function hrefWeb(web: string | null | undefined): string | null {
  const w = (web ?? '').trim();
  if (!w) return null;
  return PROTOCOLO.test(w) ? w : `https://${w.replace(/^\/+/, '')}`;
}

/** Como se ensena: sin https:// ni la barra final («www.empresa.com»). */
export function textoWeb(web: string | null | undefined): string {
  return (web ?? '').trim().replace(PROTOCOLO, '').replace(/\/$/, '');
}
