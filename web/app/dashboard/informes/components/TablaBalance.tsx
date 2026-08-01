'use client';

interface BalanceRow {
  seccion: string;
  total: number;
  desglose?: Array<{ cuenta: string; saldo: number }>;
}

interface TablaBalanceProps {
  titulo: string;
  filas: BalanceRow[];
  mostrarDesglose?: boolean;
}

export function TablaBalance({
  titulo,
  filas,
  mostrarDesglose = true,
}: TablaBalanceProps) {
  const eur = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  });

  const totalGeneral = filas.reduce((sum, fila) => sum + fila.total, 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
        <h3 className="font-semibold text-slate-900">{titulo}</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-6 py-3 text-left font-medium text-slate-700">
                Concepto
              </th>
              <th className="px-6 py-3 text-right font-medium text-slate-700">
                Saldo (€)
              </th>
              <th className="px-6 py-3 text-right font-medium text-slate-700 w-24">
                %
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila, idx) => (
              <div key={idx}>
                {/* Fila principal */}
                <tr className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-6 py-3 font-medium text-slate-900">
                    {fila.seccion}
                  </td>
                  <td className="px-6 py-3 text-right font-medium text-slate-900">
                    {eur.format(fila.total)}
                  </td>
                  <td className="px-6 py-3 text-right text-slate-600">
                    {totalGeneral !== 0
                      ? ((fila.total / totalGeneral) * 100).toFixed(1)
                      : '0.0'}
                    %
                  </td>
                </tr>

                {/* Desglose si existe */}
                {mostrarDesglose &&
                  fila.desglose &&
                  fila.desglose.length > 0 && (
                    <>
                      {fila.desglose.map((cuenta, cIdx) => (
                        <tr
                          key={`${idx}-${cIdx}`}
                          className="border-b border-slate-100 bg-slate-50/50"
                        >
                          <td className="px-9 py-2 text-sm text-slate-600">
                            • {cuenta.cuenta}
                          </td>
                          <td className="px-6 py-2 text-right text-sm text-slate-600">
                            {eur.format(cuenta.saldo)}
                          </td>
                          <td className="px-6 py-2 text-right text-sm text-slate-600">
                            {totalGeneral !== 0
                              ? ((cuenta.saldo / totalGeneral) * 100).toFixed(2)
                              : '0.00'}
                            %
                          </td>
                        </tr>
                      ))}
                    </>
                  )}
              </div>
            ))}

            {/* Total General */}
            <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold">
              <td className="px-6 py-3 text-slate-900">TOTAL</td>
              <td className="px-6 py-3 text-right text-slate-900">
                {eur.format(totalGeneral)}
              </td>
              <td className="px-6 py-3 text-right text-slate-900">100.0%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
