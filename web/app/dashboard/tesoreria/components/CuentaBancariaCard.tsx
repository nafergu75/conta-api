'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { Bank, CaretRight, PlusMinus, Warning } from '@phosphor-icons/react';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';

interface CuentaBancariaCardProps {
  id: string;
  iban: string;
  bancoNombre?: string;
  entidad?: string;
  saldoInicial: number;
  estado: string;
  pendientes: number;
  conciliados: number;
  /** Subcuenta 572 de la cuenta en el plan contable. */
  subcuentaCodigo?: string;
  /** Solo si la subcuenta no es de bancos (cuentas dadas de alta antes de comprobarlo). */
  avisoSubcuenta?: string;
  /** Puede cambiar la subcuenta (permiso de Tesorería). */
  puedeCambiar?: boolean;
  /** Tras cambiar la subcuenta (para recargar la lista y decirlo). */
  onSubcuentaCambiada?: (subcuentaCodigo: string) => void;
}

export function CuentaBancariaCard({
  id,
  iban,
  bancoNombre,
  entidad,
  saldoInicial,
  estado,
  pendientes,
  conciliados,
  subcuentaCodigo,
  avisoSubcuenta,
  puedeCambiar = false,
  onSubcuentaCambiada,
}: CuentaBancariaCardProps) {
  const eur = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  });

  const estadoClasses = {
    // El backend devuelve 'activa' | 'inactiva'.
    activa: 'bg-green-50 text-green-700 border-green-200',
    inactiva: 'bg-gray-50 text-gray-700 border-gray-200',
    cerrado: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-lg bg-blue-100 p-2">
            <Bank size={24} className="text-blue-600" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900">{bancoNombre || 'Cuenta'}</h3>
            <p className="break-all text-sm text-slate-500">{iban}</p>
          </div>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${estadoClasses[estado as keyof typeof estadoClasses] || estadoClasses.activa}`}>
          {estado}
        </span>
      </div>

      {subcuentaCodigo !== undefined && (
        <SubcuentaDeLaCuenta
          id={id}
          subcuentaCodigo={subcuentaCodigo}
          avisoSubcuenta={avisoSubcuenta}
          puedeCambiar={puedeCambiar}
          onCambiada={onSubcuentaCambiada}
        />
      )}

      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="rounded bg-slate-50 p-3">
          <p className="text-xs text-slate-600">Saldo Inicial</p>
          <p className="mt-1 font-semibold text-slate-900">{eur.format(saldoInicial)}</p>
        </div>
        <div className="rounded bg-amber-50 p-3">
          <p className="text-xs text-amber-600">Pendientes</p>
          <p className="mt-1 font-semibold text-amber-900">{pendientes}</p>
        </div>
        <div className="rounded bg-green-50 p-3">
          <p className="text-xs text-green-600">Conciliados</p>
          <p className="mt-1 font-semibold text-green-900">{conciliados}</p>
        </div>
      </div>

      <Link
        href={`/dashboard/tesoreria/conciliacion?cuenta=${id}`}
        className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
      >
        <PlusMinus size={16} />
        Conciliar
        <CaretRight size={14} />
      </Link>
    </div>
  );
}

/**
 * Subcuenta contable de la cuenta, con su aviso si no es de bancos y, con
 * permiso de Tesorería, el cambio aquí mismo. El servidor solo lo deja si la
 * subcuenta de antes no tiene saldo (si no, el banco quedaría partido en dos).
 */
function SubcuentaDeLaCuenta({
  id,
  subcuentaCodigo,
  avisoSubcuenta,
  puedeCambiar,
  onCambiada,
}: {
  id: string;
  subcuentaCodigo: string;
  avisoSubcuenta?: string;
  puedeCambiar: boolean;
  onCambiada?: (subcuentaCodigo: string) => void;
}) {
  const [cambiando, setCambiando] = useState(false);
  const [valor, setValor] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const campoRef = useRef<HTMLInputElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  const campoId = `cuenta-${id}-subcuenta`;
  const errorId = `${campoId}-error`;

  // Al abrir: si la de ahora no es de bancos, se propone la siguiente 572 libre; si lo es, ella misma.
  useEffect(() => {
    if (!cambiando) return;
    let vivo = true;
    campoRef.current?.focus();
    if (avisoSubcuenta) {
      apiFetch<{ subcuentaCodigo: string }>(companyPath('/treasury/bank-accounts/subcuenta-propuesta'))
        .then((p) => vivo && setValor((v) => v || p.subcuentaCodigo))
        .catch(() => undefined);
    }
    return () => {
      vivo = false;
    };
  }, [cambiando, avisoSubcuenta]);

  const abrir = () => {
    setValor(avisoSubcuenta ? '' : subcuentaCodigo);
    setError('');
    setCambiando(true);
  };

  const cerrar = () => {
    setCambiando(false);
    setError('');
    setTimeout(() => botonRef.current?.focus(), 0);
  };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const codigo = valor.replace(/[\s.]/g, '');
    if (!/^572\d{1,9}$/.test(codigo)) {
      setError('La subcuenta de un banco empieza por 572 y lleva solo cifras, por ejemplo 57200001.');
      campoRef.current?.focus();
      return;
    }
    setEnviando(true);
    setError('');
    try {
      const c = await apiFetch<{ subcuentaCodigo: string }>(companyPath(`/treasury/bank-accounts/${encodeURIComponent(id)}/subcuenta`), {
        method: 'PUT',
        body: JSON.stringify({ subcuentaCodigo: codigo }),
      });
      cerrar();
      onCambiada?.(c.subcuentaCodigo);
    } catch (err) {
      setError(errorMessage(err));
      campoRef.current?.focus();
    } finally {
      setEnviando(false);
    }
  };

  const alTeclear = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cerrar();
    }
  };

  return (
    <div className="mb-4 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-slate-600">
          Subcuenta contable: <span className="font-mono font-medium text-slate-900">{subcuentaCodigo}</span>
        </span>
        {puedeCambiar && !cambiando && (
          <button ref={botonRef} type="button" onClick={abrir} className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline">
            Cambiar subcuenta
          </button>
        )}
      </div>
      {avisoSubcuenta && (
        <p className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          <Warning size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {avisoSubcuenta}
            {!puedeCambiar && ' Pide a quien tenga permiso de Tesorería que la cambie.'}
          </span>
        </p>
      )}
      {cambiando && (
        <form onSubmit={guardar} noValidate className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3" aria-label="Cambiar la subcuenta contable">
          <div>
            <label htmlFor={campoId} className="block text-xs font-medium text-slate-700">
              Nueva subcuenta
            </label>
            <input
              ref={campoRef}
              id={campoId}
              value={valor}
              onChange={(e) => {
                setValor(e.target.value);
                setError('');
              }}
              onKeyDown={alTeclear}
              inputMode="numeric"
              autoComplete="off"
              placeholder="57200001"
              aria-invalid={error ? true : undefined}
              aria-describedby={`${error ? `${errorId} ` : ''}${campoId}-ayuda`}
              className={`mt-1 block w-full rounded-lg border bg-white px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none ${error ? 'border-red-400' : 'border-slate-300'}`}
            />
            {error && (
              <p id={errorId} role="alert" className="mt-1 text-xs text-red-700">
                {error}
              </p>
            )}
            <p id={`${campoId}-ayuda`} className="mt-1 text-xs text-slate-500">
              Una 572 que no tenga otra cuenta. Si no está en el plan, se da de alta. Lo ya apuntado no se mueve: solo se puede cambiar si la de ahora no tiene saldo.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={enviando}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {enviando ? 'Guardando…' : 'Guardar'}
            </button>
            <button type="button" onClick={cerrar} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
