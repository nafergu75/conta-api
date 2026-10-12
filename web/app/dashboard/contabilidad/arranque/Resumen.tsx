'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { ArrowRight } from '@phosphor-icons/react';
import { ApiError, errorMessage } from '@/lib/api';
import {
  ANIO_GESTORIA,
  arranqueApi,
  codigoDelError,
  EJERCICIO_ARRANQUE,
  eur,
  fechaEs,
  numero,
  varios,
  type AjustesCarga,
  type EstadoFase,
  type FicheroCarga,
  type PuntoComprobacion,
  type RespuestaCarga,
  type VistaCarga,
} from '@/lib/arranque';
import { Bloque, boton, botonSecundario, campo, Cifra, Cifras, Dialogo, irA, MensajeComprobacion, Nota } from './comun';
import { DatosBancos, DatosFiscalesForm } from './DatosAMano';
import { HojaTarjeta, ListaFicheros } from './Hojas';
import { SubirFicheros } from './SubirFicheros';

const A = ANIO_GESTORIA;
const E = EJERCICIO_ARRANQUE;

const TEXTO_ORIGEN: Record<string, string> = {
  FACTURA_INGRESO: 'facturas de venta',
  FACTURA_GASTO: 'facturas de compra',
  TESORERIA: 'cobros y pagos',
  NOMINA: 'nóminas',
  NOMINA_PAGO: 'pagos de nóminas',
  SEG_SOCIAL: 'seguros sociales',
  APERTURA: 'apertura',
  IMPORTACION: 'importados',
  AJUSTE_MANUAL: 'asientos a mano',
  AMORTIZACION: 'amortización',
};

const TEXTO_TIPO_SS: Record<string, string> = {
  SIN_REGULARIZAR: 'sin regularizar: el resultado sale de los grupos 6 y 7 y va a la 129',
  REGULARIZADO: 'regularizado: el resultado ya está en la 129',
  CON_CIERRE: 'con el asiento de cierre (todo a cero): no sirve',
};

const ACCION_TERCERO: Record<string, string> = {
  enlazar: 'Se enlaza con su ficha',
  crear: 'Se crea la ficha',
  pendiente: 'Queda pendiente',
  'ya-enlazada': 'Ya estaba enlazada',
  'no-se-enlaza': 'Se queda como cuenta',
};

/** Lista larga plegada: los primeros N y «ver todo». */
function Plegable<T>({ items, n = 10, render }: { items: T[]; n?: number; render: (x: T, i: number) => ReactNode }) {
  const [todo, setTodo] = useState(false);
  const vistos = todo ? items : items.slice(0, n);
  return (
    <>
      {vistos.map(render)}
      {items.length > n && (
        <li>
          <button type="button" className="mt-1 text-xs font-medium text-emerald-700 hover:underline" onClick={() => setTodo((v) => !v)}>
            {todo ? 'Ver menos' : `Ver los ${numero(items.length)}`}
          </button>
        </li>
      )}
    </>
  );
}

/**
 * Resumen único del borrador: qué se ha reconocido en cada fichero, qué
 * haría cada fase, los datos que se escriben a mano y la comprobación en tres
 * niveles. Un solo botón trae todo.
 */
export function Resumen({
  carga,
  vista,
  avisosSubida,
  puedeEditar,
  puedeConfirmar,
  onAnalizado,
  onRecargar,
  onConfirmada,
}: {
  carga: { id: string; version: number; ficheros: FicheroCarga[] };
  vista: VistaCarga | null;
  avisosSubida: string[];
  puedeEditar: boolean;
  puedeConfirmar: boolean;
  onAnalizado: (r: RespuestaCarga) => void;
  onRecargar: () => void;
  onConfirmada: (c: { cargaId: string; version: number; fases: EstadoFase[] }) => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [carteraTodo, setCarteraTodo] = useState(false);

  const analizar = async (ajustes: AjustesCarga) => {
    setOcupado(true);
    setError('');
    setAviso('');
    try {
      onAnalizado(await arranqueApi.analizar(carga.id, ajustes));
    } catch (e) {
      setError(errorMessage(e));
      throw e;
    } finally {
      setOcupado(false);
    }
  };
  const analizarSinLanzar = (a: AjustesCarga) => analizar(a).catch(() => undefined);
  /** Desde los formularios de datos a mano: el error lo enseña el propio formulario. */
  const analizarDesdeForm = async (a: AjustesCarga) => {
    setOcupado(true);
    setAviso('');
    try {
      onAnalizado(await arranqueApi.analizar(carga.id, a));
    } finally {
      setOcupado(false);
    }
  };

  const quitar = async (sha: string, nombre: string) => {
    if (!window.confirm(`¿Quitar «${nombre}» de la carga?`)) return;
    setOcupado(true);
    setError('');
    try {
      await arranqueApi.quitarFichero(carga.id, sha);
      if (carga.ficheros.length > 1) onAnalizado(await arranqueApi.analizar(carga.id, {}));
      else onRecargar();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOcupado(false);
    }
  };

  const confirmar = async () => {
    if (!vista) return;
    setOcupado(true);
    setError('');
    try {
      const c = await arranqueApi.confirmar(carga.id, vista.huella);
      setConfirmando(false);
      onConfirmada(c);
    } catch (e) {
      setConfirmando(false);
      const codigo = codigoDelError(e);
      if (e instanceof ApiError && e.status === 409 && (codigo === 'HUELLA_CAMBIADA' || codigo === 'CARGA_CON_ERRORES')) {
        // Algo ha cambiado (un cliente nuevo, el plan, los permisos de quien analizó): se vuelve a analizar.
        try {
          onAnalizado(await arranqueApi.analizar(carga.id, {}));
          setAviso(`${e.message} El resumen ya está al día.`);
        } catch (e2) {
          setError(errorMessage(e2));
        }
      } else setError(errorMessage(e));
    } finally {
      setOcupado(false);
    }
  };

  const terceros = useMemo(() => {
    const lista = vista?.terceros.lista ?? [];
    return soloPendientes ? lista.filter((t) => t.accion === 'pendiente' || t.accion === 'crear') : lista;
  }, [vista, soloPendientes]);

  if (!vista) {
    // Borrador sin resumen (por ejemplo, si falló el análisis): se pueden añadir ficheros o volver a analizar.
    return (
      <Bloque titulo="Ficheros subidos">
        <ListaFicheros ficheros={carga.ficheros} puedeEditar={puedeEditar} ocupado={ocupado} onQuitar={quitar} />
        {puedeEditar && (
          <div className="mt-3">
            <SubirFicheros compacta texto={carga.ficheros.length ? 'Añadir más ficheros' : 'Suelta aquí los ficheros de la gestoría o haz clic para elegirlos'} onSubido={onAnalizado} />
          </div>
        )}
        {puedeEditar && carga.ficheros.length > 0 && (
          <button type="button" className={`${boton} mt-3`} disabled={ocupado} onClick={() => analizarSinLanzar({})}>
            Analizar los ficheros
          </button>
        )}
        {error && (
          <div className="mt-3">
            <Nota tipo="error">{error}</Nota>
          </div>
        )}
      </Bloque>
    );
  }

  const c = vista.comprobaciones;
  /** Puntos que se arreglan escribiendo algo más abajo: llevan un botón que baja hasta el formulario. */
  const deBancos = (p: PuntoComprobacion) => p.clave.startsWith('bancos:');
  const deFiscales = (p: PuntoComprobacion) => p.clave.startsWith('iva:') || p.clave.startsWith('resultado-declarado');
  const accionDe = (p: PuntoComprobacion) => {
    const destino = deBancos(p) && vista.bancos?.length ? 'bancos' : deFiscales(p) ? 'impuestos' : null;
    if (!destino || !puedeEditar) return null;
    return (
      <button type="button" className="mt-1 text-xs font-medium text-emerald-700 hover:underline" onClick={() => irA(destino)}>
        Escribirlo
      </button>
    );
  };
  const p = vista.plan;
  const t = vista.terceros.resumen;
  const masasCuadran = vista.apertura ? Math.round((vista.apertura.masas.activo - vista.apertura.masas.patrimonioNeto - vista.apertura.masas.pasivo) * 100) === 0 : true;
  const retirados = Object.entries(vista.retirados);
  const complementario = vista.repeticion?.modo === 'COMPLEMENTARIO';
  const cuadreVisible = vista.cartera ? (carteraTodo ? vista.cartera.cuadre : vista.cartera.cuadre.filter((x) => Math.round(x.diferencia * 100) !== 0)) : [];

  return (
    <div className="space-y-4">
      <div id="comprobacion" className="scroll-mt-4">
        <MensajeComprobacion nivel={c.nivel} mensaje={c.mensaje} puntos={c.puntos} accionDe={accionDe} />
      </div>

      {aviso && <Nota tipo="aviso">{aviso}</Nota>}
      {avisosSubida.map((a) => (
        <Nota key={a} tipo="info">
          {a}
        </Nota>
      ))}
      {error && <Nota tipo="error">{error}</Nota>}

      <Bloque
        titulo={`Versión ${carga.version}: ficheros de la gestoría`}
        extra={
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">Cierre</span>
            {(['PROVISIONAL', 'DEFINITIVA'] as const).map((tipo) => (
              <button
                key={tipo}
                type="button"
                disabled={!puedeEditar || ocupado || vista.tipoCarga === tipo}
                onClick={() => analizarSinLanzar({ tipoCarga: tipo })}
                aria-pressed={vista.tipoCarga === tipo}
                className={`rounded-full px-3 py-1 text-xs font-medium ${vista.tipoCarga === tipo ? 'bg-emerald-600 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'} disabled:cursor-default`}
              >
                {tipo === 'PROVISIONAL' ? 'Provisional' : 'Definitivo'}
              </button>
            ))}
          </div>
        }
      >
        <p className="mb-3 text-sm text-slate-600">
          {vista.tipoCarga === 'PROVISIONAL'
            ? `Provisional: lo que tenga la gestoría antes de cerrar ${A}. Cuando cierre, cargas el definitivo y la apertura se ajusta.`
            : `Definitivo: el cierre de ${A} que ya no va a cambiar.`}
        </p>
        <ListaFicheros ficheros={carga.ficheros} puedeEditar={puedeEditar} ocupado={ocupado} onQuitar={quitar} />
        {puedeEditar && (
          <div className="mt-3">
            <SubirFicheros compacta texto="Añadir más ficheros" onSubido={onAnalizado} />
          </div>
        )}
        {vista.repetidos.length > 0 && (
          <div className="mt-3">
            <Nota tipo="info">Ficheros repetidos que no se vuelven a leer: {vista.repetidos.join(', ')}.</Nota>
          </div>
        )}
      </Bloque>

      <Bloque titulo="Qué hay en cada fichero">
        <ul className="space-y-2">
          {vista.hojas.map((h) => (
            <HojaTarjeta key={h.id} hoja={h} puedeEditar={puedeEditar} ocupado={ocupado} onAjuste={(id, a) => analizarSinLanzar({ hojas: { [id]: a } })} />
          ))}
        </ul>
      </Bloque>

      <Bloque titulo="1. Plan de cuentas">
        <Cifras>
          <Cifra titulo="Cuentas en los ficheros" valor={numero(p.cuentas)} />
          <Cifra titulo="Se crean" valor={numero(p.nuevas)} />
          <Cifra titulo="Ya estaban" valor={numero(p.existentes)} />
          <Cifra titulo="Dígitos de las subcuentas" valor={p.longitud.delPlan ?? p.longitud.actual} />
        </Cifras>
        {p.longitud.motivo && <p className="mt-2 text-sm text-slate-600">{p.longitud.motivo}</p>}
        {p.avisos.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-amber-800">
            {p.avisos.map((a) => (
              <li key={a}>· {a}</li>
            ))}
          </ul>
        )}
        {p.nombresCambian.length > 0 && (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-medium text-slate-700">{varios(p.nombresCambian.length, 'cuenta toma', 'cuentas toman')} el nombre de la gestoría</summary>
            <ul className="mt-2 space-y-1 text-slate-600">
              <Plegable
                items={p.nombresCambian}
                render={(x) => (
                  <li key={x.codigo} className="break-words">
                    <span className="font-mono">{x.codigo}</span>: «{x.actual}» pasa a «{x.nuevo}»
                  </li>
                )}
              />
            </ul>
          </details>
        )}
        {p.nombresSeQuedan.length > 0 && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer font-medium text-slate-700">{varios(p.nombresSeQuedan.length, 'cuenta conserva', 'cuentas conservan')} su nombre</summary>
            <ul className="mt-2 space-y-1 text-slate-600">
              <Plegable
                items={p.nombresSeQuedan}
                render={(x) => (
                  <li key={x.codigo} className="break-words">
                    <span className="font-mono">{x.codigo}</span>: «{x.actual}» ({x.motivo})
                  </li>
                )}
              />
            </ul>
          </details>
        )}
        {p.omitidas.length > 0 && (
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer font-medium text-slate-700">{varios(p.omitidas.length, 'cuenta no se crea', 'cuentas no se crean')}</summary>
            <ul className="mt-2 space-y-1 text-slate-600">
              <Plegable
                items={p.omitidas}
                render={(x) => (
                  <li key={x.codigo} className="break-words">
                    <span className="font-mono">{x.codigo}</span>: {x.motivo}
                  </li>
                )}
              />
            </ul>
          </details>
        )}
      </Bloque>

      <Bloque titulo="2. Clientes y proveedores">
        <Cifras>
          <Cifra titulo="Se enlazan con su ficha" valor={numero(t.enlazar)} />
          <Cifra titulo="Fichas nuevas" valor={numero(t.crear)} />
          <Cifra titulo="Quedan pendientes" valor={numero(t.pendientes)} tono={t.pendientes ? 'aviso' : 'normal'} />
          <Cifra titulo="Ya estaban enlazadas" valor={numero(t.yaEnlazadas)} />
        </Cifras>
        {vista.terceros.lista.length > 0 && (
          <div className="mt-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={soloPendientes} onChange={(e) => setSoloPendientes(e.target.checked)} /> Solo las fichas nuevas y las pendientes
            </label>
            {terceros.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Nada que revisar.</p>
            ) : (
              <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                <Plegable
                  items={terceros}
                  n={20}
                  render={(x) => (
                    <li key={x.codigo} className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="break-words text-slate-900">
                          <span className="font-mono text-xs text-slate-500">{x.codigo}</span> {x.nombre}
                        </p>
                        <p className="text-xs text-slate-500">
                          {x.tipo === 'cliente' ? 'Cliente' : 'Proveedor'} · {x.nif ?? 'sin NIF'}
                          {x.motivo ? ` · ${x.motivo}` : ''}
                        </p>
                      </div>
                      <span className={`shrink-0 self-start rounded-full px-2 py-0.5 text-xs font-medium ${x.accion === 'pendiente' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                        {ACCION_TERCERO[x.accion] ?? x.accion}
                      </span>
                    </li>
                  )}
                />
              </ul>
            )}
          </div>
        )}
      </Bloque>

      <Bloque titulo={`3. Contabilidad de ${A}`}>
        {vista.historico ? (
          <>
            <Cifras>
              <Cifra titulo="Asientos" valor={numero(vista.historico.asientos)} />
              <Cifra titulo="Apuntes" valor={numero(vista.historico.apuntes)} />
              <Cifra titulo="Desde" valor={fechaEs(vista.historico.desde)} />
              <Cifra titulo="Hasta" valor={fechaEs(vista.historico.hasta)} />
            </Cifras>
            <p className="mt-2 text-sm text-slate-700">
              {vista.historico.cuadraConSumasYSaldos === null
                ? 'No hay sumas y saldos con el que compararlo.'
                : vista.historico.cuadraConSumasYSaldos
                  ? 'Cuadra con el sumas y saldos, subcuenta a subcuenta.'
                  : 'No cuadra con el sumas y saldos: mira las comprobaciones de arriba.'}{' '}
              {vista.historico.seImporta
                ? `Se guarda como consulta: en ${A} no se podrá apuntar nada.`
                : 'No se trae: la carga sigue sin el diario hasta que subas uno que cuadre.'}
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-600">Sin libro diario. Sin él, en la app no podrás consultar el mayor ni los informes de {A}.</p>
        )}
      </Bloque>

      <Bloque titulo={`4. Apertura del 1-1-${E}`}>
        {vista.apertura ? (
          <>
            <Cifras>
              <Cifra titulo="Activo" valor={eur.format(vista.apertura.masas.activo)} />
              <Cifra titulo="Patrimonio neto" valor={eur.format(vista.apertura.masas.patrimonioNeto)} />
              <Cifra titulo="Pasivo" valor={eur.format(vista.apertura.masas.pasivo)} />
              <Cifra titulo={`Resultado de ${A}`} valor={eur.format(vista.apertura.resultado)} tono={vista.apertura.resultado < 0 ? 'mal' : 'normal'} />
            </Cifras>
            <p className="mt-2 text-sm text-slate-700">
              Un asiento con {varios(vista.apertura.lineas, 'línea', 'líneas')} (una por subcuenta), debe {eur.format(vista.apertura.debe)} y haber {eur.format(vista.apertura.haber)}.{' '}
              {masasCuadran ? 'El activo cuadra con el patrimonio neto y el pasivo.' : 'El activo no cuadra con el patrimonio neto y el pasivo.'}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {vista.apertura.origen === 'DIARIO' ? 'Sale de los saldos del diario.' : `Sumas y saldos ${TEXTO_TIPO_SS[vista.apertura.tipoSumasSaldos] ?? ''}.`}
              {vista.apertura.sustituye.length > 0 && !complementario && ` Sustituye a la apertura ${vista.apertura.sustituye.join(', ')}.`}
              {complementario && ' La apertura actual se queda; las diferencias van en un asiento de ajuste.'}
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-600">Sin sumas y saldos todavía: la apertura se pone cuando lo subas. Mientras, ya puedes facturar en {E}.</p>
        )}
      </Bloque>

      {vista.repeticion && (
        <Bloque titulo="Cambios frente a la carga vigente">
          <p className="text-sm text-slate-700">{vista.repeticion.textoModo}</p>
          {vista.repeticion.totalDiferencias > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="py-1 pr-2 font-medium">Subcuenta</th>
                    <th className="py-1 pr-2 text-right font-medium">Antes</th>
                    <th className="py-1 pr-2 text-right font-medium">Ahora</th>
                    <th className="py-1 pr-2 text-right font-medium">Diferencia</th>
                    <th className="py-1 font-medium">En {E}</th>
                  </tr>
                </thead>
                <tbody>
                  {vista.repeticion.diferencias.map((d) => (
                    <tr key={d.subcuenta} className="border-b border-slate-100">
                      <td className="py-1 pr-2">
                        <span className="font-mono text-xs">{d.subcuenta}</span> <span className="text-slate-600">{d.nombre}</span>
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">{eur.format(d.anterior)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">{eur.format(d.nuevo)}</td>
                      <td className="py-1 pr-2 text-right font-medium tabular-nums">{eur.format(d.diferencia)}</td>
                      <td className="py-1 text-xs text-slate-600">{d.movimientos2027 ? `${varios(d.movimientos2027, 'apunte', 'apuntes')}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-1 text-xs text-slate-500">
                Solo las subcuentas que cambian
                {vista.repeticion.totalDiferencias > vista.repeticion.diferencias.length ? ` (se ven ${numero(vista.repeticion.diferencias.length)} de ${numero(vista.repeticion.totalDiferencias)})` : ''}.
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-600">Los saldos son los mismos que en la carga vigente.</p>
          )}
          {(vista.repeticion.partidasQueSiguen > 0 || vista.repeticion.activosQueSiguen > 0) && (
            <p className="mt-2 text-sm text-slate-600">
              Se mantienen {varios(vista.repeticion.partidasQueSiguen, 'factura pendiente con cobros', 'facturas pendientes con cobros')} y{' '}
              {varios(vista.repeticion.activosQueSiguen, 'bien con amortización apuntada', 'bienes con amortización apuntada')}.
            </p>
          )}
          {complementario && (
            <label className="mt-3 block text-xs font-medium text-slate-600">
              Motivo del asiento de ajuste (queda guardado)
              <div className="flex flex-col gap-2 sm:flex-row">
                <input className={campo} value={motivo} maxLength={300} disabled={!puedeEditar || ocupado} placeholder="Por ejemplo: cierre definitivo de la gestoría" onChange={(e) => setMotivo(e.target.value)} />
                <button type="button" className={`${botonSecundario} mt-1 shrink-0`} disabled={!puedeEditar || ocupado || !motivo.trim()} onClick={() => analizarSinLanzar({ motivoAjuste: motivo.trim() })}>
                  Guardar el motivo
                </button>
              </div>
            </label>
          )}
        </Bloque>
      )}

      <Bloque titulo="5. Facturas pendientes de cobro y pago">
        {vista.cartera ? (
          <>
            <Cifras>
              <Cifra titulo="Facturas" valor={numero(vista.cartera.partidas)} />
              <Cifra titulo="Por cobrar" valor={eur.format(vista.cartera.cobros)} />
              <Cifra titulo="Por pagar" valor={eur.format(vista.cartera.pagos)} />
              <Cifra titulo="Saldo sin detalle" valor={numero(vista.cartera.sinDetalle)} tono={vista.cartera.sinDetalle ? 'aviso' : 'normal'} />
            </Cifras>
            {vista.cartera.facturasEnlazadas > 0 && (
              <p className="mt-2 text-sm text-slate-600">{varios(vista.cartera.facturasEnlazadas, 'factura ya estaba en la app: se cobra desde su partida', 'facturas ya estaban en la app: se cobran desde su partida')}, nunca dos veces.</p>
            )}
            <div className="mt-3">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={!carteraTodo} onChange={(e) => setCarteraTodo(!e.target.checked)} /> Solo las subcuentas que no cuadran
              </label>
              {cuadreVisible.length === 0 ? (
                <p className="mt-2 text-sm text-emerald-700">Cada cliente y proveedor cuadra con su saldo.</p>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                        <th className="py-1 pr-2 font-medium">Subcuenta</th>
                        <th className="py-1 pr-2 text-right font-medium">Saldo</th>
                        <th className="py-1 pr-2 text-right font-medium">Facturas</th>
                        <th className="py-1 text-right font-medium">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cuadreVisible.map((x) => {
                        const mal = Math.round(x.diferencia * 100) !== 0;
                        return (
                          <tr key={x.subcuenta} className="border-b border-slate-100">
                            <td className="py-1 pr-2 font-mono text-xs">{x.subcuenta}</td>
                            <td className="py-1 pr-2 text-right tabular-nums">{eur.format(x.saldoApertura)}</td>
                            <td className="py-1 pr-2 text-right tabular-nums">{eur.format(x.sumaPartidas)}</td>
                            <td className={`py-1 text-right font-medium tabular-nums ${mal ? 'text-red-700' : 'text-emerald-700'}`}>{eur.format(x.diferencia)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <p className="mt-1 text-xs text-slate-500">Lo que no cuadra queda como «Saldo sin detalle a 31-12-{A}» para poder cobrarlo o pagarlo, hasta que llegue el detalle.</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-600">Sin fichero de facturas pendientes.</p>
        )}
      </Bloque>

      <Bloque titulo="6. Inmovilizado">
        {vista.inmovilizado ? (
          <>
            <Cifras>
              <Cifra titulo="Bienes" valor={numero(vista.inmovilizado.activos)} />
              <Cifra titulo="Coste" valor={eur.format(vista.inmovilizado.coste)} />
              <Cifra titulo={`Amortizado a 31-12-${A}`} valor={eur.format(vista.inmovilizado.amortAcumulada)} />
            </Cifras>
            <p className="mt-2 text-sm text-slate-600">
              {vista.inmovilizado.seImporta ? `La amortización de ${E} la calcula la app mes a mes.` : 'No se trae: no cuadra con las cuentas 2xx y 28x (mira las comprobaciones).'}
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-600">Sin fichas de inmovilizado. Si la empresa tiene bienes, pídelas a la gestoría para calcular la amortización.</p>
        )}
      </Bloque>

      {(vista.llevanzaExterna || retirados.length > 0) && (
        <Bloque titulo={`${A} queda como «lo llevó la gestoría»`}>
          <p className="text-sm text-slate-700">
            Después de traerla, {A} se consulta pero no se cambia: no se podrá apuntar nada con fecha de {A}, ni cerrarlo en la app. Las facturas de {A} siguen en sus listados.
          </p>
          {vista.fijaInicioEnApp && (
            <p className="mt-2 text-sm text-slate-700">
              Los impuestos se llevarán en la app desde el 1-1-{vista.ejercicio}: los modelos de {A} los presentó la gestoría y no saldrán como pendientes. Lo puedes cambiar en
              Configuración &gt; Impuestos.
            </p>
          )}
          {retirados.length > 0 && (
            <p className="mt-2 text-sm text-slate-700">
              Se retiran {varios(retirados.reduce((s, [, n]) => s + n, 0), 'asiento', 'asientos')} de {A} hechos en la app ({retirados.map(([o, n]) => `${n} de ${TEXTO_ORIGEN[o] ?? o.toLowerCase()}`).join(', ')}). Si deshaces la carga, pueden volver.
            </p>
          )}
        </Bloque>
      )}

      {vista.bancos && vista.bancos.length > 0 && (
        <div id="bancos" className="scroll-mt-4">
          <DatosBancos
            bancos={vista.bancos}
            puedeEditar={puedeEditar}
            ocupado={ocupado}
            puntos={c.puntos.filter(deBancos)}
            onGuardar={(bancos) => analizarDesdeForm({ bancos })}
          />
        </div>
      )}
      <div id="impuestos" className="scroll-mt-4">
        <DatosFiscalesForm
          datos={vista.datosFiscales}
          resultadoDeclarado={vista.resultadoDeclarado ?? null}
          conResultado={!!vista.apertura}
          puedeEditar={puedeEditar}
          ocupado={ocupado}
          puntos={c.puntos.filter(deFiscales)}
          onGuardar={async ({ datosFiscales, resultadoDeclarado: r }) => {
            await analizarDesdeForm({ datosFiscales, ...(r !== undefined ? { resultadoDeclarado: r } : {}) });
          }}
        />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {puedeConfirmar ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-700">
              {vista.puedeConfirmar ? (
                c.nivel === 'CORRECTO' ? (
                  'Todo listo para traer la contabilidad.'
                ) : (
                  'Se puede traer ya; lo que falta lo completas después.'
                )
              ) : (
                <>
                  Corrige los errores para poder traerla.{' '}
                  <button type="button" className="font-medium text-emerald-700 hover:underline" onClick={() => irA('comprobacion')}>
                    Ver los errores
                  </button>
                </>
              )}
            </p>
            <button type="button" className={boton} disabled={!vista.puedeConfirmar || ocupado} onClick={() => setConfirmando(true)}>
              Traer la contabilidad de {A} <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-600">Para traer la contabilidad hace falta ser administrador de la empresa. Puedes preparar el resumen y avisarle.</p>
        )}
      </section>

      {confirmando && (
        <Dialogo titulo={`¿Traer la contabilidad de ${A}?`} onCerrar={() => (ocupado ? undefined : setConfirmando(false))}>
          <p className="text-sm text-slate-700">{vista.confirmacion}</p>
          {vista.repeticion && <p className="mt-2 text-sm text-slate-700">{vista.repeticion.textoModo}</p>}
          {c.nivel === 'FALTAN_DATOS' && <p className="mt-2 text-sm text-amber-800">Faltan datos: quedará un aviso en el panel hasta que los completes.</p>}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
            <button type="button" className={boton} disabled={ocupado} onClick={confirmar}>
              {ocupado ? 'Comprobando…' : 'Sí, traerla'}
            </button>
            <button type="button" className={botonSecundario} disabled={ocupado} onClick={() => setConfirmando(false)}>
              Cancelar
            </button>
          </div>
        </Dialogo>
      )}
    </div>
  );
}
