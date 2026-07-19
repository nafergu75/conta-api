const clients = [
  { name: 'Ferrandis Asesores', initials: 'FA' },
  { name: 'Contable Levante', initials: 'CL' },
  { name: 'Gestoría Albir', initials: 'GA' },
  { name: 'Balanç Consultors', initials: 'BC' },
  { name: 'Despatx Miró', initials: 'DM' },
];

export default function SocialProofSection() {
  return (
    <section className="py-16 md:py-20 px-4 md:px-12 bg-white dark:bg-slate-950">
      <div className="max-w-7xl mx-auto w-full text-center">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mb-2">
          Equipos contables de toda España confían en Conta API
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mb-12">
          Más de 20 pymes y despachos ya automatizan su contabilidad
        </p>

        <div className="flex flex-wrap justify-center items-center gap-6 md:gap-10">
          {clients.map((client) => (
            <div key={client.name} className="flex items-center gap-3 opacity-70 hover:opacity-100 transition-opacity">
              <span className="flex items-center justify-center w-11 h-11 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-semibold text-slate-700 dark:text-slate-300 text-sm">
                {client.initials}
              </span>
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                {client.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
