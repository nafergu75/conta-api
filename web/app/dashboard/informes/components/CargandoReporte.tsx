'use client';

export function CargandoReporte() {
  return (
    <div className="space-y-6">
      {/* Selector de rango */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-4 h-6 w-24 animate-pulse rounded-lg bg-slate-200" />
        <div className="space-y-3">
          <div className="h-10 w-full animate-pulse rounded-lg bg-slate-200" />
          <div className="h-10 w-full animate-pulse rounded-lg bg-slate-200" />
        </div>
      </div>

      {/* Cards de totales */}
      <div className="grid grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-slate-200 bg-white p-4"
          >
            <div className="mb-2 h-4 w-16 animate-pulse rounded bg-slate-200" />
            <div className="h-8 w-24 animate-pulse rounded bg-slate-200" />
          </div>
        ))}
      </div>

      {/* Indicador cuadre */}
      <div className="h-20 animate-pulse rounded-lg bg-slate-200" />

      {/* Tabla */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="space-y-2 p-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      </div>
    </div>
  );
}
