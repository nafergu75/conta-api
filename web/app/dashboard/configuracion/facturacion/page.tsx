'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Receipt, WarningCircle } from '@phosphor-icons/react';
import { apiFetch, campoDelError, companyPath, errorMessage } from '@/lib/api';
import { tieneAlgunPermiso } from '@/lib/auth';
import {
  claseBoton,
  claseCampo,
  FORMAS_PAGO,
  IRPF_PERMITIDOS,
  puedeEditar,
  puedeVer,
  QUIEN_EDITA,
  type AjustesFacturacion,
  type SerieConfig,
} from '@/lib/configuracion';
import { CASILLA_CERAMICA, CASILLA_IEEPNR, COLUMNAS_PLANTILLA_A, COLUMNAS_PLANTILLA_B, NOMBRE_PLANTILLA, normalizarPlantilla } from '@/lib/plantillasFactura';
import { AvisoSoloLectura, CabeceraBloque, Mensaje, SinAcceso, type MensajeConfig } from '../componentes';
import { useConfiguracion } from '../contexto';
import ImagenPlantilla from '@/components/configuracion/ImagenPlantilla';

/**
 * Valores por defecto de facturacion: forma de pago, dias de vencimiento,
 * IRPF habitual (solo España), cuenta bancaria que sale en la factura, mostrar
 * o no el IBAN y un texto al pie. Al emitir, el IBAN y el pie se copian en la
 * factura: cambiarlos aqui no cambia las ya emitidas.
 * IEEPNR (impuesto sobre los envases de plástico, plantilla A; solo empresas
 * españolas): si se repercute, a cuánto el kg y, solo si la empresa fuera
 * contribuyente, la cuenta a la que va. Cada factura guarda el tipo con que se
 * hizo: cambiarlo no cambia las emitidas.
 * Plantilla B (cerámica; solo empresas españolas): si la empresa vende
 * cerámica (entonces su serie B usa sola la plantilla B), la cuenta de
 * ingresos del cargo de palets de madera, el logo de la marca y el sello.
 * Al guardar con «Vendo cerámica» marcada, el servidor crea la serie B si no
 * existe; si existe y no puede usar la B, lo avisa (serieCeramica.aviso).
 * Bajo cada casilla se explica qué cambia, y tras guardar se dice cómo han
 * quedado las series A y B (GET /series).
 * Ver: ventas:read o contabilidad:read; cambiar: ventas:write.
 */

const TEXTO_PIE_MAX = 500;
/** Tipo del IEEPNR: mayor que 0 y como mucho 10 € por kg, con 4 decimales (como el servidor). */
const IEEPNR_POR_KG_MAX = 10;

interface Formulario {
  formaPago: AjustesFacturacion['formaPago'];
  diasVencimiento: string;
  irpfDefecto: number;
  cuentaBancariaId: string; // '' = automatica
  mostrarIban: boolean;
  textoPie: string;
  ieepnrRepercute: boolean;
  ieepnrPorKg: string;
  ieepnrCuenta: string; // '' = la de ingresos de cada linea
  cuentaPalets: string; // '' = la de ventas
  vendeCeramica: boolean;
}

type Campo = keyof Formulario;

const aFormulario = (a: AjustesFacturacion): Formulario => ({
  formaPago: a.formaPago,
  diasVencimiento: String(a.diasVencimiento),
  irpfDefecto: Number(a.irpfDefecto) || 0,
  cuentaBancariaId: a.cuentaBancariaId ?? '',
  mostrarIban: a.mostrarIban,
  textoPie: a.textoPie ?? '',
  ieepnrRepercute: a.ieepnrRepercute === true,
  ieepnrPorKg: String(a.ieepnrPorKg ?? 0.45).replace('.', ','),
  ieepnrCuenta: a.ieepnrCuenta ?? '',
  cuentaPalets: a.cuentaPalets ?? '',
  vendeCeramica: a.vendeCeramica === true,
});

/** € por kg escrito a mano ('0,45' o '0.45'): NaN si no es un número con 4 decimales como mucho. */
function leerTipoIeepnr(texto: string): number {
  const t = texto.trim();
  if (!/^\d+([.,]\d{1,4})?$/.test(t)) return NaN;
  return Number(t.replace(',', '.'));
}

/** IBAN en grupos de cuatro, como sale en la factura. */
const ibanLegible = (iban: string) => iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();

const RUTA_SERIES = '/dashboard/configuracion/series';

/**
 * Cómo queda la serie A tras cambiar «Repercuto el IEEPNR»: con la serie de la
 * lista (null si no se pudo leer la lista; undefined si no hay serie A).
 */
function textoSerieA(a: SerieConfig | null | undefined, marcada: boolean): string {
  if (a === null) {
    return marcada
      ? 'La serie A usará la plantilla A, salvo que le hayas elegido otra en Configuración > Series.'
      : 'La serie A vuelve a la plantilla estándar, salvo que le hayas elegido otra en Configuración > Series.';
  }
  if (!a) return marcada ? 'No tienes serie A: para facturar con la plantilla A, elígela en una serie de facturas en Configuración > Series.' : '';
  if (a.motivoPlantilla === 'elegida' || (a.plantillaElegida && a.motivoPlantilla === undefined)) {
    // Elegida a mano la propia plantilla A: ya la usa (sin la casilla, con el IEEPNR a 0).
    if (normalizarPlantilla(a.plantilla) === 'A') {
      return marcada
        ? 'La serie A ya usa la plantilla A, que tiene elegida en Configuración > Series.'
        : 'La serie A sigue con la plantilla A, que tiene elegida en Configuración > Series, pero en las facturas nuevas el IEEPNR saldrá a 0.';
    }
    const nombre = NOMBRE_PLANTILLA[normalizarPlantilla(a.plantilla)];
    return marcada
      ? `La serie A tiene elegida la ${nombre} en Configuración > Series y sigue con esa. Para que use la plantilla A, ponle allí «Automática».`
      : `La serie A sigue con la ${nombre}, que tiene elegida en Configuración > Series.`;
  }
  if (marcada) {
    return `La serie A usa ahora la plantilla A: columnas ${COLUMNAS_PLANTILLA_A}.${a.activa ? '' : ' Está desactivada: actívala en Configuración > Series para usarla.'}`;
  }
  return 'La serie A vuelve a la plantilla estándar.';
}

/** Cómo queda la serie B tras guardar (sin el aviso, que va aparte). '' si no hay nada que decir. */
function textoSerieB(antes: boolean, despues: AjustesFacturacion, b: SerieConfig | null | undefined): string {
  const marcada = despues.vendeCeramica === true;
  const estado = despues.serieCeramica?.estado;
  if (marcada && estado === 'creada') {
    return `Se ha creado la serie B (cerámica y materiales de construcción) con la plantilla B: columnas de ${COLUMNAS_PLANTILLA_B}. Ya puedes elegirla en Nueva factura.`;
  }
  if (antes === marcada) return '';
  if (marcada) {
    if (estado !== 'activa') return '';
    // 'activa' con plantilla elegida solo puede ser la B (con otra, el servidor dice 'otraPlantilla').
    return b?.motivoPlantilla === 'elegida'
      ? 'La serie B ya usa la plantilla B, que tiene elegida en Configuración > Series.'
      : `La serie B usa ahora la plantilla B: columnas de ${COLUMNAS_PLANTILLA_B}.`;
  }
  if (b === undefined) return '';
  if (b?.motivoPlantilla === 'elegida') {
    const id = normalizarPlantilla(b.plantilla);
    return `La serie B sigue con la ${id === 'B' ? 'plantilla B' : NOMBRE_PLANTILLA[id]}, que tiene elegida en Configuración > Series.`;
  }
  return 'La serie B vuelve a la plantilla estándar. No se ha borrado ni desactivado.';
}

/** Aviso de la serie B (desactivada, histórica del lector, de otro tipo o con otra plantilla), con el enlace a las series. */
function AvisoSerieB({ texto, anunciar = false }: { texto: string; anunciar?: boolean }) {
  return (
    <div role={anunciar ? 'status' : undefined} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <WarningCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p className="min-w-0">
        {texto}{' '}
        <Link href={RUTA_SERIES} className="whitespace-nowrap font-medium underline">
          Abrir las series
        </Link>
      </p>
    </div>
  );
}

/**
 * Bajo la casilla «Vendo cerámica»: qué pasará al guardar (si se ha cambiado)
 * o cómo está la serie B (si ya estaba marcada). Justo después de guardar, el
 * aviso de la serie B sale solo bajo «Guardado» (`avisoAparte`), no dos veces.
 */
function EstadoSerieB({
  marcada,
  guardada,
  serie,
  avisoAparte,
}: {
  marcada: boolean;
  guardada: boolean;
  serie: AjustesFacturacion['serieCeramica'];
  avisoAparte: boolean;
}) {
  if (marcada !== guardada) {
    return (
      <p className="text-sm font-medium text-slate-700">
        {marcada
          ? 'Al guardar se crea la serie B, si no la tienes.'
          : 'Al guardar, la serie B vuelve a la plantilla estándar, salvo que tenga otra elegida en Configuración > Series. No se borra ni se desactiva.'}
      </p>
    );
  }
  if (!marcada || !serie) return null;
  if (serie.aviso) return avisoAparte ? null : <AvisoSerieB texto={serie.aviso} />;
  if (serie.estado === 'pendiente') {
    return <p className="text-sm text-slate-600">La serie B aún no está creada: se crea al guardar o al abrir Configuración &gt; Series.</p>;
  }
  return (
    <p className="text-sm text-emerald-700">
      La serie B está activa y usa la plantilla B.{' '}
      <Link href={RUTA_SERIES} className="font-medium underline">
        Ver series
      </Link>
    </p>
  );
}

export default function FacturacionPage() {
  const { user, listo } = useConfiguracion();
  const ver = puedeVer(user, 'facturacion');
  const editar = puedeEditar(user, 'facturacion');

  const [ajustes, setAjustes] = useState<AjustesFacturacion | null>(null);
  const [form, setForm] = useState<Formulario | null>(null);
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({});
  const [mensaje, setMensaje] = useState<MensajeConfig>(null);
  // Tras guardar: lo que hay que hacer con la serie B (desactivada, de otro tipo o con otra plantilla).
  const [avisoGuardado, setAvisoGuardado] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // IEEPNR: solo en una empresa española y con un servidor que lo tenga.
  const conIeepnr = !!ajustes?.empresaEspanola && ajustes.ieepnrRepercute !== undefined;
  // Plantilla B (cerámica): también solo en España y con un servidor que la tenga.
  const conPlantillaB = !!ajustes?.empresaEspanola && ajustes.imagenesPlantillaB !== undefined;
  // La casilla «Vendo cerámica», solo si el servidor la conoce (si no, rechazaría el cambio entero).
  const conVendeCeramica = conPlantillaB && ajustes?.vendeCeramica !== undefined;

  useEffect(() => {
    if (!listo || !ver) return;
    apiFetch<AjustesFacturacion>(companyPath('/ajustes-facturacion'))
      .then((a) => {
        setAjustes(a);
        setForm(aFormulario(a));
      })
      .catch((e) => setMensaje({ ok: false, texto: errorMessage(e) }));
  }, [listo, ver]);

  const cambiar = <K extends Campo>(k: K, v: Formulario[K]) => {
    setForm((f) => (f ? { ...f, [k]: v } : f));
    setErrores((e) => (e[k] ? { ...e, [k]: undefined } : e));
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !ajustes) return;
    const err: Partial<Record<Campo, string>> = {};
    const dias = Number(form.diasVencimiento.trim());
    if (!/^\d+$/.test(form.diasVencimiento.trim()) || dias > 365) err.diasVencimiento = 'Escribe un número de días entre 0 y 365.';
    if (form.textoPie.length > TEXTO_PIE_MAX) err.textoPie = `Como máximo ${TEXTO_PIE_MAX} caracteres.`;
    const tipoIeepnr = leerTipoIeepnr(form.ieepnrPorKg);
    const cuentaIeepnr = form.ieepnrCuenta.replace(/[\s.]/g, '');
    if (conIeepnr) {
      if (!(tipoIeepnr > 0 && tipoIeepnr <= IEEPNR_POR_KG_MAX)) {
        err.ieepnrPorKg = `Escribe un importe en euros mayor que 0 y de ${IEEPNR_POR_KG_MAX} como mucho, con 4 decimales como máximo (por ejemplo, 0,45).`;
      }
      if (cuentaIeepnr && !/^(47\d{0,13}|7\d{1,14})$/.test(cuentaIeepnr)) {
        err.ieepnrCuenta = 'Escribe solo números y una cuenta que empiece por 47 (Hacienda) o por 7 (ingresos), o déjala vacía.';
      }
    }
    const cuentaPalets = form.cuentaPalets.replace(/[\s.]/g, '');
    if (conPlantillaB && cuentaPalets && !/^70\d{1,13}$/.test(cuentaPalets)) {
      err.cuentaPalets = 'Escribe solo números y una cuenta de ventas, que empiece por 70 (por ejemplo, 704), o déjala vacía.';
    }
    setErrores(err);
    setMensaje(null);
    setAvisoGuardado(null);
    if (Object.keys(err).length) return;
    setGuardando(true);
    try {
      const a = await apiFetch<AjustesFacturacion>(companyPath('/ajustes-facturacion'), {
        method: 'PUT',
        body: JSON.stringify({
          formaPago: form.formaPago,
          diasVencimiento: dias,
          ...(ajustes.empresaEspanola ? { irpfDefecto: form.irpfDefecto } : {}),
          cuentaBancariaId: form.cuentaBancariaId || null,
          mostrarIban: form.mostrarIban,
          textoPie: form.textoPie.trim() || null,
          // Solo si el servidor los conoce (si no, rechazaría el cambio entero).
          ...(conIeepnr ? { ieepnrRepercute: form.ieepnrRepercute, ieepnrPorKg: tipoIeepnr, ieepnrCuenta: cuentaIeepnr || null } : {}),
          ...(conPlantillaB ? { cuentaPalets: cuentaPalets || null } : {}),
          ...(conVendeCeramica ? { vendeCeramica: form.vendeCeramica } : {}),
        }),
      });
      // Cómo han quedado las series A y B, si ha cambiado alguna casilla (o se ha creado la B).
      const cambiaA = conIeepnr && form.ieepnrRepercute !== ajustes.ieepnrRepercute;
      const cambiaB = conVendeCeramica && (form.vendeCeramica !== ajustes.vendeCeramica || a.serieCeramica?.estado === 'creada');
      const series =
        cambiaA || cambiaB ? await apiFetch<SerieConfig[]>(companyPath('/series?tipoDocumento=FACTURA')).catch(() => null) : null;
      const serie = (codigo: string) => (series ? series.find((x) => x.codigo === codigo) : null);
      const frases: ReactNode[] = ['Guardado. Las facturas nuevas usarán estos valores; las ya emitidas no cambian.'];
      if (cambiaA) frases.push(textoSerieA(serie('A'), form.ieepnrRepercute));
      if (cambiaB) frases.push(textoSerieB(ajustes.vendeCeramica === true, a, serie('B')));
      setAjustes(a);
      setForm(aFormulario(a));
      setMensaje({
        ok: true,
        texto: (
          <>
            {frases.filter(Boolean).map((f, i) => (
              <p key={i} className={i ? 'mt-1' : undefined}>
                {f}
              </p>
            ))}
          </>
        ),
      });
      setAvisoGuardado(a.vendeCeramica && a.serieCeramica?.aviso ? a.serieCeramica.aviso : null);
    } catch (ex) {
      const campo = campoDelError(ex) as Campo | undefined;
      if (campo && form && campo in form) setErrores({ [campo]: errorMessage(ex) });
      setMensaje({ ok: false, texto: errorMessage(ex) });
    } finally {
      setGuardando(false);
    }
  };

  if (!listo) return null;

  const off = !editar || guardando;
  const cuentas = ajustes?.cuentasBancarias ?? [];
  const moneda = ajustes?.monedaCuenta ?? 'EUR';
  // La que saldria en una factura en la moneda de la empresa (misma regla que el servidor,
  // cuentaParaFactura: la elegida si es de la moneda de la factura; si no, la primera
  // activa en esa moneda y, si no hay, la primera activa).
  const elegida = form ? (cuentas.find((c) => c.id === form.cuentaBancariaId) ?? null) : null;
  const cuentaMuestra = form
    ? ((elegida && elegida.moneda === moneda ? elegida : null) ?? cuentas.find((c) => c.moneda === moneda) ?? cuentas[0] ?? null)
    : null;
  // Hay cuentas en mas de una moneda: las facturas en otra moneda llevan la suya.
  const variasMonedas = new Set(cuentas.map((c) => c.moneda)).size > 1;
  // Solo la transferencia lleva cuenta en la factura (igual que el PDF del servidor).
  const conCuenta = form?.formaPago === 'TRANSFERENCIA';
  const altaCuentas = tieneAlgunPermiso(user, ['tesoreria:write']);

  return (
    <>
      <CabeceraBloque
        icono={Receipt}
        titulo="Valores por defecto de facturación"
        descripcion="Lo que se rellena solo al hacer una factura nueva. En cada factura lo puedes cambiar."
      />

      {!ver ? (
        <SinAcceso texto="Para ver estos ajustes necesitas permiso de ventas o de contabilidad en esta empresa." />
      ) : !form || !ajustes ? (
        mensaje ? <Mensaje mensaje={mensaje} /> : <p className="text-sm text-slate-500">Cargando…</p>
      ) : (
        <form onSubmit={guardar} className="space-y-6 md:pb-16" noValidate>
          {/* md:pb-16: en el escritorio, la confirmación y Guardar quedan por encima del botón flotante de Carmen. */}
          {!editar && <AvisoSoloLectura quien={QUIEN_EDITA.facturacion} />}

          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 md:p-5">
            <h2 className="font-semibold text-slate-900">Cobro</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="formaPago" className="block text-sm font-medium text-slate-700">
                  Forma de pago
                </label>
                <select
                  id="formaPago"
                  value={form.formaPago}
                  onChange={(e) => cambiar('formaPago', e.target.value as Formulario['formaPago'])}
                  disabled={off}
                  className={claseCampo}
                >
                  {FORMAS_PAGO.map(([v, t]) => (
                    <option key={v} value={v}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="diasVencimiento" className="block text-sm font-medium text-slate-700">
                  Días hasta el vencimiento
                </label>
                <input
                  id="diasVencimiento"
                  value={form.diasVencimiento}
                  onChange={(e) => cambiar('diasVencimiento', e.target.value)}
                  disabled={off}
                  inputMode="numeric"
                  aria-invalid={errores.diasVencimiento ? true : undefined}
                  aria-describedby="diasVencimiento-ayuda"
                  className={claseCampo}
                />
                <p id="diasVencimiento-ayuda" className={`mt-1 text-xs ${errores.diasVencimiento ? 'text-red-700' : 'text-slate-500'}`}>
                  {errores.diasVencimiento ?? 'Desde la fecha de emisión. 0: vence el mismo día.'}
                </p>
              </div>
              {ajustes.empresaEspanola && (
                <div>
                  <label htmlFor="irpfDefecto" className="block text-sm font-medium text-slate-700">
                    Retención de IRPF habitual
                  </label>
                  <select
                    id="irpfDefecto"
                    value={form.irpfDefecto}
                    onChange={(e) => cambiar('irpfDefecto', Number(e.target.value))}
                    disabled={off}
                    aria-invalid={errores.irpfDefecto ? true : undefined}
                    aria-describedby="irpfDefecto-ayuda"
                    className={claseCampo}
                  >
                    {IRPF_PERMITIDOS.map((t) => (
                      <option key={t} value={t}>
                        {t === 0 ? 'Sin retención' : `${t} %`}
                      </option>
                    ))}
                  </select>
                  <p id="irpfDefecto-ayuda" className={`mt-1 text-xs ${errores.irpfDefecto ? 'text-red-700' : 'text-slate-500'}`}>
                    {errores.irpfDefecto ??
                      'Normalmente solo la aplican los profesionales (15 %, o 7 % los primeros años). A un cliente extranjero no se le aplica.'}
                  </p>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 md:p-5">
            <h2 className="font-semibold text-slate-900">Lo que sale en la factura</h2>
            <div>
              <label htmlFor="cuentaBancariaId" className="block text-sm font-medium text-slate-700">
                Cuenta bancaria
              </label>
              <select
                id="cuentaBancariaId"
                value={form.cuentaBancariaId}
                onChange={(e) => cambiar('cuentaBancariaId', e.target.value)}
                disabled={off || !form.mostrarIban || !conCuenta}
                aria-invalid={errores.cuentaBancariaId ? true : undefined}
                aria-describedby="cuentaBancariaId-ayuda"
                className={claseCampo}
              >
                <option value="">Automática: la primera activa en la moneda de la factura</option>
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {ibanLegible(c.iban)}
                    {c.bancoNombre ? ` — ${c.bancoNombre}` : ''}
                    {c.moneda !== moneda ? ` (${c.moneda})` : ''}
                  </option>
                ))}
              </select>
              <p id="cuentaBancariaId-ayuda" className={`mt-1 text-xs ${errores.cuentaBancariaId ? 'text-red-700' : 'text-slate-500'}`}>
                {errores.cuentaBancariaId ??
                  (!conCuenta ? (
                    'Con giro o al contado la factura no lleva cuenta bancaria: solo sale cuando la forma de pago es transferencia.'
                  ) : cuentas.length === 0 ? (
                    <>
                      No hay cuentas bancarias activas.{' '}
                      {altaCuentas ? (
                        <Link href="/dashboard/tesoreria/cuentas" className="font-medium text-emerald-700 underline">
                          Da de alta una
                        </Link>
                      ) : (
                        'Pide al administrador de la empresa que dé de alta una'
                      )}{' '}
                      para que tus clientes sepan dónde pagarte.
                    </>
                  ) : (
                    'Con la automática sale la primera cuenta activa. Si eliges una, sale esa en todas las facturas.'
                  ))}
              </p>
            </div>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={form.mostrarIban}
                onChange={(e) => cambiar('mostrarIban', e.target.checked)}
                disabled={off}
                className="mt-1 h-4 w-4 accent-emerald-600"
              />
              <span className="text-sm">
                <span className="font-medium text-slate-900">Mostrar el IBAN en la factura</span>
                <span className="block text-slate-600">Solo sale cuando la forma de pago es transferencia. Quítalo si no quieres que tu cuenta salga en las facturas.</span>
              </span>
            </label>
            <div>
              <label htmlFor="textoPie" className="block text-sm font-medium text-slate-700">
                Texto al pie
              </label>
              <textarea
                id="textoPie"
                value={form.textoPie}
                onChange={(e) => cambiar('textoPie', e.target.value)}
                disabled={off}
                rows={3}
                maxLength={TEXTO_PIE_MAX}
                placeholder="Por ejemplo: inscripción en un registro profesional o condiciones de pago."
                aria-invalid={errores.textoPie ? true : undefined}
                aria-describedby="textoPie-ayuda"
                className={claseCampo}
              />
              <p id="textoPie-ayuda" className={`mt-1 flex justify-between gap-2 text-xs ${errores.textoPie ? 'text-red-700' : 'text-slate-500'}`}>
                <span>{errores.textoPie ?? 'Sale al final de la factura en letra pequeña.'}</span>
                <span className="tabular-nums">
                  {form.textoPie.length}/{TEXTO_PIE_MAX}
                </span>
              </p>
            </div>

            {/* Muestra de la franja de pago y del pie del PDF, con los mismos textos que el servidor. */}
            <div aria-label="Así salen el pago y el pie en la factura" className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Así salen el pago y el pie en la factura</p>
              <p className="text-xs text-slate-800">
                {conCuenta && form.mostrarIban && cuentaMuestra ? (
                  <>
                    <span className="font-semibold">Transferencia a la cuenta</span>{' '}
                    <span className="font-mono">{ibanLegible(cuentaMuestra.iban)}</span>
                  </>
                ) : (
                  <>
                    <span className="font-semibold">Forma de pago:</span>{' '}
                    {form.formaPago === 'TRANSFERENCIA'
                      ? 'Transferencia bancaria'
                      : form.formaPago === 'GIRO'
                        ? 'Recibo domiciliado en su cuenta'
                        : 'Contado'}
                    {conCuenta && form.mostrarIban && <span className="text-amber-700"> (sin cuenta bancaria activa)</span>}
                  </>
                )}
              </p>
              {form.textoPie.trim() && <p className="mt-2 whitespace-pre-line text-[11px] leading-snug text-slate-500">{form.textoPie.trim()}</p>}
              {conCuenta && form.mostrarIban && cuentaMuestra && (
                <p className="mt-2 border-t border-slate-200 pt-2 text-[11px] text-slate-500">
                  Así sale en una factura en {moneda}.{' '}
                  {elegida && elegida.moneda !== moneda
                    ? `La cuenta elegida está en ${elegida.moneda}: sale en las facturas en ${elegida.moneda}, y en las de ${moneda} sale la primera cuenta activa en ${moneda}.`
                    : variasMonedas
                      ? 'Las facturas en otra moneda llevan la primera cuenta activa en esa moneda.'
                      : 'Una factura en otra moneda llevaría la primera cuenta activa en esa moneda, si la das de alta.'}
                </p>
              )}
            </div>
          </section>

          {conIeepnr && (
            <section aria-labelledby="ieepnr-titulo" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 md:p-5">
              <div>
                <h2 id="ieepnr-titulo" className="font-semibold text-slate-900">
                  Impuesto sobre envases de plástico (IEEPNR)
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Solo en las series con la plantilla A (envases). Se cobra en la factura por los kg de plástico no reciclado de cada línea y forma parte de la base del
                  IVA.
                </p>
              </div>
              <div>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={form.ieepnrRepercute}
                    onChange={(e) => cambiar('ieepnrRepercute', e.target.checked)}
                    disabled={off}
                    aria-describedby="ieepnrRepercute-ayuda"
                    className="mt-1 h-4 w-4 accent-emerald-600"
                  />
                  <span className="text-sm">
                    <span className="font-medium text-slate-900">{CASILLA_IEEPNR}</span>
                    <span id="ieepnrRepercute-ayuda" className="block text-slate-600">
                      La serie A usará la plantilla A: columnas {COLUMNAS_PLANTILLA_A}. Sin marcar, la serie A sigue con la estándar (concepto, cantidad, precio y
                      descuento), y en una serie con la plantilla A elegida a mano el IEEPNR sale a 0. Si en Configuración &gt; Series le eliges otra plantilla a la
                      serie A, manda la elegida.
                    </span>
                  </span>
                </label>
                {/* Qué pasará al guardar, si se ha cambiado la casilla (siempre en la página, para que se anuncie). */}
                <div role="status" className="mt-1 pl-7 empty:hidden">
                  {form.ieepnrRepercute !== (ajustes.ieepnrRepercute === true) && (
                    <p className="text-sm font-medium text-slate-700">
                      {form.ieepnrRepercute
                        ? 'Al guardar, la serie A pasa a la plantilla A (si no tiene otra elegida en Configuración > Series).'
                        : 'Al guardar, la serie A vuelve a la plantilla estándar (si no tiene otra elegida en Configuración > Series). Las facturas ya hechas no cambian.'}
                    </p>
                  )}
                </div>
              </div>
              <div className="max-w-xs">
                <label htmlFor="ieepnrPorKg" className="block text-sm font-medium text-slate-700">
                  Euros por kg
                </label>
                <input
                  id="ieepnrPorKg"
                  value={form.ieepnrPorKg}
                  onChange={(e) => cambiar('ieepnrPorKg', e.target.value)}
                  disabled={off}
                  inputMode="decimal"
                  aria-invalid={errores.ieepnrPorKg ? true : undefined}
                  aria-describedby="ieepnrPorKg-ayuda"
                  className={`${claseCampo} text-right tabular-nums`}
                />
                <p id="ieepnrPorKg-ayuda" className={`mt-1 text-xs ${errores.ieepnrPorKg ? 'text-red-700' : 'text-slate-500'}`}>
                  {errores.ieepnrPorKg ?? 'El de la Ley 7/2022 es 0,45 €. Cada factura guarda el suyo: cambiarlo no cambia las ya emitidas.'}
                </p>
              </div>
              <details className="rounded-lg border border-slate-200 p-3" open={!!form.ieepnrCuenta || !!errores.ieepnrCuenta}>
                <summary className="cursor-pointer text-sm font-medium text-slate-700">Cuenta del IEEPNR (solo si sois contribuyentes)</summary>
                <div className="mt-3 max-w-xs">
                  <label htmlFor="ieepnrCuenta" className="block text-sm font-medium text-slate-700">
                    Cuenta
                  </label>
                  <input
                    id="ieepnrCuenta"
                    value={form.ieepnrCuenta}
                    onChange={(e) => cambiar('ieepnrCuenta', e.target.value)}
                    disabled={off}
                    inputMode="numeric"
                    placeholder="La de ingresos de cada línea"
                    aria-invalid={errores.ieepnrCuenta ? true : undefined}
                    aria-describedby="ieepnrCuenta-ayuda"
                    className={`${claseCampo} font-mono`}
                  />
                </div>
                <p id="ieepnrCuenta-ayuda" className={`mt-1 text-xs ${errores.ieepnrCuenta ? 'text-red-700' : 'text-slate-500'}`}>
                  {errores.ieepnrCuenta ??
                    'Déjala vacía si solo repercutes el impuesto: va como venta, en la cuenta de ingresos de su línea. Si sois contribuyentes (presentáis el modelo 592), escribe aquí la cuenta, del grupo 47 o del 7, y el IEEPNR de las facturas que emitas a partir de ahora irá a ella. Cada factura guarda la cuenta con la que se emitió, y sus rectificativas usan la misma.'}
                </p>
              </details>
            </section>
          )}

          {conPlantillaB && (
            <section aria-labelledby="plantilla-b-titulo" className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 md:p-5">
              <div>
                <h2 id="plantilla-b-titulo" className="font-semibold text-slate-900">
                  Plantilla B (cerámica)
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {conVendeCeramica
                    ? 'La factura de cerámica, como la NZ013_2026. La cuenta de los palets, el logo de la marca y el sello solo cuentan en las series con la plantilla B.'
                    : 'Solo en las series con la plantilla B. La serie B la usa sola, salvo que le hayas elegido otra en Configuración > Series.'}
                </p>
              </div>
              {conVendeCeramica && (
                <div>
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={form.vendeCeramica}
                      onChange={(e) => cambiar('vendeCeramica', e.target.checked)}
                      disabled={off}
                      aria-describedby="vendeCeramica-ayuda"
                      className="mt-1 h-4 w-4 accent-emerald-600"
                    />
                    <span className="text-sm">
                      <span className="font-medium text-slate-900">{CASILLA_CERAMICA}</span>
                      <span id="vendeCeramica-ayuda" className="block text-slate-600">
                        Se crea la serie B con la plantilla B: {COLUMNAS_PLANTILLA_B}, además de la obra, los pesos neto y bruto y el cargo de palets. Si ya tienes
                        una serie B de facturas activa, se usa esa. Sin marcar, la serie B sigue con la estándar; quitar la marca no borra ni desactiva la serie. En cualquier serie
                        puedes elegir la plantilla B a mano.
                      </span>
                    </span>
                  </label>
                  {/* Qué pasará al guardar o cómo está la serie B (siempre en la página, para que se anuncie). */}
                  <div role="status" className="mt-2 pl-7 empty:hidden">
                    <EstadoSerieB
                      marcada={form.vendeCeramica}
                      guardada={ajustes.vendeCeramica === true}
                      serie={ajustes.serieCeramica}
                      avisoAparte={!!mensaje?.ok && !!avisoGuardado}
                    />
                  </div>
                </div>
              )}
              <div className="max-w-xs">
                <label htmlFor="cuentaPalets" className="block text-sm font-medium text-slate-700">
                  Cuenta del cargo de palets
                </label>
                <input
                  id="cuentaPalets"
                  value={form.cuentaPalets}
                  onChange={(e) => cambiar('cuentaPalets', e.target.value)}
                  disabled={off}
                  inputMode="numeric"
                  placeholder="La de ventas (700)"
                  aria-invalid={errores.cuentaPalets ? true : undefined}
                  aria-describedby="cuentaPalets-ayuda"
                  className={`${claseCampo} font-mono`}
                />
              </div>
              <p id="cuentaPalets-ayuda" className={`-mt-2 text-xs ${errores.cuentaPalets ? 'text-red-700' : 'text-slate-500'}`}>
                {errores.cuentaPalets ??
                  'La cuenta de ingresos de los palets de madera que se cobran en la factura, por ejemplo la 704 (ventas de envases y embalajes). Vacía, van a la de ventas. Se pone en la línea del cargo al guardar la factura, y en cada factura se puede cambiar.'}
              </p>
              {!errores.cuentaPalets && ajustes.cuentaPaletsProblema && ajustes.cuentaPalets && form.cuentaPalets.replace(/[\s.]/g, '') === ajustes.cuentaPalets && (
                <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {ajustes.cuentaPaletsProblema} Mientras no la cambies (o la vuelvas a activar en el plan contable), el cargo de palets va a la cuenta de ventas de siempre.
                </p>
              )}
              <ImagenPlantilla
                tipo="marca"
                titulo="Logo de la marca"
                ayuda="El segundo logo, el de la marca (por ejemplo, PRACTIKA). Sale arriba en el centro, debajo del de la empresa. PNG o JPG, hasta 1 MB."
                puedeEditar={editar}
              />
              <ImagenPlantilla
                tipo="sello"
                titulo="Sello de la empresa"
                ayuda="Sale abajo a la izquierda, junto a los totales. PNG o JPG, hasta 1 MB; mejor con fondo blanco o transparente."
                puedeEditar={editar}
              />
            </section>
          )}

          <Mensaje
            mensaje={mensaje}
            onCerrar={() => {
              setMensaje(null);
              setAvisoGuardado(null);
            }}
          />
          {mensaje?.ok && avisoGuardado && <AvisoSerieB texto={avisoGuardado} anunciar />}

          {editar && (
            <div className="flex justify-end">
              <button type="submit" disabled={guardando} className={claseBoton}>
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          )}
        </form>
      )}
    </>
  );
}
