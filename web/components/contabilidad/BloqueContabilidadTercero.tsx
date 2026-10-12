'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';
import { enlaceLibroMayor, enlaceMayorTerceros, type TipoFicha } from '@/lib/subcuentas';
import { importe } from '@/app/dashboard/informes/TablaInforme';
import { hoyIso } from '@/lib/anios';

/**
 * Bloque «Contabilidad» de la ficha de un cliente o proveedor: su subcuenta
 * propia (430 del cliente; 400 y 410 del proveedor), su saldo contable a hoy y
 * los enlaces a su mayor. El saldo y los enlaces solo con permiso de
 * contabilidad (el plan contable y los informes lo exigen).
 */

interface Props {
  tipo: TipoFicha;
  id: string;
  /** Subcuentas de la ficha con su para que: [['43000012', null]] o [['40000007', 'compras'], ['41000007', 'servicios']]. */
  subcuentas: Array<{ codigo: string | null | undefined; etiqueta?: string }>;
  /** Las que ya estan en el plan contable (las demas aun no tienen movimientos). */
  subcuentasEnPlan?: string[];
}

interface Detalle {
  tercero: { saldoFinal: number; debe: number; haber: number };
  totalPendiente: number;
}


export function BloqueContabilidadTercero({ tipo, id, subcuentas, subcuentasEnPlan }: Props) {
  const [veContabilidad, setVeContabilidad] = useState(false);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  // Los permisos se leen tras montar (la sesion esta en el navegador).
  useEffect(() => {
    setVeContabilidad(tieneAlgunPermiso(getUser(), ['contabilidad:read']));
  }, []);

  const conCodigo = subcuentas.filter((s): s is { codigo: string; etiqueta?: string } => !!s.codigo);

  useEffect(() => {
    if (!veContabilidad) return;
    let vigente = true;
    const hoy = hoyIso();
    setCargando(true);
    apiFetch<Detalle>(companyPath(`/informes-contables/terceros/${tipo === 'cliente' ? 'clientes' : 'proveedores'}/${encodeURIComponent(id)}?desde=${hoy.slice(0, 4)}-01-01&hasta=${hoy}`))
      .then((d) => vigente && (setDetalle(d), setError('')))
      .catch((e) => vigente && setError(errorMessage(e)))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [veContabilidad, tipo, id]);

  const saldo = detalle?.tercero.saldoFinal ?? 0;
  // El saldo contable y lo pendiente segun facturas no cuadran (mas de un centimo): se explica por que puede ser.
  const noCoinciden = !!detalle && Math.abs(Math.round(saldo * 100) - Math.round(detalle.totalPendiente * 100)) > 1;
  const lectura =
    saldo === 0
      ? 'sin saldo'
      : tipo === 'cliente'
        ? saldo > 0
          ? 'nos debe'
          : 'a su favor (anticipos o cobros de más)'
        : saldo > 0
          ? 'le debemos'
          : 'a nuestro favor (anticipos o pagos de más)';

  return (
    <section aria-labelledby={`conta-${id}`} className="mb-6 rounded-xl border border-slate-200 bg-white p-4 md:p-5">
      <h2 id={`conta-${id}`} className="flex items-center gap-2 font-semibold text-slate-900">
        <BookOpen size={20} className="text-slate-500" /> Contabilidad
      </h2>

      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs text-slate-500">{conCodigo.length > 1 ? 'Subcuentas contables' : 'Subcuenta contable'}</dt>
          <dd className="text-slate-900">
            {conCodigo.length === 0 ? (
              <span className="text-slate-600">Todavía no tiene. La recibirá con su primera factura.</span>
            ) : (
              <ul className="space-y-0.5">
                {conCodigo.map((s) => (
                  <li key={s.codigo}>
                    <span className="font-mono">{s.codigo}</span>
                    {s.etiqueta && <span className="text-slate-600"> ({s.etiqueta})</span>}
                    {subcuentasEnPlan && !subcuentasEnPlan.includes(s.codigo) && <span className="text-slate-500"> · sin movimientos todavía</span>}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>

        {veContabilidad && (
          <div className="min-w-0">
            <dt className="text-xs text-slate-500">Saldo contable a hoy</dt>
            <dd className="text-slate-900">
              {cargando && !detalle ? (
                <span className="text-slate-500">Calculando…</span>
              ) : error ? (
                <span className="text-red-700">No se ha podido calcular: {error}</span>
              ) : detalle ? (
                <>
                  <span className="font-mono text-base font-semibold tabular-nums">{importe(saldo)}</span> <span className="text-slate-600">{lectura}</span>
                  <span className="block text-xs text-slate-500">
                    Según facturas, pendiente de {tipo === 'cliente' ? 'cobro' : 'pago'}: <span className="font-mono">{importe(detalle.totalPendiente)}</span>
                  </span>
                  {noCoinciden && (
                    <span className="mt-1 block text-xs text-amber-800">
                      No coinciden: puede haber asientos en borrador, que no cuentan hasta que los apruebas en el{' '}
                      <Link href="/dashboard/motor-contable" className="font-medium underline">
                        Motor contable
                      </Link>
                      , o {tipo === 'cliente' ? 'cobros' : 'pagos'} sin contabilizar.
                    </span>
                  )}
                </>
              ) : null}
            </dd>
          </div>
        )}
      </dl>

      {veContabilidad ? (
        <div className="mt-4 flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:gap-x-5">
          <Link href={enlaceLibroMayor(tipo, id)} className="inline-flex min-h-[44px] items-center gap-1 font-medium text-emerald-700 hover:underline sm:min-h-0">
            {conCodigo.length > 1 ? 'Ver el mayor de sus subcuentas' : 'Ver el mayor de su subcuenta'} <ArrowRight size={14} />
          </Link>
          <Link href={enlaceMayorTerceros(tipo, id)} className="inline-flex min-h-[44px] items-center gap-1 font-medium text-emerald-700 hover:underline sm:min-h-0">
            Ver en el mayor de {tipo === 'cliente' ? 'clientes' : 'proveedores'} <ArrowRight size={14} />
          </Link>
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-500">El saldo contable y el mayor los ve quien tiene acceso a contabilidad.</p>
      )}
    </section>
  );
}
