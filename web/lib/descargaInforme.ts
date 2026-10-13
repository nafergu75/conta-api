import { ApiError } from '@/lib/api';

/**
 * Nombre legible para el fichero de un informe, con sus partes separadas por
 * guiones: «Mayor del cliente Bar Pepe SL - 2026.pdf». Conserva las tildes y
 * quita solo lo que Windows no admite en un nombre de fichero.
 */
export function nombreDescarga(partes: Array<string | number | null | undefined>, formato: 'pdf' | 'xlsx'): string {
  const base = partes
    .map((p) => String(p ?? '').trim())
    .filter(Boolean)
    .join(' - ')
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150)
    .replace(/[\s.]+$/, '');
  return `${base || 'Informe'}.${formato}`;
}

/** Lo que se le dice a la persona cuando no se puede descargar un informe, con el motivo. */
export function motivoDescarga(e: unknown, formato: 'pdf' | 'xlsx'): string {
  const que = formato === 'pdf' ? 'el PDF' : 'el Excel';
  if (e instanceof ApiError) {
    if (e.status >= 500) return `No se ha podido descargar ${que}: el servidor ha fallado al prepararlo. Inténtalo de nuevo en un momento.`;
    // Sin explicacion del servidor, apiDownload solo sabe el codigo HTTP.
    if (e.message.startsWith('No se pudo descargar')) return `No se ha podido descargar ${que} (error ${e.status}). Inténtalo de nuevo.`;
    return `No se ha podido descargar ${que}: ${e.message}`;
  }
  // fetch lanza TypeError cuando no llega al servidor (sin conexión, corte de red).
  if (e instanceof TypeError) return `No se ha podido descargar ${que}: no hay conexión con el servidor. Comprueba la conexión e inténtalo de nuevo.`;
  return `No se ha podido descargar ${que}${e instanceof Error && e.message ? `: ${e.message}` : '.'}`;
}
