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
        <p className="mt-2 text-slate-600">Importa los movimientos del banco desde el extracto en Excel o CSV</p>
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
          <UploadExtractoForm key={selectedCuenta} accountId={selectedCuenta} />
        )}

      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
        <h3 className="mb-2 font-semibold text-slate-900">Qué extractos se pueden subir</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>El Excel (.xlsx o .xls) o CSV que descargas de la banca online, sin tocarlo.</li>
          <li>Hace falta una columna de fecha y otra de importe, o dos de cargo y abono. Las filas de título, el IBAN y los totales se ignoran.</li>
          <li>Si el extracto se solapa con otro ya importado, los movimientos repetidos no se duplican.</li>
          <li>Si una fila no se puede leer, no se importa nada y se indica qué fila es.</li>
        </ul>
      </div>
    </div>
  );
}
