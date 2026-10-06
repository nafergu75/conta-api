/**
 * Modo dia (fondo blanco) o noche (fondo negro) del panel. Se guarda por
 * navegador; si el usuario no ha elegido, sigue al sistema operativo.
 * El script SCRIPT_TEMA (en app/layout.tsx) lo aplica antes de pintar.
 */
export type Tema = 'claro' | 'oscuro';
const CLAVE = 'tema';

export function temaGuardado(): Tema | null {
  try {
    const t = localStorage.getItem(CLAVE);
    return t === 'claro' || t === 'oscuro' ? t : null;
  } catch {
    return null;
  }
}

export function temaActual(): Tema {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) return 'oscuro';
  return 'claro';
}

export function aplicarTema(tema: Tema): void {
  document.documentElement.classList.toggle('dark', tema === 'oscuro');
  try {
    localStorage.setItem(CLAVE, tema);
  } catch {
    // Sin almacenamiento: dura hasta recargar.
  }
}

/** Se ejecuta en <head> antes de pintar, para que no parpadee en blanco. */
export const SCRIPT_TEMA = `try{var t=localStorage.getItem('${CLAVE}');if(t==='oscuro'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;
