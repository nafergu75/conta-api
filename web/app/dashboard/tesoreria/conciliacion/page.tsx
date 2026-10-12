'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { ANIO_GESTORIA, partidasApi, type PartidaVista } from '@/lib/arranque';
import { TablaMovimientos } from '../components/TablaMovimientos';

interface CuentaBancaria {
  id: string;
  iban: string;
  bancoNombre?: string;
  estado: string;
}

interface Movimiento {
  id: string;
  fecha: string;
  importe: number;
  concepto: string;
  estado: 'pendiente' | 'conciliado' | 'rechazado';
  reconciliacionId?: string;
  tipo?: 'entrada' | 'salida' | 'desconocido';
}

function ConciliacionPageInner() {
  const searchParams = useSearchParams();
  const cuentaParam = searchParams.get('cuenta');

  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [selectedCuenta, setSelectedCuenta] = useState<string>(cuentaParam || '');
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState<'pendiente' | 'conciliado' | 'todos'>('pendiente');
  const [reconciliando, setReconciliando] = useState<string | null>(null);
  const [modalMovimiento, setModalMovimiento] = useState<Movimiento | null>(null);
  const [errorCarga, setErrorCarga] = useState('');
  const [errorConciliacion, setErrorConciliacion] = useState('');
  const [formReconciliacion, setFormReconciliacion] = useState({
    tipoOrigen: 'factura_ingreso',
    origenId: '',
  });
  /** Facturas de 2026 que la gestoría dejó pendientes (partidas), para casar el movimiento con una. */
  const [partidas, setPartidas] = useState<PartidaVista[] | null>(null);

  useEffect(() => {
    fetchCuentas();
  }, []);

  useEffect(() => {
    if (selectedCuenta) {
      fetchMovimientos();
    }
  }, [selectedCuenta, filtroEstado]);

  const fetchCuentas = async () => {
    try {
      const cuentasActivas = (await apiFetch<CuentaBancaria[]>(companyPath('/treasury/bank-accounts'))) || [];
      setCuentas(cuentasActivas);
      if (cuentaParam) {
        setSelectedCuenta(cuentaParam);
      } else if (cuentasActivas.length > 0) {
        setSelectedCuenta(cuentasActivas[0].id);
      }
    } catch (error) {
      setErrorCarga(errorMessage(error));
    }
  };

  const fetchMovimientos = async () => {
    if (!selectedCuenta) return;
    setLoading(true);
    try {
      let path = `/treasury/bank-accounts/${selectedCuenta}/movements`;
      if (filtroEstado !== 'todos') {
        path += `?estado=${filtroEstado}`;
      }
      setMovimientos((await apiFetch<Movimiento[]>(companyPath(path))) || []);
    } catch (error) {
      setErrorCarga(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleConciliar = async (movimientoId: string) => {
    const mov = movimientos.find((m) => m.id === movimientoId);
    if (mov) {
      setModalMovimiento(mov);
      setReconciliando(movimientoId);
      // Las de cobro para un abono y las de pago para un cargo (sin las de 2026, si la empresa no tiene, la opción no sale).
      setPartidas(null);
      partidasApi
        .listar({ tipo: mov.importe > 0 ? 'COBRO' : 'PAGO', estado: 'ABIERTAS' })
        .then((r) => setPartidas(r.partidas))
        .catch(() => setPartidas([]));
    }
  };

  const handleSubmitReconciliacion = async () => {
    if (!reconciliando || !formReconciliacion.origenId) return;

    setErrorConciliacion('');
    try {
      if (formReconciliacion.tipoOrigen === 'partida_2026') {
        // Cobro o pago de una factura de 2026 que dejó pendiente la gestoría.
        await partidasApi.conciliar(reconciliando, formReconciliacion.origenId);
      } else {
        await apiFetch(companyPath(`/treasury/movements/${reconciliando}/reconcile`), {
          method: 'POST',
          body: JSON.stringify({
            tipoOrigen: formReconciliacion.tipoOrigen,
            origenId: formReconciliacion.origenId,
          }),
        });
      }
      setReconciliando(null);
      setModalMovimiento(null);
      setFormReconciliacion({ tipoOrigen: 'factura_ingreso', origenId: '' });
      fetchMovimientos();
    } catch (error) {
      // El error se muestra dentro del modal, junto al formulario.
      setErrorConciliacion(errorMessage(error));
    }
  };

  const eur = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  });

  return (
    <div className="space-y-6">
      {errorCarga && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {errorCarga}
        </div>
      )}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Conciliación Bancaria</h1>
        <p className="mt-2 text-slate-600">
          Reconcilia movimientos bancarios con facturas y asientos contables
        </p>
      </div>

      {cuentas.length === 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-sm text-amber-900">
            No hay cuentas bancarias. Debes crear una cuenta en la sección de
            <a href="/dashboard/tesoreria/cuentas" className="font-medium underline">
              {' '}
              Cuentas Bancarias
            </a>
            .
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Selecciona una cuenta</span>
              <select
                value={selectedCuenta}
                onChange={(e) => setSelectedCuenta(e.target.value)}
                className="mt-2 block w-full max-w-md rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                {cuentas.map((cuenta) => (
                  <option key={cuenta.id} value={cuenta.id}>
                    {cuenta.bancoNombre || 'Cuenta'} - {cuenta.iban}
                  </option>
                ))}
              </select>
            </label>

            {selectedCuenta && (
              <div className="flex gap-2">
                <button
                  onClick={() => setFiltroEstado('pendiente')}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                    filtroEstado === 'pendiente'
                      ? 'bg-blue-600 text-white'
                      : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Pendientes
                </button>
                <button
                  onClick={() => setFiltroEstado('conciliado')}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                    filtroEstado === 'conciliado'
                      ? 'bg-green-600 text-white'
                      : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Conciliados
                </button>
                <button
                  onClick={() => setFiltroEstado('todos')}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                    filtroEstado === 'todos'
                      ? 'bg-slate-600 text-white'
                      : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  Todos
                </button>
              </div>
            )}
          </div>

          {selectedCuenta && (
            <TablaMovimientos
              movimientos={movimientos}
              onConciliar={handleConciliar}
              loading={loading}
            />
          )}
        </>
      )}

      {/* Modal de conciliación */}
      {modalMovimiento && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Conciliar movimiento</h2>

            <div className="mb-6 rounded-lg bg-slate-50 p-4">
              <p className="text-sm text-slate-600">
                <strong>Concepto:</strong> {modalMovimiento.concepto}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                <strong>Importe:</strong> {eur.format(modalMovimiento.importe)}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                <strong>Fecha:</strong> {new Date(modalMovimiento.fecha).toLocaleDateString('es-ES')}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Tipo de origen
                </label>
                <select
                  value={formReconciliacion.tipoOrigen}
                  onChange={(e) =>
                    setFormReconciliacion({ ...formReconciliacion, tipoOrigen: e.target.value, origenId: '' })
                  }
                  className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="factura_ingreso">Factura de ingreso (cobro)</option>
                  {partidas && partidas.length > 0 && <option value="partida_2026">Factura de {ANIO_GESTORIA} pendiente (de la gestoría)</option>}
                  <option value="factura_gasto" disabled>Factura de gasto (aún no disponible)</option>
                  <option value="asiento" disabled>Asiento contable (aún no disponible)</option>
                </select>
              </div>

              {formReconciliacion.tipoOrigen === 'partida_2026' ? (
              <div>
                <label htmlFor="conc-partida" className="block text-sm font-medium text-slate-700 mb-2">
                  Factura de {ANIO_GESTORIA}
                </label>
                <select
                  id="conc-partida"
                  value={formReconciliacion.origenId}
                  onChange={(e) => setFormReconciliacion({ ...formReconciliacion, origenId: e.target.value })}
                  className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Elige la factura…</option>
                  {(partidas ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.tercero || p.subcuenta} · {p.sinDetalle ? 'saldo sin detalle' : p.numeroDocumento} · queda {eur.format(p.pendiente)}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">Se apunta como cobro o pago de esa factura, con la fecha y el importe del movimiento.</p>
              </div>
              ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  ID de la factura
                </label>
                <input
                  type="text"
                  placeholder="ID de la factura de venta"
                  value={formReconciliacion.origenId}
                  onChange={(e) =>
                    setFormReconciliacion({ ...formReconciliacion, origenId: e.target.value })
                  }
                  className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              )}
            </div>

            {errorConciliacion && (
              <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
                {errorConciliacion}
              </p>
            )}

            <div className="mt-6 flex gap-2">
              <button
                onClick={handleSubmitReconciliacion}
                disabled={!formReconciliacion.origenId}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50 hover:bg-blue-700"
              >
                Conciliar
              </button>
              <button
                onClick={() => {
                  setErrorConciliacion('');
                  setReconciliando(null);
                  setModalMovimiento(null);
                  setFormReconciliacion({ tipoOrigen: 'factura_ingreso', origenId: '' });
                }}
                className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConciliacionPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Cargando...</div>}>
      <ConciliacionPageInner />
    </Suspense>
  );
}
