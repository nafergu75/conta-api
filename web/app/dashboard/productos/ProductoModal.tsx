'use client';

import { useEffect, useState } from 'react';
import { X } from '@phosphor-icons/react';
import { apiFetch, campoDelError, companyPath, errorMessage } from '@/lib/api';
import { decimalesDe, leerCantidad, paraEditar, problemaTextoAdicional, TEXTO_ADICIONAL_LINEAS_MAX, TEXTO_ADICIONAL_MAX } from '@/lib/plantillasFactura';

export interface Familia {
  id: string;
  codigo: string;
  nombre: string;
  ivaPorcentaje: number | null;
  cuentaVentas: string | null;
  activa: boolean;
  parentId: string | null;
  productos: number;
  hijas: Familia[];
}

export interface Producto {
  id: string;
  referencia: string;
  descripcion: string;
  precio: number;
  ivaPorcentaje: number;
  unidad: string;
  tipo: 'PRODUCTO' | 'SERVICIO';
  precioCompra: number | null;
  cuentaVentas: string | null;
  cuentaVentasEfectiva: string;
  notas: string | null;
  bloqueado: boolean;
  familiaId: string | null;
  familia: { id: string; codigo: string; nombre: string } | null;
  /** Plantilla A (envases): unidades por pack, kg de plástico no reciclado por unidad, si lleva IEEPNR y su texto en la factura. */
  unidadesPorPack?: number | null;
  kgPlasticoUnidad?: number | null;
  llevaIeepnr?: boolean;
  textoFactura?: string | null;
}

/** Familias en lista plana, con las subfamilias detras de su familia. */
export function familiasPlanas(arbol: Familia[]) {
  return arbol.flatMap((f) => [{ ...f, nivel: 0 }, ...f.hijas.map((h) => ({ ...h, nivel: 1 }))]);
}

const UNIDADES = ['ud', 'h', 'kg', 'l', 'm', 'm2', 'día', 'mes', 'servicio'];
const IVAS = [21, 10, 4, 0];
const campo = 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500';
const num = (s: string) => Number(String(s).replace(',', '.'));

/** Alta o edicion de un producto. Al elegir familia propone el siguiente codigo y su IVA. */
export function ProductoModal({
  producto,
  familias,
  onCerrar,
  onGuardado,
}: {
  producto: Producto | null; // null = nuevo
  familias: Familia[];
  onCerrar: () => void;
  onGuardado: (p: Producto) => void;
}) {
  const [f, setF] = useState({
    referencia: producto?.referencia ?? '',
    descripcion: producto?.descripcion ?? '',
    familiaId: producto?.familiaId ?? '',
    tipo: producto?.tipo ?? 'PRODUCTO',
    unidad: producto?.unidad ?? 'ud',
    precio: producto ? String(producto.precio) : '',
    ivaPorcentaje: String(producto?.ivaPorcentaje ?? 21),
    precioCompra: producto?.precioCompra == null ? '' : String(producto.precioCompra),
    cuentaVentas: producto?.cuentaVentas ?? '',
    notas: producto?.notas ?? '',
    unidadesPorPack: paraEditar(producto?.unidadesPorPack),
    kgPlasticoUnidad: paraEditar(producto?.kgPlasticoUnidad),
    llevaIeepnr: producto?.llevaIeepnr === true,
    textoFactura: producto?.textoFactura ?? '',
  });
  const [codigoTocado, setCodigoTocado] = useState(Boolean(producto));
  const [error, setError] = useState('');
  // Campo que señala el error (de la comprobación o del servidor).
  const [campoError, setCampoError] = useState<string | undefined>();
  // Bloque «Factura con envases»: abierto si el producto ya trae algo de él.
  const [envasesAbierto, setEnvasesAbierto] = useState(
    () => !!(producto?.unidadesPorPack || producto?.kgPlasticoUnidad || producto?.llevaIeepnr || producto?.textoFactura),
  );
  const lineasTexto = f.textoFactura ? f.textoFactura.split(/\r\n|\r|\n/).length : 0;
  const invalido = (c: string) => (campoError === c ? { 'aria-invalid': true as const, 'aria-describedby': 'prod-error' } : {});
  const [guardando, setGuardando] = useState(false);
  const planas = familiasPlanas(familias).filter((x) => x.activa || x.id === producto?.familiaId);

  // Producto nuevo: codigo sugerido segun la familia (mientras no lo escriba el usuario).
  useEffect(() => {
    if (codigoTocado) return;
    const q = f.familiaId ? `?familiaId=${encodeURIComponent(f.familiaId)}` : '';
    apiFetch<{ codigo: string }>(companyPath(`/productos/siguiente-codigo${q}`))
      .then((r) => setF((x) => ({ ...x, referencia: r.codigo })))
      .catch(() => undefined);
  }, [f.familiaId, codigoTocado]);

  const elegirFamilia = (familiaId: string) => {
    const fam = planas.find((x) => x.id === familiaId);
    setF((x) => ({ ...x, familiaId, ...(!producto && fam?.ivaPorcentaje != null && { ivaPorcentaje: String(fam.ivaPorcentaje) }) }));
  };

  const precioConIva = Math.round(num(f.precio || '0') * (1 + num(f.ivaPorcentaje || '0') / 100) * 100) / 100;
  const margen = f.precioCompra && num(f.precio) > 0 ? Math.round(((num(f.precio) - num(f.precioCompra)) / num(f.precio)) * 1000) / 10 : null;

  /** Lo que falta o no vale en el bloque de envases (plantilla A), con su campo. */
  const problemaEnvases = (): { mensaje: string; campo: string } | null => {
    const upp = leerCantidad(f.unidadesPorPack);
    if (upp !== null && !(Number.isInteger(upp) && upp >= 1 && upp <= 100000)) {
      return { mensaje: 'Las unidades por pack son un número entero entre 1 y 100.000.', campo: 'unidadesPorPack' };
    }
    const kg = leerCantidad(f.kgPlasticoUnidad);
    if (kg !== null && !(kg >= 0 && kg <= 1000 && decimalesDe(kg) <= 6)) {
      return { mensaje: 'Los kg de plástico no reciclado por unidad son un número entre 0 y 1.000, con 6 decimales como mucho (por ejemplo, 0,033558).', campo: 'kgPlasticoUnidad' };
    }
    const texto = problemaTextoAdicional(f.textoFactura);
    if (texto) return { mensaje: texto, campo: 'textoFactura' };
    return null;
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCampoError(undefined);
    const mal = problemaEnvases();
    if (mal) {
      setEnvasesAbierto(true);
      setError(mal.mensaje);
      setCampoError(mal.campo);
      return;
    }
    setGuardando(true);
    try {
      const cuerpo = {
        referencia: f.referencia.trim(),
        descripcion: f.descripcion.trim(),
        familiaId: f.familiaId || null,
        tipo: f.tipo,
        unidad: f.unidad,
        precio: num(f.precio || '0'),
        ivaPorcentaje: num(f.ivaPorcentaje || '0'),
        precioCompra: f.precioCompra === '' ? null : num(f.precioCompra),
        cuentaVentas: f.cuentaVentas.trim() || null,
        notas: f.notas.trim() || null,
        // Plantilla A (envases). Vacío: sin dato.
        unidadesPorPack: leerCantidad(f.unidadesPorPack),
        kgPlasticoUnidad: leerCantidad(f.kgPlasticoUnidad),
        llevaIeepnr: f.llevaIeepnr,
        textoFactura: f.textoFactura.trim() || null,
      };
      const r = await apiFetch<Producto>(companyPath(producto ? `/productos/${producto.id}` : '/productos'), {
        method: producto ? 'PUT' : 'POST',
        body: JSON.stringify(cuerpo),
      });
      onGuardado(r);
    } catch (err) {
      setError(errorMessage(err));
      const campo = campoDelError(err);
      setCampoError(campo);
      if (campo && ['unidadesPorPack', 'kgPlasticoUnidad', 'llevaIeepnr', 'textoFactura'].includes(campo)) setEnvasesAbierto(true);
    } finally {
      setGuardando(false);
    }
  };

  const fam = planas.find((x) => x.id === f.familiaId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="prod-titulo">
      <form onSubmit={guardar} className="max-h-[90dvh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-lg bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 id="prod-titulo" className="text-lg font-semibold text-slate-900">{producto ? `Producto ${producto.referencia}` : 'Nuevo producto'}</h2>
          <button type="button" onClick={onCerrar} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
          <div className="md:col-span-3">
            <label htmlFor="p-familia" className="block text-sm font-medium text-slate-700">Familia</label>
            <select id="p-familia" value={f.familiaId} onChange={(e) => elegirFamilia(e.target.value)} className={campo}>
              <option value="">Sin familia</option>
              {planas.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nivel ? '   · ' : ''}
                  {x.codigo} · {x.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3">
            <label htmlFor="p-codigo" className="block text-sm font-medium text-slate-700">Código</label>
            <input
              id="p-codigo"
              value={f.referencia}
              onChange={(e) => {
                setCodigoTocado(true);
                setF({ ...f, referencia: e.target.value });
              }}
              className={`${campo} font-mono`}
              required
            />
            {!producto && <p className="mt-1 text-xs text-slate-500">Te proponemos el siguiente libre{fam ? ` de la familia ${fam.codigo}` : ''}.</p>}
          </div>
          <div className="md:col-span-6">
            <label htmlFor="p-desc" className="block text-sm font-medium text-slate-700">Descripción</label>
            <input id="p-desc" value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} className={campo} required placeholder="Lo que saldrá en la línea de la factura" />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="p-tipo" className="block text-sm font-medium text-slate-700">Tipo</label>
            <select id="p-tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as 'PRODUCTO' | 'SERVICIO' })} className={campo}>
              <option value="PRODUCTO">Producto</option>
              <option value="SERVICIO">Servicio</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="p-unidad" className="block text-sm font-medium text-slate-700">Unidad</label>
            <input id="p-unidad" list="unidades" value={f.unidad} onChange={(e) => setF({ ...f, unidad: e.target.value })} className={campo} />
            <datalist id="unidades">{UNIDADES.map((u) => <option key={u} value={u} />)}</datalist>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="p-iva" className="block text-sm font-medium text-slate-700">IVA %</label>
            <input id="p-iva" list="ivas" inputMode="decimal" value={f.ivaPorcentaje} onChange={(e) => setF({ ...f, ivaPorcentaje: e.target.value })} className={`${campo} text-right tabular-nums`} />
            <datalist id="ivas">{IVAS.map((i) => <option key={i} value={i} />)}</datalist>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="p-precio" className="block text-sm font-medium text-slate-700">Precio de venta (sin IVA)</label>
            <input id="p-precio" inputMode="decimal" value={f.precio} onChange={(e) => setF({ ...f, precio: e.target.value })} className={`${campo} text-right tabular-nums`} placeholder="0,00" />
            <p className="mt-1 text-xs text-slate-500 tabular-nums">Con IVA: {precioConIva.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="p-compra" className="block text-sm font-medium text-slate-700">Precio de compra <span className="font-normal text-slate-500">(opcional)</span></label>
            <input id="p-compra" inputMode="decimal" value={f.precioCompra} onChange={(e) => setF({ ...f, precioCompra: e.target.value })} className={`${campo} text-right tabular-nums`} />
            {margen !== null && <p className="mt-1 text-xs text-slate-500 tabular-nums">Margen: {margen.toLocaleString('es-ES')} %</p>}
          </div>
          <div className="md:col-span-2">
            <label htmlFor="p-cuenta" className="block text-sm font-medium text-slate-700">Cuenta de ventas <span className="font-normal text-slate-500">(opcional)</span></label>
            <input id="p-cuenta" inputMode="numeric" value={f.cuentaVentas} onChange={(e) => setF({ ...f, cuentaVentas: e.target.value })} className={`${campo} font-mono`} placeholder={fam?.cuentaVentas ?? (f.tipo === 'SERVICIO' ? '705' : '700')} />
            <p className="mt-1 text-xs text-slate-500">Si la dejas vacía, la de la familia o la habitual.</p>
          </div>
          <div className="md:col-span-6">
            <label htmlFor="p-notas" className="block text-sm font-medium text-slate-700">Notas internas <span className="font-normal text-slate-500">(no salen en la factura)</span></label>
            <textarea id="p-notas" rows={2} value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} className={campo} />
          </div>
          <details
            className="rounded-lg border border-slate-200 p-3 md:col-span-6"
            open={envasesAbierto}
            onToggle={(e) => setEnvasesAbierto(e.currentTarget.open)}
          >
            <summary className="cursor-pointer text-sm font-medium text-slate-700">
              Factura con envases (plantilla A) <span className="font-normal text-slate-500">(opcional)</span>
            </summary>
            <p className="mt-2 text-xs text-slate-500">
              Solo en las series con la plantilla A: al elegir el producto en la factura se proponen las uds (packs × unidades por pack), los kg de plástico y el texto.
            </p>
            <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-6">
              <div className="md:col-span-2">
                <label htmlFor="p-upp" className="block text-sm font-medium text-slate-700">Unidades por pack</label>
                <input
                  id="p-upp"
                  inputMode="numeric"
                  value={f.unidadesPorPack}
                  onChange={(e) => setF({ ...f, unidadesPorPack: e.target.value })}
                  className={`${campo} text-right tabular-nums aria-[invalid=true]:border-red-500`}
                  placeholder="4"
                  {...invalido('unidadesPorPack')}
                />
              </div>
              <div className="md:col-span-4">
                <label htmlFor="p-kg" className="block text-sm font-medium text-slate-700">Kg de plástico no reciclado por unidad</label>
                <input
                  id="p-kg"
                  inputMode="decimal"
                  value={f.kgPlasticoUnidad}
                  onChange={(e) => setF({ ...f, kgPlasticoUnidad: e.target.value })}
                  className={`${campo} text-right tabular-nums aria-[invalid=true]:border-red-500 md:max-w-[12rem]`}
                  placeholder="0,033558"
                  aria-describedby="p-kg-ayuda"
                  {...invalido('kgPlasticoUnidad')}
                />
                <p id="p-kg-ayuda" className="mt-1 text-xs text-slate-500">Hasta 6 decimales. Si el plástico va por pack (el film), divídelo entre las unidades del pack.</p>
              </div>
              <label className="flex items-start gap-3 md:col-span-6">
                <input
                  type="checkbox"
                  checked={f.llevaIeepnr}
                  onChange={(e) => setF({ ...f, llevaIeepnr: e.target.checked })}
                  className="mt-1 h-4 w-4 accent-blue-600"
                  aria-describedby="p-ieepnr-ayuda"
                />
                <span className="text-sm">
                  <span className="font-medium text-slate-900">Lleva IEEPNR</span>
                  <span id="p-ieepnr-ayuda" className="block text-slate-600">
                    {f.llevaIeepnr && !f.kgPlasticoUnidad.trim()
                      ? 'Escribe los kg por unidad para que se propongan en la factura.'
                      : 'Se proponen sus kg de plástico en la factura (uds × kg por unidad).'}
                  </span>
                </span>
              </label>
              <div className="md:col-span-6">
                <label htmlFor="p-texto" className="block text-sm font-medium text-slate-700">Texto adicional en la factura</label>
                <textarea
                  id="p-texto"
                  rows={3}
                  maxLength={TEXTO_ADICIONAL_MAX}
                  value={f.textoFactura}
                  onChange={(e) => setF({ ...f, textoFactura: e.target.value })}
                  className={`${campo} aria-[invalid=true]:border-red-500`}
                  placeholder={'Cod. RPA Azúcar: 6B30250\nUnidad 1,5 L Refrescos SR'}
                  aria-describedby="p-texto-ayuda"
                  {...invalido('textoFactura')}
                />
                <p id="p-texto-ayuda" className="mt-1 flex justify-between gap-2 text-xs text-slate-500">
                  <span>Sale bajo el concepto, en letra pequeña. Se puede cambiar en cada factura.</span>
                  <span className={`tabular-nums ${lineasTexto > TEXTO_ADICIONAL_LINEAS_MAX ? 'text-red-700' : ''}`}>
                    {f.textoFactura.length}/{TEXTO_ADICIONAL_MAX} · {lineasTexto}/{TEXTO_ADICIONAL_LINEAS_MAX} líneas
                  </span>
                </p>
              </div>
            </div>
          </details>
        </div>

        {error && <p id="prod-error" role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCerrar} disabled={guardando} className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200">
            Cancelar
          </button>
          <button type="submit" disabled={guardando} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {guardando ? 'Guardando...' : producto ? 'Guardar' : 'Crear producto'}
          </button>
        </div>
      </form>
    </div>
  );
}
