'use client';

import { BookOpen, Plugs, ChartBar } from '@phosphor-icons/react';

const features = [
  {
    icon: BookOpen,
    title: 'Automatización de asientos',
    description:
      'Las transacciones se convierten en asientos contables automáticamente, sin intervención manual.',
  },
  {
    icon: Plugs,
    title: 'Conexión nativa',
    description:
      'Más de 50 integraciones listas para usar, o construye la tuya con nuestra API documentada.',
  },
  {
    icon: ChartBar,
    title: 'Informes en tiempo real',
    description:
      'Balance, pérdidas y ganancias, IVA y movimientos generados al momento. Auditoría siempre lista.',
  },
];

export default function FeatureGrid() {
  return (
    <section id="features" className="py-20 md:py-28 px-4 md:px-12 bg-slate-50 dark:bg-slate-950">
      <div className="max-w-7xl mx-auto w-full">
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mb-12">
          Qué hace Conta API
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="p-6 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 border-b-4 border-b-accent-600 shadow-sm hover:shadow-md hover:-translate-y-[2px] transition-all"
              >
                <Icon size={32} className="text-accent-600 mb-4" weight="duotone" />
                <h3 className="text-xl font-semibold mb-3 text-slate-900 dark:text-slate-50">
                  {feature.title}
                </h3>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
