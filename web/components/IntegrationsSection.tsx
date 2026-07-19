'use client';

import Link from 'next/link';
import { ArrowRight } from '@phosphor-icons/react';

const integrations = [
  'Sage',
  'SAP',
  'PrestaShop',
  'Shopify',
  'Stripe',
  'HubSpot',
  'Google Sheets',
  'Holded',
];

export default function IntegrationsSection() {
  return (
    <section id="integraciones" className="py-20 md:py-28 px-4 md:px-12 bg-white dark:bg-slate-950">
      <div className="max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="flex flex-col gap-5">
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              Conecta con las herramientas que ya usas
            </h2>
            <p className="text-lg font-medium text-accent-600">
              Más de 50 integraciones listas, o construye la tuya con la API.
            </p>
            <p className="text-slate-600 dark:text-slate-400 leading-relaxed max-w-[55ch]">
              Conta API habla con todo tu stack: facturación, ecommerce, CRM y
              nómina, todo sincronizado. Se acabaron los datos duplicados.
            </p>
            <Link
              href="#"
              className="inline-flex items-center gap-2 text-accent-600 font-semibold hover:text-accent-700 transition-colors"
            >
              Ver todas las integraciones <ArrowRight size={20} />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 md:gap-6">
            {integrations.map((name) => (
              <div
                key={name}
                className="aspect-square flex items-center justify-center rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-semibold text-slate-700 dark:text-slate-300 text-sm text-center p-3 hover:border-accent-600 transition-colors"
              >
                {name}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
