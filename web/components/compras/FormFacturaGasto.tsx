'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { CaretDown, CaretRight, MagnifyingGlass, Plus, Trash, WarningCircle, X } from '@phosphor-icons/react';
import { ApiError, apiFetch, campoDelError, companyPath, errorMessage } from '@/lib/api';
import { formatoImporte, parseImporte } from '@/lib/moneda';
import { PAISES, pareceNifIvaUe } from '@/lib/fiscal';
import {
  calcularTotales,
  CUENTAS_GASTO_HABITUALES,
  type GastoDetalle,
  type GastoRegistrado,
  paisDelPrefijo,
  sumarDias,
  TIPO_GASTO_INFO,
  TIPOS_GASTO,
  TIPOS_IVA_GASTO,
  type TipoGasto,
} from '@/lib/compras';

/**
 * Formulario de una factura de gasto: alta (Compras > Nueva factura de gasto),
 * edicion (Modificar) y revision de lo leido por el lector de gastos.
 *
 * - alta: POST /expense-invoices. La factura y su asiento quedan en firme.
 * - editar: PUT /expense-invoices/:id. El servidor rehace el asiento y el libro de IVA.
 * - lector: POST /gastos-extractor/confirmar. La factura y su asiento quedan en
 *   borrador hasta que se aprueba el asiento en el Motor contable.
 *
 * Los totales se calculan con el mismo redondeo que el servidor. Los errores
 * del servidor marcan el campo (details.campo).
 */

export type ProveedorElegido =
  | { tipo: 'existente'; id: string; nombre: string; nif: string; pais: string }
  | {
      tipo: 'nuevo';
      nombreFiscal: string;
      nifCif: string;
      pais: string;
      direccion: string;
      cp: string;
      municipio: string;
      provincia: string;
    };

export interface LineaInicial {
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  descuentoPorcentaje?: number;
  tipoIva: number;
  tipoRetencion: number;
  cuenta?: string | null;
}

export interface FormInicial {
  proveedor?: ProveedorElegido | null;
  numeroFacturaProveedor?: string;
  fechaEmision?: string;
  fechaVencimiento?: string;
  fechaRegistro?: string | null;
  tipoGasto?: TipoGasto;
  cuentaGasto?: string | null;
  lineas?: LineaInicial[];
  observaciones?: string;
  /** Lector: total que pone la factura (se cruza con el calculado). */
  totalDocumento?: number;
}

interface Props {
  modo: 'alta' | 'editar' | 'lector';
  inicial?: FormInicial;
  /** editar: la factura que se corrige. */
  facturaId?: string;
  /** editar: tiene asiento en firme (se rehace al guardar). */
  asientoEnFirme?: boolean;
  /** lector: campos que van tal cual en el cuerpo (tipoDocumento, confianza). */
  extra?: Record<string, unknown>;
  /** Si viene, el boton de guardar queda desactivado y se lee este motivo. */
  bloqueado?: string;
  /** Aviso bajo el proveedor (lector: «se creará al registrar la factura»). */
  avisoProveedor?: string;
  /** Moneda de la contabilidad para los totales. */
  monedaCuenta?: string;
  onGuardado: (r: GastoRegistrado) => void;
  onCancelar?: () => void;
}

interface LineaForm {
  clave: number;
  descripcion: string;
  cantidad: string;
  precio: string;
  descuento: number;
  tipoIva: number;
  tipoRetencion: number;
  /** Cuenta propia de la linea (facturas con varias cuentas). */
  cuenta?: string;
}

interface ProveedorBuscado {
  id: string;
  nombre: string;
  nif: string;
  pais?: string;
  activo?: boolean;
}

/** 12.5 -> '12,5' (para un campo de texto que se lee con parseImporte). */
const numeroATexto = (n: number | undefined | null) => (n === undefined || n === null || !Number.isFinite(n) ? '' : String(n).replace('.', ','));

const campoBase =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-accent-600 focus:border-accent-600 disabled:bg-slate-100 disabled:cursor-not-allowed aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50';
const etiqueta = 'block text-sm font-medium text-slate-700 mb-1';
const ayuda = 'mt-1 text-xs text-slate-500';

let siguienteClave = 1;
const lineaVacia = (tipoIva = 21): LineaForm => ({ clave: siguienteClave++, descripcion: '', cantidad: '1', precio: '', descuento: 0, tipoIva, tipoRetencion: 0 });

const esEspana = (pais: string) => {
  const p = (pais || 'ES').trim().toUpperCase();
  return p === 'ES' || p === 'ESP';
};

export default function FormFacturaGasto({
  modo,
  inicial,
  facturaId,
  asientoEnFirme,
  extra,
  bloqueado,
  avisoProveedor,
  monedaCuenta = 'EUR',
  onGuardado,
  onCancelar,
}: Props) {
  const [proveedor, setProveedor] = useState<ProveedorElegido | null>(inicial?.proveedor ?? null);
  const [numero, setNumero] = useState(inicial?.numeroFacturaProveedor ?? '');
  const [fechaEmision, setFechaEmision] = useState(inicial?.fechaEmision ?? '');
  const [fechaVencimiento, setFechaVencimiento] = useState(inicial?.fechaVencimiento ?? (inicial?.fechaEmision ? sumarDias(inicial.fechaEmision, 30) : ''));
  // En una factura ya guardada el vencimiento no se mueve solo al cambiar la fecha.
  const [vencTocado, setVencTocado] = useState(modo === 'editar' || !!inicial?.fechaVencimiento);
  const [mostrarRegistro, setMostrarRegistro] = useState(!!inicial?.fechaRegistro);
  const [fechaRegistro, setFechaRegistro] = useState(inicial?.fechaRegistro ?? '');
  const [tipoGasto, setTipoGasto] = useState<TipoGasto>(inicial?.tipoGasto ?? 'SUMINISTROS');
  const [cuenta, setCuenta] = useState(inicial?.cuentaGasto ?? '');
  const [mostrarCuenta, setMostrarCuenta] = useState(!!inicial?.cuentaGasto && inicial.cuentaGasto !== TIPO_GASTO_INFO[inicial?.tipoGasto ?? 'SUMINISTROS'].cuenta);
  const [lineas, setLineas] = useState<LineaForm[]>(() =>
    inicial?.lineas?.length
      ? inicial.lineas.map((l) => ({
          clave: siguienteClave++,
          descripcion: l.descripcion,
          cantidad: numeroATexto(l.cantidad),
          precio: numeroATexto(l.precioUnitario),
          descuento: l.descuentoPorcentaje ?? 0,
          tipoIva: l.tipoIva,
          tipoRetencion: l.tipoRetencion,
          cuenta: l.cuenta ?? undefined,
        }))
      : [lineaVacia()],
  );
  const [observaciones, setObservaciones] = useState(inicial?.observaciones ?? '');
  const [totalDocumento, setTotalDocumento] = useState(numeroATexto(inicial?.totalDocumento));

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [campoError, setCampoError] = useState<string | undefined>();
  const [facturaRepetidaId, setFacturaRepetidaId] = useState<string | null>(null);
  const [proveedorRepetidoId, setProveedorRepetidoId] = useState<string | null>(null);

  const paisProveedor = proveedor?.pais ?? 'ES';
  const extranjero = !esEspana(paisProveedor);
  const retenciones = TIPO_GASTO_INFO[tipoGasto].retenciones;
  const conRetencion = retenciones.length > 1 && !extranjero;

  // Un proveedor de fuera de España no cobra IVA español ni lleva retención: se ponen a 0.
  useEffect(() => {
    if (extranjero) setLineas((ls) => (ls.some((l) => l.tipoIva !== 0 || l.tipoRetencion !== 0) ? ls.map((l) => ({ ...l, tipoIva: 0, tipoRetencion: 0 })) : ls));
  }, [extranjero]);

  // Al cambiar el tipo de gasto, las retenciones que ese tipo no admite vuelven a 0.
  useEffect(() => {
    setLineas((ls) => (ls.some((l) => !retenciones.includes(l.tipoRetencion)) ? ls.map((l) => (retenciones.includes(l.tipoRetencion) ? l : { ...l, tipoRetencion: 0 })) : ls));
  }, [retenciones]);

  const valores = useMemo(
    () =>
      lineas.map((l) => ({
        cantidad: parseImporte(l.cantidad),
        precioUnitario: parseImporte(l.precio),
        descuentoPorcentaje: l.descuento,
        tipoIva: l.tipoIva,
        tipoRetencion: conRetencion ? l.tipoRetencion : 0,
      })),
    [lineas, conRetencion],
  );
  const totales = useMemo(() => calcularTotales(valores), [valores]);
  const totalDoc = parseImporte(totalDocumento);
  const totalNoCuadra = modo === 'lector' && Number.isFinite(totalDoc) && Math.abs(totalDoc - totales.total) > 0.02;

  const inv = (campo: string) => !!campoError && (campoError === campo || campoError.startsWith(`${campo}.`));
  const fmt = (n: number) => formatoImporte(n, monedaCuenta);

  const cambiarLinea = (clave: number, cambios: Partial<LineaForm>) => setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));

  const cambiarFecha = (v: string) => {
    setFechaEmision(v);
    if (!vencTocado) setFechaVencimiento(v ? sumarDias(v, 30) : '');
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCampoError(undefined);
    setFacturaRepetidaId(null);
    setProveedorRepetidoId(null);

    // Comprobaciones que el usuario entiende mejor aqui (el servidor repite todas).
    const falta = (mensaje: string, campo: string) => {
      setError(mensaje);
      setCampoError(campo);
    };
    if (!proveedor) return falta('Elige el proveedor de la factura o da de alta uno nuevo.', 'proveedor');
    if (proveedor.tipo === 'nuevo' && !proveedor.nombreFiscal.trim()) return falta('Escribe el nombre del proveedor.', 'proveedor.nombreFiscal');
    if (proveedor.tipo === 'nuevo' && !proveedor.nifCif.trim()) return falta('Escribe el NIF del proveedor.', 'proveedor.nifCif');
    if (!numero.trim()) return falta('Escribe el número que puso el proveedor en su factura.', 'numeroFacturaProveedor');
    if (!fechaEmision) return falta('Falta la fecha de la factura.', 'fechaEmision');
    for (let i = 0; i < lineas.length; i++) {
      if (!lineas[i].descripcion.trim()) return falta(`Falta la descripción de la línea ${i + 1}.`, `lineas.${i}.descripcion`);
      if (!Number.isFinite(valores[i].cantidad) || valores[i].cantidad <= 0) return falta(`Revisa la cantidad de la línea ${i + 1}.`, `lineas.${i}.cantidad`);
      if (!Number.isFinite(valores[i].precioUnitario)) return falta(`Revisa el precio de la línea ${i + 1}.`, `lineas.${i}.precioUnitario`);
    }

    const cuentaGlobal = cuenta.trim();
    const cuerpo: Record<string, unknown> = {
      proveedor:
        proveedor.tipo === 'existente'
          ? { id: proveedor.id }
          : {
              nuevo: {
                nombreFiscal: proveedor.nombreFiscal.trim(),
                nifCif: proveedor.nifCif.trim(),
                pais: proveedor.pais,
                ...(proveedor.direccion.trim() ? { direccion: proveedor.direccion.trim() } : {}),
                ...(proveedor.cp.trim() ? { cp: proveedor.cp.trim() } : {}),
                ...(proveedor.municipio.trim() ? { municipio: proveedor.municipio.trim() } : {}),
                ...(proveedor.provincia.trim() ? { provincia: proveedor.provincia.trim() } : {}),
              },
            },
      numeroFacturaProveedor: numero.trim(),
      fechaEmision,
      ...(fechaVencimiento ? { fechaVencimiento } : {}),
      ...(mostrarRegistro && fechaRegistro ? { fechaRegistro } : {}),
      tipoGasto,
      ...(cuentaGlobal ? { cuentaGasto: cuentaGlobal } : {}),
      lineas: lineas.map((l, i) => ({
        descripcion: l.descripcion.trim(),
        cantidad: valores[i].cantidad,
        precioUnitario: valores[i].precioUnitario,
        descuentoPorcentaje: l.descuento,
        tipoIva: l.tipoIva,
        tipoRetencion: valores[i].tipoRetencion,
        // La cuenta de cada linea solo se conserva si no se ha elegido una para toda la factura.
        ...(l.cuenta && !cuentaGlobal ? { cuenta: l.cuenta } : {}),
      })),
      ...(observaciones.trim() ? { observaciones: observaciones.trim() } : {}),
      ...(modo === 'lector' && Number.isFinite(totalDoc) ? { totalDocumento: totalDoc } : {}),
      ...(extra ?? {}),
    };

    setGuardando(true);
    try {
      if (modo === 'lector') {
        onGuardado(await apiFetch<GastoRegistrado>(companyPath('/gastos-extractor/confirmar'), { method: 'POST', body: JSON.stringify(cuerpo) }));
      } else if (modo === 'editar' && facturaId) {
        const factura = await apiFetch<GastoDetalle>(companyPath(`/expense-invoices/${encodeURIComponent(facturaId)}`), { method: 'PUT', body: JSON.stringify(cuerpo) });
        onGuardado({ factura });
      } else {
        const factura = await apiFetch<GastoDetalle>(companyPath('/expense-invoices'), { method: 'POST', body: JSON.stringify(cuerpo) });
        onGuardado({ factura });
      }
    } catch (err) {
      setError(errorMessage(err));
      setCampoError(campoDelError(err));
      if (err instanceof ApiError && err.status === 409 && err.detalles && typeof err.detalles === 'object') {
        const d = err.detalles as { facturaId?: unknown; proveedorId?: unknown };
        if (typeof d.facturaId === 'string') setFacturaRepetidaId(d.facturaId);
        if (typeof d.proveedorId === 'string') setProveedorRepetidoId(d.proveedorId);
      }
    } finally {
      setGuardando(false);
    }
  };

  /** 409 «Ya existe un proveedor con ese NIF»: se elige el que ya esta dado de alta. */
  const usarProveedorExistente = async () => {
    if (!proveedorRepetidoId) return;
    try {
      const p = await apiFetch<{ id: string; nombreFiscal: string; nifCif: string; pais?: string }>(companyPath(`/proveedores/${encodeURIComponent(proveedorRepetidoId)}`));
      setProveedor({ tipo: 'existente', id: p.id, nombre: p.nombreFiscal, nif: p.nifCif, pais: p.pais || 'ES' });
      setError('');
      setCampoError(undefined);
      setProveedorRepetidoId(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const textoBoton = modo === 'editar' ? 'Guardar cambios' : modo === 'lector' ? 'Registrar factura' : 'Guardar factura';
  const nota =
    modo === 'lector'
      ? 'Quedará pendiente de revisar: su asiento se aprueba en el Motor contable.'
      : modo === 'alta'
        ? 'Al guardar se anota en la contabilidad y en el libro de IVA.'
        : null;

  return (
    <form onSubmit={guardar} noValidate className="flex flex-col gap-6">
      {/* 1. Proveedor */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Proveedor</h2>
        <SelectorProveedor
          valor={proveedor}
          onCambio={(p) => {
            setProveedor(p);
            if (campoError?.startsWith('proveedor')) {
              setError('');
              setCampoError(undefined);
            }
          }}
          inv={inv}
        />
        {avisoProveedor && proveedor?.tipo === 'nuevo' && <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{avisoProveedor}</p>}
        {extranjero && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Proveedor de fuera de España: la factura va sin IVA español y sin retención.
          </p>
        )}
      </section>

      {/* 2. Datos de la factura */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Datos de la factura</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="md:col-span-3">
            <label htmlFor="fg-numero" className={etiqueta}>
              Nº de factura del proveedor *
            </label>
            <input
              id="fg-numero"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              maxLength={60}
              aria-invalid={inv('numeroFacturaProveedor')}
              className={campoBase}
              autoComplete="off"
            />
            <p className={ayuda}>El número que aparece en la factura. Si es un ticket sin número, escribe el número del ticket o la fecha y la hora que aparecen.</p>
          </div>
          <div>
            <label htmlFor="fg-fecha" className={etiqueta}>
              Fecha de la factura *
            </label>
            <input id="fg-fecha" type="date" value={fechaEmision} onChange={(e) => cambiarFecha(e.target.value)} aria-invalid={inv('fechaEmision')} className={campoBase} />
          </div>
          <div>
            <label htmlFor="fg-venc" className={etiqueta}>
              Vencimiento
            </label>
            <input
              id="fg-venc"
              type="date"
              value={fechaVencimiento}
              onChange={(e) => {
                setFechaVencimiento(e.target.value);
                setVencTocado(true);
              }}
              aria-invalid={inv('fechaVencimiento')}
              className={campoBase}
            />
            {!vencTocado && <p className={ayuda}>A 30 días de la fecha de la factura.</p>}
          </div>
          <div className="flex items-end">
            {!mostrarRegistro ? (
              <button type="button" onClick={() => setMostrarRegistro(true)} className="inline-flex items-center gap-1 py-2 text-sm font-medium text-blue-600 hover:underline">
                <CaretRight size={14} /> ¿La recibiste más tarde?
              </button>
            ) : (
              <div className="w-full">
                <label htmlFor="fg-registro" className={etiqueta}>
                  Fecha de registro
                </label>
                <input id="fg-registro" type="date" value={fechaRegistro} onChange={(e) => setFechaRegistro(e.target.value)} aria-invalid={inv('fechaRegistro')} className={campoBase} />
              </div>
            )}
          </div>
          {mostrarRegistro && (
            <p className="md:col-span-3 -mt-2 text-xs text-slate-500">
              El IVA se deduce en el trimestre de esta fecha. Déjala vacía si la anotas en el mismo trimestre que la fecha de la factura.{' '}
              <button
                type="button"
                className="font-medium text-blue-600 hover:underline"
                onClick={() => {
                  setMostrarRegistro(false);
                  setFechaRegistro('');
                }}
              >
                Quitar
              </button>
            </p>
          )}
        </div>

        <fieldset className="mt-5" aria-invalid={inv('tipoGasto')}>
          <legend className={etiqueta}>Tipo de gasto *</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {TIPOS_GASTO.map((t) => (
              <label
                key={t}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${tipoGasto === t ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
              >
                <input type="radio" name="fg-tipo" value={t} checked={tipoGasto === t} onChange={() => setTipoGasto(t)} className="accent-emerald-600" />
                <span>
                  {TIPO_GASTO_INFO[t].texto} <span className="text-slate-500">({TIPO_GASTO_INFO[t].cuenta})</span>
                </span>
              </label>
            ))}
          </div>
          {tipoGasto === 'ALQUILER' && !extranjero && (
            <p className={ayuda}>El alquiler de un local suele llevar una retención del 19 % (modelo 115), salvo que el arrendador te diga que está exento.</p>
          )}
          {tipoGasto === 'SERVICIO_PROFESIONAL' && !extranjero && <p className={ayuda}>Si el profesional te descuenta IRPF en la factura, ponlo en la columna IRPF (va al modelo 111).</p>}
        </fieldset>

        <div className="mt-4">
          <button type="button" onClick={() => setMostrarCuenta((v) => !v)} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline">
            {mostrarCuenta ? <CaretDown size={14} /> : <CaretRight size={14} />} Cuenta contable
            {!mostrarCuenta && <span className="font-normal text-slate-500">: {cuenta.trim() || TIPO_GASTO_INFO[tipoGasto].cuenta}</span>}
          </button>
          {mostrarCuenta && (
            <div className="mt-2 max-w-md">
              <label htmlFor="fg-cuenta" className={etiqueta}>
                Cuenta de gasto
              </label>
              <input
                id="fg-cuenta"
                list="fg-cuentas"
                inputMode="numeric"
                value={cuenta}
                placeholder={`${TIPO_GASTO_INFO[tipoGasto].cuenta} (la del tipo de gasto)`}
                onChange={(e) => setCuenta(e.target.value.replace(/[^\d]/g, ''))}
                aria-invalid={inv('cuentaGasto') || inv('lineas.0.cuenta')}
                className={campoBase}
              />
              <datalist id="fg-cuentas">
                {CUENTAS_GASTO_HABITUALES.map(([c, n]) => (
                  <option key={c} value={c}>
                    {n}
                  </option>
                ))}
              </datalist>
              <p className={ayuda}>Vacía, se usa la del tipo de gasto. Tiene que ser una cuenta del grupo 6 de tu plan contable (por ejemplo, 629 Otros servicios).</p>
              {!cuenta.trim() && lineas.some((l) => l.cuenta) && <p className={ayuda}>Esta factura tiene cuentas distintas por línea: se conservan mientras no elijas una aquí.</p>}
            </div>
          )}
        </div>
      </section>

      {/* 3. Lineas */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Conceptos</h2>
        <div className="flex flex-col gap-3">
          {lineas.map((l, i) => {
            const c = `lineas.${i}`;
            return (
              <div key={l.clave} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-12 md:items-end md:border-0 md:p-0">
                <div className="col-span-2 md:col-span-4">
                  <label htmlFor={`fg-desc-${l.clave}`} className={`${etiqueta} ${i > 0 ? 'md:sr-only' : ''}`}>
                    Descripción
                  </label>
                  <input
                    id={`fg-desc-${l.clave}`}
                    value={l.descripcion}
                    onChange={(e) => cambiarLinea(l.clave, { descripcion: e.target.value })}
                    aria-invalid={inv(`${c}.descripcion`)}
                    className={campoBase}
                  />
                </div>
                <div className="md:col-span-1">
                  <label htmlFor={`fg-cant-${l.clave}`} className={`${etiqueta} ${i > 0 ? 'md:sr-only' : ''}`}>
                    Cantidad
                  </label>
                  <input
                    id={`fg-cant-${l.clave}`}
                    inputMode="decimal"
                    value={l.cantidad}
                    onChange={(e) => cambiarLinea(l.clave, { cantidad: e.target.value })}
                    aria-invalid={inv(`${c}.cantidad`)}
                    className={`${campoBase} text-right`}
                  />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor={`fg-precio-${l.clave}`} className={`${etiqueta} ${i > 0 ? 'md:sr-only' : ''}`}>
                    Precio (sin IVA)
                  </label>
                  <input
                    id={`fg-precio-${l.clave}`}
                    inputMode="decimal"
                    value={l.precio}
                    placeholder="0,00"
                    onChange={(e) => cambiarLinea(l.clave, { precio: e.target.value })}
                    aria-invalid={inv(`${c}.precioUnitario`)}
                    className={`${campoBase} text-right`}
                  />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor={`fg-iva-${l.clave}`} className={`${etiqueta} ${i > 0 ? 'md:sr-only' : ''}`}>
                    IVA
                  </label>
                  <select
                    id={`fg-iva-${l.clave}`}
                    value={l.tipoIva}
                    disabled={extranjero}
                    onChange={(e) => cambiarLinea(l.clave, { tipoIva: Number(e.target.value) })}
                    aria-invalid={inv(`${c}.tipoIva`)}
                    className={campoBase}
                  >
                    {TIPOS_IVA_GASTO.map((t) => (
                      <option key={t} value={t}>
                        {t} %
                      </option>
                    ))}
                  </select>
                </div>
                {conRetencion ? (
                  <div className="md:col-span-2">
                    <label htmlFor={`fg-irpf-${l.clave}`} className={`${etiqueta} ${i > 0 ? 'md:sr-only' : ''}`}>
                      IRPF
                    </label>
                    <select
                      id={`fg-irpf-${l.clave}`}
                      value={l.tipoRetencion}
                      onChange={(e) => cambiarLinea(l.clave, { tipoRetencion: Number(e.target.value) })}
                      aria-invalid={inv(`${c}.tipoRetencion`)}
                      className={campoBase}
                    >
                      {retenciones.map((t) => (
                        <option key={t} value={t}>
                          {t} %
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="hidden md:col-span-2 md:block" />
                )}
                <div className="col-span-2 flex items-center justify-between gap-2 md:col-span-1 md:justify-end">
                  <span className="text-sm text-slate-600 md:hidden">
                    Base {fmt(Number.isFinite(valores[i].cantidad) && Number.isFinite(valores[i].precioUnitario) ? calcularTotales([valores[i]]).base : 0)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setLineas((ls) => (ls.length > 1 ? ls.filter((x) => x.clave !== l.clave) : ls))}
                    disabled={lineas.length === 1}
                    className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                    aria-label={`Quitar la línea ${i + 1}`}
                    title="Quitar la línea"
                  >
                    <Trash size={18} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setLineas((ls) => [...ls, lineaVacia(extranjero ? 0 : ls[ls.length - 1]?.tipoIva ?? 21)])}
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-600 hover:text-accent-700"
        >
          <Plus size={16} /> Añadir línea
        </button>

        {/* Totales */}
        <dl className="mt-5 ml-auto flex w-full max-w-sm flex-col gap-1 border-t border-slate-200 pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-600">Base imponible</dt>
            <dd className="font-mono text-slate-900">{fmt(totales.base)}</dd>
          </div>
          {totales.ivaPorTipo.map((t) => (
            <div key={t.tipo} className="flex justify-between">
              <dt className="text-slate-600">IVA {t.tipo} %</dt>
              <dd className="font-mono text-slate-900">{fmt(t.cuota)}</dd>
            </div>
          ))}
          {totales.retencion > 0 && (
            <div className="flex justify-between">
              <dt className="text-slate-600">Retención IRPF</dt>
              <dd className="font-mono text-slate-900">−{fmt(totales.retencion)}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
            <dt className="text-slate-900">Total a pagar</dt>
            <dd className="font-mono text-slate-900">{fmt(totales.total)}</dd>
          </div>
        </dl>

        {modo === 'lector' && (
          <div className="mt-4 max-w-sm ml-auto">
            <label htmlFor="fg-totaldoc" className={etiqueta}>
              Total que pone la factura
            </label>
            <input
              id="fg-totaldoc"
              inputMode="decimal"
              value={totalDocumento}
              onChange={(e) => setTotalDocumento(e.target.value)}
              aria-invalid={inv('totalDocumento') || totalNoCuadra}
              className={`${campoBase} text-right`}
            />
            {totalNoCuadra ? (
              <p className="mt-1 text-xs text-amber-700">No coincide con el total calculado ({fmt(totales.total)}): revisa las bases, el IVA y la retención, o corrige este total.</p>
            ) : (
              <p className={ayuda}>Se compara con el total calculado para detectar errores de lectura. Déjalo vacío si no quieres comprobarlo.</p>
            )}
          </div>
        )}
      </section>

      {/* 4. Observaciones */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-6">
        <label htmlFor="fg-obs" className={etiqueta}>
          Observaciones
        </label>
        <textarea id="fg-obs" rows={2} maxLength={2000} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} aria-invalid={inv('observaciones')} className={campoBase} />
      </section>

      {/* 5. Errores y boton */}
      {error && (
        <div role="alert" className="flex flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <p className="flex items-start gap-2">
            <WarningCircle size={18} className="mt-0.5 shrink-0" />
            <span>{facturaRepetidaId ? `Esta factura ya está registrada. ${error}` : proveedorRepetidoId ? `Ya existe ese proveedor. ${error}` : error}</span>
          </p>
          {facturaRepetidaId && (
            <Link href={`/dashboard/compras/${facturaRepetidaId}`} className="font-semibold underline">
              Ver la factura
            </Link>
          )}
          {proveedorRepetidoId && (
            <button type="button" onClick={usarProveedorExistente} className="self-start font-semibold underline">
              Usar el existente
            </button>
          )}
        </div>
      )}

      {modo === 'editar' && asientoEnFirme && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Al guardar se rehace su asiento y su anotación en el libro de IVA.</p>
      )}
      {bloqueado && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{bloqueado}</p>}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        {nota && <p className="text-sm text-slate-500 sm:mr-auto">{nota}</p>}
        {onCancelar && (
          <button type="button" onClick={onCancelar} className="rounded-lg border border-slate-300 px-4 py-2.5 font-semibold text-slate-700 transition-colors hover:bg-slate-50">
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={guardando || !!bloqueado}
          className="rounded-lg bg-accent-600 px-5 py-2.5 font-semibold text-white transition-all hover:bg-accent-700 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
        >
          {guardando ? 'Guardando...' : textoBoton}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Proveedor: buscador de los activos o alta de uno nuevo
// ---------------------------------------------------------------------------

function SelectorProveedor({
  valor,
  onCambio,
  inv,
}: {
  valor: ProveedorElegido | null;
  onCambio: (p: ProveedorElegido | null) => void;
  inv: (campo: string) => boolean;
}) {
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<ProveedorBuscado[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [errorBusqueda, setErrorBusqueda] = useState('');
  const peticion = useRef(0);

  useEffect(() => {
    if (valor) return;
    const n = ++peticion.current;
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await apiFetch<ProveedorBuscado[]>(companyPath(`/proveedores/buscar?activos=true&limit=8&q=${encodeURIComponent(q.trim())}`));
        if (n === peticion.current) {
          setResultados(Array.isArray(r) ? r : []);
          setErrorBusqueda('');
        }
      } catch (err) {
        if (n === peticion.current) setErrorBusqueda(errorMessage(err));
      } finally {
        if (n === peticion.current) setBuscando(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, valor]);

  if (valor?.tipo === 'existente') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="min-w-0">
          <p className="font-medium text-slate-900 break-words">{valor.nombre}</p>
          <p className="font-mono text-sm text-slate-500">
            {valor.nif}
            {!esEspana(valor.pais) && <span className="ml-2 font-sans">· {PAISES.find(([c]) => c === valor.pais)?.[1] ?? valor.pais}</span>}
          </p>
        </div>
        <button type="button" onClick={() => onCambio(null)} className="text-sm font-semibold text-blue-600 hover:underline">
          Cambiar
        </button>
      </div>
    );
  }

  if (valor?.tipo === 'nuevo') {
    const set = (campo: keyof Omit<Extract<ProveedorElegido, { tipo: 'nuevo' }>, 'tipo'>) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const v = e.target.value;
      const sig = { ...valor, [campo]: v };
      // NIF-IVA de otro pais de la UE (FR..., DE...): el pais sale del prefijo.
      if (campo === 'nifCif' && esEspana(valor.pais) && pareceNifIvaUe(v)) {
        const p = paisDelPrefijo(v);
        if (p && p !== 'ES') sig.pais = p;
      }
      onCambio(sig);
    };
    const es = esEspana(valor.pais);
    const ue = !es && pareceNifIvaUe(valor.nifCif);
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-slate-700">Proveedor nuevo: se dará de alta al guardar la factura.</p>
          <button type="button" onClick={() => onCambio(null)} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline">
            <X size={14} /> Buscar uno existente
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label htmlFor="fg-pnombre" className={etiqueta}>
              Nombre fiscal *
            </label>
            <input id="fg-pnombre" value={valor.nombreFiscal} onChange={set('nombreFiscal')} aria-invalid={inv('proveedor.nombreFiscal')} className={campoBase} />
          </div>
          <div>
            <label htmlFor="fg-ppais" className={etiqueta}>
              País
            </label>
            <select id="fg-ppais" value={valor.pais} onChange={set('pais')} aria-invalid={inv('proveedor.pais')} className={campoBase}>
              {PAISES.map(([c, n]) => (
                <option key={c} value={c}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="fg-pnif" className={etiqueta}>
              {es ? 'NIF/CIF *' : ue ? 'NIF-IVA (con el prefijo del país) *' : 'Identificación fiscal (Tax ID) *'}
            </label>
            <input id="fg-pnif" value={valor.nifCif} onChange={set('nifCif')} aria-invalid={inv('proveedor.nifCif') || inv('proveedor.nuevo')} className={`${campoBase} font-mono`} autoComplete="off" />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="fg-pdir" className={etiqueta}>
              Dirección
            </label>
            <input id="fg-pdir" value={valor.direccion} onChange={set('direccion')} aria-invalid={inv('proveedor.direccion')} className={campoBase} />
          </div>
          <div>
            <label htmlFor="fg-pcp" className={etiqueta}>
              Código postal
            </label>
            <input id="fg-pcp" inputMode={es ? 'numeric' : 'text'} value={valor.cp} onChange={set('cp')} aria-invalid={inv('proveedor.cp')} className={campoBase} />
          </div>
          <div>
            <label htmlFor="fg-pmun" className={etiqueta}>
              Municipio
            </label>
            <input id="fg-pmun" value={valor.municipio} onChange={set('municipio')} aria-invalid={inv('proveedor.municipio')} className={campoBase} />
          </div>
          <div>
            <label htmlFor="fg-pprov" className={etiqueta}>
              {es ? 'Provincia' : 'Región o estado'}
            </label>
            <input id="fg-pprov" value={valor.provincia} onChange={set('provincia')} aria-invalid={inv('proveedor.provincia')} className={campoBase} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="fg-buscar" className={etiqueta}>
        Busca el proveedor *
      </label>
      <div className="relative">
        <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          id="fg-buscar"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nombre o NIF"
          aria-invalid={inv('proveedor')}
          className={`${campoBase} pl-9`}
          autoComplete="off"
        />
      </div>
      {errorBusqueda && <p className="text-sm text-rose-700">{errorBusqueda}</p>}
      <ul className="flex flex-col divide-y divide-slate-100 rounded-lg border border-slate-200">
        {buscando && resultados.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Buscando...</li>}
        {!buscando && resultados.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">{q.trim() ? 'No hay ningún proveedor activo con ese nombre o NIF.' : 'Aún no tienes proveedores dados de alta.'}</li>}
        {resultados.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onCambio({ tipo: 'existente', id: p.id, nombre: p.nombre, nif: p.nif, pais: p.pais || 'ES' })}
              className="flex w-full flex-wrap items-baseline justify-between gap-x-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span className="font-medium text-slate-900 break-words">{p.nombre}</span>
              <span className="font-mono text-xs text-slate-500">{p.nif}</span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => {
          const t = q.trim();
          const pareceNif = /\d/.test(t) && !/\s/.test(t);
          onCambio({
            tipo: 'nuevo',
            nombreFiscal: pareceNif ? '' : t,
            nifCif: pareceNif ? t : '',
            pais: pareceNif && pareceNifIvaUe(t) ? (paisDelPrefijo(t) ?? 'ES') : 'ES',
            direccion: '',
            cp: '',
            municipio: '',
            provincia: '',
          });
        }}
        className="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-accent-600 hover:text-accent-700"
      >
        <Plus size={16} /> Crear proveedor nuevo
      </button>
    </div>
  );
}
