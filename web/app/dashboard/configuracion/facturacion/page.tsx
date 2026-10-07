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
 * Ver: ventas:read o contabilidad:read; cambiar: ventas:write.
 */

const TEXTO_PIE_MAX = 500;

interface Formulario {
  formaPago: AjustesFacturacion['formaPago'];
  diasVencimiento: string;
  irpfDefecto: number;
  cuentaBancariaId: string; // '' = automatica
  mostrarIban: boolean;
  textoPie: string;
}

type Campo = keyof Formulario;

const aFormulario = (a: AjustesFacturacion): Formulario => ({
  formaPago: a.formaPago,
  diasVencimiento: String(a.diasVencimiento),
  irpfDefecto: Number(a.irpfDefecto) || 0,
  cuentaBancariaId: a.cuentaBancariaId ?? '',
  mostrarIban: a.mostrarIban,
  textoPie: a.textoPie ?? '',
});

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
  // La que saldria en una factura en la moneda de la empresa (misma regla que el servidor:
  // la elegida; si no, la primera activa en esa moneda y, si no hay, la primera activa).
  const cuentaMuestra = form
    ? (cuentas.find((c) => c.id === form.cuentaBancariaId) ?? cuentas.find((c) => c.moneda === moneda) ?? cuentas[0] ?? null)
    : null;
  const formaTexto = FORMAS_PAGO.find(([v]) => v === form?.formaPago)?.[1] ?? '';

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
                disabled={off || !form.mostrarIban}
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
                  (cuentas.length === 0 ? (
                    <>
                      No hay cuentas bancarias activas.{' '}
                      {tieneAlgunPermiso(user, ['tesoreria:read', 'tesoreria:write']) ? (
                        <Link href="/dashboard/tesoreria/cuentas" className="font-medium text-emerald-700 underline">
                          Da de alta una
                        </Link>
                      ) : (
                        'Pide a quien lleva la tesorería que dé de alta una'
                      )}{' '}
                      para que tus clientes sepan dónde pagarte.
                    </>
                  ) : (
                    'Con la automática, una factura en dólares lleva tu cuenta en dólares si la tienes. Una cuenta concreta sale en todas las facturas.'
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
                <span className="block text-slate-600">Quítalo si tus clientes pagan con recibo domiciliado o al contado.</span>
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

            {/* Muestra de como queda el final del PDF. */}
            <div aria-label="Así queda el pie de la factura" className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Así queda el pie de la factura</p>
              <p className="text-xs text-slate-800">
                <span className="font-semibold">Forma de pago:</span> {formaTexto}
                {form.mostrarIban && (
                  <>
                    {' · '}
                    <span className="font-semibold">IBAN:</span>{' '}
                    {cuentaMuestra ? (
                      <span className="font-mono">
                        {ibanLegible(cuentaMuestra.iban)}
                        {cuentaMuestra.bancoNombre ? ` (${cuentaMuestra.bancoNombre})` : ''}
                      </span>
                    ) : (
                      <span className="text-amber-700">sin cuenta bancaria</span>
                    )}
                  </>
                )}
              </p>
              {form.textoPie.trim() && <p className="mt-2 whitespace-pre-line text-[11px] leading-snug text-slate-500">{form.textoPie.trim()}</p>}
            </div>
          </section>

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
