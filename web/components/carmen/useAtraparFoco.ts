'use client';

import { useEffect } from 'react';

const ENFOCABLES =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Mientras `activo`, el tabulador no sale de `ref` (ventana modal) y Esc llama
 * a `alEscape`. Devolver el foco al cerrar es cosa de quien abre.
 */
export function useAtraparFoco(ref: React.RefObject<HTMLElement>, activo: boolean, alEscape: () => void): void {
  useEffect(() => {
    if (!activo) return;
    const alPulsar = (e: KeyboardEvent) => {
      const nodo = ref.current;
      if (!nodo) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        // Los modales de las pantallas (nóminas, administración...) escuchan Esc en
        // window: sin esto, cerrar Carmen cerraría también el que haya debajo.
        e.stopPropagation();
        alEscape();
        return;
      }
      if (e.key !== 'Tab') return;
      const focos = Array.from(nodo.querySelectorAll<HTMLElement>(ENFOCABLES)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (!focos.length) return;
      const primero = focos[0];
      const ultimo = focos[focos.length - 1];
      const dentro = nodo.contains(document.activeElement);
      if (e.shiftKey && (!dentro || document.activeElement === primero)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && (!dentro || document.activeElement === ultimo)) {
        e.preventDefault();
        primero.focus();
      }
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [ref, activo, alEscape]);
}
