'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, clearSession } from '@/lib/auth';
import { CaretDown, CaretRight, Plus, X, MagnifyingGlass } from '@phosphor-icons/react';
import { Tooltip } from '@/app/dashboard/components/Tooltip';

interface PgcNode {
  level: 'group' | 'subgroup' | 'account';
  code: string;
  name: string;
  type?: string;
  groupCode?: string;
  subgroupCode?: string;
}

interface ModalData {
  type: 'subgrupo' | 'subcuenta' | null;
  parentCode?: string;
  parentName?: string;
}

export default function PlanContablePage() {
  const router = useRouter();
  const [data, setData] = useState<PgcNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedSubgroups, setExpandedSubgroups] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal state
  const [modal, setModal] = useState<ModalData>({ type: null });
  const [formData, setFormData] = useState({ code: '', name: '' });
  const [formError, setFormError] = useState<string>('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  useEffect(() => {
    async function loadPlanContable() {
      try {
        const token = getToken();
        if (!token) {
          clearSession();
          router.push('/login');
          return;
        }

        const response = await fetch('/api/conta/plan-contable/base/todo', {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          if (response.status === 401) {
            clearSession();
            router.push('/login');
            return;
          }
          throw new Error(`Error ${response.status}`);
        }

        const result = await response.json();
        setData(result.data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar plan contable');
        console.error('Error:', err);
      } finally {
        setLoading(false);
      }
    }

    loadPlanContable();
  }, [router]);

  const toggleGroup = (groupCode: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupCode)) {
      newExpanded.delete(groupCode);
    } else {
      newExpanded.add(groupCode);
    }
    setExpandedGroups(newExpanded);
  };

  const toggleSubgroup = (subgroupCode: string) => {
    const newExpanded = new Set(expandedSubgroups);
    if (newExpanded.has(subgroupCode)) {
      newExpanded.delete(subgroupCode);
    } else {
      newExpanded.add(subgroupCode);
    }
    setExpandedSubgroups(newExpanded);
  };

  const openCreateSubgrupo = (groupCode: string, groupName: string) => {
    setModal({ type: 'subgrupo', parentCode: groupCode, parentName: groupName });
    setFormData({ code: '', name: '' });
    setFormError('');
  };

  const openCreateSubcuenta = (accountCode: string, accountName: string) => {
    setModal({ type: 'subcuenta', parentCode: accountCode, parentName: accountName });
    setFormData({ code: '', name: '' });
    setFormError('');
  };

  const closeModal = () => {
    setModal({ type: null });
    setFormData({ code: '', name: '' });
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.code.trim() || !formData.name.trim()) {
      setFormError('Todos los campos son obligatorios');
      return;
    }

    setFormSubmitting(true);
    setFormError('');

    try {
      // Para esta versión, solo mostramos el modal sin enviar al API
      // La funcionalidad completa requeriría endpoints POST en el backend
      alert(`${modal.type === 'subgrupo' ? 'Subgrupo' : 'Subcuenta'} creado: [${formData.code}] ${formData.name}`);
      closeModal();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al crear');
    } finally {
      setFormSubmitting(false);
    }
  };

  const groups = data.filter((n) => n.level === 'group');
  const subgroups = data.filter((n) => n.level === 'subgroup');
  const accounts = data.filter((n) => n.level === 'account');

  const getSubgroupsForGroup = (groupCode: string) => subgroups.filter((sg) => sg.groupCode === groupCode);
  const getAccountsForSubgroup = (subgroupCode: string) => accounts.filter((a) => a.subgroupCode === subgroupCode);

  // Filtrar cuentas por búsqueda
  const filterAccounts = (accs: PgcNode[]) => {
    if (!searchTerm.trim()) return accs;
    const search = searchTerm.toLowerCase();
    return accs.filter((a) =>
      a.code.toLowerCase().includes(search) || a.name.toLowerCase().includes(search)
    );
  };

  const filteredAccounts = filterAccounts(accounts);
  const matchingSubgroups = new Set(
    filteredAccounts.map((a) => a.subgroupCode).filter(Boolean)
  );
  const matchingGroups = new Set(
    subgroups
      .filter((sg) => matchingSubgroups.has(sg.code))
      .map((sg) => sg.groupCode)
      .filter(Boolean)
  );

  // Auto-expandir cuando hay búsqueda
  const shouldAutoExpand = searchTerm.trim().length > 0;
  const visibleGroups = shouldAutoExpand ? groups : groups;

  const getTypeBadgeConfig = (type: string) => {
    const config: Record<string, { color: string; label: string; tooltip: string }> = {
      patrimonio_neto: {
        color: 'bg-blue-100 text-blue-800',
        label: 'Patrimonio',
        tooltip: 'Capital y ganancias acumuladas de la empresa.',
      },
      activo: {
        color: 'bg-green-100 text-green-800',
        label: 'Activo',
        tooltip: 'Bienes y derechos que posee la empresa (efectivo, inventario, equipos).',
      },
      pasivo: {
        color: 'bg-orange-100 text-orange-800',
        label: 'Pasivo',
        tooltip: 'Obligaciones y deudas de la empresa (préstamos, proveedores).',
      },
      gasto: {
        color: 'bg-red-100 text-red-800',
        label: 'Gasto',
        tooltip: 'Dinero invertido en operaciones (sueldos, servicios, materiales).',
      },
      ingreso: {
        color: 'bg-emerald-100 text-emerald-800',
        label: 'Ingreso',
        tooltip: 'Dinero recibido por ventas y servicios.',
      },
    };
    return config[type] || { color: 'bg-gray-100 text-gray-800', label: type, tooltip: 'Tipo de cuenta.' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-gray-600">Cargando plan contable...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-gray-900">Plan Contable</h1>
            <Tooltip text="Estructura organizativa de las cuentas donde se registran todas las operaciones contables de la empresa. Organismos por grupos, subgrupos y cuentas individuales." />
          </div>
          <p className="mt-2 text-gray-600">Estructura del plan contable PGC-PYME</p>
        </div>
      </div>

      {/* Búsqueda */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Buscar cuenta
        </label>
        <div className="relative">
          <MagnifyingGlass
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por código o nombre..."
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-9 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              title="Limpiar búsqueda"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">Grupos</p>
          <p className="text-2xl font-bold text-gray-900">
            {shouldAutoExpand ? matchingGroups.size : groups.length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">Subgrupos</p>
          <p className="text-2xl font-bold text-gray-900">
            {shouldAutoExpand ? matchingSubgroups.size : subgroups.length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">Cuentas</p>
          <p className="text-2xl font-bold text-gray-900">
            {shouldAutoExpand ? filteredAccounts.length : accounts.length}
          </p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600">Total nodos</p>
          <p className="text-2xl font-bold text-gray-900">
            {shouldAutoExpand ? matchingGroups.size + matchingSubgroups.size + filteredAccounts.length : data.length}
          </p>
        </div>
      </div>

      {/* Plan Contable Jerárquico */}
      <div className="bg-white rounded-lg border border-gray-200">
        {filteredAccounts.length === 0 && shouldAutoExpand && (
          <div className="px-6 py-8 text-center">
            <p className="text-slate-600">No se encontraron cuentas con ese término.</p>
            <button
              onClick={() => setSearchTerm('')}
              className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Limpiar búsqueda
            </button>
          </div>
        )}
        {(filteredAccounts.length > 0 || !shouldAutoExpand) && (
          <div className="divide-y">
            {visibleGroups
              .filter((g) => !shouldAutoExpand || matchingGroups.has(g.code))
              .map((group) => {
                const groupSubgroups = getSubgroupsForGroup(group.code);
                const isExpanded = shouldAutoExpand || expandedGroups.has(group.code);

            return (
              <div key={group.code} className="divide-y">
                {/* Grupo */}
                <div className="flex items-center gap-3 px-6 py-4 hover:bg-gray-50 transition group/header">
                  <button
                    onClick={() => toggleGroup(group.code)}
                    className="w-5 flex justify-center flex-shrink-0"
                  >
                    {isExpanded ? <CaretDown size={16} weight="fill" /> : <CaretRight size={16} weight="fill" />}
                  </button>
                  <span className="font-semibold text-gray-900 flex-1">
                    [{group.code}] {group.name}
                  </span>
                  <span className="text-xs text-gray-500">{groupSubgroups.length} subgrupos</span>
                  <button
                    onClick={() => openCreateSubgrupo(group.code, group.name)}
                    className="ml-2 p-2 text-gray-600 hover:bg-blue-50 hover:text-blue-600 rounded opacity-0 group-hover/header:opacity-100 transition"
                    title="Crear subgrupo"
                  >
                    <Plus size={16} />
                  </button>
                </div>

                {/* Subgrupos */}
                {isExpanded && groupSubgroups
                  .filter((sg) => !shouldAutoExpand || matchingSubgroups.has(sg.code))
                  .map((subgroup) => {
                    const subgroupAccounts = getAccountsForSubgroup(subgroup.code);
                    const filteredSubgroupAccounts = filterAccounts(subgroupAccounts);
                    const isSubgroupExpanded = shouldAutoExpand || expandedSubgroups.has(subgroup.code);

                  return (
                    <div key={subgroup.code} className="bg-gray-50 border-t">
                      <div className="flex items-center gap-3 px-12 py-3 hover:bg-gray-100 transition group/subheader">
                        <button
                          onClick={() => toggleSubgroup(subgroup.code)}
                          className="w-5 flex justify-center flex-shrink-0"
                        >
                          {isSubgroupExpanded ? (
                            <CaretDown size={14} weight="fill" />
                          ) : (
                            <CaretRight size={14} weight="fill" />
                          )}
                        </button>
                        <span className="font-medium text-gray-700 flex-1">
                          [{subgroup.code}] {subgroup.name}
                        </span>
                        <span className="text-xs text-gray-500">
                          {shouldAutoExpand
                            ? `${filteredSubgroupAccounts.length}/${subgroupAccounts.length}`
                            : `${subgroupAccounts.length}`} cuentas
                        </span>
                        <button
                          onClick={() => openCreateSubcuenta(subgroup.code, subgroup.name)}
                          className="ml-2 p-2 text-gray-600 hover:bg-blue-50 hover:text-blue-600 rounded opacity-0 group-hover/subheader:opacity-100 transition"
                          title="Crear subcuenta"
                        >
                          <Plus size={16} />
                        </button>
                      </div>

                      {/* Cuentas */}
                      {isSubgroupExpanded && filteredSubgroupAccounts.map((account) => {
                        const typeConfig = getTypeBadgeConfig(account.type || '');
                        return (
                          <div key={account.code} className="px-20 py-2 text-sm border-t border-gray-200 hover:bg-white transition">
                            <div className="flex items-center gap-3">
                              <span className="font-mono text-gray-600 w-16">[{account.code}]</span>
                              <span className="text-gray-700 flex-1">{account.name}</span>
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-1 rounded text-xs font-medium ${typeConfig.color}`}>
                                  {typeConfig.label}
                                </span>
                                <Tooltip text={typeConfig.tooltip} position="left" />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
            })}
          </div>
        )}
      </div>

      {/* Modal para crear subgrupo/subcuenta */}
      {modal.type && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                {modal.type === 'subgrupo' ? 'Crear Subgrupo' : 'Crear Subcuenta'}
              </h2>
              <button
                onClick={closeModal}
                className="p-1 text-gray-500 hover:bg-gray-100 rounded"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-3">
                  Dentro de: <span className="font-medium">[{modal.parentCode}] {modal.parentName}</span>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Código
                </label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Ej: 4601"
                  disabled={formSubmitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Ej: Personal subcontratado"
                  disabled={formSubmitting}
                />
              </div>

              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-700">{formError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition"
                  disabled={formSubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition disabled:opacity-50"
                  disabled={formSubmitting}
                >
                  {formSubmitting ? 'Creando...' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
