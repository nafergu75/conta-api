'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Tooltip } from '@/app/dashboard/components/Tooltip';
import { errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { useEmpresaEspanola } from '@/lib/fiscal';
import { ANIO_GESTORIA, arranqueApi, EJERCICIO_ARRANQUE, RUTA_ARRANQUE, type AjustesCarga, type EstadoArranque, type EstadoFase, type RespuestaCarga } from '@/lib/arranque';
import { Bloque, botonSecundario, Nota } from './comun';
import { DeshacerCarga } from './Deshacer';
import { Importando } from './Importando';
import { Pendientes } from './Pendientes';
import { Peticion } from './Peticion';
import { Resumen } from './Resumen';
import { SubirFicheros } from './SubirFicheros';
import { Vigente } from './Vigente';

const A = ANIO_GESTORIA;
const E = EJERCICIO_ARRANQUE;

/**
 * «Traer la contabilidad de 2026»: se suben de una vez los ficheros de la
 * gestoría, la app reconoce cada uno, enseña un resumen con la comprobación
 * en tres niveles y, con una sola confirmación, trae el plan, los clientes y
 * proveedores, el diario de 2026, la apertura de 2027, las facturas
 * pendientes, el inmovilizado y los comparativos. Con ?vista=pendientes, las
 * facturas de 2026 que quedan por cobrar o pagar.
 */
export default function ArranquePage() {
  return (
    <Suspense fallback={<p className="p-6 text-slate-500">Cargando…</p>}>
      <Arranque />
    </Suspense>
  );
}

function Arranque() {
  const sp = useSearchParams();
  const user = getUser();
  const puedeLeer = tieneAlgunPermiso(user, ['contabilidad:read']);
  const puedeVerPendientes = tieneAlgunPermiso(user, ['contabilidad:read', 'tesoreria:read', 'ventas:read', 'compras:read']);
  const vista = sp?.get('vista') === 'pendientes' || !puedeLeer ? 'pendientes' : 'carga';
  const espanola = useEmpresaEspanola();

  const pestana = (id: 'carga' | 'pendientes', texto: string, href: string) => (
    <Link
      href={href}
      role="tab"
      aria-selected={vista === id}
      className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${vista === id ? 'border-emerald-600 text-emerald-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}
    >
      {texto}
    </Link>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 pb-24 pt-6 md:px-8">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Traer la contabilidad de {A}</h1>
          <Tooltip text={`Si la gestoría lleva la contabilidad de ${A} en su programa (a3, ContaPlus, Sage, Holded, Contasol, Monitor...), sube aquí sus ficheros y la app empieza ${E} con los mismos saldos, cuentas, clientes y proveedores.`} />
        </div>
        <p className="mt-2 text-slate-600">
          Sube de una vez los ficheros que te dé la gestoría. La app reconoce cada uno, te enseña lo que ha encontrado y, con una sola confirmación, deja {E} listo para
          empezar.
        </p>
      </div>

      {espanola === false ? (
        <Nota tipo="info">Esto es para las empresas españolas cuya contabilidad llevaba una gestoría. Esta empresa no lo necesita.</Nota>
      ) : (
        <>
          {puedeLeer && puedeVerPendientes && (
            <nav className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
              {pestana('carga', 'La carga', RUTA_ARRANQUE)}
              {pestana('pendientes', `Facturas de ${A} pendientes`, `${RUTA_ARRANQUE}?vista=pendientes`)}
            </nav>
          )}
          {vista === 'pendientes' ? puedeVerPendientes ? <Pendientes /> : <Nota tipo="info">Tu acceso no incluye ver cobros ni pagos.</Nota> : <Carga />}
        </>
      )}
    </div>
  );
}

function Carga() {
  const user = getUser();
  const puedeEditar = tieneAlgunPermiso(user, ['contabilidad:write']);
  const esAdmin = tieneAlgunPermiso(user, ['admin:empresa']);
  const [estado, setEstado] = useState<EstadoArranque | null>(null);
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState('');
  const [avisosSubida, setAvisosSubida] = useState<string[]>([]);
  /** Vista del último análisis (la del borrador, al día). */
  const [respuesta, setRespuesta] = useState<RespuestaCarga | null>(null);
  /** Recién confirmada: la importación empieza sola. */
  const [importando, setImportando] = useState<{ cargaId: string; version: number; fases: EstadoFase[]; automatico: boolean } | null>(null);
  const [nuevaCarga, setNuevaCarga] = useState<'PROVISIONAL' | 'DEFINITIVA' | null>(null);
  const [tipoInicial, setTipoInicial] = useState<'PROVISIONAL' | 'DEFINITIVA'>('PROVISIONAL');
  const [deshaciendo, setDeshaciendo] = useState<string | null>(null);
  /** Lo escrito a mano en la carga vigente (bancos, 303, resultado), para no tener que repetirlo en la nueva. */
  const [heredado, setHeredado] = useState<AjustesCarga>({});

  useEffect(() => {
    if (!nuevaCarga) return;
    arranqueApi
      .comprobaciones()
      .then((c) => {
        if (!c || c.deBorrador) return setHeredado({});
        const bancos = Object.fromEntries(
          (c.bancos ?? []).filter((b) => b.saldoExtracto !== null).map((b) => [b.subcuenta, { saldoExtracto: b.saldoExtracto, ...(b.aceptada ? { aceptarDiferencia: true } : {}) }]),
        );
        setHeredado({
          ...(Object.keys(bancos).length ? { bancos } : {}),
          ...(c.datosFiscales ? { datosFiscales: c.datosFiscales } : {}),
          ...(c.resultadoDeclarado !== null ? { resultadoDeclarado: c.resultadoDeclarado } : {}),
        });
      })
      .catch(() => setHeredado({}));
  }, [nuevaCarga]);

  const cargar = useCallback(async () => {
    try {
      const e = await arranqueApi.estado();
      setEstado(e);
      setError('');
      if (e.aplicando) setImportando({ cargaId: e.aplicando.id, version: e.aplicando.version, fases: e.aplicando.fases ?? [], automatico: false });
      else setImportando(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const alSubir = (r: RespuestaCarga) => {
    setRespuesta(r);
    setAvisosSubida(r.avisos);
    setNuevaCarga(null);
    setHecho('');
    cargar();
  };

  if (error && !estado) return <Nota tipo="error">{error}</Nota>;
  if (!estado) return <p className="text-sm text-slate-500">Cargando…</p>;

  const borrador = estado.borrador;
  const vistaBorrador = respuesta && borrador && respuesta.carga.id === borrador.id ? respuesta.vista : (borrador?.vista ?? null);
  const ficherosBorrador = respuesta && borrador && respuesta.carga.id === borrador.id ? respuesta.carga.ficheros : (borrador?.ficheros ?? []);

  return (
    <div className="space-y-4">
      {hecho && <Nota tipo="bien">{hecho}</Nota>}
      {error && <Nota tipo="error">{error}</Nota>}
      {estado.llevanzaAnterior === 'EXTERNA' && !estado.vigente && !estado.aplicando && (
        <Nota tipo="info">
          {A} está marcado como «lo llevó la gestoría», pero no hay ninguna carga traída.{' '}
          {esAdmin && (
            <button
              type="button"
              className="font-medium underline"
              onClick={async () => {
                try {
                  setHecho((await arranqueApi.volverApp()).texto);
                  cargar();
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
            >
              Volver a llevar {A} en la app
            </button>
          )}
        </Nota>
      )}

      {importando ? (
        <Importando
          cargaId={importando.cargaId}
          version={importando.version}
          fasesIniciales={importando.fases}
          nombres={estado.fases}
          puedeAplicar={esAdmin}
          automatico={importando.automatico}
          onTerminada={() => {
            setImportando(null);
            setRespuesta(null);
            cargar();
          }}
          onDeshacer={() => setDeshaciendo(importando.cargaId)}
        />
      ) : (
        <>
          {estado.vigente && nuevaCarga && !borrador && (
            <Bloque titulo={nuevaCarga === 'DEFINITIVA' ? `Cierre definitivo de ${A}` : 'Una carga nueva'}>
              <p className="mb-3 text-sm text-slate-600">
                Sube los ficheros nuevos de la gestoría (los que cambian y los que faltaban). Antes de aplicar nada verás qué cambia frente a la versión {estado.vigente.version},
                subcuenta a subcuenta. Lo que escribiste a mano (bancos, 303 y resultado) se copia en la nueva y lo puedes cambiar.
              </p>
              <SubirFicheros ajustes={{ ...heredado, tipoCarga: nuevaCarga }} onSubido={alSubir} />
              <button type="button" className={`${botonSecundario} mt-3`} onClick={() => setNuevaCarga(null)}>
                Cancelar
              </button>
            </Bloque>
          )}

          {borrador && (
            <>
              {estado.vigente && (
                <h2 className="pt-2 text-lg font-semibold text-slate-900">
                  Versión {borrador.version} en preparación{borrador.tipo === 'DEFINITIVA' ? ': cierre definitivo' : ''}
                </h2>
              )}
              <Resumen
                carga={{ id: borrador.id, version: borrador.version, ficheros: ficherosBorrador }}
                vista={vistaBorrador}
                avisosSubida={avisosSubida}
                puedeEditar={puedeEditar}
                puedeConfirmar={esAdmin}
                onAnalizado={alSubir}
                onRecargar={() => {
                  setRespuesta(null);
                  cargar();
                }}
                onConfirmada={(c) => {
                  setAvisosSubida([]);
                  setImportando({ cargaId: c.cargaId, version: c.version, fases: c.fases, automatico: true });
                }}
              />
            </>
          )}

          {estado.vigente && (
            <Vigente
              vigente={estado.vigente}
              versiones={estado.versiones}
              hayBorrador={!!borrador}
              puedeEditar={puedeEditar}
              esAdmin={esAdmin}
              onNuevaCarga={(t) => setNuevaCarga(t)}
              onDeshacer={() => setDeshaciendo(estado.vigente!.id)}
            />
          )}

          {!borrador && !estado.vigente && (
            <>
              <Peticion />
              {puedeEditar ? (
                <Bloque titulo="Sube los ficheros">
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-slate-600">¿Qué cierre es?</span>
                    {(['PROVISIONAL', 'DEFINITIVA'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={tipoInicial === t}
                        onClick={() => setTipoInicial(t)}
                        className={`rounded-full px-3 py-1 text-xs font-medium ${tipoInicial === t ? 'bg-emerald-600 text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                      >
                        {t === 'PROVISIONAL' ? 'Provisional (lo normal en enero)' : 'Definitivo'}
                      </button>
                    ))}
                  </div>
                  <SubirFicheros ajustes={{ tipoCarga: tipoInicial }} onSubido={alSubir} />
                  <p className="mt-2 text-xs text-slate-500">Al subirlos no se cambia nada: primero verás el resumen.</p>
                </Bloque>
              ) : (
                <Nota tipo="info">Para subir los ficheros hace falta el permiso Contabilidad «Modificar». Pídeselo al administrador de la empresa.</Nota>
              )}
            </>
          )}
        </>
      )}

      {deshaciendo && (
        <DeshacerCarga
          cargaId={deshaciendo}
          puedeDeshacer={esAdmin}
          onCerrar={() => setDeshaciendo(null)}
          onHecho={(texto) => {
            setDeshaciendo(null);
            setHecho(texto);
            setRespuesta(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}
