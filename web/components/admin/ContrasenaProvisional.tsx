'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy, WarningCircle } from '@phosphor-icons/react';

interface Props {
  /** La contrasena que ha generado el servidor. Solo vive en el estado de quien la muestra. */
  contrasena: string;
  /** A quien hay que pasarsela. */
  email: string;
  /** Si se pasa, se pinta el boton «Hecho». */
  onHecho?: () => void;
  /** Donde se genera otra si se pierde (cambia segun la pantalla). */
  comoGenerarOtra?: string;
}

/**
 * Contrasena provisional recien generada: se ensena UNA vez, como texto (no en
 * un campo de contrasena, para que el navegador no ofrezca guardarla para el
 * administrador), con el boton Copiar. Nunca se guarda en el navegador.
 */
export default function ContrasenaProvisional({
  contrasena,
  email,
  onHecho,
  comoGenerarOtra = 'Si se pierde, genera otra desde su ficha con «Generar contraseña provisional».',
}: Props) {
  const texto = useRef<HTMLElement>(null);
  const [copiada, setCopiada] = useState(false);
  const [aMano, setAMano] = useState(false);
  const botonCopiar = useRef<HTMLButtonElement>(null);

  // Al aparecer, el boton que la genero (o el de «Crear usuario») ya no existe y
  // el foco se iria al cuerpo de la pagina: se lleva a «Copiar».
  useEffect(() => {
    botonCopiar.current?.focus();
  }, []);

  useEffect(() => {
    if (!copiada) return;
    const t = window.setTimeout(() => setCopiada(false), 2000);
    return () => window.clearTimeout(t);
  }, [copiada]);

  const seleccionar = () => {
    const el = texto.current;
    const sel = typeof window !== 'undefined' ? window.getSelection() : null;
    if (!el || !sel) return;
    const rango = document.createRange();
    rango.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(rango);
  };

  const copiar = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('sin portapapeles');
      await navigator.clipboard.writeText(contrasena);
      setAMano(false);
      setCopiada(true);
    } catch {
      seleccionar();
      setAMano(true);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center">
        <code
          ref={texto}
          translate="no"
          className="min-w-0 flex-1 select-all break-all font-mono text-lg text-slate-900"
          aria-label="Contraseña provisional"
        >
          {contrasena}
        </code>
        <button
          ref={botonCopiar}
          type="button"
          onClick={copiar}
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-lg bg-accent-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-accent-700 active:scale-[0.98]"
        >
          {copiada ? <Check size={16} weight="bold" aria-hidden /> : <Copy size={16} aria-hidden />}
          {copiada ? 'Copiada' : 'Copiar'}
        </button>
      </div>
      {/* Una sola region que se anuncia: «copiada» solo para el lector; «a mano», tambien a la vista. */}
      <p role="status" className={aMano && !copiada ? 'text-sm text-slate-600' : 'sr-only'}>
        {copiada ? 'Contraseña copiada.' : aMano ? 'No se ha podido copiar. Selecciónala y cópiala a mano.' : ''}
      </p>

      <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden />
        <span className="min-w-0 break-words">
          Esta contraseña es provisional y solo se enseña ahora. Pásasela a {email} por un medio distinto del correo, por ejemplo en persona
          o por teléfono. La primera vez que entre tendrá que cambiarla por una suya, que tú no conocerás.
        </span>
      </p>
      <p className="text-xs text-slate-500">{comoGenerarOtra}</p>

      {onHecho && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onHecho}
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:w-auto"
          >
            Hecho
          </button>
        </div>
      )}
    </div>
  );
}
