'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Receipt } from '@phosphor-icons/react';
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
} from '@/lib/configuracion';
import { AvisoSoloLectura, CabeceraBloque, Mensaje, SinAcceso, type MensajeConfig } from '../componentes';
import { useConfiguracion } from '../contexto';

/**
 * Valores por defecto de facturacion: forma de pago, dias de vencimiento,
 * IRPF habitual (solo España), cuenta bancaria que sale en la factura, mostrar
 * o no el IBAN y un texto al pie. Al emitir, el IBAN y el pie se copian en la
 * factura: cambiarlos aqui no cambia las ya emitidas.
 * IEEPNR (impuesto sobre los envases de plástico, plantilla A; solo empresas
 * españolas): si se repercute, a cuánto el kg y, solo si la empresa fuera
 * contribuyente, la cuenta a la que va. Cada factura guarda el tipo con que se
 * hizo: cambiarlo no cambia las emitidas.
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
});

/** € por kg escrito a mano ('0,45' o '0.45'): NaN si no es un número con 4 decimales como mucho. */
function leerTipoIeepnr(texto: string): number {
  const t = texto.trim();
  if (!/^\d+([.,]\d{1,4})?$/.test(t)) return NaN;
  return Number(t.replace(',', '.'));
}

/** IBAN en grupos de cuatro, como sale en la factura. */
const ibanLegible = (iban: string) => iban.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();

export default function FacturacionPage() {
  const { user, listo } = useConfiguracion();
  const ver = puedeVer(user, 'facturacion');
  const editar = puedeEditar(user, 'facturacion');

  const [ajustes, setAjustes] = useState<AjustesFacturacion | null>(null);
  const [form, setForm] = useState<Formulario | null>(null);
  const [errores, setErrores] = useState<Partial<Record<Campo, string>>>({});
  const [mensaje, setMensaje] = useState<MensajeConfig>(null);
  const [guardando, setGuardando] = useState(false);
  // IEEPNR: solo en una empresa española y con un servidor que lo tenga.
  const conIeepnr = !!ajustes?.empresaEspanola && ajustes.ieepnrRepercute !== undefined;

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
    setErrores(err);
    setMensaje(null);
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
        }),
      });
      setAjustes(a);
      setForm(aFormulario(a));
      setMensaje({ ok: true, texto: 'Guardado. Las facturas nuevas usarán estos valores; las ya emitidas no cambian.' });
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
        <form onSubmit={guardar} className="space-y-6" noValidate>
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
                  <span className="font-medium text-slate-900">Repercuto el IEEPNR en mis facturas</span>
                  <span id="ieepnrRepercute-ayuda" className="block text-slate-600">
                    Si lo marcas, la serie A pasa a usar la plantilla A (envases), salvo que le hayas elegido otra en Configuración &gt; Series. Si no lo marcas, la serie
                    A sigue con la estándar y, en las series con la plantilla A, el IEEPNR sale a 0 aunque las líneas lleven kg de plástico.
                  </span>
                </span>
              </label>
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

          <Mensaje mensaje={mensaje} onCerrar={() => setMensaje(null)} />

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
