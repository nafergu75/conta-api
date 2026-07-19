'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Code } from '@phosphor-icons/react';
import { findNavItem } from '@/components/dashboard/nav';

export default function SectionPage() {
  const params = useParams<{ section: string }>();
  const item = findNavItem(params.section);

  if (!item) {
    return (
      <main className="max-w-3xl mx-auto px-4 md:px-8 py-16 text-center">
        <h1 className="text-2xl font-semibold text-slate-900 mb-3">
          Sección no encontrada
        </h1>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-600 hover:text-accent-700"
        >
          <ArrowLeft size={16} /> Volver al resumen
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-8 py-10">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors mb-6"
      >
        <ArrowLeft size={16} /> Volver al resumen
      </Link>

      <div className="flex items-center gap-3 mb-3">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900">
          {item.label}
        </h1>
        <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
          Interfaz próximamente
        </span>
      </div>

      <p className="text-slate-600 leading-relaxed mb-8 max-w-[60ch]">
        {item.description} Este módulo ya funciona en la API; la pantalla del
        dashboard está en desarrollo.
      </p>

      <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-200 bg-slate-50">
          <Code size={18} className="text-accent-600" />
          <h2 className="text-sm font-semibold text-slate-900">
            Endpoints disponibles
          </h2>
        </div>
        <ul className="divide-y divide-slate-100">
          {item.endpoints.map((ep) => (
            <li
              key={ep}
              className="px-5 py-3 font-mono text-sm text-slate-700"
            >
              {ep}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-sm text-slate-500 mt-6">
        Puedes probar estos endpoints ahora mismo desde{' '}
        <a
          href="http://localhost:3000/docs/"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-accent-600 hover:text-accent-700"
        >
          Swagger UI
        </a>{' '}
        con el token de tu sesión.
      </p>
    </main>
  );
}
