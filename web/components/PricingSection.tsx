'use client';

import Link from 'next/link';
import { Check } from '@phosphor-icons/react';

const plans = [
  {
    name: 'Starter',
    price: '49 €',
    period: '/mes',
    description: 'Para equipos pequeños',
    features: [
      'Hasta 500 transacciones/mes',
      '5 integraciones',
      'Soporte por email',
      'Dashboard básico',
    ],
    cta: 'Empezar prueba gratis',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '149 €',
    period: '/mes',
    description: 'Para pymes y despachos',
    features: [
      'Hasta 5.000 transacciones/mes',
      'Integraciones ilimitadas',
      'Soporte prioritario',
      'Informes avanzados',
      'API completa',
    ],
    cta: 'Solicitar demo',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'A medida',
    period: '',
    description: 'Soluciones personalizadas',
    features: [
      'Transacciones ilimitadas',
      'Integraciones a medida',
      'Cuenta dedicada',
      'SLA garantizado',
    ],
    cta: 'Hablar con ventas',
    highlighted: false,
  },
];

export default function PricingSection() {
  return (
    <section id="pricing" className="py-20 md:py-28 px-4 md:px-12 bg-slate-50 dark:bg-slate-950">
      <div className="max-w-7xl mx-auto w-full">
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-center text-slate-900 dark:text-slate-50 mb-12">
          Precios simples y transparentes
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 items-start">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`rounded-xl p-8 border transition-all ${
                plan.highlighted
                  ? 'bg-white dark:bg-slate-900 border-t-4 border-t-accent-600 border-slate-200 dark:border-slate-700 shadow-lg shadow-slate-900/10'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
              }`}
            >
              <h3 className="text-2xl font-semibold text-slate-900 dark:text-slate-50 mb-1">
                {plan.name}
              </h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">
                {plan.description}
              </p>

              <div className="mb-6">
                <span className="text-4xl font-bold text-slate-900 dark:text-slate-50">
                  {plan.price}
                </span>
                {plan.period && (
                  <span className="text-slate-600 dark:text-slate-400 ml-1">
                    {plan.period}
                  </span>
                )}
              </div>

              <ul className="space-y-3 mb-8">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-3 text-slate-700 dark:text-slate-300"
                  >
                    <Check
                      size={20}
                      className="text-accent-600 flex-shrink-0 mt-0.5"
                      weight="bold"
                    />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="#cta"
                className={`block w-full text-center py-3 rounded-lg font-semibold transition-all ${
                  plan.highlighted
                    ? 'bg-accent-600 text-white hover:bg-accent-700 hover:-translate-y-[2px] active:scale-[0.98]'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-50 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
