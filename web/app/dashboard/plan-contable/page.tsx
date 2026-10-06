'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CaretDown, CaretRight, Plus, X, MagnifyingGlass } from '@phosphor-icons/react';
import { Tooltip } from '@/app/dashboard/components/Tooltip';
import { apiFetch, companyPath, errorMessage } from '@/lib/api';
import { getUser, tieneAlgunPermiso } from '@/lib/auth';

/**
 * Plan contable de la empresa activa (ChartOfAccounts).
 *
 * Antes la pantalla mostraba el plan base generico y el formulario "crear"
 * solo enseñaba un aviso sin guardar nada. Ahora lee el plan de la empresa
 * (el backend lo crea la primera vez) y las subcuentas se guardan de verdad.
 * Los grupos y subgrupos del PGC son fijos: no se pueden crear.
 */
interface Cuenta {
  id: string;
  codigo: string;
  nombre: string;
  nivel: number; // 1 grupo, 2 subgrupo, 3 cuenta, 4+ subcuenta
  naturaleza: string;
  parentCodigo: string | null;
  esPersonalizadaEmpresa: boolean;
  activo: boolean;
}

interface Modal {
  padre: Cuenta;
}

const NATURALEZA: Record<string, { color: string; label: string; tooltip: string }> = {
  PATRIMONIO_NETO: { color: 'bg-blue-100 text-blue-800', label: 'Patrimonio', tooltip: 'Capital y resultados acumulados de la empresa.' },
  ACTIVO: { color: 'bg-green-100 text-green-800', label: 'Activo', tooltip: 'Bienes y derechos de la empresa (tesorería, existencias, clientes...).' },
  PASIVO: { color: 'bg-orange-100 text-orange-800', label: 'Pasivo', tooltip: 'Deudas y obligaciones (préstamos, proveedores, Hacienda...).' },
  GASTO: { color: 'bg-red-100 text-red-800', label: 'Gasto', tooltip: 'Compras y gastos del ejercicio (grupo 6).' },
  INGRESO: { color: 'bg-emerald-100 text-emerald-800', label: 'Ingreso', tooltip: 'Ventas e ingresos del ejercicio (grupo 7).' },
};

function badge(naturaleza: string) {
  return NATURALEZA[naturaleza] ?? { color: 'bg-gray-100 text-gray-800', label: naturaleza, tooltip: 'Tipo de cuenta.' };
}

/** Siguiente codigo libre de 7 digitos bajo `padre` (629 -> 6290001, 6290002...). */
function siguienteCodigo(padre: Cuenta, hijos: Cuenta[]): string {
  const largo = Math.max(7, padre.codigo.length + 1);
  const usados = new Set(hijos.map((h) => h.codigo));
  for (let n = 1; n < 10 ** (largo - padre.codigo.length); n++) {
    const codigo = padre.codigo + String(n).padStart(largo - padre.codigo.length, '0');
    if (!usados.has(codigo)) return codigo;
  }
  return padre.codigo;
}

export default function PlanContablePage() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [busqueda, setBusqueda] = useState('');

  const [modal, setModal] = useState<Modal | null>(null);
  const [form, setForm] = useState({ codigo: '', nombre: '' });
  const [formError, setFormError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState('');

  const puedeEditar = tieneAlgunPermiso(getUser(), ['contabilidad:write']);

  const cargar = useCallback(async () => {
    try {
      const r = await apiFetch<{ cuentas: Cuenta[] }>(companyPath('/accounting/chart-of-accounts'));
      setCuentas(r.cuentas ?? []);
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const hijosDe = useMemo(() => {
    const m = new Map<string, Cuenta[]>();
    for (const c of cuentas) {
      const k = c.parentCodigo ?? '';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(c);
    }
    m.forEach((lista) => lista.sort((a, b) => a.codigo.localeCompare(b.codigo)));
    return m;
  }, [cuentas]);

  // Con busqueda: se muestran las cuentas que coinciden y toda su rama.
  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return null;
    const porCodigo = new Map(cuentas.map((c) => [c.codigo, c]));
    const set = new Set<string>();
    const coinciden = cuentas.filter((c) => c.codigo.includes(q) || c.nombre.toLowerCase().includes(q));
    for (const c of coinciden) {
      let x: Cuenta | undefined = c;
      while (x) {
        set.add(x.codigo);
        x = x.parentCodigo ? porCodigo.get(x.parentCodigo) : undefined;
      }
    }
    // Y sus subcuentas (en el PGC el codigo del hijo empieza por el del padre).
    const cuentasQueCoinciden = coinciden.filter((c) => c.nivel >= 3).map((c) => c.codigo);
    for (const c of cuentas) {
      if (cuentasQueCoinciden.some((m) => c.codigo.startsWith(m))) set.add(c.codigo);
    }
    return set;
  }, [busqueda, cuentas]);

  const conteo = useMemo(() => {
    const lista = visibles ? cuentas.filter((c) => visibles.has(c.codigo)) : cuentas;
    return {
      grupos: lista.filter((c) => c.nivel === 1).length,
      subgrupos: lista.filter((c) => c.nivel === 2).length,
      cuentas: lista.filter((c) => c.nivel === 3).length,
      subcuentas: lista.filter((c) => c.nivel >= 4).length,
    };
  }, [cuentas, visibles]);

  const alternar = (codigo: string) => {
    setAbiertos((prev) => {
      const s = new Set(prev);
      if (s.has(codigo)) s.delete(codigo);
      else s.add(codigo);
      return s;
    });
  };

  const abrirModal = (padre: Cuenta) => {
    setModal({ padre });
    setForm({ codigo: siguienteCodigo(padre, hijosDe.get(padre.codigo) ?? []), nombre: '' });
    setFormError('');
  };

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modal) return;
    const codigo = form.codigo.trim();
    const nombre = form.nombre.trim();
    if (!codigo || !nombre) {
      setFormError('Escribe el código y el nombre.');
      return;
    }
    if (!/^\d+$/.test(codigo) || !codigo.startsWith(modal.padre.codigo) || codigo.length <= modal.padre.codigo.length) {
      setFormError(`El código tiene que empezar por ${modal.padre.codigo} y llevar más dígitos.`);
      return;
    }
    setGuardando(true);
    setFormError('');
    try {
      await apiFetch(companyPath('/accounting/chart-of-accounts'), {
        method: 'POST',
        body: JSON.stringify({ codigo, nombre, parentCodigo: modal.padre.codigo }),
      });
      setAbiertos((prev) => new Set(prev).add(modal.padre.codigo));
      setModal(null);
      setAviso(`Subcuenta ${codigo} creada.`);
      await cargar();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setGuardando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-gray-600">Cargando plan contable...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-700">No se ha podido cargar el plan contable: {error}</p>
        <button onClick={() => { setLoading(true); cargar(); }} className="mt-2 text-sm font-medium text-red-700 underline">
          Reintentar
        </button>
      </div>
    );
  }

  const renderFila = (c: Cuenta, profundidad: number): React.ReactNode => {
    if (visibles && !visibles.has(c.codigo)) return null;
    const hijos = hijosDe.get(c.codigo) ?? [];
    const abierto = visibles !== null || abiertos.has(c.codigo);
    const admiteSubcuentas = c.nivel >= 3;
    const tb = badge(c.naturaleza);
    const estilo =
      c.nivel === 1
        ? 'py-4 font-semibold text-gray-900'
        : c.nivel === 2
          ? 'py-3 font-medium text-gray-700 bg-gray-50'
          : 'py-2 text-sm text-gray-700';

    return (
      <div key={c.id}>
        <div
          className={`group/fila flex items-center gap-3 border-t border-gray-100 pr-4 hover:bg-gray-50 transition ${estilo}`}
          style={{ paddingLeft: 16 + profundidad * 28 }}
        >
          <button
            onClick={() => alternar(c.codigo)}
            className={`w-5 flex justify-center flex-shrink-0 ${hijos.length ? '' : 'invisible'}`}
            aria-label={abierto ? 'Plegar' : 'Desplegar'}
          >
            {abierto ? <CaretDown size={14} weight="fill" /> : <CaretRight size={14} weight="fill" />}
          </button>
          <span className="font-mono text-gray-500 min-w-16">{c.codigo}</span>
          <span className="flex-1">
            {c.nombre}
            {c.esPersonalizadaEmpresa && (
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">propia</span>
            )}
          </span>
          {c.nivel >= 3 && (
            <span className="flex items-center gap-2">
              <span className={`px-2 py-1 rounded text-xs font-medium ${tb.color}`}>{tb.label}</span>
              <Tooltip text={tb.tooltip} position="left" />
            </span>
          )}
          {c.nivel <= 2 && <span className="text-xs text-gray-500">{hijos.length} {c.nivel === 1 ? 'subgrupos' : 'cuentas'}</span>}
          {puedeEditar && admiteSubcuentas && (
            <button
              onClick={() => abrirModal(c)}
              className="p-1.5 text-gray-500 hover:bg-blue-50 hover:text-blue-600 rounded opacity-0 group-hover/fila:opacity-100 focus:opacity-100 transition"
              title={`Crear subcuenta de ${c.codigo}`}
            >
              <Plus size={16} />
            </button>
          )}
        </div>
        {abierto && hijos.map((h) => renderFila(h, profundidad + 1))}
      </div>
    );
  };

  const grupos = hijosDe.get('') ?? [];

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-gray-900">Plan contable</h1>
          <Tooltip text="Cuentas de la empresa según el PGC de PYMES. Los grupos, subgrupos y cuentas son los oficiales; debajo de cada cuenta puedes crear subcuentas propias (por ejemplo, una por proveedor o por tipo de gasto)." />
        </div>
        <p className="mt-2 text-gray-600">
          PGC PYMES (RD 1515/2007).{puedeEditar ? ' Pasa el ratón por una cuenta y pulsa + para crear una subcuenta.' : ''}
        </p>
      </div>

      {aviso && (
        <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {aviso}
          <button onClick={() => setAviso('')} aria-label="Cerrar aviso"><X size={16} /></button>
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <label htmlFor="buscar-cuenta" className="block text-sm font-medium text-slate-700 mb-2">Buscar cuenta</label>
        <div className="relative">
          <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id="buscar-cuenta"
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Código o nombre (p. ej. 629, suministros)"
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-9 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
          {busqueda && (
            <button onClick={() => setBusqueda('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" title="Limpiar búsqueda">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          ['Grupos', conteo.grupos],
          ['Subgrupos', conteo.subgrupos],
          ['Cuentas', conteo.cuentas],
          ['Subcuentas', conteo.subcuentas],
        ].map(([t, n]) => (
          <div key={t} className="bg-white p-4 rounded-lg border border-gray-200">
            <p className="text-sm text-gray-600">{t}</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">{n}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {visibles && visibles.size === 0 ? (
          <div className="px-6 py-8 text-center">
            <p className="text-slate-600">Ninguna cuenta coincide con «{busqueda}».</p>
            <button onClick={() => setBusqueda('')} className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium">Limpiar búsqueda</button>
          </div>
        ) : grupos.length === 0 ? (
          <p className="px-6 py-8 text-center text-slate-600">La empresa todavía no tiene cuentas.</p>
        ) : (
          grupos.map((g) => renderFila(g, 0))
        )}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" role="dialog" aria-modal="true">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Nueva subcuenta</h2>
              <button onClick={() => setModal(null)} className="p-1 text-gray-500 hover:bg-gray-100 rounded" aria-label="Cerrar">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={crear} className="p-6 space-y-4">
              <p className="text-sm text-gray-600">
                Dentro de <span className="font-medium">{modal.padre.codigo} {modal.padre.nombre}</span>
              </p>
              <div>
                <label htmlFor="sub-codigo" className="block text-sm font-medium text-gray-700 mb-2">Código</label>
                <input
                  id="sub-codigo"
                  inputMode="numeric"
                  value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={guardando}
                />
                <p className="mt-1 text-xs text-gray-500">Empieza por {modal.padre.codigo}. Te proponemos el siguiente libre.</p>
              </div>
              <div>
                <label htmlFor="sub-nombre" className="block text-sm font-medium text-gray-700 mb-2">Nombre</label>
                <input
                  id="sub-nombre"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Ej.: Material de oficina"
                  disabled={guardando}
                  autoFocus
                />
              </div>
              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-700">{formError}</p>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setModal(null)} className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition" disabled={guardando}>
                  Cancelar
                </button>
                <button type="submit" className="flex-1 px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition disabled:opacity-50" disabled={guardando}>
                  {guardando ? 'Guardando...' : 'Crear subcuenta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
