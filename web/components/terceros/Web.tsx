'use client';

import { ArrowSquareOut, Globe, WarningCircle } from '@phosphor-icons/react';
import { EJEMPLO_WEB, hrefWeb, LARGO_MAXIMO_WEB, textoWeb } from '@/lib/web';

/**
 * Web de un cliente o de un proveedor: la casilla de las altas y las fichas,
 * y el enlace que sale en la ficha y en los listados.
 */

/**
 * Enlace a la web del tercero. Se abre en una pestaña nueva, sin que esa
 * pagina pueda tocar la de la app (rel noopener). Sin web, nada.
 */
export function EnlaceWeb({ web, className = '' }: { web: string | null | undefined; className?: string }) {
  const href = hrefWeb(web);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex max-w-full items-center gap-1.5 rounded font-medium text-accent-700 underline underline-offset-2 hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 ${className}`}
    >
      <Globe size={14} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-all">{textoWeb(web)}</span>
      <ArrowSquareOut size={12} className="shrink-0" aria-hidden="true" />
      <span className="sr-only"> (se abre en una pestaña nueva)</span>
    </a>
  );
}

/**
 * Casilla «Web». Acepta la web con o sin https:// (el servidor se lo pone).
 * El error del servidor para este campo sale debajo, junto a la casilla; sin
 * error, el ejemplo.
 */
export function CampoWeb({
  id,
  value,
  onChange,
  error,
  claseEtiqueta,
  claseCampo,
}: {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Motivo del servidor si la web no es valida (details.campo = 'web'). */
  error?: string | null;
  claseEtiqueta: string;
  claseCampo: string;
}) {
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  return (
    <>
      <label htmlFor={id} className={claseEtiqueta}>
        Web
      </label>
      <input
        id={id}
        // De texto (no «url»): el navegador no la rechaza por escribirla sin https://.
        type="text"
        inputMode="url"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder={EJEMPLO_WEB}
        maxLength={LARGO_MAXIMO_WEB}
        value={value}
        onChange={onChange}
        aria-invalid={!!error}
        aria-describedby={error ? idError : idAyuda}
        className={claseCampo}
      />
      {error ? (
        <p id={idError} role="alert" className="mt-1 flex items-start gap-1.5 text-sm text-rose-700">
          <WarningCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">{error}</span>
        </p>
      ) : (
        <p id={idAyuda} className="mt-1 text-xs text-slate-500">
          Por ejemplo, {EJEMPLO_WEB}
        </p>
      )}
    </>
  );
}
