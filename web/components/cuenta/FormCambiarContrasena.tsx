'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Eye, EyeSlash } from '@phosphor-icons/react';
import { ApiError, apiFetch, campoDelError, errorMessage } from '@/lib/api';
import { clearSession, type EmpresaSesion, type SessionUser } from '@/lib/auth';

/**
 * Respuesta de POST /auth/cambiar-contrasena (la misma forma que el login):
 * tokens NUEVOS, porque los anteriores dejan de valer al cambiar la contrasena.
 */
export interface ResultadoLogin {
  token: string;
  refreshToken?: string;
  user: Partial<SessionUser> & { id?: string; email?: string };
  empresas?: EmpresaSesion[];
  empresaSeleccionada?: string | null;
}

interface Props {
  /** true: contrasena provisional, no se puede usar nada mas hasta cambiarla. */
  obligatorio: boolean;
  /** Para que el gestor de contrasenas guarde la nueva con el email correcto. */
  email?: string;
  onHecho: (r: ResultadoLogin) => void;
}

const MINIMO = 12;

const CLASE_INPUT =
  'w-full min-h-[44px] rounded-lg border border-slate-300 px-3.5 py-2.5 pr-24 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600 focus:border-accent-600';

type Campo = 'actual' | 'nueva' | 'repetida';
const ORDEN_CAMPOS: readonly Campo[] = ['actual', 'nueva', 'repetida'];

/**
 * Texto del error del servidor para un campo. En la pantalla obligatoria el
 * campo se llama «Contraseña provisional»: el servidor habla de «la actual», y
 * eso a quien acaba de entrar con la que le dieron no le dice nada.
 */
function textoErrorCampo(campo: 'actual' | 'nueva', mensaje: string, obligatorio: boolean): string {
  if (!obligatorio) return mensaje;
  if (campo === 'actual') {
    return 'No coincide con la contraseña provisional que te dio el administrador. Escríbela tal cual: distingue mayúsculas y minúsculas.';
  }
  if (/distinta de la actual/i.test(mensaje)) return 'Tiene que ser distinta de la contraseña provisional.';
  return mensaje;
}

/**
 * Formulario para poner una contrasena propia. Lo usan la pantalla obligatoria
 * de /cambiar-contrasena y, mas adelante, Configuracion (obligatorio = false).
 */
export default function FormCambiarContrasena({ obligatorio, email, onHecho }: Props) {
  const id = useId();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [haCambiadoFuera, setHaCambiadoFuera] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // Cada envio con errores sube el contador: tras pintarlos, el foco va al
  // primer campo con error y el lector de pantalla lee su mensaje (aria-describedby).
  const [fallosEnvio, setFallosEnvio] = useState(0);
  const refs = {
    actual: useRef<HTMLInputElement>(null),
    nueva: useRef<HTMLInputElement>(null),
    repetida: useRef<HTMLInputElement>(null),
  };

  useEffect(() => {
    if (fallosEnvio === 0) return;
    const primero = ORDEN_CAMPOS.find((c) => errores[c]);
    if (primero) refs[primero].current?.focus();
    // Solo tras un envio fallido, no con cada tecla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallosEnvio]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErrorGeneral(null);
    setHaCambiadoFuera(false);

    const nuevosErrores: Partial<Record<Campo, string>> = {};
    if (!actual) nuevosErrores.actual = obligatorio ? 'Escribe la contraseña provisional.' : 'Escribe tu contraseña actual.';
    if (nueva.length < MINIMO) nuevosErrores.nueva = `Tiene que tener al menos ${MINIMO} caracteres.`;
    if (!nuevosErrores.nueva && repetida !== nueva) nuevosErrores.repetida = 'Las dos contraseñas nuevas no coinciden.';
    setErrores(nuevosErrores);
    if (Object.keys(nuevosErrores).length > 0) {
      setFallosEnvio((n) => n + 1);
      return;
    }

    setEnviando(true);
    try {
      const r = await apiFetch<ResultadoLogin>('/auth/cambiar-contrasena', {
        method: 'POST',
        body: JSON.stringify({ actual, nueva }),
      });
      setActual('');
      setNueva('');
      setRepetida('');
      onHecho(r);
    } catch (err) {
      const campo = campoDelError(err);
      if (campo === 'actual' || campo === 'nueva') {
        setErrores({ [campo]: textoErrorCampo(campo, errorMessage(err), obligatorio) });
        setFallosEnvio((n) => n + 1);
      } else if (err instanceof ApiError && err.status === 409) {
        setHaCambiadoFuera(true);
        setErrorGeneral(errorMessage(err));
      } else if (err instanceof ApiError && err.status === 429) {
        setErrorGeneral('Demasiados intentos. Espera unos minutos y vuelve a probar.');
      } else {
        setErrorGeneral(errorMessage(err));
      }
    } finally {
      setEnviando(false);
    }
  }

  function volverAEntrar() {
    clearSession();
    window.location.replace('/login');
  }

  const faltan = nueva.length > 0 && nueva.length < MINIMO ? MINIMO - nueva.length : 0;

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
      {/* Para el gestor de contrasenas: asocia la nueva al email de esta cuenta. */}
      <input type="email" name="username" autoComplete="username" value={email ?? ''} readOnly hidden />

      {errorGeneral && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <p>{errorGeneral}</p>
          {haCambiadoFuera && (
            <button
              type="button"
              onClick={volverAEntrar}
              className="mt-2 w-full min-h-[44px] rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-700"
            >
              Volver a entrar
            </button>
          )}
        </div>
      )}

      <CampoClave
        id={`${id}-actual`}
        etiqueta={obligatorio ? 'Contraseña provisional' : 'Contraseña actual'}
        valor={actual}
        onChange={setActual}
        autoComplete="current-password"
        error={errores.actual}
        inputRef={refs.actual}
        ayuda={obligatorio ? 'La misma con la que acabas de entrar. Distingue mayúsculas y minúsculas.' : undefined}
      />
      <CampoClave
        id={`${id}-nueva`}
        etiqueta="Contraseña nueva"
        valor={nueva}
        onChange={setNueva}
        autoComplete="new-password"
        error={errores.nueva}
        inputRef={refs.nueva}
        ayuda={
          <>
            Al menos {MINIMO} caracteres. Una frase que te sea fácil de recordar vale más que una palabra rara. No puede ser
            tu email ni la que tienes ahora.
            {faltan > 0 && (
              <span className="mt-1 block text-amber-700">
                {faltan === 1 ? 'Falta 1 carácter.' : `Faltan ${faltan} caracteres.`}
              </span>
            )}
          </>
        }
      />
      <CampoClave
        id={`${id}-repetida`}
        etiqueta="Repite la contraseña nueva"
        valor={repetida}
        onChange={setRepetida}
        autoComplete="new-password"
        error={errores.repetida}
        inputRef={refs.repetida}
      />

      <button
        type="submit"
        disabled={enviando}
        className="mt-2 w-full min-h-[44px] py-2.5 bg-accent-600 text-white font-semibold rounded-lg hover:bg-accent-700 active:scale-[0.98] transition-all disabled:opacity-60 disabled:pointer-events-none"
      >
        {enviando ? 'Guardando…' : obligatorio ? 'Guardar y entrar' : 'Guardar contraseña'}
      </button>
    </form>
  );
}

function CampoClave({
  id,
  etiqueta,
  valor,
  onChange,
  autoComplete,
  error,
  ayuda,
  inputRef,
}: {
  id: string;
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  autoComplete: 'current-password' | 'new-password';
  error?: string;
  ayuda?: React.ReactNode;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const [visible, setVisible] = useState(false);
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const describe = [error ? idError : null, ayuda ? idAyuda : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {etiqueta}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type={visible ? 'text' : 'password'}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          maxLength={128}
          aria-invalid={error ? true : undefined}
          aria-describedby={describe}
          className={CLASE_INPUT}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-controls={id}
          className="absolute inset-y-0 right-0 flex min-w-[44px] items-center gap-1 rounded-r-lg px-3 text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          {visible ? <EyeSlash size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      {error && (
        // role=alert: se anuncia aunque el foco ya estuviera en este campo (Intro dentro de él).
        <p id={idError} role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}
      {ayuda && (
        <p id={idAyuda} className="text-xs text-slate-500">
          {ayuda}
        </p>
      )}
    </div>
  );
}
