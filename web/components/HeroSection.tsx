import Link from 'next/link';

const flowSteps = ['Facturación', 'Conta API', 'Contabilidad', 'Reportes'];

export default function HeroSection() {
  return (
    <section className="min-h-[calc(100dvh-5rem)] flex items-center py-16 md:py-24 px-4 md:px-12 bg-white dark:bg-slate-950">
      <div className="max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="flex flex-col gap-6">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-none text-slate-900 dark:text-slate-50">
              Automatiza tu contabilidad desde cualquier sistema
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-[55ch]">
              Conecta tu facturación, ERP y herramientas con tus asientos
              contables en tiempo real. Cero errores, cero retrasos.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 pt-2">
              <Link
                href="#cta"
                className="text-center px-8 py-4 bg-accent-600 text-white font-semibold rounded-lg hover:bg-accent-700 hover:-translate-y-[2px] active:scale-[0.98] transition-all"
              >
                Solicitar demo
              </Link>
              <Link
                href="#features"
                className="text-center px-8 py-4 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-50 font-semibold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
              >
                Ver cómo funciona
              </Link>
            </div>
          </div>

          <div className="flex justify-center">
            <div className="w-full max-w-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg shadow-slate-900/5 p-8">
              <p className="text-xs font-mono uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-6 text-center">
                Flujo de automatización
              </p>
              <div className="flex flex-col items-center gap-2">
                {flowSteps.map((step, i) => (
                  <div key={step} className="flex flex-col items-center gap-2 w-full">
                    <div
                      className={`w-full max-w-[240px] text-center px-4 py-3 rounded-lg text-sm font-medium border ${
                        step === 'Conta API'
                          ? 'bg-accent-600 border-accent-600 text-white shadow-md shadow-accent-600/25'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {step}
                    </div>
                    {i < flowSteps.length - 1 && (
                      <span className="text-slate-400 text-sm leading-none">↓</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
