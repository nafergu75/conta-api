'use client';

import { CheckCircle, Info, QrCode, ShieldCheck, Sparkle, Warning, WarningCircle } from '@phosphor-icons/react';
import {
  etiquetaCampo,
  nivelConfianza,
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
}

export default function PanelLectura({ info, lector, revisado, onRevisado }: Props) {
  const entradas = Object.entries(info.campos).filter((e): e is [string, EstadoCampo] => !!e[1]);
  const variosTramos = entradas.some(([id]) => /^desglose\.[1-9]/.test(id));
  const marcados = entradas
    .filter(([, c]) => c.estado !== 'ok')
    .sort((a, b) => (a[1].estado === b[1].estado ? posicion(a[0]) - posicion(b[0]) : a[1].estado === 'error' ? -1 : 1));
  const comprobados = entradas.length - marcados.length;
  const hayErrores = marcados.some(([, c]) => c.estado === 'error');
  const qr = info.qr;
  const pct = info.confianza !== null ? Math.round(info.confianza * 100) : null;

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
        {qr.estado === 'COINCIDE' && (
          <span className={`${INSIGNIA} border-emerald-200 bg-emerald-50 text-emerald-700`} title={qr.texto}>
            <ShieldCheck size={14} weight="fill" aria-hidden="true" />
            QR verificado
          </span>
        )}
        {(qr.estado === 'NO_COINCIDE' || qr.estado === 'ILEGIBLE') && (
          <span className={`${INSIGNIA} border-amber-200 bg-amber-50 text-amber-800`}>
            <Warning size={14} weight="fill" aria-hidden="true" />
            {qr.estado === 'NO_COINCIDE' ? 'El QR no coincide' : 'QR ilegible'}
          </span>
        )}
      </div>

      {info.respaldo?.texto && <p className="text-xs text-slate-500">{info.respaldo.texto}</p>}

      {qr.estado === 'COINCIDE' && <p className="text-xs text-slate-600">{qr.texto}</p>}
      {(qr.estado === 'NO_COINCIDE' || qr.estado === 'ILEGIBLE') && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
          <p className="flex items-start gap-2">
            <QrCode size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{qr.texto}</span>
          </p>
          {qr.diferencias.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-9">
              {qr.diferencias.map((d) => (
                <li key={d.campo} className="break-words">
                  {textoDiferenciaQr(d)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {(qr.estado === 'SIN_QR' || qr.estado === 'AJENO') && <p className="text-xs text-slate-500">{qr.texto}</p>}

      {/* Resumen */}
      {marcados.length === 0 ? (
        <p className="flex items-start gap-2 text-emerald-700">
          <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>No se ha encontrado nada raro. Échale un vistazo antes de registrarla.</span>
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className={`flex items-start gap-2 font-semibold ${hayErrores ? 'text-rose-700' : 'text-amber-800'}`}>
            <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              Comprueba estos datos
              {hayErrores ? (lector === 'gastos' ? ': hay alguno que tienes que corregir antes de registrarla.' : ': hay alguno que impide registrarla.') : '.'}
            </span>
          </p>
          <ul className="flex flex-col gap-2">
            {marcados.map(([id, c]) => {
              const error = c.estado === 'error';
              return (
                <li key={id} className={`rounded-lg border p-3 ${error ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="font-semibold">{etiquetaCampo(id, lector, variosTramos)}</span>
                    <span className="text-xs font-semibold uppercase tracking-wide">{error ? 'Hay que corregirlo' : 'Revísalo'}</span>
                  </div>
                  <p className="mt-1 break-words">
                    Leído: <span className="font-medium">{valorLegible(id, c.valorLeido)}</span>
                    {c.confianza !== null && c.confianza < 0.8 && <span className="text-xs"> · confianza {Math.round(c.confianza * 100)} %</span>}
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
                  {c.sugerencia && <p className="mt-1 break-words font-medium">{c.sugerencia}</p>}
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

      {info.avisos.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-800">
          <p className="mb-1 flex items-center gap-2 font-semibold">
            <Info size={16} weight="fill" aria-hidden="true" /> Ten en cuenta
          </p>
          <ul className="list-disc space-y-0.5 pl-5">
            {info.avisos.map((a, i) => (
              <li key={i} className="break-words">
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {info.requiereRevision && (
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 font-medium text-slate-800">
          <input
            type="checkbox"
            checked={revisado}
            onChange={(e) => onRevisado(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
          />
          <span>He revisado los datos marcados</span>
        </label>
      )}
    </section>
  );
}
