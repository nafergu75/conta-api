'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash } from '@phosphor-icons/react';
import { Tooltip } from '@/app/dashboard/components/Tooltip';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';

/**
 * Alta de factura de venta, o edicion de un borrador (?id=...).
 *
 * "Guardar borrador" la deja sin numero y editable. "Emitir factura" le da el
 * siguiente numero de la serie y ya no se puede cambiar: los errores se
 * corrigen con una rectificativa (como exige Verifactu).
 */

interface Cliente {
  id: string;
  nombreFiscal: string;
  nifCif: string;
}

interface Serie {
  id: string;
  codigo: string;
  descripcion: string;
  activa: boolean;
  porDefecto: boolean;
  ultimoNumero?: number;
}

interface Producto {
  id: string;
  referencia: string;
  descripcion: string;
  precio: number;
  ivaPorcentaje: number;
  bloqueado: boolean;
}

interface Linea {
  clave: number;
  productoServicioId: string;
  descripcion: string;
  cantidad: string;
  precioUnitario: string;
  descuentoPorcentaje: string;
  tipoIva: number;
}

interface FacturaApi {
  id: string;
  customerId: string;
  serie: string;
  estadoDocumento: string;
  tipoFactura: string;
  fechaEmision: string;
  fechaVencimiento: string;
  observaciones?: string;
  lineas: Array<{
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    descuentoPorcentaje: number;
    tipoIva: number;
    tipoRetencion: number;
    productoServicioId?: string;
  }>;
}

const IVAS = [21, 10, 5, 4, 0];
const IRPFS = [0, 7, 15, 19];
const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const num = (s: string): number => {
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const hoy = () => new Date().toISOString().slice(0, 10);
const masDias = (fecha: string, dias: number) => {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

let siguienteClave = 1;
const lineaVacia = (): Linea => ({
  clave: siguienteClave++,
  productoServicioId: '',
  descripcion: '',
  cantidad: '1',
  precioUnitario: '',
  descuentoPorcentaje: '0',
  tipoIva: 21,
});

const campo =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';
const etiqueta = 'mb-1 block text-sm font-medium text-slate-700';

export default function NuevaFacturaPage() {
  return (
    <Suspense fallback={<p className="p-6 text-slate-500">Cargando…</p>}>
      <FormularioFactura />
    </Suspense>
  );
}

function FormularioFactura() {
  const router = useRouter();
  const borradorId = useSearchParams().get('id');

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [series, setSeries] = useState<Serie[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const [clienteId, setClienteId] = useState('');
  const [serie, setSerie] = useState('');
  const [tipoFactura, setTipoFactura] = useState('F1');
  const [fechaEmision, setFechaEmision] = useState(hoy());
  const [fechaVencimiento, setFechaVencimiento] = useState(masDias(hoy(), 30));
  const [irpf, setIrpf] = useState(0);
  const [observaciones, setObservaciones] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()]);

  useEffect(() => {
    (async () => {
      try {
        const [cli, ser, prod] = await Promise.all([
          apiFetch<{ items: Cliente[] } | Cliente[]>(companyPath('/clientes?limit=1000')),
          apiFetch<Serie[]>(companyPath('/series?tipoDocumento=FACTURA')),
          apiFetch<{ items: Producto[] }>(companyPath('/productos?limit=1000&activos=true')).catch(() => ({ items: [] })),
        ]);
        setClientes(Array.isArray(cli) ? cli : cli.items ?? []);
        const activas = ser.filter((s) => s.activa);
        setSeries(activas);
        setProductos(prod.items ?? []);

        if (borradorId) {
          const { invoice } = await apiFetch<{ invoice: FacturaApi }>(companyPath(`/income-invoices/${borradorId}`));
          if (invoice.estadoDocumento !== 'BORRADOR') {
            router.replace(`/dashboard/facturas/${invoice.id}`);
            return;
          }
          setClienteId(invoice.customerId);
          setSerie(invoice.serie);
          setTipoFactura(invoice.tipoFactura);
          setFechaEmision(invoice.fechaEmision);
          setFechaVencimiento(invoice.fechaVencimiento);
          setObservaciones(invoice.observaciones ?? '');
          setIrpf(invoice.lineas.find((l) => l.tipoRetencion)?.tipoRetencion ?? 0);
          setLineas(
            invoice.lineas.map((l) => ({
              clave: siguienteClave++,
              productoServicioId: l.productoServicioId ?? '',
              descripcion: l.descripcion,
              cantidad: String(l.cantidad),
              precioUnitario: String(l.precioUnitario),
              descuentoPorcentaje: String(l.descuentoPorcentaje ?? 0),
              tipoIva: l.tipoIva,
            })),
          );
        } else {
          setSerie((activas.find((s) => s.porDefecto) ?? activas[0])?.codigo ?? '');
        }
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setCargando(false);
      }
    })();
  }, [borradorId, router]);

  const cambiarLinea = (clave: number, cambios: Partial<Linea>) =>
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));

  const elegirProducto = (clave: number, id: string) => {
    const p = productos.find((x) => x.id === id);
    if (!p) return cambiarLinea(clave, { productoServicioId: '' });
    cambiarLinea(clave, {
      productoServicioId: p.id,
      descripcion: p.descripcion,
      precioUnitario: String(p.precio),
      tipoIva: IVAS.includes(p.ivaPorcentaje) ? p.ivaPorcentaje : 21,
    });
  };

  // Mismo calculo que el servidor (redondeo por linea), para que lo que se ve sea lo que se emite.
  const totales = useMemo(() => {
    let base = 0;
    let retencion = 0;
    const porTipo = new Map<number, { base: number; cuota: number }>();
    for (const l of lineas) {
      const bruto = r2(num(l.cantidad) * num(l.precioUnitario));
      const b = r2(bruto - r2((bruto * num(l.descuentoPorcentaje)) / 100));
      const cuota = r2((b * l.tipoIva) / 100);
      base = r2(base + b);
      retencion = r2(retencion + r2((b * irpf) / 100));
      const t = porTipo.get(l.tipoIva) ?? { base: 0, cuota: 0 };
      porTipo.set(l.tipoIva, { base: r2(t.base + b), cuota: r2(t.cuota + cuota) });
    }
    const iva = r2(Array.from(porTipo.values()).reduce((s, t) => s + t.cuota, 0));
    return { base, iva, retencion, total: r2(base + iva - retencion), porTipo: Array.from(porTipo.entries()).sort((a, b) => b[0] - a[0]) };
  }, [lineas, irpf]);

  const serieElegida = series.find((s) => s.codigo === serie);

  const cuerpo = () => ({
    customer: { id: clienteId },
    serie,
    tipoFactura,
    fechaEmision,
    fechaVencimiento,
    observaciones: observaciones.trim() || undefined,
    lineas: lineas.map((l) => ({
      descripcion: l.descripcion.trim(),
      cantidad: num(l.cantidad),
      precioUnitario: num(l.precioUnitario),
      descuentoPorcentaje: num(l.descuentoPorcentaje),
      tipoIva: l.tipoIva,
      tipoRetencion: irpf,
      productoServicioId: l.productoServicioId || undefined,
    })),
  });

  const comprobar = (): string => {
    if (!clienteId) return 'Elige el cliente.';
    if (!serie) return 'Elige la serie.';
    if (fechaVencimiento < fechaEmision) return 'El vencimiento no puede ser anterior a la fecha de emisión.';
    const mal = lineas.findIndex((l) => !l.descripcion.trim() || num(l.cantidad) === 0 || l.precioUnitario === '');
    if (mal >= 0) return `Completa la línea ${mal + 1}: descripción, cantidad y precio.`;
    return '';
  };

  const guardar = async (emitir: boolean) => {
    const fallo = comprobar();
    if (fallo) return setError(fallo);
    if (emitir) {
      const siguiente = (serieElegida?.ultimoNumero ?? 0) + 1;
      const ok = window.confirm(
        `Vas a emitir la factura ${serie}-${siguiente} (aprox.) por ${eur.format(totales.total)}.\n\n` +
          'Una vez emitida no se puede modificar ni borrar; solo corregir con una factura rectificativa. ¿Emitir?',
      );
      if (!ok) return;
    }
    setGuardando(true);
    setError('');
    try {
      let id = borradorId;
      if (borradorId) {
        await apiFetch(companyPath(`/income-invoices/${borradorId}`), { method: 'PUT', body: JSON.stringify(cuerpo()) });
      } else {
        const { invoice } = await apiFetch<{ invoice: { id: string } }>(companyPath('/income-invoices'), {
          method: 'POST',
          body: JSON.stringify({ ...cuerpo(), borrador: true }),
        });
        id = invoice.id;
      }
      if (emitir) {
        await apiFetch(companyPath(`/income-invoices/${id}/finalizar`), {
          method: 'POST',
          body: JSON.stringify({ fechaEmision }),
        });
      }
      router.push(`/dashboard/facturas/${id}`);
    } catch (e) {
      setError(errorMessage(e));
      setGuardando(false);
    }
  };

  if (cargando) return <p className="p-6 text-slate-500">Cargando…</p>;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/facturas" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Volver a facturas">
          <ArrowLeft size={20} />
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">{borradorId ? 'Editar borrador' : 'Nueva factura'}</h1>
        <Tooltip text="Guarda como borrador mientras la preparas. Al emitirla recibe el siguiente número de la serie y ya no se puede cambiar." />
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <section className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-3">
        <div className="md:col-span-2">
          <label className={etiqueta} htmlFor="cliente">Cliente</label>
          <select id="cliente" className={campo} value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">Elige un cliente…</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombreFiscal} — {c.nifCif}
              </option>
            ))}
          </select>
          {clientes.length === 0 && (
            <p className="mt-1 text-xs text-slate-500">
              No hay clientes. <Link href="/dashboard/clientes" className="text-blue-700 underline">Da de alta uno</Link> antes de facturar.
            </p>
          )}
        </div>
        <div>
          <label className={etiqueta} htmlFor="serie">Serie</label>
          <select id="serie" className={campo} value={serie} onChange={(e) => setSerie(e.target.value)}>
            {series.map((s) => (
              <option key={s.id} value={s.codigo}>
                {s.codigo} — {s.descripcion}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={etiqueta} htmlFor="tipo">Tipo de factura</label>
          <select id="tipo" className={campo} value={tipoFactura} onChange={(e) => setTipoFactura(e.target.value)}>
            <option value="F1">Completa (F1)</option>
            <option value="F2">Simplificada / ticket (F2)</option>
          </select>
        </div>
        <div>
          <label className={etiqueta} htmlFor="emision">Fecha de emisión</label>
          <input id="emision" type="date" className={campo} value={fechaEmision} onChange={(e) => setFechaEmision(e.target.value)} />
        </div>
        <div>
          <label className={etiqueta} htmlFor="vencimiento">Vencimiento</label>
          <input id="vencimiento" type="date" className={campo} value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="font-semibold text-slate-900">Líneas</h2>
          <button
            type="button"
            onClick={() => setLineas((ls) => [...ls, lineaVacia()])}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Plus size={16} /> Añadir línea
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 font-medium">Descripción</th>
                <th className="w-20 px-3 py-2 text-right font-medium">Cant.</th>
                <th className="w-28 px-3 py-2 text-right font-medium">Precio</th>
                <th className="w-20 px-3 py-2 text-right font-medium">Dto. %</th>
                <th className="w-24 px-3 py-2 font-medium">IVA</th>
                <th className="w-28 px-3 py-2 text-right font-medium">Importe</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lineas.map((l, i) => {
                const bruto = r2(num(l.cantidad) * num(l.precioUnitario));
                const importe = r2(bruto - r2((bruto * num(l.descuentoPorcentaje)) / 100));
                return (
                  <tr key={l.clave}>
                    <td className="px-3 py-2">
                      <select
                        aria-label={`Producto de la línea ${i + 1}`}
                        className={campo}
                        value={l.productoServicioId}
                        onChange={(e) => elegirProducto(l.clave, e.target.value)}
                      >
                        <option value="">Libre</option>
                        {productos.filter((p) => !p.bloqueado).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.referencia} — {p.descripcion}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        aria-label={`Descripción de la línea ${i + 1}`}
                        className={campo}
                        value={l.descripcion}
                        onChange={(e) => cambiarLinea(l.clave, { descripcion: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        aria-label={`Cantidad de la línea ${i + 1}`}
                        inputMode="decimal"
                        className={`${campo} text-right`}
                        value={l.cantidad}
                        onChange={(e) => cambiarLinea(l.clave, { cantidad: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        aria-label={`Precio de la línea ${i + 1}`}
                        inputMode="decimal"
                        className={`${campo} text-right`}
                        value={l.precioUnitario}
                        onChange={(e) => cambiarLinea(l.clave, { precioUnitario: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        aria-label={`Descuento de la línea ${i + 1}`}
                        inputMode="decimal"
                        className={`${campo} text-right`}
                        value={l.descuentoPorcentaje}
                        onChange={(e) => cambiarLinea(l.clave, { descuentoPorcentaje: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        aria-label={`IVA de la línea ${i + 1}`}
                        className={campo}
                        value={l.tipoIva}
                        onChange={(e) => cambiarLinea(l.clave, { tipoIva: Number(e.target.value) })}
                      >
                        {IVAS.map((t) => (
                          <option key={t} value={t}>
                            {t} %
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-900">{eur.format(importe)}</td>
                    <td className="px-1 py-2">
                      <button
                        type="button"
                        aria-label={`Quitar la línea ${i + 1}`}
                        disabled={lineas.length === 1}
                        onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}
                        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                      >
                        <Trash size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <label className={etiqueta} htmlFor="irpf">
              Retención de IRPF
            </label>
            <select id="irpf" className={campo} value={irpf} onChange={(e) => setIrpf(Number(e.target.value))}>
              {IRPFS.map((t) => (
                <option key={t} value={t}>
                  {t === 0 ? 'Sin retención' : `${t} %`}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">Profesionales: 15 % (7 % los tres primeros años de actividad).</p>
          </div>
          <div>
            <label className={etiqueta} htmlFor="obs">Observaciones</label>
            <textarea id="obs" rows={3} className={campo} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-600">Base imponible</dt>
              <dd className="font-mono tabular-nums">{eur.format(totales.base)}</dd>
            </div>
            {totales.porTipo.map(([tipo, t]) => (
              <div key={tipo} className="flex justify-between">
                <dt className="text-slate-600">
                  IVA {tipo} % sobre {eur.format(t.base)}
                </dt>
                <dd className="font-mono tabular-nums">{eur.format(t.cuota)}</dd>
              </div>
            ))}
            {totales.retencion > 0 && (
              <div className="flex justify-between">
                <dt className="text-slate-600">Retención IRPF {irpf} %</dt>
                <dd className="font-mono tabular-nums">−{eur.format(totales.retencion)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-slate-300 pt-2 text-base font-bold text-slate-900">
              <dt>Total</dt>
              <dd className="font-mono tabular-nums">{eur.format(totales.total)}</dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          disabled={guardando}
          onClick={() => guardar(false)}
          className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Guardar borrador
        </button>
        <button
          type="button"
          disabled={guardando}
          onClick={() => guardar(true)}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {guardando ? 'Guardando…' : 'Emitir factura'}
        </button>
      </div>
    </div>
  );
}
