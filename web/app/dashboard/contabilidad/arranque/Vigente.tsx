'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowCounterClockwise, BookOpen, FileArrowUp } from '@phosphor-icons/react';
import { errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import {
  ANIO_GESTORIA,
  arranqueApi,
  EJERCICIO_ARRANQUE,
  fechaEs,
  RUTA_INMOVILIZADO,
  type CargaBreve,
  type ComprobacionesArranque,
  type PuntoComprobacion,
} from '@/lib/arranque';
import { Bloque, boton, botonPeligro, botonSecundario, campo, enlace, MensajeComprobacion, Nota } from './comun';
import { DatosBancos, DatosFiscalesForm } from './DatosAMano';

const A = ANIO_GESTORIA;
const E = EJERCICIO_ARRANQUE;

const ESTADO_VERSION: Record<string, string> = {
  CONFIRMADA: 'Vigente',
  SUSTITUIDA: 'Sustituida',
  DESHECHA: 'Deshecha',
  APLICANDO: 'A medias',
};

/** Nombre de cada punto aceptado, para la lista (la clave es técnica). */
const NOMBRE_PUNTO: Record<string, string> = {
  'bancos:extracto': 'Saldo del extracto de los bancos',
  'bancos:cuenta': 'Cuentas de bancos sin enlazar',
  'bancos:diferencia': 'Diferencia entre el banco y la contabilidad',
  'iva:303-4t': 'Resultado del 303 del 4T',
  'iva:compensar': 'Cuotas de IVA a compensar',
  'empresa:datos': 'Datos de la empresa',
  'series:2027': `Series de ${EJERCICIO_ARRANQUE}`,
  'terceros:sin-ficha': 'Clientes o proveedores sin ficha',
  'resultado-declarado': `Resultado de ${ANIO_GESTORIA}`,
  'cartera:cuadre': 'Facturas pendientes que no cuadran',
};
const nombrePunto = (clave: string) => NOMBRE_PUNTO[clave] ?? (clave.startsWith('falta:') ? 'Fichero que falta' : 'Aviso');

/** Aceptar un punto de «Faltan datos» con un motivo (solo el administrador). */
function AceptarAviso({ p, onAceptado }: { p: PuntoComprobacion; onAceptado: (c: ComprobacionesArranque) => void }) {
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  if (!abierto) {
    return (
      <button type="button" className="mt-1 text-xs font-medium text-slate-600 underline-offset-2 hover:underline" onClick={() => setAbierto(true)}>
        No hace falta: aceptarlo con un motivo
      </button>
    );
  }
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
      <label className="block text-xs font-medium text-slate-600">
        ¿Por qué no hace falta? (queda guardado)
        <input className={campo} value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} />
      </label>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          className={`${boton} px-3 py-1.5 text-xs`}
          disabled={ocupado || motivo.trim().length < 3}
          onClick={async () => {
            setOcupado(true);
            setError('');
            try {
              onAceptado(await arranqueApi.aceptarAviso(p.clave, motivo.trim()));
            } catch (e) {
              setError(errorMessage(e));
              setOcupado(false);
            }
          }}
        >
          Aceptar
        </button>
        <button type="button" className="text-xs font-medium text-slate-600 hover:underline" onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/**
 * La contabilidad de 2026 ya traída: versión, comprobaciones en vivo (con lo
 * que falta y dónde se completa), bancos y datos fiscales, consulta de 2026,
 * cargar el cierre definitivo o más ficheros, deshacer e historial.
 */
export function Vigente({
  vigente,
  versiones,
  hayBorrador,
  puedeEditar,
  esAdmin,
  onNuevaCarga,
  onDeshacer,
}: {
  vigente: CargaBreve;
  versiones: CargaBreve[];
  hayBorrador: boolean;
  puedeEditar: boolean;
  esAdmin: boolean;
  onNuevaCarga: (tipo: 'PROVISIONAL' | 'DEFINITIVA') => void;
  onDeshacer: () => void;
}) {
  const user = getUser();
  const puedeBancos = tieneAlgunPermiso(user, ['tesoreria:write', 'contabilidad:write']);
  const puedeFiscales = tieneAlgunPermiso(user, ['impuestos:write', 'contabilidad:write']);
  const puedeSeries = tieneAlgunPermiso(user, ['ventas:write']);
  const [comp, setComp] = useState<ComprobacionesArranque | null>(null);
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setComp(await arranqueApi.comprobaciones());
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  // Otra versión vigente (tras deshacer o traer otra): sus comprobaciones son otras.
  useEffect(() => {
    setComp(null);
    setHecho('');
    cargar();
  }, [cargar, vigente.id, vigente.confirmadaEn]);

  const crearSeries = async () => {
    setOcupado(true);
    setError('');
    try {
      const r = await arranqueApi.series();
      setHecho(r.texto);
      await cargar();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOcupado(false);
    }
  };

  /** Lo que se puede hacer desde cada punto: enlace o botón. */
  const accionDe = (p: PuntoComprobacion) => {
    const partes = [];
    if (p.clave === 'series:2027' || p.clave === 'series:anteriores') {
      if (puedeSeries)
        partes.push(
          <button key="s" type="button" className={`${botonSecundario} mt-2 px-3 py-1.5 text-xs`} disabled={ocupado} onClick={crearSeries}>
            Crear series {E}
          </button>,
        );
    }
    if (p.clave === 'empresa:datos')
      partes.push(
        <Link key="e" href="/dashboard/empresa" className={`${enlace} mt-1 inline-block text-xs`}>
          Ir a Datos de la empresa
        </Link>,
      );
    if (p.clave === 'terceros:sin-ficha')
      partes.push(
        <Link key="t" href="/dashboard/contabilidad/puesta-en-marcha" className={`${enlace} mt-1 inline-block text-xs`}>
          Enlazar en Puesta en marcha
        </Link>,
      );
    if (p.clave === 'ejercicio:2027')
      partes.push(
        <Link key="j" href="/dashboard/configuracion/ejercicios" className={`${enlace} mt-1 inline-block text-xs`}>
          Ir a Ejercicios y periodos
        </Link>,
      );
    if (p.clave.startsWith('bancos:') || p.clave.startsWith('iva:'))
      partes.push(
        <a key="b" href={p.clave.startsWith('bancos:') ? '#bancos' : '#impuestos'} className={`${enlace} mt-1 inline-block text-xs`}>
          Completarlo más abajo
        </a>,
      );
    if (esAdmin && p.nivel === 'FALTA') partes.push(<AceptarAviso key="a" p={p} onAceptado={setComp} />);
    return partes.length ? <div className="flex flex-col items-start">{partes}</div> : null;
  };

  const anteriores = versiones.filter((v) => v.id !== vigente.id);
  const noUsados = vigente.ficherosNoUsados ?? [];
  const usados = vigente.ficheros.filter((f) => !noUsados.includes(f.nombre));

  return (
    <div className="space-y-4">
      <Bloque
        titulo={`Contabilidad de ${A} traída`}
        extra={
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${vigente.tipo === 'DEFINITIVA' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
            {vigente.tipo === 'DEFINITIVA' ? 'Cierre definitivo' : 'Apertura provisional'}
          </span>
        }
      >
        <p className="text-sm text-slate-700">
          Versión {vigente.version}
          {vigente.confirmadaEn ? `, traída el ${fechaEs(vigente.confirmadaEn)}` : ''}, con {usados.length === 1 ? '1 fichero' : `${usados.length} ficheros`}:{' '}
          <span className="break-words text-slate-600">{usados.map((f) => f.nombre).join(', ')}</span>.
          {noUsados.length > 0 && <span className="break-words text-slate-600"> No se usaron: {noUsados.join(', ')}.</span>}
        </p>
        {vigente.tipo === 'PROVISIONAL' && (
          <p className="mt-2 text-sm text-slate-600">
            Cuando la gestoría cierre {A}, carga el cierre definitivo: la app compara subcuenta a subcuenta y ajusta la apertura (o añade un asiento de ajuste si enero ya está
            bloqueado).
          </p>
        )}
        {puedeEditar && !hayBorrador && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {vigente.tipo === 'PROVISIONAL' && (
              <button type="button" className={boton} onClick={() => onNuevaCarga('DEFINITIVA')}>
                <FileArrowUp size={16} /> Cargar el cierre definitivo
              </button>
            )}
            <button type="button" className={botonSecundario} onClick={() => onNuevaCarga(vigente.tipo)}>
              Añadir o cambiar ficheros
            </button>
            <button type="button" className={botonPeligro} onClick={onDeshacer}>
              <ArrowCounterClockwise size={16} /> Deshacer la carga
            </button>
          </div>
        )}
      </Bloque>

      {error && <Nota tipo="error">{error}</Nota>}
      {hecho && <Nota tipo="bien">{hecho}</Nota>}

      {comp ? (
        <MensajeComprobacion nivel={comp.nivel} mensaje={comp.mensaje} puntos={comp.puntos} accionDe={accionDe} />
      ) : (
        !error && <p className="text-sm text-slate-500">Comprobando…</p>
      )}

      {comp?.aceptados && comp.aceptados.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <summary className="cursor-pointer font-medium text-slate-700">Avisos aceptados ({comp.aceptados.length})</summary>
          <ul className="mt-2 space-y-1 text-slate-600">
            {comp.aceptados.map((a) => (
              <li key={a.clave}>
                {nombrePunto(a.clave)}: «{a.motivo}» ({fechaEs(a.en)})
              </li>
            ))}
          </ul>
        </details>
      )}

      {comp?.bancos && comp.bancos.length > 0 && (
        <div id="bancos">
          <DatosBancos
            bancos={comp.bancos}
            puedeEditar={puedeBancos}
            ocupado={ocupado}
            puntos={comp.puntos.filter((p) => p.clave.startsWith('bancos:'))}
            onGuardar={async (b) => {
              setOcupado(true);
              try {
                setComp(await arranqueApi.bancos(b));
                setHecho('Bancos guardados.');
              } finally {
                setOcupado(false);
              }
            }}
          />
        </div>
      )}
      {comp && (
        <div id="impuestos">
          <DatosFiscalesForm
            datos={comp.datosFiscales}
            resultadoDeclarado={comp.resultadoDeclarado}
            conResultado
            puedeEditar={puedeFiscales}
            ocupado={ocupado}
            puntos={comp.puntos.filter((p) => p.clave.startsWith('iva:') || p.clave.startsWith('resultado-declarado'))}
            onGuardar={async ({ datosFiscales, resultadoDeclarado }) => {
              setOcupado(true);
              try {
                setComp(await arranqueApi.datosFiscales({ ...datosFiscales, ...(resultadoDeclarado !== undefined ? { resultadoDeclarado } : {}) }));
                setHecho('Cifras guardadas.');
              } finally {
                setOcupado(false);
              }
            }}
          />
        </div>
      )}

      <Bloque titulo={`Consultar ${A}`}>
        <p className="text-sm text-slate-600">
          {A} es de solo lectura: no se puede apuntar nada con fecha de {A}. En los informes, elige el ejercicio {A}.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ['sumas', 'Sumas y saldos'],
              ['mayor', 'Libro mayor'],
              ['diario', 'Libro diario'],
              ['balance', 'Balance de situación'],
              ['pyg', 'Pérdidas y ganancias'],
            ] as const
          ).map(([tipo, nombre]) => (
            <li key={tipo}>
              <Link href={`/dashboard/informes?tipo=${tipo}`} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50">
                <BookOpen size={18} className="shrink-0 text-emerald-600" /> {nombre}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/dashboard/mayor-terceros" className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50">
              <BookOpen size={18} className="shrink-0 text-emerald-600" /> Mayor de clientes y proveedores
            </Link>
          </li>
          <li>
            <Link href={RUTA_INMOVILIZADO} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50">
              <BookOpen size={18} className="shrink-0 text-emerald-600" /> Inmovilizado y amortización
            </Link>
          </li>
        </ul>
      </Bloque>

      {anteriores.length > 0 && (
        <Bloque titulo="Versiones anteriores">
          <ul className="divide-y divide-slate-100 text-sm">
            {anteriores.map((v) => (
              <li key={v.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span className="text-slate-800">
                  Versión {v.version} · {v.tipo === 'DEFINITIVA' ? 'definitiva' : 'provisional'}
                  {v.confirmadaEn ? ` · ${fechaEs(v.confirmadaEn)}` : ''}
                </span>
                <span className="text-xs text-slate-500">{ESTADO_VERSION[v.estado] ?? v.estado}</span>
              </li>
            ))}
          </ul>
        </Bloque>
      )}
    </div>
  );
}
