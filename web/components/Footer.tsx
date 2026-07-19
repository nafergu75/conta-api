'use client';

import Link from 'next/link';
import { LinkedinLogo, GithubLogo } from '@phosphor-icons/react';

const columns = [
  {
    title: 'Producto',
    links: ['Características', 'Pricing', 'Integraciones'],
  },
  {
    title: 'Empresa',
    links: ['Sobre nosotros', 'Blog', 'Contacto'],
  },
  {
    title: 'Legal',
    links: ['Privacidad', 'Términos', 'Seguridad'],
  },
];

export default function Footer() {
  return (
    <footer className="bg-slate-900 border-t border-slate-800 py-12 px-4 md:px-12">
      <div className="max-w-7xl mx-auto w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-10 mb-10">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 font-semibold text-lg text-white">
              <span className="w-7 h-7 bg-accent-600 rounded-lg flex items-center justify-center text-white font-bold text-xs">
                CA
              </span>
              Conta API
            </div>
            <p className="text-slate-400 text-sm">© 2026 Conta API</p>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="font-semibold text-white mb-4">{col.title}</h4>
              <ul className="space-y-2">
                {col.links.map((label) => (
                  <li key={label}>
                    <Link
                      href="#"
                      className="text-slate-400 hover:text-accent-500 text-sm transition-colors"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h4 className="font-semibold text-white mb-4">Contacto</h4>
            <a
              href="mailto:hola@conta-api.com"
              className="text-slate-400 hover:text-accent-500 text-sm transition-colors"
            >
              hola@conta-api.com
            </a>
            <div className="flex gap-4 mt-4">
              <Link
                href="#"
                aria-label="LinkedIn"
                className="text-slate-400 hover:text-accent-500 transition-colors"
              >
                <LinkedinLogo size={20} />
              </Link>
              <Link
                href="https://github.com/nafergu75/conta-api"
                aria-label="GitHub"
                className="text-slate-400 hover:text-accent-500 transition-colors"
              >
                <GithubLogo size={20} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
