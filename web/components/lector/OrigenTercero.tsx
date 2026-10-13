'use client';

import { useId } from 'react';
import { nombrePais, NUMERO_FISCAL_GENERICO, origenDePais, PAISES, PAISES_UE, type OrigenTercero as Origen } from '@/lib/fiscal';
import type { EleccionOrigen, InfoTercero, LectorPantalla } from '@/lib/lecturas';

/**
 * «¿De dónde es el cliente?» (o «el proveedor»), en los dos lectores: antes de
 * subir la factura y, despues de leerla, en el panel de lo leido.
 *
 * Tres opciones (De España, De otro país de la UE y De fuera de la UE) y, en
 * las dos ultimas, el pais (opcional: si no se elige, el servidor lo toma de la
 * direccion leida). Lo elegido manda en las validaciones del servidor: de
 * España exige un NIF español valido; de la UE, un NIF-IVA; de fuera de la UE
 * acepta cualquier identificacion o ninguna (queda para revisar).
 *
 * La ultima eleccion de cada lector se recuerda en el navegador.
 */

const OPCIONES: Array<{ valor: Origen; texto: string; ayuda: string }> = [
  { valor: 'ES', texto: 'De España', ayuda: 'Con NIF español' },
  { valor: 'UE', texto: 'De otro país de la UE', ayuda: 'Con NIF-IVA (VAT)' },
  { valor: 'FUERA', texto: 'De fuera de la UE', ayuda: 'Con su número fiscal (RNC, EIN…) o sin él' },
];

export const ORIGEN_POR_DEFECTO: EleccionOrigen = { origen: 'ES', pais: 'ES' };

const CLAVE = (lector: LectorPantalla) => `conta:lector-origen:${lector}`;

/** Lo elegido, con el pais solo si es de ese lado (en ES, siempre 'ES'). */
export function eleccionValida(origen: unknown, pais: unknown): EleccionOrigen | null {
  if (origen !== 'ES' && origen !== 'UE' && origen !== 'FUERA') return null;
  if (origen === 'ES') return ORIGEN_POR_DEFECTO;
  const p = typeof pais === 'string' ? pais.trim().toUpperCase() : '';
  return { origen, pais: p && origenDePais(p) === origen ? p : null };
}

/** La ultima eleccion de ese lector en este navegador; si no la hay (o no se puede leer), De España. */
export function eleccionRecordada(lector: LectorPantalla): EleccionOrigen {
  try {
    const crudo = window.localStorage.getItem(CLAVE(lector));
    if (!crudo) return ORIGEN_POR_DEFECTO;
    const e = JSON.parse(crudo) as { origen?: unknown; pais?: unknown };
    return eleccionValida(e?.origen, e?.pais) ?? ORIGEN_POR_DEFECTO;
  } catch {
    return ORIGEN_POR_DEFECTO;
  }
}

/** Guarda la eleccion para la proxima factura de ese lector. Si el navegador no deja, no pasa nada. */
export function recordarEleccion(lector: LectorPantalla, e: EleccionOrigen): void {
  try {
    window.localStorage.setItem(CLAVE(lector), JSON.stringify(e));
  } catch {
    // Sin almacenamiento (ventana privada, bloqueado): se queda De España la proxima vez.
  }
}

const DE_DONDE: Record<Origen, string> = { ES: 'De España', UE: 'De otro país de la UE', FUERA: 'De fuera de la UE' };
const DE_DONDE_FRASE: Record<Origen, string> = { ES: 'de España', UE: 'de otro país de la UE', FUERA: 'de fuera de la UE' };

const POR: Record<string, string> = {
  ficha: 'de su ficha',
  prefijo: 'de su NIF-IVA',
  direccion: 'de la dirección leída',
  forma: 'de su NIF',
};

/**
 * La misma pregunta despues de leer, en el panel de lo leido: cambiarla vuelve
 * a comprobar los datos (sin leer otra vez la factura). Si lo leido no casa
 * con lo elegido (se eligio De España y la factura trae un NIF-IVA francés o
 * una direccion en Francia, o al reves), un aviso propone cambiarlo con un boton.
 */
export function OrigenTerceroLeido({
  tipo,
  tercero,
  valor,
  onCambiar,
  cambiando,
  error,
}: {
  tipo: 'cliente' | 'proveedor';
  tercero: InfoTercero | undefined;
  valor: EleccionOrigen;
  onCambiar: (e: EleccionOrigen) => void;
  cambiando: boolean;
  error: string;
}) {
  const propuesta = tercero?.contradiccion ?? null;
  const paisPropuesto = propuesta?.pais ? nombrePais(propuesta.pais) : null;
  // El pais con que se ha comprobado, si no lo ha elegido la persona: de donde sale.
  const paisDeducido = tercero?.pais && tercero.origen !== 'ES' && !valor.pais ? `${nombrePais(tercero.pais)} (${POR[tercero.detectado.por ?? ''] ?? 'de la factura'})` : null;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <OrigenTercero
        tipo={tipo}
        valor={valor}
        onCambiar={onCambiar}
        disabled={cambiando}
        ayuda="Si lo cambias, se vuelven a comprobar los datos leídos, sin leer otra vez la factura."
      />
      {paisDeducido && (
        <p className="text-sm text-slate-600">
          País: <span className="font-medium text-slate-900">{paisDeducido}</span>
          {tercero?.numeroFiscal && tercero.numeroFiscal !== NUMERO_FISCAL_GENERICO ? ` · su número fiscal es el ${tercero.numeroFiscal}` : ''}
        </p>
      )}
      {/* Siempre en la página (sr-only si no hay nada): así el lector de pantalla anuncia la comprobación. */}
      <p role="status" className={cambiando ? 'text-sm text-slate-600' : 'sr-only'}>
        {cambiando ? 'Comprobando otra vez los datos leídos…' : ''}
      </p>
      {propuesta && !cambiando && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 break-words">
            La factura parece de un {tipo} {propuesta.origen !== 'ES' && paisPropuesto ? `de ${paisPropuesto}` : DE_DONDE_FRASE[propuesta.origen]}.
          </p>
          <button
            type="button"
            onClick={() => onCambiar(propuesta.origen === 'ES' ? ORIGEN_POR_DEFECTO : { origen: propuesta.origen, pais: propuesta.pais })}
            className="shrink-0 self-start rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-semibold text-amber-800 hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600"
          >
            Cambiar a «{DE_DONDE[propuesta.origen]}»{paisPropuesto && propuesta.origen !== 'ES' ? ` (${paisPropuesto})` : ''}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}

interface Props {
  tipo: 'cliente' | 'proveedor';
  valor: EleccionOrigen;
  onCambiar: (e: EleccionOrigen) => void;
  disabled?: boolean;
  /** Texto bajo la pregunta (p. ej., que cambiarlo vuelve a comprobar la factura). */
  ayuda?: string;
}

export default function OrigenTercero({ tipo, valor, onCambiar, disabled = false, ayuda }: Props) {
  const id = useId();
  const paises = valor.origen === 'UE' ? PAISES.filter(([c]) => c !== 'ES' && PAISES_UE.has(c)) : PAISES.filter(([c]) => !PAISES_UE.has(c));
  const elegir = (origen: Origen) => {
    if (origen === valor.origen) return;
    // Al cambiar de lado, el pais que habia (del otro lado) se quita.
    onCambiar(origen === 'ES' ? ORIGEN_POR_DEFECTO : { origen, pais: null });
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p id={`${id}-titulo`} className="text-sm font-semibold text-slate-900">
          ¿De dónde es el {tipo}?
        </p>
        {ayuda && (
          <p id={`${id}-ayuda`} className="mt-0.5 text-xs text-slate-600">
            {ayuda}
          </p>
        )}
      </div>
      <div role="radiogroup" aria-labelledby={`${id}-titulo`} aria-describedby={ayuda ? `${id}-ayuda` : undefined} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {OPCIONES.map((o) => {
          const elegida = valor.origen === o.valor;
          return (
            <label
              key={o.valor}
              className={`flex min-w-0 items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent-600 has-[:focus-visible]:ring-offset-1 ${
                elegida ? 'border-accent-600 bg-emerald-50 text-slate-900' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
            >
              <input
                type="radio"
                name={`${id}-origen`}
                value={o.valor}
                checked={elegida}
                disabled={disabled}
                onChange={() => elegir(o.valor)}
                aria-labelledby={`${id}-${o.valor}-texto`}
                aria-describedby={`${id}-${o.valor}-ayuda`}
                className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
              />
              <span className="min-w-0">
                <span id={`${id}-${o.valor}-texto`} className="block font-medium">
                  {o.texto}
                </span>
                <span id={`${id}-${o.valor}-ayuda`} className="block text-xs text-slate-500">
                  {o.ayuda}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {valor.origen !== 'ES' && (
        <div>
          <label htmlFor={`${id}-pais`} className="mb-1 block text-sm font-medium text-slate-700">
            País del {tipo} <span className="font-normal text-slate-500">(opcional)</span>
          </label>
          <select
            id={`${id}-pais`}
            value={valor.pais ?? ''}
            disabled={disabled}
            onChange={(e) => onCambiar({ origen: valor.origen, pais: e.target.value || null })}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-accent-600 focus:outline-none focus:ring-2 focus:ring-accent-600 disabled:opacity-60"
          >
            {/* Corto: tiene que caber en el móvil. */}
            <option value="">Sin elegir (sale de la factura)</option>
            {paises.map(([c, n]) => (
              <option key={c} value={c}>
                {n}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
