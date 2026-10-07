'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { DownloadSimple, Eye, FileArrowUp, PencilSimple, Plus, Receipt, Trash, UploadSimple } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import {
  pagina,
  Alerta,
  boton,
  botonPeligro,
  botonSecundario,
  CabeceraNominas,
  CamposMedioPago,
  campo,
  cuerpoMedioPago,
  Dato,
  EstadoBadge,
  etiqueta,
  eur,
  fechaEs,
  hoyIso,
  MarcaCuadre,
  Modal,
  num,
  periodoTexto,
  permisosNominas,
  SelectorMes,
  SinPermiso,
  textoTipo,
  type MedioPago,
  type Nomina,
  type Totales,
} from './comun';
import { NominaModal } from './NominaModal';
import { AsientosModal } from './AsientosModal';
import { SegurosSociales, type SegurosSocialesMes } from './SegurosSociales';
import { descargarPdf, Documentos, subirPdf, type DocumentoNomina } from './Documentos';

/**
 * Nominas del mes: una fila por trabajador con su cuadre, estado y asiento.
 * Desde aqui se contabilizan (un asiento por trabajador), se anulan, se pagan
 * los liquidos y los seguros sociales, y se guardan los PDF de la gestoria.
 */

interface ResumenMes {
  ejercicio: number;
  mes: number;
  fechaDevengo: string;
  estadoPeriodo: string;
  nominas: Nomina[];
  totales: Totales;
  estados: Record<string, number>;
  cuadran: boolean;
  pendientePago: { nominas: number; liquido: number };
}

type Accion = { tipo: 'nueva' } | { tipo: 'editar'; nomina: Nomina } | { tipo: 'asientos'; ids?: string[] } | { tipo: 'contabilizar'; ids?: string[] } | { tipo: 'anular' } | { tipo: 'pagar' } | { tipo: 'anularPago' } | { tipo: 'borrar'; nomina: Nomina };

export default function NominasPage() {
  return (
    <Suspense fallback={<p className={`${pagina} text-sm text-slate-500`}>Cargando...</p>}>
      <NominasMes />
    </Suspense>
  );
}

function NominasMes() {
  const router = useRouter();
  const params = useSearchParams();
  const { leer, escribir } = permisosNominas();
  const ejercicio = Number(params.get('ejercicio')) || 0;
  const mes = Number(params.get('mes')) || 0;

  const irA = useCallback((e: number, m: number) => router.replace(`/dashboard/nominas?ejercicio=${e}&mes=${m}`, { scroll: false }), [router]);

  // Sin mes en la URL: el ultimo mes con nominas del año (o el actual).
  useEffect(() => {
    if (!leer || (ejercicio && mes)) return;
    const hoy = new Date();
    const anio = hoy.getFullYear();
    apiFetch<Array<{ mes: number; totalBruto: number }>>(companyPath(`/nominas/resumen?ejercicio=${anio}`))
      .then((r) => {
        const conDatos = (r ?? []).filter((x) => x.totalBruto > 0).map((x) => x.mes);
        irA(anio, conDatos.length ? Math.max(...conDatos) : hoy.getMonth() + 1);
      })
      .catch(() => irA(anio, hoy.getMonth() + 1));
  }, [leer, ejercicio, mes, irA]);

  if (!leer) {
    return (
      <div className={pagina}>
        <CabeceraNominas titulo="Nóminas" subtitulo="Registro contable de las nóminas que calcula la gestoría." />
        <SinPermiso />
      </div>
    );
  }
  if (!ejercicio || !mes) return <p className={`${pagina} text-sm text-slate-500`}>Cargando...</p>;
  return <Mes key={`${ejercicio}-${mes}`} ejercicio={ejercicio} mes={mes} escribir={escribir} irA={irA} />;
}

function Mes({ ejercicio, mes, escribir, irA }: { ejercicio: number; mes: number; escribir: boolean; irA: (e: number, m: number) => void }) {
  const [datos, setDatos] = useState<ResumenMes | null>(null);
  const [ss, setSs] = useState<SegurosSocialesMes | null>(null);
  const [docs, setDocs] = useState<DocumentoNomina[]>([]);
  const [errorCarga, setErrorCarga] = useState('');
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string; avisos?: string[] } | null>(null);
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [accion, setAccion] = useState<Accion | null>(null);
  const pdfPara = useRef<string | null>(null);
  const inputPdf = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    const [r, s, d] = await Promise.allSettled([
      apiFetch<ResumenMes>(companyPath(`/nominas/periodos/${ejercicio}/${mes}`)),
      apiFetch<SegurosSocialesMes>(companyPath(`/nominas/seguros-sociales/${ejercicio}/${mes}`)),
      apiFetch<DocumentoNomina[]>(companyPath(`/nominas/periodos/${ejercicio}/${mes}/documentos`)),
    ]);
    if (r.status === 'fulfilled') {
      setDatos(r.value);
      setErrorCarga('');
      const ids = new Set(r.value.nominas.map((n) => n.id));
      setSeleccion((sel) => new Set(Array.from(sel).filter((id) => ids.has(id))));
    } else setErrorCarga(errorMessage(r.reason));
    setSs(s.status === 'fulfilled' ? s.value : null);
    setDocs(d.status === 'fulfilled' ? d.value : []);
  }, [ejercicio, mes]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const nominas = useMemo(() => datos?.nominas ?? [], [datos]);
  const elegidas = nominas.filter((n) => seleccion.has(n.id));
  /** Las nominas a las que se aplica una accion: las marcadas en ese estado o, sin marcar ninguna, todas las del mes en ese estado. */
  const objetivo = (estado: string) => (elegidas.length ? elegidas : nominas).filter((n) => n.estado === estado);
  const borradores = objetivo('BORRADOR');
  const contabilizadas = objetivo('CONTABILIZADA');
  const pagadas = objetivo('PAGADA');
  const pdfPorNomina = useMemo(() => new Map(docs.filter((d) => d.nominaId).map((d) => [d.nominaId!, d])), [docs]);
  const abierto = !datos || datos.estadoPeriodo === 'abierto';

  const hecho = (texto: string, avisos?: string[]) => {
    setAccion(null);
    setMensaje({ tipo: 'ok', texto, avisos });
    setSeleccion(new Set());
    cargar();
  };
  const fallo = (texto: string) => setMensaje({ tipo: 'error', texto });

  const alternar = (id: string) =>
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const todas = nominas.length > 0 && nominas.every((n) => seleccion.has(n.id));

  const elegirPdf = (n: Nomina) => {
    pdfPara.current = n.id;
    inputPdf.current?.click();
  };
  const subirPdfFila = async (f: File | undefined) => {
    const id = pdfPara.current;
    if (inputPdf.current) inputPdf.current.value = '';
    if (!f || !id) return;
    try {
      const d = await subirPdf(ejercicio, mes, f, 'nomina', id);
      setMensaje({ tipo: 'ok', texto: `PDF de la nómina de ${d.trabajador ?? 'el trabajador'} guardado.` });
      cargar();
    } catch (e) {
      fallo(errorMessage(e));
    }
  };

  const conSeleccion = (n: number) => (elegidas.length ? ` (${n})` : '');

  return (
    <div className={pagina}>
      <CabeceraNominas
        titulo="Nóminas del mes"
        subtitulo="Las nóminas que calcula la gestoría, un asiento por trabajador con su subcuenta 465."
        acciones={
          escribir && (
            <>
              <Link href={`/dashboard/nominas/importar?ejercicio=${ejercicio}&mes=${mes}`} className={botonSecundario}>
                <FileArrowUp size={16} /> Importar Excel
              </Link>
              <button type="button" onClick={() => setAccion({ tipo: 'nueva' })} className={boton}>
                <Plus size={16} /> Añadir nómina
              </button>
            </>
          )
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SelectorMes ejercicio={ejercicio} mes={mes} onCambiar={irA} />
        {datos && !abierto && (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
            Periodo {datos.estadoPeriodo}: no se puede contabilizar en este mes
          </span>
        )}
      </div>

      {mensaje && (
        <Alerta tipo={mensaje.tipo}>
          <p>{mensaje.texto}</p>
          {mensaje.avisos && mensaje.avisos.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-amber-800">
              {mensaje.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
        </Alerta>
      )}
      {errorCarga && <Alerta tipo="error">{errorCarga}</Alerta>}

      {datos && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Dato titulo="Trabajadores" valor={datos.totales.trabajadores} nota={`${datos.totales.nominas} ${datos.totales.nominas === 1 ? 'nómina' : 'nóminas'}`} />
            <Dato titulo="Bruto" valor={eur.format(datos.totales.brutoDinerario)} />
            <Dato titulo="Líquido" valor={eur.format(datos.totales.liquido)} nota={datos.pendientePago.nominas ? `${eur.format(datos.pendientePago.liquido)} sin pagar` : undefined} tono={datos.pendientePago.nominas ? 'aviso' : 'normal'} />
            <Dato titulo="SS empresa" valor={eur.format(datos.totales.ssEmpresa)} />
            <Dato titulo="Coste empresa" valor={eur.format(datos.totales.costeEmpresa)} />
          </div>

          {escribir && nominas.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-sm text-slate-600">{elegidas.length ? `${elegidas.length} marcadas:` : 'Todo el mes:'}</span>
              <button type="button" onClick={() => setAccion({ tipo: 'contabilizar', ids: elegidas.length ? borradores.map((n) => n.id) : undefined })} disabled={!borradores.length || !abierto} className={boton}>
                Contabilizar{conSeleccion(borradores.length)}
              </button>
              <button type="button" onClick={() => setAccion({ tipo: 'pagar' })} disabled={!contabilizadas.length} className={botonSecundario}>
                Pagar líquidos{conSeleccion(contabilizadas.length)}
              </button>
              <button type="button" onClick={() => setAccion({ tipo: 'asientos', ids: elegidas.length ? elegidas.map((n) => n.id) : undefined })} className={botonSecundario}>
                <Receipt size={16} /> Ver asientos
              </button>
              <button type="button" onClick={() => setAccion({ tipo: 'anular' })} disabled={!contabilizadas.length && !(elegidas.length && borradores.length)} className={botonSecundario}>
                Anular contabilización{conSeleccion(contabilizadas.length)}
              </button>
              {pagadas.length > 0 && (
                <button type="button" onClick={() => setAccion({ tipo: 'anularPago' })} className={botonSecundario}>
                  Anular pago{conSeleccion(pagadas.length)}
                </button>
              )}
            </div>
          )}

          <div className="relative overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  {escribir && (
                    <th className="w-10 px-3 py-3">
                      <input
                        type="checkbox"
                        aria-label="Marcar todas"
                        checked={todas}
                        onChange={() => setSeleccion(todas ? new Set() : new Set(nominas.map((n) => n.id)))}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </th>
                  )}
                  <th className="px-3 py-3 font-medium">Trabajador</th>
                  <th className="px-3 py-3 text-right font-medium">Bruto</th>
                  <th className="px-3 py-3 text-right font-medium">SS trab.</th>
                  <th className="px-3 py-3 text-right font-medium">IRPF</th>
                  <th className="px-3 py-3 text-right font-medium">Líquido</th>
                  <th className="px-3 py-3 text-right font-medium">SS empresa</th>
                  <th className="px-3 py-3 text-center font-medium">Cuadre</th>
                  <th className="px-3 py-3 font-medium">Estado</th>
                  <th className="px-3 py-3 font-medium">Asiento</th>
                  <th className="px-3 py-3 text-center font-medium">PDF</th>
                  <th className="px-3 py-3">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {nominas.length === 0 ? (
                  <tr>
                    <td colSpan={escribir ? 12 : 11} className="px-4 py-10 text-center text-slate-500">
                      No hay nóminas de {periodoTexto(ejercicio, mes)}.
                      {escribir && (
                        <>
                          {' '}
                          <Link href={`/dashboard/nominas/importar?ejercicio=${ejercicio}&mes=${mes}`} className="font-medium text-blue-700 hover:underline">
                            Importa el Excel de la gestoría
                          </Link>{' '}
                          o añádelas a mano.
                        </>
                      )}
                    </td>
                  </tr>
                ) : (
                  nominas.map((n) => {
                    const pdf = pdfPorNomina.get(n.id);
                    const anulada = n.estado === 'ANULADA';
                    return (
                      <tr key={n.id} className={!n.cuadre.cuadra ? 'bg-red-50' : anulada ? 'text-slate-400' : seleccion.has(n.id) ? 'bg-blue-50' : ''}>
                        {escribir && (
                          <td className="px-3 py-2">
                            <input type="checkbox" aria-label={`Marcar a ${n.empleado?.nombreCompleto}`} checked={seleccion.has(n.id)} onChange={() => alternar(n.id)} className="h-4 w-4 rounded border-slate-300" />
                          </td>
                        )}
                        <td className="px-3 py-2">
                          <span className="font-medium text-slate-900">{n.empleado?.nombreCompleto ?? '—'}</span>
                          {n.tipo !== 'ORDINARIA' && <span className="ml-2 rounded bg-sky-50 px-1.5 py-0.5 text-xs text-sky-700">{textoTipo(n.tipo).toLowerCase()}</span>}
                          <span className="block font-mono text-xs text-slate-500">{n.empleado?.nif}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{num.format(n.brutoDinerario)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{num.format(n.ssTrabajador)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                          {num.format(n.irpf)}
                          {n.porcentajeIrpf !== null && <span className="block text-xs text-slate-500">{num.format(n.porcentajeIrpf)} %</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-slate-900">{num.format(n.liquido)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{num.format(n.ssEmpresa)}</td>
                        <td className="px-3 py-2 text-center">
                          <MarcaCuadre cuadre={n.cuadre} />
                        </td>
                        <td className="px-3 py-2">
                          <EstadoBadge estado={n.estado} />
                          {n.estado === 'PAGADA' && <span className="block text-xs text-slate-500">{fechaEs(n.fechaPago)}</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-600">
                          {n.asientoNumero ?? '—'}
                          {n.asientoPagoNumero && <span className="block">{n.asientoPagoNumero}</span>}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {pdf ? (
                            <button type="button" onClick={() => descargarPdf(pdf).catch((e) => fallo(errorMessage(e)))} className="rounded p-1.5 text-red-600 hover:bg-slate-100" title={`Descargar ${pdf.archivoNombre}`} aria-label={`Descargar el PDF de ${n.empleado?.nombreCompleto}`}>
                              <DownloadSimple size={18} />
                            </button>
                          ) : escribir && !anulada ? (
                            <button type="button" onClick={() => elegirPdf(n)} className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Subir el PDF de esta nómina" aria-label={`Subir el PDF de ${n.empleado?.nombreCompleto}`}>
                              <UploadSimple size={18} />
                            </button>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <span className="flex justify-end gap-1">
                            <button type="button" onClick={() => setAccion({ tipo: 'asientos', ids: [n.id] })} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" title="Ver el asiento" aria-label={`Ver el asiento de ${n.empleado?.nombreCompleto}`}>
                              <Eye size={16} />
                            </button>
                            {escribir && n.estado === 'BORRADOR' && (
                              <button type="button" onClick={() => setAccion({ tipo: 'editar', nomina: n })} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-600" title="Editar" aria-label={`Editar la nómina de ${n.empleado?.nombreCompleto}`}>
                                <PencilSimple size={16} />
                              </button>
                            )}
                            {escribir && (n.estado === 'BORRADOR' || anulada) && (
                              <button type="button" onClick={() => setAccion({ tipo: 'borrar', nomina: n })} className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Borrar" aria-label={`Borrar la nómina de ${n.empleado?.nombreCompleto}`}>
                                <Trash size={16} />
                              </button>
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {nominas.length > 0 && (
                <tfoot className="bg-slate-50 font-semibold text-slate-900">
                  <tr>
                    {escribir && <td />}
                    <td className="px-3 py-2">Total{datos.estados.ANULADA ? ' (sin anuladas)' : ''}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{num.format(datos.totales.brutoDinerario)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{num.format(datos.totales.ssTrabajador)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{num.format(datos.totales.irpf)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{num.format(datos.totales.liquido)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{num.format(datos.totales.ssEmpresa)}</td>
                    <td className="px-3 py-2 text-center text-xs font-medium">{datos.cuadran ? '' : <span className="text-red-700">Hay descuadres</span>}</td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <input ref={inputPdf} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => subirPdfFila(e.target.files?.[0])} />

          <div className="grid gap-4 lg:grid-cols-2">
            {ss && <SegurosSociales ss={ss} escribir={escribir} onCambio={cargar} onMensaje={(tipo, texto) => setMensaje({ tipo, texto })} />}
            <Documentos ejercicio={ejercicio} mes={mes} documentos={docs} nominas={nominas} escribir={escribir} onCambio={cargar} onMensaje={(tipo, texto) => setMensaje({ tipo, texto })} />
          </div>
        </>
      )}

      {(accion?.tipo === 'nueva' || accion?.tipo === 'editar') && (
        <NominaModal nomina={accion.tipo === 'editar' ? accion.nomina : null} ejercicio={ejercicio} mes={mes} onCerrar={() => setAccion(null)} onGuardado={hecho} />
      )}
      {accion?.tipo === 'asientos' && <AsientosModal ejercicio={ejercicio} mes={mes} nominaIds={accion.ids} onCerrar={() => setAccion(null)} />}
      {accion?.tipo === 'contabilizar' && <AsientosModal ejercicio={ejercicio} mes={mes} nominaIds={accion.ids} contabilizar onCerrar={() => setAccion(null)} onContabilizado={hecho} />}
      {accion?.tipo === 'pagar' && <PagarLiquidos ejercicio={ejercicio} mes={mes} nominas={contabilizadas} todas={!elegidas.length} onCerrar={() => setAccion(null)} onHecho={hecho} />}
      {accion?.tipo === 'anular' && (
        <AnularContabilizacion
          ejercicio={ejercicio}
          mes={mes}
          contabilizadas={contabilizadas}
          borradores={elegidas.length ? borradores : []}
          onCerrar={() => setAccion(null)}
          onHecho={hecho}
        />
      )}
      {accion?.tipo === 'anularPago' && <AnularPago ejercicio={ejercicio} mes={mes} pagadas={pagadas} todas={!elegidas.length} onCerrar={() => setAccion(null)} onHecho={hecho} />}
      {accion?.tipo === 'borrar' && <BorrarNomina nomina={accion.nomina} onCerrar={() => setAccion(null)} onHecho={hecho} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagar los liquidos (465 de cada trabajador contra el banco o la caja)
// ---------------------------------------------------------------------------

function PagarLiquidos({
  ejercicio,
  mes,
  nominas,
  todas,
  onCerrar,
  onHecho,
}: {
  ejercicio: number;
  mes: number;
  nominas: Nomina[];
  todas: boolean;
  onCerrar: () => void;
  onHecho: (t: string, avisos?: string[]) => void;
}) {
  const [medio, setMedio] = useState<MedioPago>({ fecha: hoyIso(), cuenta: '' });
  const embargos = Math.round(nominas.reduce((a, n) => a + n.embargos * 100, 0)) / 100;
  const liquido = Math.round(nominas.reduce((a, n) => a + n.liquido * 100, 0)) / 100;
  const [conEmbargos, setConEmbargos] = useState(false);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const pagar = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    setError('');
    try {
      const r = await apiFetch<{ pagadas: number; importe: number; asiento: { numero: string }; avisos: string[] }>(companyPath(`/nominas/periodos/${ejercicio}/${mes}/pago`), {
        method: 'POST',
        body: JSON.stringify({ ...cuerpoMedioPago(medio), ...(todas ? {} : { nominaIds: nominas.map((n) => n.id) }), ...(conEmbargos ? { incluirEmbargos: true } : {}) }),
      });
      onHecho(`${r.pagadas} ${r.pagadas === 1 ? 'nómina pagada' : 'nóminas pagadas'}: ${eur.format(r.importe)} (asiento ${r.asiento.numero}).`, r.avisos);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setOcupado(false);
    }
  };

  const total = liquido + (conEmbargos ? embargos : 0);
  return (
    <Modal titulo={`Pagar los líquidos de ${periodoTexto(ejercicio, mes)}`} onCerrar={onCerrar}>
      <form onSubmit={pagar} className="space-y-4">
        <p className="text-sm text-slate-700">
          {nominas.length} {nominas.length === 1 ? 'nómina contabilizada' : 'nóminas contabilizadas'} por <strong className="tabular-nums">{eur.format(liquido)}</strong>. Se salda la 465 de cada trabajador contra la cuenta elegida, y la fecha
          del pago pasa a ser la fecha de pago de la nómina (la que cuenta para el modelo 111).
        </p>
        <ul className="max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 text-sm">
          {nominas.map((n) => (
            <li key={n.id} className="flex justify-between gap-3 px-3 py-1.5">
              <span className="truncate text-slate-700">{n.empleado?.nombreCompleto}</span>
              <span className="tabular-nums text-slate-900">{eur.format(n.liquido)}</span>
            </li>
          ))}
        </ul>
        <CamposMedioPago valor={medio} onCambiar={setMedio} />
        {embargos > 0 && (
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={conEmbargos} onChange={(e) => setConEmbargos(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
            Pagar también los embargos retenidos ({eur.format(embargos)}) en el mismo cargo
          </label>
        )}
        {error && <Alerta tipo="error">{error}</Alerta>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCerrar} disabled={ocupado} className={botonSecundario}>
            Cancelar
          </button>
          <button type="submit" disabled={ocupado || !nominas.length} className={boton}>
            {ocupado ? 'Pagando...' : `Pagar ${eur.format(total)}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Anular la contabilizacion (REVERSED o contraasiento si el periodo esta cerrado)
// ---------------------------------------------------------------------------

function AnularContabilizacion({
  ejercicio,
  mes,
  contabilizadas,
  borradores,
  onCerrar,
  onHecho,
}: {
  ejercicio: number;
  mes: number;
  contabilizadas: Nomina[];
  /** Borradores marcados: solo se pueden dejar anulados. */
  borradores: Nomina[];
  onCerrar: () => void;
  onHecho: (t: string) => void;
}) {
  const [dejarAnuladas, setDejarAnuladas] = useState(!contabilizadas.length);
  const [fecha, setFecha] = useState(hoyIso());
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const afectadas = dejarAnuladas ? [...contabilizadas, ...borradores] : contabilizadas;

  const anular = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    setError('');
    try {
      const r = await apiFetch<{ anuladas: number; estadoFinal: string; asientosRevertidos: string[]; contraasientos: Array<{ numero: string }> }>(
        companyPath(`/nominas/periodos/${ejercicio}/${mes}/anular`),
        {
          method: 'POST',
          body: JSON.stringify({
            // Siempre con las nominas concretas: sin ellas, el servidor rechaza el mes entero si alguna esta pagada.
            nominaIds: afectadas.map((n) => n.id),
            fecha,
            ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
            ...(dejarAnuladas ? { dejarAnuladas: true } : {}),
          }),
        },
      );
      const partes = [
        r.asientosRevertidos.length ? `${r.asientosRevertidos.length} ${r.asientosRevertidos.length === 1 ? 'asiento anulado' : 'asientos anulados'}` : '',
        r.contraasientos.length ? `${r.contraasientos.length} ${r.contraasientos.length === 1 ? 'contraasiento' : 'contraasientos'} (${r.contraasientos.map((c) => c.numero).join(', ')})` : '',
      ].filter(Boolean);
      onHecho(`${r.anuladas} ${r.anuladas === 1 ? 'nómina' : 'nóminas'} ${r.estadoFinal === 'ANULADA' ? 'anuladas' : 'vuelven a borrador'}${partes.length ? `: ${partes.join(' y ')}` : ''}.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal titulo="Anular la contabilización" onCerrar={onCerrar}>
      <form onSubmit={anular} className="space-y-4">
        <p className="text-sm text-slate-700">
          {contabilizadas.length > 0
            ? `${contabilizadas.length} ${contabilizadas.length === 1 ? 'nómina contabilizada' : 'nóminas contabilizadas'}. Con el periodo abierto, su asiento se anula; si está cerrado, se hace un contraasiento con la fecha indicada.`
            : 'Las nóminas marcadas están en borrador: solo se pueden dejar anuladas.'}{' '}
          Las nóminas pagadas hay que desmarcarlas o anular antes su pago.
        </p>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={dejarAnuladas} disabled={!contabilizadas.length} onChange={(e) => setDejarAnuladas(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
          <span>
            Dejarlas anuladas
            <span className="block text-xs text-slate-500">Si no, vuelven a borrador para corregirlas y contabilizarlas otra vez.</span>
          </span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="an-fecha" className={etiqueta}>
              Fecha del contraasiento
            </label>
            <input id="an-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={campo} />
          </div>
          <div>
            <label htmlFor="an-motivo" className={etiqueta}>
              Motivo
            </label>
            <input id="an-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} className={campo} placeholder="Opcional" />
          </div>
        </div>
        {error && <Alerta tipo="error">{error}</Alerta>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCerrar} disabled={ocupado} className={botonSecundario}>
            Cancelar
          </button>
          <button type="submit" disabled={ocupado || !afectadas.length} className={botonPeligro}>
            {ocupado ? 'Anulando...' : `Anular ${afectadas.length} ${afectadas.length === 1 ? 'nómina' : 'nóminas'}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AnularPago({ ejercicio, mes, pagadas, todas, onCerrar, onHecho }: { ejercicio: number; mes: number; pagadas: Nomina[]; todas: boolean; onCerrar: () => void; onHecho: (t: string) => void }) {
  const [fecha, setFecha] = useState(hoyIso());
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const anular = async (e: React.FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    setError('');
    try {
      const r = await apiFetch<{ nominas: number; arrastradas: number; contraasientos: Array<{ numero: string }>; movimientosDesconciliados: number }>(
        companyPath(`/nominas/periodos/${ejercicio}/${mes}/pago/anular`),
        { method: 'POST', body: JSON.stringify({ ...(todas ? {} : { nominaIds: pagadas.map((n) => n.id) }), fecha, ...(motivo.trim() ? { motivo: motivo.trim() } : {}) }) },
      );
      onHecho(
        `Pago anulado: ${r.nominas} ${r.nominas === 1 ? 'nómina vuelve' : 'nóminas vuelven'} a contabilizada` +
          (r.arrastradas ? ` (${r.arrastradas} de otras nóminas pagadas en el mismo cargo)` : '') +
          (r.contraasientos.length ? `; contraasiento ${r.contraasientos.map((c) => c.numero).join(', ')}` : '') +
          (r.movimientosDesconciliados ? '; el movimiento del banco queda sin conciliar' : '') +
          '.',
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal titulo="Anular el pago de los líquidos" onCerrar={onCerrar}>
      <form onSubmit={anular} className="space-y-4">
        <p className="text-sm text-slate-700">
          {pagadas.length} {pagadas.length === 1 ? 'nómina pagada' : 'nóminas pagadas'}. El pago se anula entero: si en el mismo cargo se pagaron otras nóminas, también vuelven a contabilizada.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="ap-fecha" className={etiqueta}>
              Fecha del contraasiento
            </label>
            <input id="ap-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={campo} />
          </div>
          <div>
            <label htmlFor="ap-motivo" className={etiqueta}>
              Motivo
            </label>
            <input id="ap-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} className={campo} placeholder="Opcional" />
          </div>
        </div>
        {error && <Alerta tipo="error">{error}</Alerta>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCerrar} disabled={ocupado} className={botonSecundario}>
            Cancelar
          </button>
          <button type="submit" disabled={ocupado} className={botonPeligro}>
            {ocupado ? 'Anulando...' : 'Anular el pago'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function BorrarNomina({ nomina, onCerrar, onHecho }: { nomina: Nomina; onCerrar: () => void; onHecho: (t: string) => void }) {
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const borrar = async () => {
    setOcupado(true);
    setError('');
    try {
      await apiFetch(companyPath(`/nominas/${nomina.id}`), { method: 'DELETE' });
      onHecho(`Nómina de ${nomina.empleado?.nombreCompleto ?? 'el trabajador'} borrada.`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setOcupado(false);
    }
  };
  return (
    <Modal titulo="Borrar la nómina" onCerrar={onCerrar}>
      <div className="space-y-4">
        <p className="text-sm text-slate-700">
          Se borra la nómina {textoTipo(nomina.tipo).toLowerCase()} de <strong>{nomina.empleado?.nombreCompleto}</strong> de {periodoTexto(nomina.ejercicio, nomina.mes)} ({eur.format(nomina.liquido)} de
          líquido). No tiene asiento, así que no cambia la contabilidad.
        </p>
        {error && <Alerta tipo="error">{error}</Alerta>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCerrar} disabled={ocupado} className={botonSecundario}>
            Cancelar
          </button>
          <button type="button" onClick={borrar} disabled={ocupado} className={botonPeligro}>
            {ocupado ? 'Borrando...' : 'Borrar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
