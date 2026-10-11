'use client';

import { CheckCircle, Info, QrCode, ShieldCheck, Sparkle, Warning, WarningCircle } from '@phosphor-icons/react';
import {
  CAMPO_QR,
  claveTexto,
  etiquetaCampo,
  nivelConfianza,
  qrConProblema,
  textoCompletadosQr,
  textoDiferenciaQr,
  valorLegible,
  type EstadoCampo,
  type InfoLectura,
  type LectorPantalla,
} from '@/lib/lecturas';

/**
 * Resultado de una lectura: con que se leyo, la confianza, el QR VERI*FACTU,
 * los datos que hay que comprobar (con su motivo) y la casilla "He revisado".
 * El color siempre va con texto: nunca se distingue un estado solo por color.
 */

const INSIGNIA = 'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium';

/** Orden en el que se ensenan los campos marcados. */
const ORDEN = [
  'tipoDocumento',
  'emisor.nif',
  'emisor.nombre',
  'receptor.nif',
  'receptor.nombre',
  'numero',
  'fechaEmision',
  'fechaVencimiento',
  'moneda',
  'desglose',
  'retencion.tipo',
  'retencion.importe',
  'totales.base',
  'totales.cuotaIva',
  'totales.totalFactura',
  'totales.totalAPagar',
  'rectificativa.numeroRectificada',
  'iban',
  'concepto',
];

function posicion(id: string): number {
  const i = ORDEN.indexOf(id.startsWith('desglose.') ? 'desglose' : id);
  return i === -1 ? ORDEN.length : i;
}

function claseConfianza(c: number): string {
  if (c >= 0.8) return `${INSIGNIA} border-emerald-200 bg-emerald-50 text-emerald-700`;
  if (c >= 0.6) return `${INSIGNIA} border-amber-200 bg-amber-50 text-amber-800`;
  return `${INSIGNIA} border-rose-200 bg-rose-50 text-rose-700`;
}

interface Props {
  info: InfoLectura;
  lector: LectorPantalla;
  revisado: boolean;
  onRevisado: (v: boolean) => void;
  /** false: sin la casilla "He revisado" (la factura no se puede registrar de todos modos). */
  conCasilla?: boolean;
  /** Campos con un error que no se arregla cambiando el dato (rectificativa, duplicada). */
  sinArreglo?: string[];
}

/** Lo que pone cada tarjeta. En ventas no se puede cambiar nada: solo comprobar. */
function etiquetaEstado(lector: LectorPantalla, error: boolean, arreglable: boolean): string {
  if (lector === 'ventas') return error ? 'Impide registrarla' : 'Compruébalo';
  if (error) return arreglable ? 'Hay que corregirlo' : 'No se puede registrar';
  return 'Revísalo';
}

/** Un aviso general que habla del QR: ya lo cuenta el recuadro del QR. */
const hablaDelQr = (m: string) => /\bQR\b/.test(m);

/** El motivo ya dice lo que trae el QR: la sugerencia lo repetiria. */
const mencionaQr = (c: EstadoCampo) => c.motivos.some((m) => m.includes('QR VERI*FACTU'));

export default function PanelLectura({ info, lector, revisado, onRevisado, conCasilla = true, sinArreglo = [] }: Props) {
  const entradas = Object.entries(info.campos).filter((e): e is [string, EstadoCampo] => !!e[1]);
  const variosTramos = entradas.some(([id]) => /^desglose\.[1-9]/.test(id));
  const marcados = entradas
    .filter(([, c]) => c.estado !== 'ok')
    .sort((a, b) => (a[1].estado === b[1].estado ? posicion(a[0]) - posicion(b[0]) : a[1].estado === 'error' ? -1 : 1));
  const qr = info.qr;
  const qrMal = qrConProblema(qr);
  const completados = qr.completados ?? [];
  // Lo sacado del QR no se ha comprobado con nada: no cuenta como "sin problemas" aunque llegue en ok.
  const delQr = new Set<string>(completados.map((c) => CAMPO_QR[c]));
  const comprobados = entradas.filter(([id, c]) => c.estado === 'ok' && !delQr.has(id)).length;
  const completadosConTarjeta = completados.every((c) => marcados.some(([id]) => id === CAMPO_QR[c]));
  // Lo marcado sin dato (archivo ya registrado...). Si habla del QR y el recuadro del QR ya sale, no se repite.
  const generales = (info.generales ?? []).filter((g) => g.nivel !== 'ok' && !(qrMal && hablaDelQr(g.mensaje)));
  const textosGenerales = new Set((info.generales ?? []).map((g) => claveTexto(g.mensaje)));
  // Los avisos traen tambien los generales: aqui solo los que no salen ya arriba.
  const avisos = info.avisos.filter((a) => !textosGenerales.has(claveTexto(a)) && claveTexto(a) !== claveTexto(qr.texto));
  const hayErrores = marcados.some(([, c]) => c.estado === 'error') || generales.some((g) => g.nivel === 'error');
  const hayBloqueos = marcados.some(([id, c]) => c.estado === 'error' && sinArreglo.includes(id));
  const nadaRaro = marcados.length === 0 && generales.length === 0 && !qrMal && completados.length === 0;
  const pct = info.confianza !== null ? Math.round(info.confianza * 100) : null;
  // Las diferencias del QR que tienen su tarjeta (casi siempre todas).
  const marcadosQr = qr.diferencias.every((d) => marcados.some(([id]) => id === CAMPO_QR[d.campo]));

  return (
    <section aria-label="Resultado de la lectura" className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm">
      {/* Con que se leyo, confianza y QR */}
      <div className="flex flex-wrap items-center gap-2">
        <span className={`${INSIGNIA} border-slate-200 bg-slate-50 text-slate-700`}>
          <Sparkle size={14} weight="duotone" aria-hidden="true" />
          {info.textoOrigen}
        </span>
        {pct !== null && info.confianza !== null && (
          <span className={claseConfianza(info.confianza)}>
            Confianza {nivelConfianza(info.confianza).toLowerCase()} · {pct} %
          </span>
        )}
        {/* Verde solo si todo lo del QR se ha cotejado con lo leido. */}
        {qr.estado === 'COINCIDE' && completados.length === 0 && (
          <span className={`${INSIGNIA} border-emerald-200 bg-emerald-50 text-emerald-700`}>
            <ShieldCheck size={14} weight="fill" aria-hidden="true" />
            Coincide con el QR
          </span>
        )}
        {qr.estado === 'COINCIDE' && completados.length > 0 && (
          <span className={`${INSIGNIA} border-amber-200 bg-amber-50 text-amber-800`}>
            <QrCode size={14} weight="bold" aria-hidden="true" />
            {completados.length === 1 ? 'Un dato sale del QR' : 'Datos sacados del QR'}
          </span>
        )}
        {qrMal && (
          <span className={`${INSIGNIA} border-amber-200 bg-amber-50 text-amber-800`}>
            <Warning size={14} weight="fill" aria-hidden="true" />
            {qr.pruebas ? 'QR de pruebas' : qr.estado === 'NO_COINCIDE' ? 'El QR no coincide' : 'QR ilegible'}
          </span>
        )}
      </div>

      {info.respaldo?.texto && <p className="text-xs text-slate-500">{info.respaldo.texto}</p>}

      {qr.estado === 'COINCIDE' && completados.length === 0 && <p className="text-xs text-slate-600">{qr.texto}</p>}
      {qr.estado === 'COINCIDE' && completados.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
          <p className="flex items-start gap-2">
            <QrCode size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{textoCompletadosQr(completados, lector, completadosConTarjeta)}</span>
          </p>
        </div>
      )}
      {qrMal && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
          <p className="flex items-start gap-2">
            <QrCode size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{qr.texto}</span>
          </p>
          {/* Cada diferencia sale en su tarjeta de "Comprueba estos datos": aqui no se repite. */}
          {qr.diferencias.length > 0 && (
            <p className="mt-1 pl-[26px]">
              {marcadosQr ? 'Mira abajo los datos que no coinciden.' : `${qr.diferencias.map(textoDiferenciaQr).join('. ')}.`}
            </p>
          )}
        </div>
      )}
      {(qr.estado === 'SIN_QR' || qr.estado === 'AJENO') && <p className="text-xs text-slate-500">{qr.texto}</p>}

      {/* Resumen */}
      {nadaRaro ? (
        <p className="flex items-start gap-2 text-emerald-700">
          <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>No se ha encontrado nada raro. Échale un vistazo antes de registrarla.</span>
        </p>
      ) : marcados.length === 0 && generales.length === 0 ? null : (
        <div className="flex flex-col gap-2">
          <p className={`flex items-start gap-2 font-semibold ${hayErrores ? 'text-rose-700' : 'text-amber-800'}`}>
            <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              {marcados.length > 0 ? 'Comprueba estos datos' : generales.length === 1 ? 'Revisa este aviso' : 'Revisa estos avisos'}
              {hayErrores ? (lector === 'gastos' && !hayBloqueos ? ': hay alguno que tienes que corregir antes de registrarla.' : ': hay alguno que impide registrarla.') : '.'}
            </span>
          </p>
          <ul className="flex flex-col gap-2">
            {generales.map((g, i) => {
              const error = g.nivel === 'error';
              return (
                <li key={`general-${i}`} className={`rounded-lg border p-3 ${error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="min-w-0 break-words font-semibold">{g.mensaje}</span>
                    <span className="text-xs font-semibold uppercase tracking-wide">{etiquetaEstado(lector, error, false)}</span>
                  </div>
                </li>
              );
            })}
            {marcados.map(([id, c]) => {
              const error = c.estado === 'error';
              const confianza = c.confianza !== null && c.confianza < 0.8 ? Math.round(c.confianza * 100) : null;
              // "· confianza 62 %" sobra si el motivo ya lo dice.
              const verConfianza = confianza !== null && !c.motivos.some((m) => m.includes(`${confianza} %`));
              return (
                <li key={id} className={`rounded-lg border p-3 ${error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="font-semibold">{etiquetaCampo(id, lector, variosTramos, c.tipoIva)}</span>
                    <span className="text-xs font-semibold uppercase tracking-wide">{etiquetaEstado(lector, error, !sinArreglo.includes(id))}</span>
                  </div>
                  <p className="mt-1 break-words">
                    {c.fuente === 'qr' && (c.confianza !== 1 || delQr.has(id)) ? 'Sacado del QR' : 'Leído'}: <span className="font-medium">{valorLegible(id, c.valorLeido)}</span>
                    {verConfianza && <span className="text-xs"> · confianza {confianza} %</span>}
                  </p>
                  {c.motivos.length > 0 && (
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">
                      {c.motivos.map((m, i) => (
                        <li key={i} className="break-words">
                          {m}
                        </li>
                      ))}
                    </ul>
                  )}
                  {c.sugerencia && !mencionaQr(c) && <p className="mt-1 break-words font-medium">{c.sugerencia}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {comprobados > 0 && (
        <p className="text-xs text-slate-500">
          {comprobados === 1 ? '1 dato comprobado sin problemas.' : `${comprobados} datos comprobados sin problemas.`}
        </p>
      )}

      {avisos.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-800">
          <p className="mb-1 flex items-center gap-2 font-semibold">
            <Info size={16} weight="fill" aria-hidden="true" /> Ten en cuenta
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            {avisos.map((a, i) => (
              <li key={i} className="break-words">
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {info.requiereRevision && conCasilla && (
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 font-medium text-slate-800">
          <input
            type="checkbox"
            checked={revisado}
            onChange={(e) => onRevisado(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
          />
          <span>{lector === 'ventas' ? 'He comprobado que los datos marcados son correctos' : 'He revisado los datos marcados'}</span>
        </label>
      )}
    </section>
  );
}
