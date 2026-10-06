'use client';

import { useEffect, useState } from 'react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { UploadExtractoForm } from '../components/UploadExtractoForm';

interface CuentaBancaria {
  id: string;
  iban: string;
  bancoNombre?: string;
  estado: string;
}

export default function ExtractosPage() {
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [selectedCuenta, setSelectedCuenta] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [ultimaSubida, setUltimaSubida] = useState<any>(null);
  const [errorCarga, setErrorCarga] = useState('');

  useEffect(() => {
    fetchCuentas();
  }, []);

  const fetchCuentas = async () => {
    try {
      const todas = await apiFetch<CuentaBancaria[]>(companyPath('/treasury/bank-accounts'));
      const cuentasActivas = (todas || []).filter((c) => c.estado === 'activa');
      setCuentas(cuentasActivas);
      if (cuentasActivas.length > 0) {
        setSelectedCuenta(cuentasActivas[0].id);
      }
    } catch (error) {
      setErrorCarga(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const handleUploadSuccess = (resultado: any) => {
    setUltimaSubida(resultado);
  };

  if (loading) {
    return <div className="text-center text-slate-500">Cargando cuentas...</div>;
  }

  if (!cuentas.length) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-slate-900">Subir Extractos</h1>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-sm text-amber-900">
            No hay cuentas bancarias activas. Primero debes crear una cuenta en la sección de
            <a href="/dashboard/tesoreria/cuentas" className="font-medium underline">
              {' '}
              Cuentas Bancarias
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {errorCarga && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {errorCarga}
        </div>
      )}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Subir Extractos</h1>
        <p className="mt-2 text-slate-600">Importa movimientos bancarios desde archivos CSV</p>
      </div>

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
          <UploadExtractoForm accountId={selectedCuenta} onSuccess={handleUploadSuccess} />
        )}

        {ultimaSubida && !ultimaSubida.error && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-6">
            <h3 className="mb-4 font-semibold text-green-900">Resumen de importación</h3>
            <div className="space-y-2">
              <p className="text-sm text-green-800">
                <strong>{ultimaSubida.data?.movimientosCreados || 0}</strong> movimientos importados
                correctamente
              </p>
              {ultimaSubida.data?.detalles && ultimaSubida.data.detalles.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-medium text-green-900">Detalles:</p>
                  <div className="max-h-48 overflow-y-auto rounded border border-green-300 bg-white p-3">
                    {ultimaSubida.data.detalles.map((mov: any, idx: number) => (
                      <div key={idx} className="border-b border-green-200 py-2 text-xs text-slate-700 last:border-0">
                        <div className="flex justify-between">
                          <span>
                            {new Date(mov.fecha).toLocaleDateString('es-ES')} - {mov.concepto}
                          </span>
                          <span className="font-medium">
                            {new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(mov.importe)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6">
        <h3 className="mb-3 font-semibold text-slate-900">Formato esperado del CSV</h3>
        <p className="mb-3 text-sm text-slate-600">
          El archivo debe contener las siguientes columnas (en este orden):
        </p>
        <code className="block space-y-1 rounded bg-slate-900 p-4 font-mono text-xs text-slate-100">
          <div>fecha,importe,concepto,referencia</div>
          <div>2024-01-15,-500.50,"Pago a proveedores","FAC-2024-001"</div>
          <div>2024-01-16,1200.00,"Ingreso cliente","CLT-2024-005"</div>
        </code>
        <ul className="mt-4 space-y-2 text-sm text-slate-600">
          <li>
            <strong>fecha:</strong> formato YYYY-MM-DD
          </li>
          <li>
            <strong>importe:</strong> número positivo (entrada) o negativo (salida)
          </li>
          <li>
            <strong>concepto:</strong> descripción del movimiento
          </li>
          <li>
            <strong>referencia:</strong> código de referencia (opcional)
          </li>
        </ul>
      </div>
    </div>
  );
}
