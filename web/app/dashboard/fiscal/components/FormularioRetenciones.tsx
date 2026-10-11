'use client';

import { useEffect, useState } from 'react';
import { Download, FloppyDisk, WarningCircle } from '@phosphor-icons/react';
import { apiDownload, apiFetch, companyPath, errorMessage } from '@/lib/api';
import { formatoImporte } from '@/lib/moneda';

/**
 * Borrador del 111 o del 115 con las casillas y rótulos del formulario de la
 * AEAT. Sale de la misma declaración que el fichero para importar en la sede
 * (GET /impuestos/modelos/:id/txt): lo que se ve es lo que se descarga.
 */

export interface CasillaFormulario {
  numero: string;
  descripcion: string;
  valor: number;
  tipo: 'numero' | 'importe';
}

type TipoDeclaracion = 'I' | 'U' | 'G' | 'N';
type FormaPago = 'I' | 'U' | 'G';

export interface FormularioRetencionesDatos {
  modelo: '111' | '115';
  titulo: string;
  fuente: string;
  version: string;
  identificacion: { nif: string; apellidosODenominacion: string; nombre: string; ejercicio: number; periodo: string; personaFisica: boolean };
  columnas: string[];
  bloques: Array<{ titulo: string; filas: Array<{ rotulo: string; casillas: CasillaFormulario[] }> }>;
  total: Array<CasillaFormulario & { rotulo: string }>;
  liquidacion: {
    tipoDeclaracion: TipoDeclaracion;
    tipoDeclaracionTexto: string;
    formaPago: FormaPago;
    complementaria: boolean;
    justificanteAnterior: string;
    iban: string;
  };
  errores: string[];
  avisos: string[];
}

/** Casilla de la base del resultado, la de anteriores declaraciones y su clave guardada en Impuestos. */
const CLAVES: Record<'111' | '115', { base: string; anteriores: string; claveAnteriores: string; claveResultado: string }> = {
  '111': { base: '28', anteriores: '29', claveAnteriores: '29_resultado_anteriores', claveResultado: '30_resultado' },
  '115': { base: '03', anteriores: '04', claveAnteriores: '04_anteriores', claveResultado: '05_resultado' },
};

const FORMAS_PAGO: Array<{ valor: FormaPago; texto: string }> = [
  { valor: 'I', texto: 'Ingreso (pago con NRC o en el banco)' },
  { valor: 'U', texto: 'Domiciliación en la cuenta de la empresa' },
  { valor: 'G', texto: 'Ingreso a anotar en la cuenta corriente tributaria' },
];

const eur = (n: number) => formatoImporte(Number(n) || 0, 'EUR');
const centimos = (n: number) => Math.round((Number(n) || 0) * 100);

/** "1.234,56" o "1234.56" -> 1234.56 (NaN si no es un importe). */
function leerImporte(texto: string): number {
  const t = texto.trim().replace(/\s/g, '');
  if (!t) return 0;
  const normal = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  return /^\d+(\.\d{1,2})?$/.test(normal) ? Number(normal) : NaN;
}

function Casilla({ c, etiqueta }: { c: CasillaFormulario; etiqueta?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded border border-slate-300 bg-white px-2 py-1.5" title={c.descripcion}>
      <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 font-mono text-xs font-semibold text-white">{c.numero}</span>
      {etiqueta && <span className="min-w-0 flex-1 truncate text-xs text-slate-500 md:hidden">{etiqueta}</span>}
      <span className="font-mono text-sm text-slate-900">{c.tipo === 'numero' ? (Number(c.valor) || 0).toLocaleString('es-ES') : eur(c.valor)}</span>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-300">
      <h3 className="bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800">{titulo}</h3>
      <div className="space-y-3 p-3">{children}</div>
    </section>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-500">{etiqueta}</p>
      <p className="break-words font-mono text-sm text-slate-900">{valor || '—'}</p>
    </div>
  );
}

interface Props {
  formulario: FormularioRetencionesDatos;
  /** Id del ModeloImpuesto: el del fichero y el de las opciones del borrador. */
  modeloId: string;
  estado: string;
  /** Tras guardar las opciones, para volver a cargar el modelo. */
  onGuardado?: () => void;
}

export function FormularioRetenciones({ formulario: f, modeloId, estado, onGuardado }: Props) {
  const claves = CLAVES[f.modelo];
  const todas = [...f.bloques.flatMap((b) => b.filas.flatMap((fila) => fila.casillas)), ...f.total];
  const valor = (numero: string) => Number(todas.find((c) => c.numero === numero)?.valor ?? 0) || 0;
  const editable = estado === 'vigente';

  const [formaPago, setFormaPago] = useState<FormaPago>(f.liquidacion.formaPago);
  const [complementaria, setComplementaria] = useState(f.liquidacion.complementaria);
  const [justificante, setJustificante] = useState(f.liquidacion.justificanteAnterior);
  const [anteriores, setAnteriores] = useState(() => (valor(claves.anteriores) ? String(valor(claves.anteriores)).replace('.', ',') : ''));
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [errorDescarga, setErrorDescarga] = useState('');

  // Otro periodo u otro modelo: las opciones vuelven a las guardadas.
  useEffect(() => {
    setFormaPago(f.liquidacion.formaPago);
    setComplementaria(f.liquidacion.complementaria);
    setJustificante(f.liquidacion.justificanteAnterior);
    setAnteriores(valor(claves.anteriores) ? String(valor(claves.anteriores)).replace('.', ',') : '');
    setMensaje('');
    setErrorDescarga('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f]);

  const id = f.identificacion;
  const nombreFichero = `${f.modelo}_${id.ejercicio}_${id.periodo}.txt`;

  const guardarOpciones = async () => {
    setMensaje('');
    const importeAnteriores = complementaria ? leerImporte(anteriores) : 0;
    if (Number.isNaN(importeAnteriores)) {
      setMensaje(`El importe de la casilla [${claves.anteriores}] no es válido: escríbelo con coma para los céntimos (por ejemplo, 1250,50).`);
      return;
    }
    const casillas: Record<string, unknown> = {
      opcion_forma_pago: formaPago,
      opcion_complementaria: complementaria,
      opcion_justificante_anterior: complementaria ? justificante.replace(/\s/g, '') : '',
    };
    // [29] / [04] y el resultado solo cambian si cambia lo ingresado antes (si no, el modelo se sigue recalculando).
    if (centimos(importeAnteriores) !== centimos(valor(claves.anteriores))) {
      casillas[claves.claveAnteriores] = importeAnteriores;
      casillas[claves.claveResultado] = (centimos(valor(claves.base)) - centimos(importeAnteriores)) / 100;
    }
    try {
      setGuardando(true);
      await apiFetch(companyPath(`/impuestos/modelos/${modeloId}`), { method: 'PUT', body: JSON.stringify({ casillas }) });
      setMensaje('Guardado.');
      onGuardado?.();
    } catch (err) {
      setMensaje(errorMessage(err));
    } finally {
      setGuardando(false);
    }
  };

  const descargar = async () => {
    setErrorDescarga('');
    try {
      await apiDownload(companyPath(`/impuestos/modelos/${modeloId}/txt`), nombreFichero);
    } catch (err) {
      setErrorDescarga(errorMessage(err));
    }
  };

  const conColumnas = f.columnas.length > 1;

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 md:p-6">
      <div>
        <h2 className="font-semibold text-slate-900">{f.titulo}</h2>
        <p className="mt-1 text-xs text-slate-500">
          Borrador con las casillas del formulario de la AEAT. Diseño de registro: {f.fuente} ({f.version}).
        </p>
      </div>

      <Seccion titulo="Identificación">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Dato etiqueta="NIF" valor={id.nif} />
          <Dato etiqueta={id.personaFisica ? 'Apellidos' : 'Apellidos y nombre o razón social'} valor={id.apellidosODenominacion} />
          <Dato etiqueta="Nombre" valor={id.nombre} />
        </div>
      </Seccion>

      <Seccion titulo="Devengo">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Dato etiqueta="Ejercicio" valor={String(id.ejercicio)} />
          <Dato etiqueta="Periodo" valor={id.periodo} />
        </div>
      </Seccion>

      <Seccion titulo="Liquidación">
        {f.bloques.map((b) => (
          <div key={b.titulo} className="space-y-2">
            {f.bloques.length > 1 && <p className="text-sm font-medium text-slate-800">{b.titulo}</p>}
            {conColumnas && (
              <div className="hidden gap-2 text-xs text-slate-500 md:grid md:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,11rem))]">
                <span />
                {f.columnas.map((col) => (
                  <span key={col} className="text-right">
                    {col}
                  </span>
                ))}
              </div>
            )}
            {b.filas.map((fila) => (
              <div
                key={fila.rotulo}
                className={`grid grid-cols-1 items-center gap-2 ${conColumnas ? 'md:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,11rem))]' : 'md:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]'}`}
              >
                <span className="text-sm text-slate-700">{fila.rotulo}</span>
                {fila.casillas.map((c, i) => (
                  <Casilla key={c.numero} c={c} etiqueta={conColumnas ? f.columnas[i] : undefined} />
                ))}
              </div>
            ))}
          </div>
        ))}
        <div className="space-y-2 border-t border-slate-200 pt-3">
          {f.total.map((t) => (
            <div key={t.numero} className="grid grid-cols-1 items-center gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
              <span className="text-sm text-slate-700">{t.rotulo}</span>
              <Casilla c={t} />
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Declaración complementaria">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Dato etiqueta="Complementaria" valor={f.liquidacion.complementaria ? 'X' : 'No'} />
          <Dato etiqueta="Nº de justificante de la declaración anterior" valor={f.liquidacion.justificanteAnterior} />
        </div>
      </Seccion>

      <Seccion titulo="Tipo de declaración y forma de pago">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Dato etiqueta="Tipo de declaración" valor={`${f.liquidacion.tipoDeclaracion} · ${f.liquidacion.tipoDeclaracionTexto}`} />
          {f.liquidacion.tipoDeclaracion === 'U' && <Dato etiqueta="Domiciliación: IBAN" valor={f.liquidacion.iban} />}
        </div>
      </Seccion>

      {f.errores.length > 0 && (
        <div role="alert" className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <p className="flex items-center gap-2 font-medium">
            <WarningCircle size={18} aria-hidden /> Así no se puede generar el fichero:
          </p>
          <ul className="list-disc space-y-1 pl-6">
            {f.errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {f.avisos.length > 0 && (
        <ul className="list-disc space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 pl-8 text-sm text-amber-800">
          {f.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      {editable && (
        <details className="rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-800">Forma de pago y complementaria</summary>
          <div className="mt-3 space-y-3">
            <div>
              <label htmlFor={`fp-${f.modelo}`} className="block text-sm font-medium text-slate-700">
                Forma de pago
              </label>
              <select
                id={`fp-${f.modelo}`}
                value={formaPago}
                onChange={(e) => setFormaPago(e.target.value as FormaPago)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:w-auto"
              >
                {FORMAS_PAGO.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.texto}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">Si el resultado es 0, la declaración sale como negativa (N). La domiciliación usa la cuenta bancaria activa de la empresa.</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={complementaria} onChange={(e) => setComplementaria(e.target.checked)} />
              Es una declaración complementaria
            </label>
            {complementaria && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor={`just-${f.modelo}`} className="block text-sm font-medium text-slate-700">
                    Nº de justificante de la declaración anterior
                  </label>
                  <input
                    id={`just-${f.modelo}`}
                    inputMode="numeric"
                    maxLength={13}
                    value={justificante}
                    onChange={(e) => setJustificante(e.target.value.replace(/\D/g, ''))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                    placeholder="13 cifras"
                  />
                </div>
                <div>
                  <label htmlFor={`ant-${f.modelo}`} className="block text-sm font-medium text-slate-700">
                    [{claves.anteriores}] Ingresado en la declaración anterior
                  </label>
                  <input
                    id={`ant-${f.modelo}`}
                    inputMode="decimal"
                    value={anteriores}
                    onChange={(e) => setAnteriores(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                    placeholder="0,00"
                  />
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={guardarOpciones}
              disabled={guardando}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <FloppyDisk size={18} aria-hidden />
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
            {mensaje && (
              <p role="status" className="text-sm text-slate-700">
                {mensaje}
              </p>
            )}
          </div>
        </details>
      )}

      <div className="space-y-2">
        <button
          type="button"
          onClick={descargar}
          disabled={f.errores.length > 0}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download size={18} aria-hidden />
          Descargar el fichero para la AEAT ({nombreFichero})
        </button>
        <p className="text-xs text-slate-500">
          En la sede, abre el formulario del modelo {f.modelo} y usa «Importar» con este fichero. Revisa las casillas antes de presentar.
        </p>
        {errorDescarga && (
          <p role="alert" className="text-sm text-red-700">
            {errorDescarga}
          </p>
        )}
      </div>
    </div>
  );
}
