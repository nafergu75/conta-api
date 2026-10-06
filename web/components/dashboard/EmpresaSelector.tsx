'use client';

import { useEffect, useState } from 'react';
import { Buildings, CaretUpDown } from '@phosphor-icons/react';
import { apiFetch, errorMessage } from '@/lib/api';
import { cambiarEmpresa, getCompanyId, type EmpresaSesion, type SessionUser } from '@/lib/auth';

/**
 * Empresa con la que se trabaja. Con una sola, solo se muestra su nombre; con
 * varias, se elige aqui. El administrador global ve todas las de la plataforma.
 * Al cambiar se recarga la pagina: cada pantalla lee la empresa al cargar.
 */
export function EmpresaSelector({ user }: { user: SessionUser }) {
  const [empresas, setEmpresas] = useState<EmpresaSesion[]>(user.empresas ?? []);
  const [error, setError] = useState('');
  const activa = getCompanyId();

  useEffect(() => {
    if (!user.esAdminGlobal) return;
    apiFetch<Array<{ id: string; codigo: string | null; nombre: string; activa: boolean }>>('/admin/empresas')
      .then((lista) => {
        const todas = lista.filter((e) => e.activa).map((e) => ({ companyId: e.id, codigo: e.codigo, nombre: e.nombre }));
        setEmpresas(todas);
        // Un admin sin empresas propias entra en la primera de la plataforma.
        if (!user.empresaActiva && !user.companies?.length && todas[0]) {
          cambiarEmpresa(todas[0].companyId, todas[0].nombre);
          window.location.reload();
        }
      })
      .catch((e) => setError(errorMessage(e)));
  }, [user.esAdminGlobal, user.empresaActiva, user.companies]);

  const actual = empresas.find((e) => e.companyId === activa);

  const elegir = (companyId: string) => {
    if (companyId === activa) return;
    cambiarEmpresa(companyId, empresas.find((e) => e.companyId === companyId)?.nombre);
    // A la portada: la pantalla abierta puede no tener sentido en la otra empresa.
    window.location.assign('/dashboard');
  };

  if (empresas.length <= 1 && !user.esAdminGlobal) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
        <Buildings size={18} className="shrink-0 text-slate-400" />
        <span className="truncate font-medium" title={actual?.nombre}>
          {actual?.nombre ?? 'Empresa'}
        </span>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="empresa-activa" className="mb-1 block px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        Empresa{user.esAdminGlobal ? ' (administrador)' : ''}
      </label>
      <div className="relative">
        <Buildings size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <select
          id="empresa-activa"
          value={actual ? activa : ''}
          onChange={(e) => elegir(e.target.value)}
          className="w-full appearance-none truncate rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-8 text-sm font-medium text-slate-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
        >
          {!actual && <option value="">Elige una empresa</option>}
          {empresas.map((e) => (
            <option key={e.companyId} value={e.companyId}>
              {e.nombre}
              {e.codigo ? ` (${e.codigo})` : ''}
            </option>
          ))}
        </select>
        <CaretUpDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
      </div>
      {error && <p className="mt-1 px-1 text-xs text-red-600">No se han podido cargar todas las empresas: {error}</p>}
    </div>
  );
}
