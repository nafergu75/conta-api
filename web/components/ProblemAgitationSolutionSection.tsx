'use client';

import { WarningCircle, Clock, CheckCircle } from '@phosphor-icons/react';

const cards = [
  {
    icon: WarningCircle,
    iconClass: 'text-rose-500',
    borderClass: 'border-rose-500',
    title: 'Procesos contables manuales',
    description:
      'Asientos duplicados, errores humanos y reconciliación manual cada mes.',
  },
  {
    icon: Clock,
    iconClass: 'text-amber-400',
    borderClass: 'border-amber-400',
    title: 'Coste en tiempo y riesgo',
    description:
      'Más de 40 horas mensuales en tareas repetitivas, auditorías complicadas y sin visibilidad en tiempo real.',
  },
  {
    icon: CheckCircle,
    iconClass: 'text-accent-500',
    borderClass: 'border-accent-500',
    title: 'Conta API lo automatiza todo',
    description:
      'Tus sistemas hablan entre sí. Asientos automáticos, informes sincronizados y auditoría lista en minutos.',
  },
];

export default function ProblemAgitationSolutionSection() {
  return (
    <section className="py-20 md:py-28 px-4 md:px-12 bg-slate-950">
      <div className="max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.title}
                className={`flex flex-col gap-4 p-6 rounded-xl bg-slate-900 border-b-2 ${card.borderClass}`}
              >
                <Icon size={40} className={card.iconClass} weight="duotone" />
                <h3 className="text-xl font-semibold text-white">{card.title}</h3>
                <p className="text-slate-300 leading-relaxed">
                  {card.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
